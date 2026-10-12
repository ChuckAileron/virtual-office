import { Layout, LayoutOptions, FloorSize, Office, Point, Tiles, T } from './types';

const WALKABLE = new Set<number>([T.FLOOR, T.OFFICE, T.DOOR, T.CHAIR, T.BOSS, T.CONF]);

export const OFFICE_W = 9; // incluye paredes
export const OFFICE_H = 7;
const BOSS_W = 15;
const BOSS_H = 9;
const CONF_H = 8;
const CONF_MIN_W = 9;
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

/**
 * Calcula la distribución del espacio de trabajo a partir de la cantidad de oficinas y de si
 * hay sala de reuniones (arriba) y oficina del jefe (al medio).
 */
export function planLayout(opts: LayoutOptions = {}): { size: FloorSize; rooms: PlannedRoom[] } {
  const n = clampInt(opts.offices, 1, LIMITS.maxOffices);
  const conference = toBool(opts.conference);
  const boss = toBool(opts.boss);

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
  const confW = conference ? Math.max(CONF_MIN_W, perSide + 6) : 0;
  const bossW = boss ? BOSS_W : 0;
  const widest = Math.max(...topRows, ...(bottomRows.length ? bottomRows : [0]));
  const contentW = Math.max(confW, bossW, rowWidth(widest));
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

  if (conference) section('conference', confW, CONF_H, { perSide });
  officeRows(topRows);
  if (boss) section('boss', BOSS_W, BOSS_H);
  officeRows(bottomRows);
  const height = y - GAP + MARGIN;

  return { size: { width, height, offices: n, conference, boss }, rooms };
}

export function computeFloorSize(opts: LayoutOptions): FloorSize {
  return planLayout(opts).size;
}

export function generateLayout(opts: LayoutOptions): Layout {
  const { size, rooms: placed } = planLayout(opts);
  const { width: W, height: H } = size;

  const tiles: Tiles = Array.from({ length: H }, () => new Array<number>(W).fill(T.FLOOR));
  for (let x = 0; x < W; x++) { tiles[0][x] = T.WALL; tiles[H - 1][x] = T.WALL; }
  for (let y = 0; y < H; y++) { tiles[y][0] = T.WALL; tiles[y][W - 1] = T.WALL; }

  const offices: Office[] = [];
  let officeNo = 0;
  for (const r of placed) {
    const floor = r.kind === 'boss' ? T.BOSS : r.kind === 'conference' ? T.CONF : T.OFFICE;
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const wall = x === r.x || x === r.x + r.w - 1 || y === r.y || y === r.y + r.h - 1;
        tiles[y][x] = wall ? T.WALL : floor;
      }
    }
    // puerta de 3 tiles centrada en la pared inferior
    const dc = r.x + Math.floor(r.w / 2);
    for (let x = dc - 1; x <= dc + 1; x++) tiles[r.y + r.h - 1][x] = T.DOOR;

    let name: string;
    if (r.kind === 'office') {
      for (let x = dc - 1; x <= dc + 1; x++) tiles[r.y + 2][x] = T.DESK;
      name = `Oficina ${++officeNo}`;
    } else if (r.kind === 'boss') {
      for (let x = dc - 1; x <= dc + 1; x++) tiles[r.y + 3][x] = T.DESK;
      name = 'Oficina del jefe';
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

  return { size, tiles, offices };
}

export function isWalkable(tiles: Tiles, x: number, y: number): boolean {
  return y >= 0 && y < tiles.length && x >= 0 && x < tiles[0].length && WALKABLE.has(tiles[y][x]);
}

export function officeAt(offices: Office[], x: number, y: number): Office | null {
  return offices.find((o) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h) ?? null;
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
