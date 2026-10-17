import type { Accessories, AppearancePatch, Dir, FloorDecoration, OfficeFloorStyle, PlayerView, Role } from '@vo/shared';
import { GAME } from '@vo/shared';
import { getConfig, uploadFloorImage } from '../net/api';
import { createSocket, type GameSocket } from '../net/socket';
import { VoiceController } from '../net/voice';
import { AlarmController } from './alarm';
import { BuildController } from './build';
import { ACTIVITY_THROTTLE_MS, BUBBLE_MS, CHAT_LINES, TAP_HOLD_MS } from './constants';
import { mouseToTile } from './coords';
import { MoveIntent } from './moveIntent';
import { invalidateTiles, render } from './renderer';
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
  toast = '';
  readonly build: BuildController;
  readonly voice: VoiceController;
  readonly alarm: AlarmController;
  readonly socket: GameSocket;

  private listeners = new Set<() => void>();
  private canvas: HTMLCanvasElement | null = null;
  private raf = 0;
  private lastT = 0;
  private lastActivity = 0;
  private chatId = 0;
  private keys = new KeyStack();
  private intent = new MoveIntent(
    { move: (dir) => this.sendMove(dir), turn: (dir) => this.sendTurn(dir) },
    TAP_HOLD_MS,
    MOVE_SEND_MS,
  );
  private closed = false;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private detachInput: (() => void) | null = null;

  constructor(private readonly token: string, code: string, private readonly onClose: (reason: string) => void) {
    this.build = new GameBuild(this).create();
    this.voice = new VoiceController({
      requestToken: () => new Promise((resolve) => {
        if (!this.socket.connected) { resolve({ ok: false, error: 'Sin conexión con el servidor' }); return; }
        this.socket.emit('voice_token', resolve);
      }),
      getConfigUrl: () => getConfig().then((c) => c.janusUrl).catch(() => null),
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
    this.alarm = new AlarmController();
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
    s.on('floor_decoration_add', ({ decoration }) => { this.state?.floorDecorations.push(decoration); });
    s.on('floor_decoration_remove', ({ id }) => {
      if (this.state) this.state.floorDecorations = this.state.floorDecorations.filter((d) => d.id !== id);
    });
    s.on('office_floor_style', ({ style }) => {
      if (!this.state) return;
      const index = this.state.floorStyles.findIndex((entry) => entry.officeId === style.officeId);
      if (index < 0) this.state.floorStyles.push(style);
      else this.state.floorStyles[index] = style;
      invalidateTiles(this.state);
      this.emit();
    });
    s.on('pet_add', ({ pet }) => { this.state?.pets.set(pet.id, makePet(pet)); });
    s.on('pet_remove', ({ id }) => { this.state?.pets.delete(id); });
    s.on('pet_move', ({ id, x, y, dir }) => {
      const p = this.state?.pets.get(id);
      if (p) { p.x = x; p.y = y; p.dir = dir; }
    });
    s.on('build_error', ({ error }) => this.build.error(error));
    s.on('audible', ({ ids }) => this.voice.setAudible(ids));
    s.on('alarm', (p) => this.alarm.trigger(p));
    s.on('convened', ({ by, seats }) => {
      const st = this.state;
      if (st) {
        const now = performance.now();
        for (const seat of seats) {
          const p = st.players.get(seat.id);
          if (!p) continue;
          st.effects.push({ x: p.rx, y: p.ry, start: now, until: now + 600 });
          p.x = seat.x;
          p.y = seat.y;
          p.dir = seat.dir;
          p.rx = seat.x;
          p.ry = seat.y;
          st.effects.push({ x: seat.x, y: seat.y, start: now, until: now + 600 });
        }
      }
      this.notify(`📣 ${by} convocó a todos a la sala de reuniones`);
    });
    s.on('notice', ({ text }) => this.notify(text));
    s.on('role', ({ id, role }) => {
      const p = this.state?.players.get(id);
      if (p) { p.role = role; this.emit(); }
    });
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
  sendPlace = (kind: string, x: number, y: number, perspective: 'front' | 'side' = 'front', flipped = false): void => {
    if (this.socket.connected) this.socket.emit('place', { kind, x, y, perspective, flipped });
  };
  sendRemoveObject = (id: number): void => { if (this.socket.connected) this.socket.emit('remove_object', { id }); };
  sendPlaceFloorDecoration = (decoration: Omit<FloorDecoration, 'id'>): void => {
    if (this.socket.connected) this.socket.emit('place_floor_decoration', decoration);
  };
  sendRemoveFloorDecoration = (id: number): void => { if (this.socket.connected) this.socket.emit('remove_floor_decoration', { id }); };
  sendOfficeFloorStyle = (style: OfficeFloorStyle): void => {
    if (this.socket.connected) this.socket.emit('set_office_floor_style', style);
  };
  sendPlacePet = (kind: string, color: string, x: number, y: number): void => { if (this.socket.connected) this.socket.emit('place_pet', { kind, color, x, y }); };
  sendRemovePet = (id: number): void => { if (this.socket.connected) this.socket.emit('remove_pet', { id }); };
  sendLook = (acc: Partial<Accessories>): void => { if (this.socket.connected) this.socket.emit('set_look', { acc }); };
  sendAppearance = (look: AppearancePatch): void => { if (this.socket.connected) this.socket.emit('set_look', { look }); };
  uploadFloorImage = (file: File) => uploadFloorImage(file, this.token);

  sendChat(text: string): void {
    const t = text.trim();
    if (t && this.socket.connected) this.socket.emit('chat', { text: t.slice(0, GAME.CHAT_MAX) });
  }

  private sendMove(dir: Dir): void { if (this.socket.connected) this.socket.emit('move', { dir }); }
  private sendTurn(dir: Dir): void { if (this.socket.connected) this.socket.emit('turn', { dir }); }

  /** Dispara una alarma de emergencia para todos; el mensaje es opcional. */
  sendAlarm(message: string): void {
    if (!this.socket.connected) return;
    this.socket.emit('alarm', { message: message.trim().slice(0, GAME.ALARM_MESSAGE_MAX) });
  }

  /** Convoca a todos los presentes a la sala de reuniones (solo jefe o administrador). */
  convene(): void {
    if (this.socket.connected) this.socket.emit('convene');
  }

  /** Lista las cuentas con su rol (solo administrador). */
  listUsers(): Promise<Array<{ username: string; role: Role }>> {
    return new Promise((resolve) => {
      if (!this.socket.connected) { resolve([]); return; }
      this.socket.emit('list_users', (r) => resolve(r.users));
    });
  }

  /** Asigna o quita el rol de jefe a una cuenta (solo administrador). */
  assignRole(username: string, role: Role): void {
    if (this.socket.connected) this.socket.emit('assign_role', { username, role });
  }

  /** Muestra un aviso breve en pantalla durante unos segundos. */
  notify(text: string): void {
    this.toast = text;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toast = ''; this.emit(); }, 5000);
    this.emit();
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
        if (dir) {
          e.preventDefault();
          const canTurn = this.keys.current === null && !this.intent.isWalking;
          this.keys.press(dir);
          this.intent.press(dir);
          const me = this.me();
          // El giro optimista solo aplica estando quieto: caminando, la orientación
          // la marca el movimiento, así no se ve el doble giro al combinar teclas.
          if (me && canTurn) me.dir = dir;
        }
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      const dir = KEY_TO_DIR[e.key];
      if (dir) { this.keys.release(dir); this.intent.release(dir); }
    };
    const onBlur = (): void => { this.keys.clear(); this.intent.clear(); };
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
    this.intent.tick(this.keys.current);
    interpolate(st, dt);
    if (st.effects.length) st.effects = st.effects.filter((e) => e.until > now);
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    }
    render(canvas, st, this.build, now);
    const where = this.computeWhere();
    if (where !== this.where) { this.where = where; this.emit(); }
  }

  /** Salida voluntaria del espacio de trabajo. */
  leave(): void { this.close(''); }

  private close(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.detachInput?.();
    this.voice.dispose();
    this.alarm.dispose();
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
        place: (k, x, y, perspective, flipped) => s.sendPlace(k, x, y, perspective, flipped),
        removeObject: (id) => s.sendRemoveObject(id),
        placeFloorDecoration: (imageUrl, x, y, w, h) => s.sendPlaceFloorDecoration({ imageUrl, x, y, w, h }),
        removeFloorDecoration: (id) => s.sendRemoveFloorDecoration(id),
        placePet: (k, c, x, y) => s.sendPlacePet(k, c, x, y),
        removePet: (id) => s.sendRemovePet(id),
        setLook: (acc) => s.sendLook(acc),
      },
      () => s.emit(),
    );
  }
}
