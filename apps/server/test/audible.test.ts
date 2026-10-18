import { describe, expect, it } from 'vitest';
import { generateLayout } from '@vo/shared';
import { dropAudible, refreshAudible } from '../src/realtime/audible';
import type { Player, RoomRuntime } from '../src/rooms/room.types';

const layout = generateLayout({ offices: 2 });
const room: RoomRuntime = {
  code: 'T', name: 'T', size: layout.size, tiles: layout.tiles, offices: layout.offices,
  objects: [], pets: [], floorDecorations: [], floorStyles: [], officeOwners: new Map(), players: new Map(), blocked: new Set(),
};
const mk = (id: string, x: number, y: number): Player =>
  ({ id, x, y, audible: new Set<string>() } as unknown as Player);
const add = (p: Player) => room.players.set(p.id, p);

describe('audible', () => {
  const o = layout.offices[0];
  const inside = { x: o.x + 2, y: o.y + 2 };

  it('detecta quién cambia al entrar, y limpia al salir', () => {
    const a = mk('a', inside.x, inside.y);
    const b = mk('b', inside.x + 1, inside.y);
    add(a);
    expect(refreshAudible(room, a)).toHaveLength(0);
    add(b);
    const changed = refreshAudible(room, b);
    expect(changed.map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect([...a.audible]).toEqual(['b']);
    expect(refreshAudible(room, b)).toHaveLength(0);
    room.players.delete('b');
    expect(dropAudible(room, b).map((p) => p.id)).toEqual(['a']);
    expect(a.audible.size).toBe(0);
  });
});
