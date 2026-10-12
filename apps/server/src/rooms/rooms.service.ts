import { HttpException, HttpStatus, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { LayoutOptions, PublicRoom, formatCode, generateLayout, normalizeCode, rebuildBlocked } from '@vo/shared';
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
    if (this.rooms.size >= MAX_ROOMS) throw new HttpException('Demasiados pisos creados', HttpStatus.TOO_MANY_REQUESTS);
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
    const room: RoomRuntime = {
      code: row.code,
      name: row.name,
      size: row.size,
      tiles: row.tiles,
      offices: row.offices,
      objects: await this.repo.loadObjects(row.code),
      pets: await this.repo.loadPets(row.code),
      players: new Map(),
      blocked: new Set(),
    };
    rebuildBlocked(room);
    return room;
  }
}
