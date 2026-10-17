import type { Dir } from '@vo/shared';

export interface MoveIntentSink {
  move: (dir: Dir) => void;
  turn: (dir: Dir) => void;
}

interface HeldKey {
  start: number;
  moved: boolean;
  /** `true` si se pulsó sin ninguna otra dirección mantenida (toque aislado). */
  alone: boolean;
}

/**
 * Traduce las teclas de dirección en dos acciones:
 * - un toque aislado y breve (menos de `tapMs`) solo gira hacia ese lado;
 * - una pulsación mantenida avanza de forma continua, reenviando `move` cada `sendMs`.
 *
 * Combinaciones: si ya hay una dirección mantenida, la nueva tecla solo toma el
 * relevo tras `takeoverMs`. Antes de eso no gira ni mueve, así que caminar a la
 * izquierda y rozar la derecha no produce el doble giro.
 */
export class MoveIntent {
  private readonly held = new Map<Dir, HeldKey>();
  private lastMove = 0;
  private walking = false;

  constructor(
    private readonly sink: MoveIntentSink,
    private readonly tapMs: number,
    private readonly sendMs: number,
    private readonly takeoverMs: number = tapMs,
    private readonly now: () => number = () => performance.now(),
  ) {}

  press(dir: Dir): void {
    if (this.held.has(dir)) return;
    this.held.set(dir, { start: this.now(), moved: false, alone: this.held.size === 0 });
  }

  release(dir: Dir): void {
    const state = this.held.get(dir);
    this.held.delete(dir);
    if (this.held.size === 0) this.walking = false;
    // El giro por toque solo existe estando quieto: al caminar, cualquier pulsación
    // adicional mueve o espera el relevo, pero nunca hace girar al personaje.
    if (
      !this.isWalking
      && state
      && state.alone
      && !state.moved
      && this.held.size === 0
      && this.now() - state.start < this.tapMs
    ) {
      this.sink.turn(dir);
    }
  }

  clear(): void {
    this.held.clear();
    this.walking = false;
  }

  /** `true` si hay más de una dirección mantenida a la vez. */
  get hasCombination(): boolean {
    return this.held.size > 1;
  }

  /** `true` mientras el personaje está avanzando por alguna tecla mantenida. */
  get isWalking(): boolean {
    return this.walking;
  }

  /** Avanza el estado; `current` es la dirección dominante (última pulsada) o null. */
  tick(current: Dir | null): void {
    if (!current) return;
    const state = this.held.get(current);
    if (!state) return;
    const now = this.now();
    const threshold = state.alone ? this.tapMs : this.takeoverMs;
    if (!state.moved) {
      if (now - state.start >= threshold) {
        state.moved = true;
        this.walking = true;
        this.sink.move(current);
        this.lastMove = now;
      }
    } else if (now - this.lastMove >= this.sendMs) {
      this.walking = true;
      this.sink.move(current);
      this.lastMove = now;
    }
  }
}
