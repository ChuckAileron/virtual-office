import { T, type Dir, type Office, type Tiles } from './types';

/** Asiento de la sala de reuniones: casilla y orientación al sentarse. */
export interface Seat {
  x: number;
  y: number;
  dir: Dir;
}

/**
 * Posición de pie al extremo izquierdo de la mesa de la sala de reuniones, mirando
 * hacia ella. El jefe no tiene silla (hay una por oficina), así que preside desde ahí.
 * Devuelve `null` si no hay sala de reuniones o no se encuentra la mesa.
 */
export function meetingHead(offices: Office[], tiles: Tiles): Seat | null {
  const room = offices.find((o) => o.kind === 'conference');
  if (!room) return null;

  let left: { x: number; y: number } | null = null;
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (tiles[y]?.[x] !== T.TABLE) continue;
      if (!left || x < left.x || (x === left.x && y < left.y)) left = { x, y };
    }
  }
  if (!left) return null;

  const head: Seat = { x: left.x - 1, y: left.y, dir: 'right' };
  const t = tiles[head.y]?.[head.x];
  return t === T.CONF || t === T.FLOOR ? head : null;
}

/**
 * Asientos de la sala de reuniones para `count` personas. Prioriza las sillas de la
 * mesa (mirando hacia ella) y, si faltan, usa el piso libre del recinto por filas.
 * Devuelve una lista vacía si el espacio de trabajo no tiene sala de reuniones.
 */
export function meetingSeats(offices: Office[], tiles: Tiles, blocked: Set<string>, count: number): Seat[] {
  const room = offices.find((o) => o.kind === 'conference');
  if (!room) return [];

  const chairs: Seat[] = [];
  const spare: Seat[] = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (blocked.has(`${x},${y}`)) continue;
      const t = tiles[y]?.[x];
      if (t === T.CHAIR) {
        chairs.push({ x, y, dir: tiles[y + 1]?.[x] === T.TABLE ? 'down' : 'up' });
      } else if (t === T.CONF || t === T.FLOOR) {
        spare.push({ x, y, dir: 'down' });
      }
    }
  }

  const byRow = (a: Seat, b: Seat) => a.y - b.y || a.x - b.x;
  chairs.sort(byRow);
  spare.sort(byRow);

  const wanted = Math.max(0, Math.floor(count));
  return [...chairs, ...spare].slice(0, wanted);
}
