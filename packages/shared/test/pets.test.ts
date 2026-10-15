import { describe, expect, it } from 'vitest';
import { MAX_PETS, Pet, RoomState, T, generateLayout, officeAt, rebuildBlocked, stepPet, validatePet } from '../src';

const layout = generateLayout({ offices: 3, conference: true, boss: true });
const mk = () => {
  const room = { tiles: layout.tiles, offices: layout.offices, objects: [], pets: [] as Pet[], players: new Map(), blocked: new Set<string>() } as RoomState & { pets: Pet[]; offices: typeof layout.offices };
  rebuildBlocked(room);
  return room as Required<Pick<typeof room, 'tiles' | 'offices' | 'objects' | 'pets' | 'players' | 'blocked'>>;
};
const office = layout.offices.find((o) => o.kind === 'office')!;
const px = office.x + 1, py = office.y + 3;

describe('validatePet', () => {
  const room = mk();

  it('valida tipo, color y coordenadas', () => {
    expect(validatePet(room, 'dog', 'brown', px, py)).toBeNull();
    expect(validatePet(room, 'cat', 'black', px, py)).toBeNull();
    expect(validatePet(room, 'bird', 'brown', px, py)).toBeTruthy();
    expect(validatePet(room, 'dog', 'pink', px, py)).toBeTruthy();
    expect(validatePet(room, 'dog', 'brown', 1.5, py)).toBeTruthy();
  });

  it('solo dentro de oficina / jefe / sala; nunca en pasillo, paredes, puertas o escritorios', () => {
    for (let y = 0; y < layout.tiles.length; y++) {
      for (let x = 0; x < layout.tiles[0].length; x++) {
        const t = layout.tiles[y][x];
        if ([T.FLOOR, T.WALL, T.DOOR, T.DESK, T.TABLE].includes(t as never)) expect(validatePet(room, 'dog', 'brown', x, y)).toBeTruthy();
      }
    }
    for (const kind of ['boss', 'conference']) {
      const o = layout.offices.find((r) => r.kind === kind)!;
      expect(validatePet(room, 'cat', 'gray', o.x + 1, o.y + o.h - 2)).toBeNull();
    }
  });

  it('no sobre objetos sólidos, otras mascotas ni jugadores', () => {
    const r = mk();
    r.blocked.add(`${px},${py}`);
    expect(validatePet(r, 'dog', 'brown', px, py)).toBeTruthy();
    r.pets.push({ id: 1, kind: 'dog', color: 'brown', x: px + 2, y: py, dir: 'down' });
    expect(validatePet(r, 'cat', 'brown', px + 2, py)).toBeTruthy();
    r.players.set('a', { x: px + 3, y: py });
    expect(validatePet(r, 'cat', 'brown', px + 3, py)).toBeTruthy();
  });

  it('respeta el máximo', () => {
    const r = mk();
    r.pets = Array.from({ length: MAX_PETS }, (_, i) => ({ id: i, kind: 'dog', color: 'brown', x: 0, y: 0, dir: 'down' as const }));
    expect(validatePet(r, 'dog', 'brown', px, py)).toBeTruthy();
  });
});

describe('stepPet', () => {
  it('deambula al azar sin salir nunca de su recinto', () => {
    for (const o of layout.offices) {
      const r = mk();
      const pet: Pet = { id: 1, kind: 'dog', color: 'brown', x: o.x + 1, y: o.y + o.h - 2, dir: 'down' };
      r.pets.push(pet);
      const visited = new Set<string>();
      for (let i = 0; i < 3000; i++) {
        stepPet(r, pet);
        expect(officeAt(layout.offices, pet.x, pet.y)).toBe(o);
        expect([T.OFFICE, T.BOSS, T.CONF, T.LOBBY, T.SOFA]).toContain(layout.tiles[pet.y][pet.x]);
        visited.add(`${pet.x},${pet.y}`);
      }
      expect(visited.size).toBeGreaterThan(5);
    }
  });

  it('esquiva objetos sólidos y jugadores', () => {
    const r = mk();
    const blockedKey = `${office.x + 2},${office.y + 3}`;
    r.blocked.add(blockedKey);
    r.players.set('p', { x: office.x + 3, y: office.y + 3 });
    const pet: Pet = { id: 1, kind: 'dog', color: 'brown', x: office.x + 1, y: office.y + 3, dir: 'down' };
    r.pets.push(pet);
    for (let i = 0; i < 2000; i++) {
      stepPet(r, pet);
      expect(`${pet.x},${pet.y}`).not.toBe(blockedKey);
      expect(pet.x === office.x + 3 && pet.y === office.y + 3).toBe(false);
    }
  });
});
