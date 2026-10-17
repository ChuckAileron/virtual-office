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

  constructor(
    private readonly sink: MoveIntentSink,
    private readonly tapMs: number,
    private readonly sendMs: number,
    private readonly now: () => number = () => performance.now(),
  ) {}

  press(dir: Dir): void {
    if (!this.held.has(dir)) this.held.set(dir, { start: this.now(), moved: false });
  }

  release(dir: Dir): void {
    const state = this.held.get(dir);
    this.held.delete(dir);
    if (state && !state.moved && this.now() - state.start < this.tapMs) this.sink.turn(dir);
  }

  clear(): void {
    this.held.clear();
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
