export const T = {
  FLOOR: 0,
  WALL: 1,
  OFFICE: 2,
  DESK: 3,
  DOOR: 5,
  TABLE: 6,
  CHAIR: 7,
  BOSS: 8,
  CONF: 9,
  LOBBY: 10,
  KITCHEN: 11,
  COUNTER: 12,
  REST: 13,
  SOFA: 14,
  ROUND_TABLE: 15,
} as const;

export type Tiles = number[][];
export type RoomKind = 'office' | 'boss' | 'conference' | 'lobby' | 'kitchen' | 'rest';
export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: Record<Dir, readonly [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

/** Recinto del espacio de trabajo (oficina, oficina del jefe o sala de reuniones). */
export interface Office {
  id: number;
  kind: RoomKind;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FloorSize {
  width: number;
  height: number;
  offices: number;
  conference: boolean;
  boss: boolean;
  kitchen: boolean;
  rest: boolean;
  /** Versión del trazado, para regenerar espacios creados con un diseño anterior. */
  version: number;
}

export interface LayoutOptions {
  offices?: unknown;
  conference?: unknown;
  boss?: unknown;
  kitchen?: unknown;
  rest?: unknown;
}

export interface Layout {
  size: FloorSize;
  tiles: Tiles;
  offices: Office[];
}

export interface PlacedObject {
  id: number;
  type: string;
  x: number;
  y: number;
  perspective?: 'front' | 'side';
  flipped?: boolean;
}

/** Imagen colocada como capa de piso dentro de un recinto. Dimensiones en tiles. */
export interface FloorDecoration {
  id: number;
  imageUrl: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OfficeFloorStyle {
  officeId: number;
  color: string;
  pattern: 'solid' | 'checker';
}

export interface Pet {
  id: number;
  kind: string;
  color: string;
  x: number;
  y: number;
  dir: Dir;
}

export interface Accessories {
  hat: string | null;
  hatColor: string;
  glasses: string | null;
  extra: string | null;
  extraColor: string;
}

export interface Appearance {
  gender: 'male' | 'female';
  style: number;
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  acc: Accessories;
}

export interface Point {
  x: number;
  y: number;
}

/** Estado de un espacio de trabajo en memoria que necesitan las reglas de colocación y movimiento. */
export interface RoomState {
  tiles: Tiles;
  offices?: Office[];
  objects: PlacedObject[];
  pets?: Pet[];
  players: Map<string, Point>;
  blocked: Set<string>;
}
