import { describe, expect, it } from 'vitest';
import {
  CATALOG, CATALOG_LIST, MAX_OBJECTS, PlacedObject, RoomState, T, generateLayout, rebuildBlocked, validatePlacement,
} from '../src';

const mkRoom = (tiles: number[][], objects: PlacedObject[] = []): RoomState => {
  const room: RoomState = { tiles, objects, players: new Map(), blocked: new Set() };
  rebuildBlocked(room);
  return room;
};

const layout = generateLayout({ offices: 3, conference: true, boss: true });
const office = layout.offices.find((o) => o.kind === 'office')!;
const px = office.x + 1, py = office.y + 3; // interior libre, lejos de puertas y del frente del escritorio

describe('validatePlacement', () => {
  const room = mkRoom(layout.tiles);

  it('acepta el interior libre y rechaza entradas inválidas', () => {
    expect(validatePlacement(room, 'plant', px, py)).toBeNull();
    expect(validatePlacement(room, 'plant', 0, 0)).toBeTruthy();
    expect(validatePlacement(room, 'plant', -1, 5)).toBeTruthy();
    expect(validatePlacement(room, 'nope', px, py)).toBeTruthy();
    expect(validatePlacement(room, 'toString', px, py)).toBeTruthy();
    expect(validatePlacement(room, 'plant', 1.5, 2)).toBeTruthy();
  });

  it('rechaza tiles no libres, puertas y frente a escritorios', () => {
    for (let y = 0; y < layout.tiles.length; y++) {
      for (let x = 0; x < layout.tiles[0].length; x++) {
        const t = layout.tiles[y][x];
        if ([T.WALL, T.DOOR, T.DESK, T.TABLE, T.CHAIR].includes(t as never)) expect(validatePlacement(room, 'bin', x, y)).toBeTruthy();
        if (layout.tiles[y - 1]?.[x] === T.DESK) expect(validatePlacement(room, 'bin', x, y)).toBeTruthy();
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => layout.tiles[y + dy]?.[x + dx] === T.DOOR)) {
          expect(validatePlacement(room, 'bin', x, y)).toBeTruthy();
        }
      }
    }
  });

  it('solapamiento: la alfombra va debajo, lo demás no se superpone', () => {
    const base = { type: 'plant', id: 1, x: px, y: py };
    expect(validatePlacement(mkRoom(layout.tiles, [base]), 'bin', px, py)).toBeTruthy();
    expect(validatePlacement(mkRoom(layout.tiles, [base]), 'rug', px, py)).toBeNull();
    const rug = { type: 'rug', id: 2, x: px, y: py };
    expect(validatePlacement(mkRoom(layout.tiles, [base, rug]), 'rug', px + 1, py + 1)).toBeTruthy();
    expect(validatePlacement(mkRoom(layout.tiles, [rug]), 'bin', px + 1, py + 1)).toBeNull();
  });

  it('objetos de 2 tiles', () => {
    expect(validatePlacement(room, 'sofa', px, py + 2)).toBeNull();
    expect(validatePlacement(mkRoom(layout.tiles, [{ type: 'plant', id: 1, x: px, y: py }]), 'sofa', px, py)).toBeTruthy();
  });

  it('un jugador encima impide un objeto sólido, pero no una alfombra', () => {
    const r = mkRoom(layout.tiles);
    r.players.set('a', { x: px, y: py });
    expect(validatePlacement(r, 'bin', px, py)).toBeTruthy();
    expect(validatePlacement(r, 'rug', px, py)).toBeNull();
  });

  it('no puede aislar una zona del piso', () => {
    const corridor = mkRoom([[1, 1, 1, 1, 1], [1, 0, 0, 0, 1], [1, 1, 1, 1, 1]]);
    expect(validatePlacement(corridor, 'plant', 2, 1)).toBeTruthy();
    const open = mkRoom([[1, 1, 1, 1, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 1, 1, 1, 1]]);
    expect(validatePlacement(open, 'plant', 2, 1)).toBeNull();
  });

  it('respeta el límite de objetos', () => {
    const many = Array.from({ length: MAX_OBJECTS }, (_, i) => ({ id: i, type: 'rug', x: 0, y: 0 }));
    expect(validatePlacement(mkRoom(layout.tiles, many), 'plant', px, py)).toBeTruthy();
  });

  it('catálogo consistente', () => {
    expect(CATALOG_LIST.length).toBeGreaterThanOrEqual(12);
    for (const d of CATALOG_LIST) expect(d.name && d.w >= 1 && d.h >= 1 && CATALOG[d.type]).toBeTruthy();
  });
});
