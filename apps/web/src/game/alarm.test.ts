import { GAME } from '@vo/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlarmController, alarmNotes } from './alarm';

describe('alarmNotes', () => {
  it('genera un arpegio suave que se repite durante toda la duración', () => {
    const notes = alarmNotes(GAME.ALARM_DURATION_MS);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0].time).toBe(0);
    for (const note of notes) {
      expect(note.freq).toBeGreaterThan(0);
      expect(note.time).toBeLessThan(GAME.ALARM_DURATION_MS);
      expect(note.duration).toBeGreaterThan(0);
    }
    expect(notes.length).toBeGreaterThan(3);
    const first = notes.slice(0, 3).map((n) => n.freq);
    const second = notes.slice(3, 6).map((n) => n.freq);
    expect(second).toEqual(first);
  });

  it('no genera notas más allá de una duración corta', () => {
    const notes = alarmNotes(300);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((n) => n.time < 300)).toBe(true);
  });
});

describe('AlarmController', () => {
  afterEach(() => vi.useRealTimers());

  it('activa la alerta con nombre y mensaje y la apaga al terminar', () => {
    vi.useFakeTimers();
    const alarm = new AlarmController();
    const seen: boolean[] = [];
    alarm.subscribe(() => seen.push(alarm.getSnapshot().active));

    alarm.trigger({ name: 'Ana', message: 'Reunión urgente', durationMs: 30_000 });
    expect(alarm.getSnapshot()).toMatchObject({ active: true, name: 'Ana', message: 'Reunión urgente' });
    expect(alarm.getSnapshot().endsAt).toBe(Date.now() + 30_000);

    vi.advanceTimersByTime(30_000);
    expect(alarm.getSnapshot().active).toBe(false);
    expect(seen).toEqual([true, false]);
    alarm.dispose();
  });

  it('ignora un mensaje en blanco', () => {
    vi.useFakeTimers();
    const alarm = new AlarmController();
    alarm.trigger({ name: 'Beto', message: '   ' });
    expect(alarm.getSnapshot().message).toBeNull();
    alarm.dispose();
  });
});
