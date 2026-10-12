import { Layout, LayoutOptions, FloorSize, Office, Point, Tiles, T } from './types';

const WALKABLE = new Set<number>([T.FLOOR, T.OFFICE, T.DOOR, T.CHAIR, T.BOSS, T.CONF, T.LOBBY, T.KITCHEN, T.REST, T.SOFA]);

export const OFFICE_W = 9; // incluye paredes
export const OFFICE_H = 7;
const BOSS_W = 15;
const BOSS_H = 9;
const CONF_H = 8;
const CONF_MIN_W = 9;
const GIANT_TV_W = 3;
const KITCHEN_W = 9;
const KITCHEN_H = 7;
const REST_W = 13;
const REST_H = 9;
/** Alto total de la franja de entrada, incluida la pared inferior que la cierra. */
const LOBBY_H = 5;
/** Filas de pasillo de entrada entre la última oficina y el muro que cierra el espacio de trabajo. */
const ENTRANCE_HALL = 3;
const GAP = 2; // espacio libre entre habitaciones
const MARGIN = 2; // borde del piso hasta la primera habitación (pared + 1 tile de pasillo)

export const LIMITS = { maxOffices: 60 };

function clampInt(v: unknown, min: number, max: number): number {
  let n = Math.floor(Number(v));
  if (!Number.isFinite(n)) n = min;
  return Math.min(max, Math.max(min, n));
}

const toBool = (v: unknown) => v === true || v === 'true' || v === 'on' || v === 1 || v === '1';

interface PlannedRoom {
  kind: Office['kind'];
  x: number;
  y: number;
  w: number;
  h: number;
  perSide?: number;
}

