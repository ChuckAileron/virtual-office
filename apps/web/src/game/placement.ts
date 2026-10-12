import { T, footprint, type CatalogEntry, type PlacedObject } from '@vo/shared';
import type { GameState } from './state';

const PLACEABLE = new Set<number>([T.FLOOR, T.OFFICE, T.BOSS, T.CONF]);
const PET_FLOORS = new Set<number>([T.OFFICE, T.BOSS, T.CONF]);
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];

type Placement = Pick<GameState, 'room' | 'objects' | 'defs' | 'players' | 'pets'>;

/** Comprobación local solo para colorear la vista previa; el servidor decide. */
export function canPlaceObject(s: Placement, def: CatalogEntry, x: number, y: number): boolean {
  const { tiles } = s.room;
  const mine = footprint(def, x, y);
  const has = (px: number, py: number) => mine.some(([cx, cy]) => cx === px && cy === py);
  for (const [cx, cy] of mine) {
    const t = tiles[cy]?.[cx];
    if (t === undefined || !PLACEABLE.has(t)) return false;
    if (ORTHO.some(([dx, dy]) => tiles[cy + dy]?.[cx + dx] === T.DOOR)) return false;
    if (tiles[cy - 1]?.[cx] === T.DESK) return false;
    if (t === T.BOSS && tiles[cy + 1]?.[cx] === T.DESK) return false;
  }
  for (const o of s.objects) {
    const od = s.defs.get(o.type);
    if (od && (od.layer === 'floor') === (def.layer === 'floor') && footprint(od, o.x, o.y).some(([ox, oy]) => has(ox, oy))) return false;
  }
  if (def.solid) {
    for (const p of s.players.values()) if (has(p.x, p.y)) return false;
    for (const p of s.pets.values()) if (has(p.x, p.y)) return false;
  }
  return true;
}

export const petAt = (s: Pick<GameState, 'pets'>, x: number, y: number) =>
  [...s.pets.values()].find((p) => p.x === x && p.y === y) ?? null;

export function canPlacePet(s: Placement, x: number, y: number): boolean {
  const t = s.room.tiles[y]?.[x];
  if (t === undefined || !PET_FLOORS.has(t)) return false;
  if (petAt(s, x, y)) return false;
  for (const p of s.players.values()) if (p.x === x && p.y === y) return false;
  return !s.objects.some((o) => {
    const od = s.defs.get(o.type);
    return od?.solid && footprint(od, o.x, o.y).some(([cx, cy]) => cx === x && cy === y);
  });
}

/** Objeto bajo una casilla; los de encima tienen prioridad sobre las alfombras. */
export function objectAt(s: Pick<GameState, 'objects' | 'defs'>, x: number, y: number): PlacedObject | null {
  let found: PlacedObject | null = null;
  for (const o of s.objects) {
    const od = s.defs.get(o.type);
    if (od && footprint(od, o.x, o.y).some(([cx, cy]) => cx === x && cy === y) && (!found || od.layer !== 'floor')) found = o;
  }
  return found;
}
