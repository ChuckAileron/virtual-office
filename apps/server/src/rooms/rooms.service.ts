import { HttpException, HttpStatus, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { LAYOUT_VERSION, LayoutOptions, PublicRoom, T, formatCode, generateLayout, normalizeCode, rebuildBlocked } from '@vo/shared';
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
      const layout = generateLayout({ offices: size.offices, conference: size.conference, boss: size.boss });
      ({ size, tiles, offices } = layout);
      await this.repo.updateRoomLayout(row.code, layout);
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
}