/** Rectángulo interior de la entrada (lobby), sin paredes propias. */
export interface PlannedLobby {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Se sube al cambiar el trazado para regenerar los espacios creados con un diseño anterior. */
export const LAYOUT_VERSION = 7;

/**
 * Calcula la distribución del espacio de trabajo a partir de la cantidad de oficinas y de si
 * hay cocina, sala de reuniones y espacio de descanso (arriba) y oficina del jefe (al medio).
 */
export function planLayout(opts: LayoutOptions = {}): { size: FloorSize; rooms: PlannedRoom[]; lobby: PlannedLobby } {
  const n = clampInt(opts.offices, 1, LIMITS.maxOffices);
  const conference = toBool(opts.conference);
  const boss = toBool(opts.boss);
  const kitchen = toBool(opts.kitchen);
  const rest = toBool(opts.rest);

  const cols = Math.ceil(Math.sqrt(n));
  const splitRows = (count: number) => {
    const rows: number[] = [];
    for (let left = count; left > 0; left -= cols) rows.push(Math.min(cols, left));
    return rows;
  };
  const topCount = boss ? Math.ceil(n / 2) : n;
  const topRows = splitRows(topCount);
  const bottomRows = splitRows(n - topCount);
  const rowWidth = (k: number) => k * OFFICE_W + (k - 1) * GAP;

  const perSide = Math.ceil(n / 2); // una persona por oficina
  // Deja espacio para la mesa/sillas de las oficinas y una TV gigante de 3 tiles
  // a cualquiera de los dos costados, con holgura para entrar y salir.
  const confW = conference
    ? Math.max(CONF_MIN_W, perSide + 6 + 2 * GIANT_TV_W)
    : 0;
  const bossW = boss ? BOSS_W : 0;
  const widest = Math.max(...topRows, ...(bottomRows.length ? bottomRows : [0]));

  // Fila superior: cocina (izquierda), sala de reuniones (centro) y descanso (derecha).
  // Si no hay sala de reuniones, lo que se elija queda centrado como grupo.
  const topRooms: PlannedRoom[] = [];
  if (kitchen) topRooms.push({ kind: 'kitchen', x: 0, y: 0, w: KITCHEN_W, h: KITCHEN_H });
  if (conference) topRooms.push({ kind: 'conference', x: 0, y: 0, w: confW, h: CONF_H, perSide });
  if (rest) topRooms.push({ kind: 'rest', x: 0, y: 0, w: REST_W, h: REST_H });
  const topRowW = topRooms.length ? topRooms.reduce((sum, r) => sum + r.w, 0) + (topRooms.length - 1) * GAP : 0;
  const topRowH = Math.max(0, ...topRooms.map((r) => r.h));

  const contentW = Math.max(confW, bossW, topRowW, rowWidth(widest));
  const width = contentW + 2 * MARGIN;

  const rooms: PlannedRoom[] = [];
  let y = MARGIN;
  const centerX = (w: number) => MARGIN + Math.floor((contentW - w) / 2);
  const section = (kind: Office['kind'], w: number, h: number, extra?: { perSide: number }) => {
    rooms.push({ kind, x: centerX(w), y, w, h, ...extra });
    y += h + GAP;
  };
  const officeRows = (rowCounts: number[]) => {
    for (const k of rowCounts) {
      const startX = centerX(rowWidth(k));
      for (let i = 0; i < k; i++) rooms.push({ kind: 'office', x: startX + i * (OFFICE_W + GAP), y, w: OFFICE_W, h: OFFICE_H });
      y += OFFICE_H + GAP;
    }
  };

  if (topRooms.length) {
    let x = centerX(topRowW);
    for (const r of topRooms) { rooms.push({ ...r, x, y }); x += r.w + GAP; }
    y += topRowH + GAP;
  }
  officeRows(topRows);
  if (boss) section('boss', BOSS_W, BOSS_H);
  officeRows(bottomRows);
  // El recinto del espacio de trabajo (con su borde inferior) queda por encima de la entrada.
  // La entrada (lobby) es una franja a todo el ancho al fondo, con una puerta que la conecta.
  const workspaceH = y - GAP + ENTRANCE_HALL + 1; // incluye la fila de pared que cierra el recinto
  const lobby: PlannedLobby = { x: 1, y: workspaceH, w: width - 2, h: LOBBY_H - 1 };
  const height = workspaceH + LOBBY_H;

  return { size: { width, height, offices: n, conference, boss, kitchen, rest, version: LAYOUT_VERSION }, rooms, lobby };
}

export function computeFloorSize(opts: LayoutOptions): FloorSize {
  return planLayout(opts).size;
}

/** Sillones (transitables) alrededor de mesas redondas dentro del espacio de descanso. */
function placeRest(tiles: Tiles, r: PlannedRoom): void {
  const ax = r.x + 1, ay = r.y + 1;
  const cluster = (tx: number, ty: number) => {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) tiles[ty + dy][tx + dx] = T.ROUND_TABLE;
    const seats: Array<[number, number]> = [
      [tx, ty - 1], [tx + 1, ty - 1], // arriba
      [tx, ty + 2], [tx + 1, ty + 2], // abajo
      [tx - 1, ty], [tx - 1, ty + 1], // izquierda
      [tx + 2, ty], [tx + 2, ty + 1], // derecha
    ];
    for (const [sx, sy] of seats) if (tiles[sy]?.[sx] !== undefined && tiles[sy][sx] !== T.WALL) tiles[sy][sx] = T.SOFA;
  };
  cluster(ax + 2, ay + 2);
  cluster(ax + 7, ay + 2);
}

