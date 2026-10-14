import { officeAt, type CatalogEntry, type Dir, type FloorDecoration, type Office, type OfficeFloorStyle, type PlacedObject, type Pet, type PlayerView, type WelcomePayload } from '@vo/shared';

export interface ClientPlayer extends PlayerView {
  rx: number;
  ry: number;
  bubble: string | null;
  bubbleUntil: number;
  /** Nivel de voz 0..1 para el indicador de "hablando". */
  level: number;
}

export interface ClientPet extends Pet {
  rx: number;
  ry: number;
}

/** Efecto visual temporal de teletransporte en una casilla (convocatoria a la reunión). */
export interface TeleportEffect {
  x: number;
  y: number;
  start: number;
  until: number;
}

export interface GameState {
  you: string;
  room: WelcomePayload['room'];
  players: Map<string, ClientPlayer>;
  pets: Map<number, ClientPet>;
  objects: PlacedObject[];
  floorDecorations: FloorDecoration[];
  floorStyles: OfficeFloorStyle[];
  catalog: CatalogEntry[];
  defs: Map<string, CatalogEntry>;
  petKinds: WelcomePayload['petKinds'];
  petColors: WelcomePayload['petColors'];
  accessories: WelcomePayload['accessories'];
  cam: { x: number; y: number };
  effects: TeleportEffect[];
}

export const PLAYER_RATE = 14;
export const PET_RATE = 7;

export const makePlayer = (p: PlayerView): ClientPlayer => ({ ...p, rx: p.x, ry: p.y, bubble: null, bubbleUntil: 0, level: 0 });
export const makePet = (p: Pet): ClientPet => ({ ...p, rx: p.x, ry: p.y });

export function createState(w: WelcomePayload): GameState {
  const state: GameState = {
    you: w.you,
    room: w.room,
    players: new Map(),
    pets: new Map(),
    objects: [...(w.objects ?? [])],
    floorDecorations: [...(w.floorDecorations ?? [])],
    floorStyles: [...(w.floorStyles ?? [])],
    catalog: w.catalog ?? [],
    defs: new Map((w.catalog ?? []).map((d) => [d.type, d])),
    petKinds: w.petKinds ?? [],
    petColors: w.petColors ?? [],
    accessories: w.accessories,
    cam: { x: 0, y: 0 },
    effects: [],
  };
  for (const p of w.pets ?? []) state.pets.set(p.id, makePet(p));
  for (const p of w.players) state.players.set(p.id, makePlayer(p));
  return state;
}

/** Acerca `current` a `target` con suavizado exponencial; encaja cuando queda muy cerca. */
export function approach(current: number, target: number, dt: number, rate: number): number {
  const next = current + (target - current) * Math.min(1, dt * rate);
  return Math.abs(target - next) < 0.01 ? target : next;
}

export function interpolate(state: GameState, dt: number): void {
  for (const p of state.players.values()) {
    p.rx = approach(p.rx, p.x, dt, PLAYER_RATE);
    p.ry = approach(p.ry, p.y, dt, PLAYER_RATE);
  }
  for (const p of state.pets.values()) {
    p.rx = approach(p.rx, p.x, dt, PET_RATE);
    p.ry = approach(p.ry, p.y, dt, PET_RATE);
  }
}

export const isMoving = (p: { x: number; y: number; rx: number; ry: number }): boolean => p.rx !== p.x || p.ry !== p.y;

export function whereLabel(offices: Office[], x: number, y: number): string {
  const o = officeAt(offices, x, y);
  return o ? `📍 ${o.name}` : '📍 Pasillo';
}

export function chatBubble(text: string): string {
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

export const KEY_TO_DIR: Record<string, Dir> = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
};

/** Pila de teclas de dirección: manda la última pulsada. */
export class KeyStack {
  private keys: Dir[] = [];
  press(dir: Dir): void { this.release(dir); this.keys.push(dir); }
  release(dir: Dir): void { this.keys = this.keys.filter((k) => k !== dir); }
  clear(): void { this.keys = []; }
  get current(): Dir | null { return this.keys.length ? this.keys[this.keys.length - 1] : null; }
}
