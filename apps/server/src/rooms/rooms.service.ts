import { HttpException, HttpStatus, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { CATALOG, LAYOUT_VERSION, Layout, LayoutOptions, PlacedObject, PublicRoom, T, defOf, footprint, formatCode, generateLayout, normalizeCode, rebuildBlocked } from '@vo/shared';
import { Repository, RoomRow } from '../db/repository';
import { RoomRuntime } from './room.types';

const MAX_ROOMS = 1000;

@Injectable()
export class RoomsService implements OnModuleInit {
  private readonly rooms = new Map<string, RoomRuntime>();

  constructor(@Inject(Repository) private readonly repo: Repository) {}

  async onModuleInit() {
    for (const row of await this.repo.loadRooms()) this.rooms.set(row.code, await this.toRuntime(row));
  }

  all(): IterableIterator<RoomRuntime> {
    return this.rooms.values();
  }

  find(code: unknown): RoomRuntime | undefined {
    return this.rooms.get(normalizeCode(code));
  }

  async create(name: string, opts: LayoutOptions): Promise<RoomRuntime> {
    if (this.rooms.size >= MAX_ROOMS) throw new HttpException('Demasiados espacios de trabajo creados', HttpStatus.TOO_MANY_REQUESTS);
    const layout = generateLayout(opts);
    const code = await this.repo.saveRoom(name, layout);
    await this.seedDefaultFurnishings(code, layout);
    const room = await this.toRuntime({ code, name, ...layout });
    this.rooms.set(code, room);
    return room;
  }

  toPublic(room: RoomRuntime): PublicRoom {
    return {
      code: formatCode(room.code),
      name: room.name,
      width: room.size.width,
      height: room.size.height,
      offices: room.offices.length,
      players: room.players.size,
    };
  }

  private async toRuntime(row: RoomRow): Promise<RoomRuntime> {
    // Migración: regenera los espacios creados con un trazado anterior (sin entrada o con el
    // diseño antiguo de entrada), conservando sus opciones. El resto no cambia.
    let { size, tiles, offices } = row;
    if (size.version !== LAYOUT_VERSION || !tiles.some((r) => r.includes(T.LOBBY))) {
      const layout = generateLayout({
        offices: size.offices, conference: size.conference, boss: size.boss, kitchen: size.kitchen, rest: size.rest,
      });
      const migratedOffice = (oldOffice: (typeof offices)[number]) => layout.offices.find((office) => office.name === oldOffice.name)
        ?? (oldOffice.kind === 'office' ? undefined : layout.offices.find((office) => office.kind === oldOffice.kind));
      const officeIdMappings = offices.flatMap((oldOffice) => {
        const newOffice = migratedOffice(oldOffice);
        return newOffice ? [{ from: oldOffice.id, to: newOffice.id }] : [];
      });
      await this.repo.remapOfficeFloorStyles(row.code, officeIdMappings);
      const relocate = (x: number, y: number): { x: number; y: number } | null => {
        const oldOffice = offices.find((office) => x >= office.x && x < office.x + office.w && y >= office.y && y < office.y + office.h);
        if (!oldOffice) return null;
        const newOffice = migratedOffice(oldOffice);
        return newOffice ? { x: x + newOffice.x - oldOffice.x, y: y + newOffice.y - oldOffice.y } : null;
      };
      // Al ampliar/reubicar los recintos, conserva los muebles, mascotas e
      // imágenes en la misma posición relativa dentro de su oficina.
      for (const object of await this.repo.loadObjects(row.code)) {
        const point = relocate(object.x, object.y);
        if (point && (point.x !== object.x || point.y !== object.y)) await this.repo.moveObject(row.code, object.id, point.x, point.y);
      }
      for (const pet of await this.repo.loadPets(row.code)) {
        const point = relocate(pet.x, pet.y);
        if (point && (point.x !== pet.x || point.y !== pet.y)) await this.repo.movePet(row.code, pet.id, point.x, point.y);
      }
      for (const decoration of await this.repo.loadFloorDecorations(row.code)) {
        const point = relocate(decoration.x, decoration.y);
        if (point && (point.x !== decoration.x || point.y !== decoration.y)) {
          await this.repo.moveFloorDecoration(row.code, decoration.id, point.x, point.y);
        }
      }
      ({ size, tiles, offices } = layout);
      await this.repo.updateRoomLayout(row.code, layout);
      await this.removeLegacyInteriorPresets(row.code, layout);
      await this.upgradeLegacyFurniturePresets(row.code, layout);
      await this.seedDefaultFurnishings(row.code, layout);
    }
    const room: RoomRuntime = {
      code: row.code,
      name: row.name,
      size,
      tiles,
      offices,
      objects: await this.repo.loadObjects(row.code),
      pets: await this.repo.loadPets(row.code),
      floorDecorations: await this.repo.loadFloorDecorations(row.code),
      floorStyles: await this.repo.loadOfficeFloorStyles(row.code),
      players: new Map(),
      blocked: new Set(),
    };
    rebuildBlocked(room);
    return room;
  }

  /** Mobiliario inicial colocado por recinto; queda persistido y se puede editar como el resto. */
  private async seedDefaultFurnishings(code: string, layout: Layout): Promise<void> {
    const candidates: Array<Pick<PlacedObject, 'type' | 'x' | 'y'> & Partial<Pick<PlacedObject, 'perspective' | 'flipped'>>> = [];
    const add = (type: string, x: number, y: number, perspective: 'front' | 'side' = 'front', flipped = false) =>
      candidates.push({ type, x, y, perspective, flipped });

    for (const room of layout.offices) {
      const left = room.x + 1, right = room.x + room.w - 2;
      const top = room.y + 2, bottom = room.y + room.h - 3;
      switch (room.kind) {
        case 'office': {
          const officeNumber = Number(room.name.match(/\d+/)?.[0] ?? room.id);
          const bookshelfX = officeNumber % 2 === 0 ? left : right - 1;
          add('bookshelf_tall', bookshelfX, top);
          add(officeNumber % 3 === 0 ? 'cooler' : 'filing', left, bottom);
          break;
        }
        case 'boss':
          add('bookshelf_tall', left, top);
          add('bookshelf_tall', right - 1, top);
          add(room.id % 3 === 0 ? 'cooler' : 'filing', left, bottom);
          add('sofa_blue', room.x + room.w - 6, room.y + room.h - 3);
          break;
        case 'conference':
          add('bookshelf_tall', left, room.y + 2);
          add('plant', left, bottom);
          add('plant', right, bottom);
          {
            const perSide = Math.ceil(layout.size.offices / 2);
            const tableWidth = perSide + 2;
            const tableX = room.x + 1 + Math.floor((room.w - 2 - tableWidth) / 2);
            const rugColumns = Math.min(Math.floor((room.w - 2) / 3), Math.ceil((tableWidth + 2) / 3));
            const startX = tableX + Math.ceil((tableWidth - rugColumns * 3) / 2);
            for (const y of [room.y + 3, room.y + 5, room.y + 7]) {
              for (let column = 0; column < rugColumns; column++) add('rug', startX + column * 3, y);
            }
          }
          break;
        case 'kitchen':
          add('fridge', room.x + room.w - 3, room.y + 2);
          break;
        case 'rest':
          add('sofa_wide', room.x + 5, room.y + 2);
          add('sofa_vertical', room.x + 2, room.y + 5, 'front', true);
          add('sofa_vertical', room.x + room.w - 4, room.y + 5);
          add('plant', left, room.y + 2);
          add('plant', right, room.y + 2);
          add('plant', right, room.y + room.h - 3);
          for (const y of [room.y + 4, room.y + 6]) for (const x of [room.x + 3, room.x + 6, room.x + 9]) add('rug', x, y);
          break;
        case 'lobby':
          add('sofa_blue', room.x + room.w - 11, room.y + 2);
          add('sofa_vertical_blue', room.x + room.w - 14, room.y + 3);
          add('sofa_vertical_blue', room.x + room.w - 5, room.y + 3);
          add('plant', room.x + room.w - 14, room.y + 1);
          add('plant', room.x + room.w - 4, room.y + 1);
          for (const y of [room.y + 2, room.y + 4, room.y + 6]) {
            for (let column = 0; column < 4; column++) add('rug', room.x + room.w - 14 + column * 3, y);
          }
          break;
      }
    }

    const occupied = new Set<string>();
    const existing = await this.repo.loadObjects(code);
    const existingKeys = new Set(existing.map((o) => `${o.type}:${o.x}:${o.y}`));
    const reserve = (object: Pick<PlacedObject, 'type' | 'x' | 'y'>): void => {
      const def = defOf(object.type);
      if (!def?.solid) return;
      for (const [x, y] of footprint(def, object.x, object.y)) occupied.add(`${x},${y}`);
    };
    existing.forEach(reserve);

    const floorTiles = new Set<number>([T.FLOOR, T.OFFICE, T.BOSS, T.CONF, T.LOBBY, T.KITCHEN, T.REST]);
    const forbiddenRugTiles = new Set<number>([T.WALL, T.DOOR, T.DESK, T.COUNTER]);
    for (const item of candidates) {
      const def = CATALOG[item.type];
      const key = `${item.type}:${item.x}:${item.y}`;
      if (!def || existingKeys.has(key)) continue;
      const cells = footprint(def, item.x, item.y);
      const canPlace = cells.every(([x, y]) => {
        const tile = layout.tiles[y]?.[x];
        if (tile === undefined) return false;
        if (def.layer === 'floor') return !forbiddenRugTiles.has(tile);
        return floorTiles.has(tile) && !occupied.has(`${x},${y}`);
      });
      if (!canPlace) continue;
      await this.repo.addObject(code, item.type, item.x, item.y, item.perspective ?? 'front', item.flipped ?? false);
      existingKeys.add(key);
      reserve(item);
    }
  }

  /** Elimina los objetos de presets antiguos que no forman parte del mapa objetivo. */
  private async removeLegacyInteriorPresets(code: string, layout: Layout): Promise<void> {
    const generated = new Map<string, Set<string>>();
    const mark = (type: string, x: number, y: number): void => {
      const points = generated.get(type) ?? new Set<string>();
      points.add(`${x}:${y}`);
      generated.set(type, points);
    };
    for (const room of layout.offices) {
      const left = room.x + 1, right = room.x + room.w - 2;
      const top = room.y + 1, bottom = room.y + room.h - 2;
      if (room.kind === 'office') {
        mark('rug', room.x + 4, room.y + 4);
        mark('bin', right, bottom);
      }
      if (room.kind === 'office' || room.kind === 'boss') {
        mark('plant', left, bottom); mark('plant', right, bottom);
      } else if (room.kind === 'kitchen') {
        mark('plant', left, bottom);
        mark('cooler', room.x + 4, room.y + 2);
      }
      else if (room.kind === 'lobby') mark('plant', room.x + 1, bottom);
      if (room.kind === 'conference') {
        mark('whiteboard', left, top);
        mark('giant_tv', right - 2, top);
        // Preset v14: cuatro alfombras por fila; v15: cinco módulos en dos filas.
        const columns = Math.min(4, Math.floor((room.w - 2) / 3));
        const startX = room.x + 1 + Math.floor((room.w - 2 - columns * 3) / 2);
        const startY = room.y + 1 + Math.floor((room.h - 2 - 4) / 2);
        for (let row = 0; row < 2; row++) for (let column = 0; column < columns; column++) {
          mark('rug', startX + column * 3, startY + row * 2);
        }
        const perSide = Math.ceil(layout.size.offices / 2);
        const oldColumns = Math.min(Math.floor((room.w - 2) / 3), Math.ceil((perSide + 4) / 3));
        const oldX = room.x + 1 + Math.floor((room.w - 2 - perSide) / 2)
          + Math.floor((perSide - oldColumns * 3) / 2);
        for (const y of [room.y + 2, room.y + 4]) {
          for (let column = 0; column < oldColumns; column++) mark('rug', oldX + column * 3, y);
        }
      }
      if (room.kind === 'boss') {
        mark('armchair', right - 1, bottom);
        mark('lamp', right, room.y + 4);
        for (const y of [room.y + 4, room.y + 6]) for (const x of [room.x + 4, room.x + 7, room.x + 10]) mark('rug', x, y);
      }
      if (room.kind === 'rest') {
        mark('sofa_vertical_blue', room.x + room.w - 3, room.y + 3);
        mark('sofa', room.x + 5, room.y + room.h - 2);
        for (const y of [room.y + 3, room.y + 5]) for (const x of [room.x + 3, room.x + 6, room.x + 9]) mark('rug', x, y);
      }
      if (room.kind === 'lobby') {
        mark('bench', room.x + room.w - 10, room.y + room.h - 2);
        mark('plant', room.x + room.w - 4, room.y + 1);
        for (let column = 0; column < 4; column++) {
          mark('rug', room.x + Math.floor(room.w / 2) - 6 + column * 3, room.y + room.h - 3);
        }
        mark('plant', room.x + room.w - 4, room.y + room.h - 2);
      }
    }
    for (const object of await this.repo.loadObjects(code)) {
      if (generated.get(object.type)?.has(`${object.x}:${object.y}`)) await this.repo.removeObject(code, object.id);
    }
  }

  /** Conserva los IDs de los muebles de sistema al migrarlos a las nuevas piezas de referencia. */
  private async upgradeLegacyFurniturePresets(code: string, layout: Layout): Promise<void> {
    const upgrades: Array<{ from: string; x: number; y: number; to: string; newX: number; newY: number; flipped?: boolean }> = [];
    const addUpgrade = (from: string, x: number, y: number, to: string, newX: number, newY: number, flipped?: boolean) =>
      upgrades.push({ from, x, y, to, newX, newY, flipped });
    for (const room of layout.offices) {
      const left = room.x + 1, right = room.x + room.w - 2;
      const oldTop = room.y + 1, newTop = room.y + 2;
      const oldBottom = room.y + room.h - 2, serviceY = room.y + room.h - 3;
      if (room.kind === 'office') {
        const officeNumber = Number(room.name.match(/\d+/)?.[0] ?? room.id);
        const shelfX = officeNumber % 2 === 0 ? left : right - 1;
        for (const type of ['bookshelf', 'bookshelf_tall']) {
          addUpgrade(type, left, oldTop, 'bookshelf_tall', shelfX, newTop);
          addUpgrade(type, right - 1, oldTop, 'bookshelf_tall', shelfX, newTop);
        }
        const serviceType = officeNumber % 3 === 0 ? 'cooler' : 'filing';
        addUpgrade('filing', right, oldTop, serviceType, left, serviceY);
        addUpgrade('filing', left, oldBottom, serviceType, left, serviceY);
        addUpgrade('cooler', left, oldBottom, serviceType, left, serviceY);
      }
      else if (room.kind === 'boss') {
        for (const x of [left, right - 1]) {
          addUpgrade('bookshelf', x, oldTop, 'bookshelf_tall', x, newTop);
          addUpgrade('bookshelf_tall', x, oldTop, 'bookshelf_tall', x, newTop);
        }
        const serviceType = room.id % 3 === 0 ? 'cooler' : 'filing';
        addUpgrade('filing', left, oldBottom, serviceType, left, serviceY);
        addUpgrade('sofa', room.x + 2, oldBottom, 'sofa_blue', room.x + room.w - 6, serviceY);
        addUpgrade('sofa_blue', room.x + 2, room.y + 7, 'sofa_blue', room.x + room.w - 6, serviceY);
        addUpgrade('sofa_blue', room.x + 10, room.y + 7, 'sofa_blue', room.x + room.w - 6, serviceY);
      } else if (room.kind === 'rest') {
        addUpgrade('sofa', room.x + 2, oldTop, 'sofa_wide', room.x + 5, room.y + 2);
        addUpgrade('sofa', right - 1, oldTop, 'sofa_vertical', room.x + 2, room.y + 5);
        addUpgrade('sofa_wide', room.x + 5, room.y + 1, 'sofa_wide', room.x + 5, room.y + 2);
        addUpgrade('sofa_vertical_blue', left, room.y + 3, 'sofa_vertical', room.x + 2, room.y + 5, true);
        addUpgrade('sofa_vertical', room.x + 2, room.y + 5, 'sofa_vertical', room.x + 2, room.y + 5, true);
        addUpgrade('plant', left, room.y + 1, 'plant', left, room.y + 2);
        addUpgrade('plant', right, room.y + 1, 'plant', right, room.y + 2);
        addUpgrade('plant', right, oldBottom, 'plant', right, serviceY);
      } else if (room.kind === 'lobby') {
        addUpgrade('sofa_blue', room.x + room.w - 10, room.y + 1, 'sofa_blue', room.x + room.w - 11, room.y + 2);
        addUpgrade('sofa_vertical_blue', room.x + room.w - 3, room.y + 2, 'sofa_vertical_blue', room.x + room.w - 5, room.y + 3);
      } else if (room.kind === 'kitchen') {
        addUpgrade('fridge', right, room.y + 2, 'fridge', room.x + room.w - 3, room.y + 2);
      } else if (room.kind === 'conference') {
        addUpgrade('filing', left, room.y + 3, 'bookshelf_tall', left, room.y + 2);
      }
    }
    const existing = await this.repo.loadObjects(code);
    for (const upgrade of upgrades) {
      const object = existing.find((entry) => entry.type === upgrade.from && entry.x === upgrade.x && entry.y === upgrade.y);
      if (!object) continue;
      const target = defOf(upgrade.to);
      const targetCells = target ? footprint(target, upgrade.newX, upgrade.newY) : [];
      const blocked = existing.some((entry) => {
        if (entry.id === object.id) return false;
        const def = defOf(entry.type);
        return !!def?.solid && footprint(def, entry.x, entry.y).some(([x, y]) => targetCells.some(([tx, ty]) => tx === x && ty === y));
      });
      if (!blocked) await this.repo.updateObjectPreset(
        code, object.id, upgrade.to, upgrade.newX, upgrade.newY,
        object.perspective ?? 'front', upgrade.flipped ?? object.flipped ?? false,
      );
    }
  }
}
