import { GAME, canTalk } from '@vo/shared';
import type { Player, RoomRuntime } from '../rooms/room.types';

/** Ids de los jugadores con los que `me` puede hablar en este momento. */
export function computeAudible(room: RoomRuntime, me: Player, radius: number = GAME.VOICE_RADIUS): Set<string> {
  const ids = new Set<string>();
  for (const other of room.players.values()) {
    if (other !== me && canTalk(room.offices, me, other, radius)) ids.add(other.id);
  }
  return ids;
}

/**
 * Recalcula quién oye a `me` (y a quién oye `me`) y devuelve los jugadores
 * cuyo conjunto cambió, para avisarles solo a ellos.
 */
export function refreshAudible(room: RoomRuntime, me: Player, radius: number = GAME.VOICE_RADIUS): Player[] {
  const changed: Player[] = [];
  const next = computeAudible(room, me, radius);
  const prev = me.audible;
  if (next.size !== prev.size || [...next].some((id) => !prev.has(id))) {
    me.audible = next;
    changed.push(me);
  }
  for (const other of room.players.values()) {
    if (other === me) continue;
    const had = other.audible.has(me.id);
    const has = next.has(other.id);
    if (had === has) continue;
    if (has) other.audible.add(me.id);
    else other.audible.delete(me.id);
    changed.push(other);
  }
  return changed;
}

/** Quita a `me` de los conjuntos de los demás (al salir) y devuelve los afectados. */
export function dropAudible(room: RoomRuntime, me: Player): Player[] {
  const changed: Player[] = [];
  for (const other of room.players.values()) {
    if (other !== me && other.audible.delete(me.id)) changed.push(other);
  }
  return changed;
}
