import type { Dir } from '@vo/shared';

export interface MoveIntentSink {
  move: (dir: Dir) => void;
  turn: (dir: Dir) => void;
}

/**
 * Traduce las teclas de dirección en dos acciones:
 * - un toque breve (menos de `tapMs`) solo gira hacia ese lado;
 * - una pulsación mantenida avanza de forma continua, reenviando `move` cada `sendMs`.
 *
 * Se registra cada tecla por separado, de modo que soltar una tecla corta mientras se
 * mantiene otra no interrumpe el movimiento ni dispara un giro inesperado.
 */
export class MoveIntent {
  private readonly held = new Map<Dir, { start: number; moved: boolean }>();
  private lastMove = 0;
  /** Dirección cuya pulsación-started fue un toque aislado (sin otras teclas mantenidas). */
  private turnOnPress: Dir | null = null;

  constructor(
    private readonly sink: MoveIntentSink,
    private readonly tapMs: number,
    private readonly sendMs: number,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /**
   * Registra una pulsación. Solo la primera dirección pulsada puede acabar en un giro
   * por toque: si ya hay otra tecla mantenida, es una combinación y no debe girarse.
   */
  press(dir: Dir): void {
    if (this.held.has(dir)) return;
    const solo = this.held.size === 0;
    this.held.set(dir, { start: this.now(), moved: false });
    if (solo) this.turnOnPress = dir;
    else if (this.turnOnPress !== null) this.turnOnPress = null;
  }

  release(dir: Dir): void {
    const state = this.held.get(dir);
    this.held.delete(dir);
    if (this.turnOnPress === dir) this.turnOnPress = null;
    // Solo gira si era un toque breve Y no queda ninguna otra dirección pulsada:
    // en una combinación de teclas el giro ya lo produce el movimiento.
    if (state && !state.moved && this.held.size === 0 && this.now() - state.start < this.tapMs) {
      this.sink.turn(dir);
    }
  }

  clear(): void {
    this.held.clear();
    this.turnOnPress = null;
  }

  /** `true` si esta dirección se puede girar manteniendo una tecla cerrada (combinación). */
  get hasCombination(): boolean {
    return this.held.size > 1;
  }

  /** Avanza el estado; `current` es la dirección dominante (última pulsada) o null. */
  tick(current: Dir | null): void {
    if (!current) return;
    const state = this.held.get(current);
    if (!state) return;
    const now = this.now();
    if (!state.moved) {
      if (now - state.start >= this.tapMs) {
        state.moved = true;
        this.sink.move(current);
        this.lastMove = now;
      }
    } else if (now - this.lastMove >= this.sendMs) {
      this.sink.move(current);
      this.lastMove = now;
    }
  }
}