export function generateLayout(opts: LayoutOptions): Layout {
  const { size, rooms: placed, lobby } = planLayout(opts);
  const { width: W, height: H } = size;

  const tiles: Tiles = Array.from({ length: H }, () => new Array<number>(W).fill(T.FLOOR));
  for (let x = 0; x < W; x++) { tiles[0][x] = T.WALL; tiles[H - 1][x] = T.WALL; }
  for (let y = 0; y < H; y++) { tiles[y][0] = T.WALL; tiles[y][W - 1] = T.WALL; }

  const offices: Office[] = [];
  let officeNo = 0;
  for (const r of placed) {
    const floor = r.kind === 'boss' ? T.BOSS : r.kind === 'conference' ? T.CONF : r.kind === 'kitchen' ? T.KITCHEN : r.kind === 'rest' ? T.REST : T.OFFICE;
    const openArea = r.kind === 'rest';
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const wall = !openArea && (x === r.x || x === r.x + r.w - 1 || y === r.y || y === r.y + r.h - 1);
        tiles[y][x] = wall ? T.WALL : floor;
      }
    }
    const dc = r.x + Math.floor(r.w / 2);
    if (!openArea) {
      // Puerta de 3 tiles centrada en la pared inferior.
      for (let x = dc - 1; x <= dc + 1; x++) tiles[r.y + r.h - 1][x] = T.DOOR;
    }

    let name: string;
    if (r.kind === 'office') {
      for (let x = dc - 1; x <= dc + 1; x++) tiles[r.y + 2][x] = T.DESK;
      name = `Oficina ${++officeNo}`;
    } else if (r.kind === 'boss') {
      for (let x = dc - 1; x <= dc + 1; x++) tiles[r.y + 3][x] = T.DESK;
      name = 'Oficina del jefe';
    } else if (r.kind === 'kitchen') {
      for (let x = r.x + 1; x <= r.x + r.w - 2; x++) tiles[r.y + 1][x] = T.COUNTER;
      name = 'Cocina';
    } else if (r.kind === 'rest') {
      placeRest(tiles, r);
      name = 'Espacio de descanso';
    } else {
      // Mesa de reuniones con una silla por oficina (mitad arriba, mitad abajo)
      const perSide = r.perSide ?? 0;
      const tx0 = r.x + 1 + Math.floor((r.w - 2 - perSide) / 2);
      for (let i = 0; i < perSide; i++) {
        tiles[r.y + 3][tx0 + i] = T.TABLE;
        tiles[r.y + 4][tx0 + i] = T.TABLE;
        tiles[r.y + 2][tx0 + i] = T.CHAIR;
        if (i < size.offices - perSide) tiles[r.y + 5][tx0 + i] = T.CHAIR;
      }
      name = 'Sala de reuniones';
    }
    offices.push({ id: offices.length + 1, kind: r.kind, name, x: r.x, y: r.y, w: r.w, h: r.h });
  }

  // Pared que contiene el espacio de trabajo (queda por encima de la entrada) con su puerta de acceso.
  const dividerY = lobby.y - 1;
  for (let x = 0; x < W; x++) tiles[dividerY][x] = T.WALL;
  const doorX = Math.floor(W / 2);
  for (let x = doorX - 1; x <= doorX + 1; x++) tiles[dividerY][x] = T.DOOR;

  // Suelo de la entrada (lobby): franja a todo el ancho al fondo, acceso al espacio de trabajo.
  for (let y = lobby.y; y < lobby.y + lobby.h; y++) {
    for (let x = lobby.x; x < lobby.x + lobby.w; x++) tiles[y][x] = T.LOBBY;
  }
  offices.push({ id: offices.length + 1, kind: 'lobby', name: 'Entrada', x: lobby.x, y: lobby.y, w: lobby.w, h: lobby.h });

  return { size, tiles, offices };
}

export function isWalkable(tiles: Tiles, x: number, y: number): boolean {
  return y >= 0 && y < tiles.length && x >= 0 && x < tiles[0].length && WALKABLE.has(tiles[y][x]);
}

export function officeAt(offices: Office[], x: number, y: number): Office | null {
  return offices.find((o) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h) ?? null;
}

/** Recinto de entrada (lobby) donde aparecen los personajes al entrar. */
export function lobbyOf(offices: Office[]): Office | null {
  return offices.find((o) => o.kind === 'lobby') ?? null;
}

/**
 * Regla de voz: dentro de un recinto solo se habla con los de ese recinto;
 * en el pasillo se habla con quien esté a distancia <= radius (y también en el pasillo).
 */
export function canTalk(offices: Office[], a: Point, b: Point, radius: number): boolean {
  const za = officeAt(offices, a.x, a.y);
  const zb = officeAt(offices, b.x, b.y);
  if (za || zb) return za === zb;
  return Math.hypot(a.x - b.x, a.y - b.y) <= radius;
}
