import type { AccessoryCatalog } from './accessories';
import type { AppearancePatch } from './appearance';
import type { CatalogEntry } from './objects';
import type { Accessories, Appearance, Dir, FloorDecoration, FloorSize, Office, OfficeFloorStyle, PlacedObject, Pet, Role, Tiles } from './types';

/** Constantes de juego compartidas. */
export const GAME = {
  MOVE_INTERVAL_MS: 90,
  /** Velocidad de caminata en tiles por segundo (movimiento continuo, sin rejilla). */
  MOVE_SPEED: 6,
  /** Paso máximo por evento `move`, para evitar saltos si el cliente se retrasa. */
  MOVE_MAX_STEP: 0.8,
  VOICE_RADIUS: 5,
  CHAT_RADIUS: 6,
  IDLE_MS: 5 * 60 * 1000,
  CHAT_MAX: 200,
  /** Duración del sonido de la alarma de emergencia que escuchan todos. */
  ALARM_DURATION_MS: 30_000,
  /** Tiempo mínimo entre alarmas de un mismo jugador. */
  ALARM_COOLDOWN_MS: 5_000,
  /** Longitud máxima del mensaje opcional de la alarma. */
  ALARM_MESSAGE_MAX: 140,
} as const;

// ---------- REST ----------

export interface UserInfo {
  username: string;
  appearance: Appearance;
  role: Role;
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
  /** URL WebSocket de Janus; si es null el cliente usa `wss://<host>/janus`. */
  janusUrl: string | null;
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
  role: Role;
  officeId: number | null;
}

export interface WelcomePayload {
  you: string;
  assignedOfficeId: number | null;
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

export type VoiceTokenResult =
  | {
      ok: true;
      room: number;
      pin: string;
      url: string | null;
      identity: string;
      /** Token firmado que Janus exige con `token_auth`; ausente en modo desarrollo. */
      token?: string;
    }
  | { ok: false; error: string };

/**
 * Eventos del cliente al servidor. La conexión se autentica con
 * `io(url, { auth: { token } })`; después el cliente emite `join`.
 */
export interface ClientToServerEvents {
  join: (p: { code: string }) => void;
  activity: () => void;
  move: (p: { dir: Dir }) => void;
  /** Gira hacia una dirección sin desplazarse (toque breve en una tecla de movimiento). */
  turn: (p: { dir: Dir }) => void;
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
  /** Pide los datos de conexión a Janus para el espacio de trabajo actual. */
  voice_token: (ack: (r: VoiceTokenResult) => void) => void;
  /** Dispara una alarma de emergencia para todos los presentes, con mensaje opcional. */
  alarm: (p: { message: string }) => void;
  /** Convoca a todos los presentes a la sala de reuniones (solo jefe o administrador). */
  convene: () => void;
  /** Lista las cuentas con su rol (solo administrador). */
  list_users: (ack: (r: { users: Array<{ username: string; role: Role }> }) => void) => void;
  /** Asigna o quita el rol de jefe (solo administrador). */
  assign_role: (p: { username: string; role: Role }) => void;
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
    * El cliente solo debe suscribirse en Janus al audio/video de esos participantes.
   */
  audible: (p: { ids: string[] }) => void;
  /** Otra sesión del mismo usuario tomó esta conexión. */
  replaced: () => void;
  /** Alarma de emergencia disparada por alguien de la sala; todos deben reproducirla. */
  alarm: (p: { from: string; name: string; message: string; durationMs: number }) => void;
  /** Alguien convocó a todos a la sala de reuniones; `seats` indica la posición destino de cada jugador. */
  convened: (p: { by: string; seats: Array<{ id: string; x: number; y: number; dir: Dir }> }) => void;
  /** Aviso breve para el usuario (por ejemplo, una acción no permitida). */
  notice: (p: { text: string }) => void;
  /** Un administrador cambió el rol de este jugador. */
  role: (p: { id: string; role: Role }) => void;
}
