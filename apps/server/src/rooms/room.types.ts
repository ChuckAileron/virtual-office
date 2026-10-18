import type { Socket } from 'socket.io';
import type {
  Appearance, ClientToServerEvents, Dir, FloorDecoration, FloorSize, Office, OfficeFloorStyle, PlacedObject, Pet, Point, Role, ServerToClientEvents, Tiles,
} from '@vo/shared';

export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export interface Player extends Point {
  id: string;
  userId: number;
  officeId: number | null;
  socket: GameSocket;
  room: RoomRuntime | null;
  name: string;
  appearance: Appearance;
  role: Role;
  dir: Dir;
  voice: boolean;
  idle: boolean;
  lastMove: number;
  lastActive: number;
  lastEdit: number;
  lastLook: number;
  /** Marca de tiempo de la última alarma para limitar el abuso. */
  lastAlarm: number;
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
  floorDecorations: FloorDecoration[];
  floorStyles: OfficeFloorStyle[];
  /** office_id -> user_id; la propiedad persiste aunque el usuario se desconecte. */
  officeOwners: Map<number, number>;
  players: Map<string, Player>;
  blocked: Set<string>;
}
