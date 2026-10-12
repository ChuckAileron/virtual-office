import { describe, expect, it } from 'vitest';
import { T, canTalk, computeFloorSize, generateLayout, isWalkable, officeAt } from '../src';

const countTiles = (tiles: number[][], type: number) => tiles.flat().filter((t) => t === type).length;

describe('layout', () => {
  it('sin extras: solo oficinas', () => {
    const s = computeFloorSize({ offices: 4 });
    expect(s.conference).toBe(false);
    expect(s.boss).toBe(false);
  });

  it('el jefe y la sala de reuniones agrandan el espacio de trabajo', () => {
    const base = computeFloorSize({ offices: 6 });
    expect(computeFloorSize({ offices: 6, conference: true }).height).toBeGreaterThan(base.height);
    expect(computeFloorSize({ offices: 6, boss: true }).height).toBeGreaterThan(base.height);
  });

  it('la sala de reuniones crece con la cantidad de oficinas', () => {
    expect(computeFloorSize({ offices: 40, conference: true }).width).toBeGreaterThanOrEqual(
      computeFloorSize({ offices: 4, conference: true }).width,
    );
  });

  it('incluye siempre una entrada (lobby) al fondo, bajo el recinto', () => {
    for (const offices of [1, 6, 30]) {
      const l = generateLayout({ offices });
      const lobbies = l.offices.filter((o) => o.kind === 'lobby');
      expect(lobbies).toHaveLength(1);
      expect(lobbies[0].name).toBe('Entrada');
      expect(l.size.offices).toBe(offices); // la entrada no cuenta como oficina
      expect(countTiles(l.tiles, T.LOBBY)).toBeGreaterThan(0);
      // La entrada ocupa todo el ancho al fondo del piso.
      expect(lobbies[0].x).toBe(1);
      expect(lobbies[0].w).toBe(l.size.width - 2);
      expect(lobbies[0].y + lobbies[0].h).toBe(l.size.height - 1);
      // El borde que contiene el espacio de trabajo queda por encima de la entrada.
      const gridBottom = Math.max(...l.offices.filter((o) => o.kind !== 'lobby').map((o) => o.y + o.h));
      expect(lobbies[0].y).toBeGreaterThanOrEqual(gridBottom);
    }
  });

  it('conecta la entrada con el espacio de trabajo mediante una puerta', () => {
    for (const offices of [1, 8]) {
      const l = generateLayout({ offices, boss: true });
      const lobby = l.offices.find((o) => o.kind === 'lobby')!;
      const doorX = lobby.x + Math.floor(lobby.w / 2);
      const divider = lobby.y - 1; // pared inferior del recinto del espacio de trabajo
      expect(l.tiles[divider][doorX]).toBe(T.DOOR);
      expect(isWalkable(l.tiles, doorX, divider)).toBe(true);
      expect(l.tiles[divider - 1][doorX]).toBe(T.FLOOR); // pasillo del espacio de trabajo
      expect(l.tiles[divider + 1][doorX]).toBe(T.LOBBY); // ya dentro de la entrada
    }
  });

  it('no genera plantas automáticas', () => {
    const l = generateLayout({ offices: 6, boss: true });
    expect(l.tiles.flat().every((t) => Object.values(T).includes(t as never))).toBe(true);
    expect(l.tiles.flat()).not.toContain(4);
  });

  const cases: Array<[number, boolean, boolean]> = [];
  for (const n of [1, 2, 3, 5, 6, 7, 12, 25, 60]) for (const c of [false, true]) for (const b of [false, true]) cases.push([n, c, b]);

  it.each(cases)('espacio de trabajo válido (oficinas=%i, sala=%s, jefe=%s)', (n, conference, boss) => {
    const l = generateLayout({ offices: n, conference, boss });
    const { width: W, height: H } = l.size;
    expect(l.tiles).toHaveLength(H);
    expect(l.tiles[0]).toHaveLength(W);

    const normal = l.offices.filter((o) => o.kind === 'office');
    const conf = l.offices.filter((o) => o.kind === 'conference');
    const bossRooms = l.offices.filter((o) => o.kind === 'boss');
    expect(normal).toHaveLength(n);
    expect(conf).toHaveLength(conference ? 1 : 0);
    expect(bossRooms).toHaveLength(boss ? 1 : 0);

    for (const o of l.offices) {
      expect(o.x >= 1 && o.y >= 1 && o.x + o.w <= W - 1 && o.y + o.h <= H - 1).toBe(true);
      // Las oficinas tienen puerta en su pared inferior; la entrada la tiene en su pared superior.
      const doorY = o.kind === 'lobby' ? o.y - 1 : o.y + o.h - 1;
      expect(l.tiles[doorY][o.x + Math.floor(o.w / 2)]).toBe(T.DOOR);
    }
    for (let i = 0; i < l.offices.length; i++) {
      for (let j = i + 1; j < l.offices.length; j++) {
        const a = l.offices[i], b = l.offices[j];
        expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
      }
    }

    if (conference) {
      expect(conf[0].y).toBe(Math.min(...l.offices.map((o) => o.y)));
      expect(countTiles(l.tiles, T.CHAIR)).toBe(n);
    }
    if (boss) {
      const b = bossRooms[0];
      expect(b.w).toBeGreaterThan(normal[0].w);
      expect(b.h).toBeGreaterThan(normal[0].h);
      expect(Math.abs(b.x + b.w / 2 - W / 2)).toBeLessThanOrEqual(1);
      if (n > 1) expect(normal.some((o) => o.y < b.y) && normal.some((o) => o.y > b.y)).toBe(true);
    }

    // Todo el espacio de trabajo transitable es alcanzable desde el pasillo
    const start = { x: 1, y: 1 };
    expect(isWalkable(l.tiles, start.x, start.y)).toBe(true);
    const seen = new Set([`${start.x},${start.y}`]);
    const queue = [start];
    while (queue.length) {
      const { x, y } = queue.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        const k = `${nx},${ny}`;
        if (!seen.has(k) && isWalkable(l.tiles, nx, ny)) { seen.add(k); queue.push({ x: nx, y: ny }); }
      }
    }
    let walkable = 0;
    l.tiles.forEach((row, y) => row.forEach((_, x) => { if (isWalkable(l.tiles, x, y)) walkable++; }));
    expect(seen.size).toBe(walkable);
  });

  it('canTalk: recinto cerrado vs. pasillo por distancia', () => {
    const l = generateLayout({ offices: 2 });
    const [o1, o2] = l.offices;
    const inO1a = { x: o1.x + 1, y: o1.y + 1 };
    const inO1b = { x: o1.x + 2, y: o1.y + 3 };
    const inO2 = { x: o2.x + 1, y: o2.y + 1 };
    expect(officeAt(l.offices, inO1a.x, inO1a.y)).toBe(o1);
    expect(canTalk(l.offices, inO1a, inO1b, 5)).toBe(true);
    expect(canTalk(l.offices, inO1a, inO2, 5)).toBe(false);
    expect(canTalk(l.offices, { x: 1, y: 1 }, { x: 3, y: 1 }, 5)).toBe(true);
    expect(canTalk(l.offices, { x: 1, y: 1 }, { x: 10, y: 1 }, 5)).toBe(false);
    expect(canTalk(l.offices, { x: 1, y: 1 }, inO1a, 5)).toBe(false);
  });
});
