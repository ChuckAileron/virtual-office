import type { Socket } from 'socket.io';
import type {
  Appearance, ClientToServerEvents, Dir, FloorSize, Office, PlacedObject, Pet, Point, ServerToClientEvents, Tiles,
} from '@vo/shared';

export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export interface Player extends Point {
  id: string;
  userId: number;
  socket: GameSocket;
  room: RoomRuntime | null;
  name: string;
  appearance: Appearance;
  dir: Dir;
  voice: boolean;
  idle: boolean;
  lastMove: number;
  lastActive: number;
  lastEdit: number;
  lastLook: number;
  /** Ids de los jugadores con los que puede hablar ahora mismo. */
  audible: Set<string>;
}

export interface RoomRuntime {
  code: string;
  name: string;
  size: FloorSize;
  tiles: Tiles;
  offices: Office[];
  objects: PlacedObject[];
  pets: Pet[];
  players: Map<string, Player>;
  blocked: Set<string>;
}
