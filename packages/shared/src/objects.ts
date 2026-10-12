import { isWalkable, officeAt } from './layout';
import { Office, PlacedObject, RoomState, T, Tiles } from './types';

interface ObjectDef {
  name: string;
  w: number;
  h: number;
  solid: boolean;
  /** 'floor': se dibuja bajo el resto y puede coexistir con otros objetos (alfombra) */
  layer?: 'floor';
  /** Restringe el objeto a un tipo de recinto concreto. */
  roomKind?: Office['kind'];
}

export const CATALOG: Record<string, ObjectDef> = {
  plant: { name: 'Planta grande', w: 1, h: 1, solid: true },
  bookshelf: { name: 'Librero', w: 2, h: 1, solid: true },
  filing: { name: 'Archivador', w: 1, h: 1, solid: true },
  sofa: { name: 'Sofá', w: 2, h: 1, solid: true },
  armchair: { name: 'Sillón', w: 1, h: 1, solid: true },
  coffee: { name: 'Cafetera', w: 1, h: 1, solid: true },
  cooler: { name: 'Dispensador de agua', w: 1, h: 1, solid: true },
  printer: { name: 'Impresora', w: 1, h: 1, solid: true },
  whiteboard: { name: 'Pizarra', w: 2, h: 1, solid: true },
  fridge: { name: 'Refrigerador', w: 1, h: 1, solid: true },
  vending: { name: 'Máquina expendedora', w: 1, h: 1, solid: true },
  bin: { name: 'Papelera', w: 1, h: 1, solid: true },
  lamp: { name: 'Lámpara de pie', w: 1, h: 1, solid: true },
  giant_tv: { name: 'TV gigante', w: 3, h: 2, solid: true, roomKind: 'conference' },
  rug: { name: 'Alfombra', w: 2, h: 2, solid: false, layer: 'floor' },
};

export interface CatalogEntry extends ObjectDef {
  type: string;
}

export const CATALOG_LIST: CatalogEntry[] = Object.entries(CATALOG).map(([type, d]) => ({ type, ...d }));
export const MAX_OBJECTS = 300;
const PLACEABLE = new Set<number>([T.FLOOR, T.OFFICE, T.BOSS, T.CONF]);

export const defOf = (type: unknown): ObjectDef | null =>
  typeof type === 'string' && Object.hasOwn(CATALOG, type) ? CATALOG[type] : null;

export function footprint(def: { w: number; h: number }, x: number, y: number): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) cells.push([x + dx, y + dy]);
  return cells;
}

export function rebuildBlocked(room: Pick<RoomState, 'objects' | 'blocked'>): void {
  room.blocked.clear();
  for (const o of room.objects) {
    const def = defOf(o.type);
    if (def?.solid) for (const [cx, cy] of footprint(def, o.x, o.y)) room.blocked.add(`${cx},${cy}`);
  }
}

function nearDoor(tiles: Tiles, x: number, y: number): boolean {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tiles[y + dy]?.[x + dx] === T.DOOR);
}

function reachableCount(tiles: Tiles, blocked: Set<string>, start: { x: number; y: number }): number {
  const w = tiles[0].length;
  const seen = new Set<number>([start.y * w + start.x]);
  const queue = [start];
  while (queue.length) {
    const { x, y } = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      const k = ny * w + nx;
      if (!seen.has(k) && isWalkable(tiles, nx, ny) && !blocked.has(`${nx},${ny}`)) {
        seen.add(k);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return seen.size;
}

// El objeto no puede aislar ninguna zona caminable del espacio de trabajo
function keepsFloorConnected(room: RoomState, cells: Array<[number, number]>): boolean {
  const after = new Set(room.blocked);
  cells.forEach(([cx, cy]) => after.add(`${cx},${cy}`));
  let start: { x: number; y: number } | null = null;
  for (let y = 0; y < room.tiles.length && !start; y++) {
    for (let x = 0; x < room.tiles[0].length; x++) {
      if (room.tiles[y][x] === T.FLOOR && !after.has(`${x},${y}`)) { start = { x, y }; break; }
    }
  }
  if (!start) return false;
  return reachableCount(room.tiles, after, start) === reachableCount(room.tiles, room.blocked, start) - cells.length;
}

/** Devuelve un mensaje de error o null si el objeto se puede colocar en (x, y). */
export function validatePlacement(room: RoomState, type: unknown, x: unknown, y: unknown): string | null {
  const def = defOf(type);
  if (!def || !Number.isInteger(x) || !Number.isInteger(y)) return 'Objeto inválido';
  const px = x as number, py = y as number;
  if (room.objects.length >= MAX_OBJECTS) return 'Se alcanzó el máximo de objetos del espacio de trabajo';
  const cells = footprint(def, px, py);
  for (const [cx, cy] of cells) {
    const t = room.tiles[cy]?.[cx];
    if (t === undefined) return 'Aquí no se puede colocar (solo sobre el piso libre)';
    if (def.roomKind && officeAt(room.offices ?? [], cx, cy)?.kind !== def.roomKind) return 'Este objeto solo se puede colocar en la sala de reuniones';
    if (!PLACEABLE.has(t)) return 'Aquí no se puede colocar (solo sobre el piso libre)';
    if (nearDoor(room.tiles, cx, cy)) return 'No bloquees las puertas';
    if (room.tiles[cy - 1]?.[cx] === T.DESK) return 'Deja libre el frente del escritorio';
    if (t === T.BOSS && room.tiles[cy + 1]?.[cx] === T.DESK) return 'Deja libre la silla del jefe';
  }
  const inCells = (qx: number, qy: number) => cells.some(([cx, cy]) => cx === qx && cy === qy);
  for (const o of room.objects as PlacedObject[]) {
    const od = defOf(o.type);
    if (!od || (od.layer === 'floor') !== (def.layer === 'floor')) continue;
    if (footprint(od, o.x, o.y).some(([ox, oy]) => inCells(ox, oy))) return 'Ya hay un objeto aquí';
  }
  if (def.solid) {
    for (const p of room.players.values()) if (inCells(p.x, p.y)) return 'Hay alguien en ese lugar';
    for (const p of room.pets ?? []) if (inCells(p.x, p.y)) return 'Hay una mascota en ese lugar';
    if (!keepsFloorConnected(room, cells)) return 'Eso bloquearía el paso';
  }
  return null;
}
