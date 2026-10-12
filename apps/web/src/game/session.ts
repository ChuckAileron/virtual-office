import type { Accessories, AppearancePatch, PlayerView } from '@vo/shared';
import { GAME } from '@vo/shared';
import { getConfig } from '../net/api';
import { createSocket, type GameSocket } from '../net/socket';
import { VoiceController } from '../net/voice';
import { BuildController } from './build';
import { ACTIVITY_THROTTLE_MS, BUBBLE_MS, CHAT_LINES } from './constants';
import { mouseToTile } from './coords';
import { render } from './renderer';
import { chatBubble, createState, interpolate, KEY_TO_DIR, KeyStack, makePet, makePlayer, whereLabel, type GameState } from './state';

export interface ChatLine {
  id: number;
  name: string;
  text: string;
}

export const MOVE_SEND_MS = GAME.MOVE_INTERVAL_MS + 20;

/**
 * Sesión de juego: dueña del socket, del estado mutable del mapa y de la voz.
 * React solo observa `version` (useSyncExternalStore); el canvas se dibuja con rAF.
 */
export class GameSession {
  state: GameState | null = null;
  chat: ChatLine[] = [];
  where = '';
  version = 0;
  readonly build: BuildController;
  readonly voice: VoiceController;
  readonly socket: GameSocket;

  private listeners = new Set<() => void>();
  private canvas: HTMLCanvasElement | null = null;
  private raf = 0;
  private lastT = 0;
  private lastMove = 0;
  private lastActivity = 0;
  private chatId = 0;
  private keys = new KeyStack();
  private closed = false;
  private detachInput: (() => void) | null = null;

