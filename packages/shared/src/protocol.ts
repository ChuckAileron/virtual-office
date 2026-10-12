import type { AccessoryCatalog } from './accessories';
import type { AppearancePatch } from './appearance';
import type { CatalogEntry } from './objects';
import type { Accessories, Appearance, Dir, FloorDecoration, FloorSize, Office, OfficeFloorStyle, PlacedObject, Pet, Tiles } from './types';

/** Constantes de juego compartidas. */
export const GAME = {
  MOVE_INTERVAL_MS: 90,
  VOICE_RADIUS: 5,
  CHAT_RADIUS: 6,
  IDLE_MS: 5 * 60 * 1000,
  CHAT_MAX: 200,
} as const;

// ---------- REST ----------

export interface UserInfo {
  username: string;
  appearance: Appearance;
}
export interface SessionResponse {
  token: string;
  user: UserInfo;
}
export interface PublicRoom {
  code: string;
  name: string;
  width: number;
  height: number;
  offices: number;
  players: number;
}
export interface ClientConfig {
  /** URL WebSocket de LiveKit; si es null el cliente usa `wss://<host>/livekit`. */
  livekitUrl: string | null;
}
export interface ApiError {
  message: string;
}

// ---------- Socket.IO ----------

export interface PlayerView {
  id: string;
  name: string;
  appearance: Appearance;
  x: number;
  y: number;
  dir: Dir;
  voice: boolean;
  idle: boolean;
}

export interface WelcomePayload {
  you: string;
  room: { code: string; name: string; size: FloorSize; tiles: Tiles; offices: Office[] };
  objects: PlacedObject[];
  catalog: CatalogEntry[];
  pets: Pet[];
  floorDecorations: FloorDecoration[];
  floorStyles: OfficeFloorStyle[];
  petKinds: Array<{ type: string; name: string }>;
  petColors: Array<{ id: string; name: string; hex: string }>;
  accessories: AccessoryCatalog;
  players: PlayerView[];
}

export type VoiceTokenResult = { ok: true; token: string; url: string | null } | { ok: false; error: string };

/**
 * Eventos del cliente al servidor. La conexión se autentica con
 * `io(url, { auth: { token } })`; después el cliente emite `join`.
 */
export interface ClientToServerEvents {
  join: (p: { code: string }) => void;
  activity: () => void;
  move: (p: { dir: Dir }) => void;
  chat: (p: { text: string }) => void;
  place: (p: { kind: string; x: number; y: number; perspective?: 'front' | 'side'; flipped?: boolean }) => void;
  remove_object: (p: { id: number }) => void;
  place_pet: (p: { kind: string; color: string; x: number; y: number }) => void;
  remove_pet: (p: { id: number }) => void;
  place_floor_decoration: (p: Omit<FloorDecoration, 'id'>) => void;
  remove_floor_decoration: (p: { id: number }) => void;
  set_office_floor_style: (p: OfficeFloorStyle) => void;
  set_look: (p: { acc?: Partial<Accessories>; look?: AppearancePatch }) => void;
  /** Indicador de micrófono activo (solo informativo para la lista de jugadores). */
  voice: (p: { on: boolean }) => void;
  /** Pide un token de LiveKit para el espacio de trabajo actual. */
  voice_token: (ack: (r: VoiceTokenResult) => void) => void;
}

export interface ServerToClientEvents {
  welcome: (p: WelcomePayload) => void;
  joined: (p: { player: PlayerView }) => void;
  left: (p: { id: string }) => void;
  moved: (p: { id: string; x: number; y: number; dir: Dir }) => void;
  presence: (p: { id: string; idle: boolean }) => void;
  look: (p: { id: string; appearance: Appearance }) => void;
  voice: (p: { id: string; on: boolean }) => void;
  object_add: (p: { object: PlacedObject }) => void;
  object_remove: (p: { id: number }) => void;
  pet_add: (p: { pet: Pet }) => void;
  pet_remove: (p: { id: number }) => void;
  pet_move: (p: { id: number; x: number; y: number; dir: Dir }) => void;
  floor_decoration_add: (p: { decoration: FloorDecoration }) => void;
  floor_decoration_remove: (p: { id: number }) => void;
  office_floor_style: (p: { style: OfficeFloorStyle }) => void;
  chat: (p: { id: string; name: string; text: string }) => void;
  build_error: (p: { error: string }) => void;
  error: (p: { error: string }) => void;
  /**
   * Ids de los jugadores con los que puedes hablar (misma oficina o cerca en el pasillo).
   * El cliente solo debe suscribirse en LiveKit al audio/video de esos participantes
   * (la identidad del participante en LiveKit es el id del jugador).
   */
  audible: (p: { ids: string[] }) => void;
  /** Otra sesión del mismo usuario tomó esta conexión. */
  replaced: () => void;
}
