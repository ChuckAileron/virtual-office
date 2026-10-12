'use strict';

// Tipos de tile
const T = { FLOOR: 0, WALL: 1, OFFICE: 2, DESK: 3, PLANT: 4, DOOR: 5, TABLE: 6, CHAIR: 7, BOSS: 8, CONF: 9 };
const WALKABLE = new Set([T.FLOOR, T.OFFICE, T.DOOR, T.CHAIR, T.BOSS, T.CONF]);

const OFFICE_W = 9; // incluye paredes
const OFFICE_H = 7;
const BOSS_W = 15;
const BOSS_H = 9;
const CONF_H = 8;
const CONF_MIN_W = 9;
const GAP = 2; // espacio libre entre habitaciones
const MARGIN = 2; // borde del piso hasta la primera habitación (pared + 1 tile de pasillo)

const LIMITS = { maxOffices: 60 };

function clampInt(v, min, max) {
  v = Math.floor(Number(v));
  if (!Number.isFinite(v)) v = min;
  return Math.min(max, Math.max(min, v));
}

const toBool = (v) => v === true || v === 'true' || v === 'on' || v === 1 || v === '1';

/**
 * Calcula la distribución del piso a partir de la cantidad de oficinas y de si
 * hay sala de reuniones (arriba) y oficina del jefe (al medio).
 */
function planLayout(opts = {}) {
  const n = clampInt(opts.offices, 1, LIMITS.maxOffices);
  const conference = toBool(opts.conference);
  const boss = toBool(opts.boss);

  const cols = Math.ceil(Math.sqrt(n));
  const splitRows = (count) => {
    const rows = [];
    for (let left = count; left > 0; left -= cols) rows.push(Math.min(cols, left));
    return rows;
  };
  const topCount = boss ? Math.ceil(n / 2) : n;
  const topRows = splitRows(topCount);
  const bottomRows = splitRows(n - topCount);
  const rowWidth = (k) => k * OFFICE_W + (k - 1) * GAP;

  const perSide = Math.ceil(n / 2); // una persona por oficina
  const confW = conference ? Math.max(CONF_MIN_W, perSide + 6) : 0;
  const bossW = boss ? BOSS_W : 0;
  const widest = Math.max(...topRows, ...(bottomRows.length ? bottomRows : [0]));
  const contentW = Math.max(confW, bossW, rowWidth(widest));
  const width = contentW + 2 * MARGIN;

  const rooms = [];
  let y = MARGIN;
  const centerX = (w) => MARGIN + Math.floor((contentW - w) / 2);
  const section = (kind, w, h, extra) => {
    rooms.push({ kind, x: centerX(w), y, w, h, ...extra });
    y += h + GAP;
  };
  const officeRows = (rowCounts) => {
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

function computeFloorSize(opts) {
  return planLayout(opts).size;
}

function generateLayout(opts) {
  const { size, rooms: placed } = planLayout(opts);
  const { width: W, height: H } = size;

  const tiles = Array.from({ length: H }, () => new Array(W).fill(T.FLOOR));
  for (let x = 0; x < W; x++) { tiles[0][x] = T.WALL; tiles[H - 1][x] = T.WALL; }
  for (let y = 0; y < H; y++) { tiles[y][0] = T.WALL; tiles[y][W - 1] = T.WALL; }

  const offices = [];
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

    let name;
    if (r.kind === 'office') {
      for (let x = dc - 1; x <= dc + 1; x++) tiles[r.y + 2][x] = T.DESK;
      name = `Oficina ${++officeNo}`;
    } else if (r.kind === 'boss') {
      for (let x = dc - 1; x <= dc + 1; x++) tiles[r.y + 3][x] = T.DESK;
      name = 'Oficina del jefe';
    } else {
      // Mesa de reuniones con una silla por oficina (mitad arriba, mitad abajo)
      const tx0 = r.x + 1 + Math.floor((r.w - 2 - r.perSide) / 2);
      for (let i = 0; i < r.perSide; i++) {
        tiles[r.y + 3][tx0 + i] = T.TABLE;
        tiles[r.y + 4][tx0 + i] = T.TABLE;
        tiles[r.y + 2][tx0 + i] = T.CHAIR;
        if (i < size.offices - r.perSide) tiles[r.y + 5][tx0 + i] = T.CHAIR;
      }
      name = 'Sala de reuniones';
    }
    offices.push({ id: offices.length + 1, kind: r.kind, name, x: r.x, y: r.y, w: r.w, h: r.h });
  }

  return { size, tiles, offices };
}

function isWalkable(tiles, x, y) {
  return y >= 0 && y < tiles.length && x >= 0 && x < tiles[0].length && WALKABLE.has(tiles[y][x]);
}

function officeAt(offices, x, y) {
  return offices.find((o) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h) || null;
}

// Regla de voz: dentro de un recinto solo se habla con los de ese recinto;
// en el pasillo se habla con quien esté a distancia <= radius (y también en el pasillo).
function canTalk(offices, a, b, radius) {
  const za = officeAt(offices, a.x, a.y);
  const zb = officeAt(offices, b.x, b.y);
  if (za || zb) return za === zb;
  return Math.hypot(a.x - b.x, a.y - b.y) <= radius;
}

module.exports = { T, LIMITS, OFFICE_W, OFFICE_H, planLayout, computeFloorSize, generateLayout, isWalkable, officeAt, canTalk };