  constructor(token: string, code: string, private readonly onClose: (reason: string) => void) {
    this.build = new GameBuild(this).create();
    this.voice = new VoiceController({
      requestToken: () => new Promise((resolve) => {
        if (!this.socket.connected) { resolve({ ok: false, error: 'Sin conexión con el servidor' }); return; }
        this.socket.emit('voice_token', resolve);
      }),
      getConfigUrl: () => getConfig().then((c) => c.livekitUrl).catch(() => null),
      getName: (id) => this.state?.players.get(id)?.name ?? 'Alguien',
      setLevel: (id, level) => {
        const st = this.state;
        const p = st?.players.get(id === 'me' ? st.you : id);
        if (p) p.level = level;
      },
      setVoiceFlag: (on) => {
        this.socket.emit('voice', { on });
        const me = this.me();
        if (me) me.voice = on;
        this.emit();
      },
      onSpeaking: () => this.reportActivity(),
    });
    this.socket = createSocket(token);
    this.wire(code);
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  getVersion = (): number => this.version;

  emit(): void {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  get connected(): boolean { return this.socket.connected; }

  private wire(code: string): void {
    const s = this.socket;
    s.on('connect', () => s.emit('join', { code }));
    s.on('connect_error', (e) => this.close(e.message && e.message !== 'xhr poll error' ? e.message : 'No se pudo conectar con el servidor'));
    s.on('disconnect', () => this.close('Se perdió la conexión con el servidor'));
    s.on('error', (p) => this.close(p.error));
    s.on('replaced', () => this.close('Tu cuenta se abrió en otra pestaña o dispositivo'));
    s.on('welcome', (w) => {
      this.state = createState(w);
      this.where = this.computeWhere();
      this.build.init();
      this.emit();
    });
    s.on('joined', ({ player }) => { this.state?.players.set(player.id, makePlayer(player)); this.emit(); });
    s.on('left', ({ id }) => { this.state?.players.delete(id); this.emit(); });
    s.on('moved', ({ id, x, y, dir }) => {
      const p = this.state?.players.get(id);
      if (p) { p.x = x; p.y = y; p.dir = dir; }
    });
    s.on('voice', ({ id, on }) => {
      const p = this.state?.players.get(id);
      if (p) { p.voice = on; this.emit(); }
    });
    s.on('presence', ({ id, idle }) => {
      const p = this.state?.players.get(id);
      if (p) { p.idle = idle; this.emit(); }
    });
    s.on('look', ({ id, appearance }) => {
      const p = this.state?.players.get(id);
      if (p) { p.appearance = appearance; this.emit(); }
    });
    s.on('object_add', ({ object }) => { this.state?.objects.push(object); });
    s.on('object_remove', ({ id }) => { if (this.state) this.state.objects = this.state.objects.filter((o) => o.id !== id); });
    s.on('pet_add', ({ pet }) => { this.state?.pets.set(pet.id, makePet(pet)); });
    s.on('pet_remove', ({ id }) => { this.state?.pets.delete(id); });
    s.on('pet_move', ({ id, x, y, dir }) => {
      const p = this.state?.pets.get(id);
      if (p) { p.x = x; p.y = y; p.dir = dir; }
    });
    s.on('build_error', ({ error }) => this.build.error(error));
    s.on('audible', ({ ids }) => this.voice.setAudible(ids));
    s.on('chat', ({ id, name, text }) => {
      const p = this.state?.players.get(id);
      if (p) { p.bubble = chatBubble(text); p.bubbleUntil = performance.now() + BUBBLE_MS; }
      this.chat = [...this.chat, { id: ++this.chatId, name, text }].slice(-CHAT_LINES);
      this.emit();
    });
  }

  private computeWhere(): string {
    const st = this.state;
    const me = st?.players.get(st.you);
    return st && me ? whereLabel(st.room.offices, me.x, me.y) : '';
  }

  /** Acciones de red usadas por el modo decorar. */
  sendPlace = (kind: string, x: number, y: number): void => { if (this.socket.connected) this.socket.emit('place', { kind, x, y }); };
  sendRemoveObject = (id: number): void => { if (this.socket.connected) this.socket.emit('remove_object', { id }); };
  sendPlacePet = (kind: string, color: string, x: number, y: number): void => { if (this.socket.connected) this.socket.emit('place_pet', { kind, color, x, y }); };
  sendRemovePet = (id: number): void => { if (this.socket.connected) this.socket.emit('remove_pet', { id }); };
  sendLook = (acc: Partial<Accessories>): void => { if (this.socket.connected) this.socket.emit('set_look', { acc }); };
  sendAppearance = (look: AppearancePatch): void => { if (this.socket.connected) this.socket.emit('set_look', { look }); };

  sendChat(text: string): void {
    const t = text.trim();
    if (t && this.socket.connected) this.socket.emit('chat', { text: t.slice(0, GAME.CHAT_MAX) });
  }

  me(): PlayerView | undefined {
    const st = this.state;
    return st?.players.get(st.you);
  }

  reportActivity = (): void => {
    if (!this.socket.connected) return;
    const now = performance.now();
    if (now - this.lastActivity < ACTIVITY_THROTTLE_MS) return;
    this.lastActivity = now;
    this.socket.emit('activity');
  };

  focusChat: (() => void) | null = null;
  blurChat: (() => void) | null = null;

  /** Engancha el canvas: bucle de dibujo, teclado y mouse. Devuelve la función de limpieza. */
  attachCanvas(canvas: HTMLCanvasElement): () => void {
    this.canvas = canvas;
    const resize = (): void => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const isTyping = (): boolean => {
      const a = document.activeElement;
      return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement;
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (isTyping()) this.blurChat?.();
        else this.build.escape();
        return;
      }
      if (isTyping()) return;
      if (e.key === 'Enter') { e.preventDefault(); this.focusChat?.(); return; }
      const dir = KEY_TO_DIR[e.key];
      if (dir) { e.preventDefault(); this.keys.press(dir); }
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      const dir = KEY_TO_DIR[e.key];
      if (dir) this.keys.release(dir);
    };
    const onBlur = (): void => this.keys.clear();
    const tile = (e: MouseEvent) => mouseToTile(e.clientX, e.clientY, canvas.getBoundingClientRect(), canvas.width, canvas.height, this.state?.cam ?? { x: 0, y: 0 });
    const onMouseMove = (e: MouseEvent): void => { if (this.build.open) this.build.setHover(tile(e)); };
    const onMouseLeave = (): void => this.build.setHover(null);
    const onClick = (e: MouseEvent): void => {
      if (!this.build.open) return;
      const t = tile(e);
      this.build.clickTile(t.x, t.y);
    };
    const onContext = (e: MouseEvent): void => {
      if (!this.build.open) return;
      e.preventDefault();
      this.build.cancel();
    };
    const activityEvents = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'] as const;

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    activityEvents.forEach((ev) => window.addEventListener(ev, this.reportActivity, { passive: true }));
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('contextmenu', onContext);

    this.lastT = performance.now();
    const frame = (now: number): void => {
      this.raf = requestAnimationFrame(frame);
      this.tick(now);
    };
    this.raf = requestAnimationFrame(frame);

    const detach = (): void => {
      cancelAnimationFrame(this.raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      activityEvents.forEach((ev) => window.removeEventListener(ev, this.reportActivity));
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('contextmenu', onContext);
      this.canvas = null;
    };
    this.detachInput = detach;
    return detach;
  }

  private tick(now: number): void {
    const st = this.state;
    const canvas = this.canvas;
    if (!st || !canvas) return;
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    const dir = this.keys.current;
    if (dir && now - this.lastMove >= MOVE_SEND_MS && this.socket.connected) {
      this.socket.emit('move', { dir });
      this.lastMove = now;
    }
    interpolate(st, dt);
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    }
    render(canvas, st, this.build, now);
    const where = this.computeWhere();
    if (where !== this.where) { this.where = where; this.emit(); }
  }

  /** Salida voluntaria del piso. */
  leave(): void { this.close(''); }

  private close(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.detachInput?.();
    this.voice.dispose();
    this.build.close();
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.onClose(reason);
  }
}

/** Crea el BuildController enlazado a la sesión (las acciones se resuelven en el momento del clic). */
class GameBuild {
  constructor(private readonly session: GameSession) {}
  create(): BuildController {
    const s = this.session;
    return new BuildController(
      () => s.state,
      {
        place: (k, x, y) => s.sendPlace(k, x, y),
        removeObject: (id) => s.sendRemoveObject(id),
        placePet: (k, c, x, y) => s.sendPlacePet(k, c, x, y),
        removePet: (id) => s.sendRemovePet(id),
        setLook: (acc) => s.sendLook(acc),
      },
      () => s.emit(),
    );
  }
}
