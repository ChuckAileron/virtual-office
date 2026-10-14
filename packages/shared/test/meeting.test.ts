import { describe, expect, it } from 'vitest';
import { T, generateLayout, meetingHead, meetingSeats } from '../src';

describe('meetingSeats', () => {
  it('siempre devuelve asientos dentro de la sala de reuniones y sobre sillas', () => {
    const { offices, tiles } = generateLayout({ offices: 4, conference: true });
    const room = offices.find((o) => o.kind === 'conference')!;
    const seats = meetingSeats(offices, tiles, new Set(), 4);
    expect(seats).toHaveLength(4);
    for (const seat of seats) {
      expect(seat.x).toBeGreaterThanOrEqual(room.x);
      expect(seat.x).toBeLessThan(room.x + room.w);
      expect(seat.y).toBeGreaterThanOrEqual(room.y);
      expect(seat.y).toBeLessThan(room.y + room.h);
      expect(tiles[seat.y][seat.x]).toBe(T.CHAIR);
    }
  });

  it('sin sala de reuniones no hay asientos', () => {
    const { offices, tiles } = generateLayout({ offices: 2 });
    expect(meetingSeats(offices, tiles, new Set(), 2)).toEqual([]);
  });

  it('cuando faltan sillas usa el piso libre de la sala', () => {
    const { offices, tiles } = generateLayout({ offices: 2, conference: true });
    const room = offices.find((o) => o.kind === 'conference')!;
    const seats = meetingSeats(offices, tiles, new Set(), 5);
    expect(seats).toHaveLength(5);
    for (const seat of seats) {
      expect(seat.x).toBeGreaterThanOrEqual(room.x);
      expect(seat.x).toBeLessThan(room.x + room.w);
      expect(seat.y).toBeGreaterThanOrEqual(room.y);
      expect(seat.y).toBeLessThan(room.y + room.h);
    }
    // Las sillas se ocupan antes que el piso.
    expect(seats.slice(0, 2).every((s) => tiles[s.y][s.x] === T.CHAIR)).toBe(true);
  });

  it('nunca devuelve más asientos que personas', () => {
    const { offices, tiles } = generateLayout({ offices: 6, conference: true });
    expect(meetingSeats(offices, tiles, new Set(), 3)).toHaveLength(3);
    expect(meetingSeats(offices, tiles, new Set(), 0)).toHaveLength(0);
  });

  it('meetingHead devuelve pie al extremo izquierdo de la mesa mirando a derecha', () => {
    const { offices, tiles } = generateLayout({ offices: 3, conference: true });
    const room = offices.find((o) => o.kind === 'conference')!;
    const head = meetingHead(offices, tiles);
    expect(head).not.toBeNull();
    if (!head) return;
    expect(head.dir).toBe('right');
    expect(head.x + 1).toBeGreaterThanOrEqual(room.x + 1);
    expect(head.y).toBeGreaterThanOrEqual(room.y + 2);
    expect(tiles[head.y][head.x]).toBe(T.CONF);
  });

  it('meetingHead devuelve null si no hay mesa o no hay sala', () => {
    expect(meetingHead([], Array.from({ length: 1 }, () => [T.FLOOR]))).toBeNull();
    const { offices, tiles } = generateLayout({ offices: 2 });
    expect(meetingHead(offices, tiles)).toBeNull();
  });
});
