import { GAME } from '@vo/shared';

export interface AlarmState {
  active: boolean;
  name: string | null;
  message: string | null;
  endsAt: number | null;
}

const INITIAL: AlarmState = { active: false, name: null, message: null, endsAt: null };

/**
 * Acorde mayor (C5–E5–G5). Suena como un pequeño carillón amable: llama la
 * atención sin resultar agresivo ni estridente (nada de sirenas ni ondas cuadradas).
 */
const CHORD_HZ = [523.25, 659.25, 783.99];
const NOTE_GAP_MS = 240;
const PATTERN_MS = 4_000;
const NOTE_DECAY_S = 1.8;

export interface AlarmNote {
  /** Desfase respecto al inicio, en milisegundos. */
  time: number;
  freq: number;
  /** Duración de la nota, en segundos. */
  duration: number;
}

/**
 * Secuencia de notas del aviso: un arpegio suave que se repite cada `PATTERN_MS`
 * hasta cubrir `durationMs`. Aislado del audio real para poder probarlo.
 */
export function alarmNotes(durationMs: number): AlarmNote[] {
  const notes: AlarmNote[] = [];
  for (let start = 0; start < durationMs; start += PATTERN_MS) {
    CHORD_HZ.forEach((freq, i) => {
      const time = start + i * NOTE_GAP_MS;
      if (time >= durationMs) return;
      notes.push({ time, freq, duration: Math.min(NOTE_DECAY_S, (durationMs - time) / 1000) });
    });
  }
  return notes;
}

export interface AlarmPayload {
  name?: string | null;
  message?: string | null;
  durationMs?: number;
}

/**
 * Dueño del sonido y del estado visual de la alarma de emergencia. Genera el
 * audio con la Web Audio API (no requiere archivos) y avisa a React mediante
 * `useSyncExternalStore`. Si el navegador no expone `AudioContext` (p. ej. en
 * pruebas) el estado igual se actualiza.
 */
export class AlarmController {
  private state: AlarmState = INITIAL;
  private listeners = new Set<() => void>();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = (): AlarmState => this.state;
  private set(patch: Partial<AlarmState>): void { this.state = { ...this.state, ...patch }; this.listeners.forEach((fn) => fn()); }

  trigger(payload: AlarmPayload): void {
    const durationMs = payload.durationMs ?? GAME.ALARM_DURATION_MS;
    this.play(durationMs);
    this.set({
      active: true,
      name: payload.name?.trim() || null,
      message: payload.message?.trim() || null,
      endsAt: Date.now() + durationMs,
    });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.clear(), durationMs);
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.silence();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
    this.listeners.clear();
    this.state = INITIAL;
  }

  private clear(): void {
    this.silence();
    this.set({ active: false, endsAt: null });
  }

  private play(durationMs: number): void {
    const Ctor = typeof AudioContext === 'undefined' ? undefined : AudioContext;
    if (!Ctor) return;
    this.silence();
    const ctx = (this.ctx ??= new Ctor());
    void ctx.resume().catch(() => {});
    const master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    this.master = master;
    const t0 = ctx.currentTime + 0.04;
    for (const note of alarmNotes(durationMs)) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = note.freq;
      osc.connect(gain).connect(master);
      const start = t0 + note.time / 1000;
      const end = start + note.duration;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.9, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  }

  /** Corta lo que esté sonando sin tocar el estado (evita solapes entre alarmas). */
  private silence(): void {
    const master = this.master;
    const ctx = this.ctx;
    this.master = null;
    if (!master || !ctx) return;
    const now = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + 0.15);
    } catch { /* nodo ya detenido */ }
    setTimeout(() => master.disconnect(), 250);
  }
}
