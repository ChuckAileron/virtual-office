import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import type { VoiceTokenResult } from '@vo/shared';
import { computeSubscriptions } from './subscriptions';

export const INSECURE_CONTEXT_MSG =
  'Tu navegador no permite usar micrófono, cámara ni pantalla en esta página: se necesita HTTPS o localhost. Abre la oficina con https:// (o desde localhost), no por IP en HTTP.';

export interface DockTile {
  key: string;
  label: string;
  screen: boolean;
  mine: boolean;
  track: Track;
}

export interface VoiceState {
  connecting: boolean;
  active: boolean;
  incomingMuted: boolean;
  cam: boolean;
  screen: boolean;
  /** Nivel del micrófono propio en pasos de 0 a 20. */
  level: number;
  /** Personas con audio suscrito (con las que estás hablando). */
  listeners: number;
  error: string | null;
  tiles: DockTile[];
}

export interface VoiceDeps {
  requestToken(): Promise<VoiceTokenResult>;
  getConfigUrl(): Promise<string | null>;
  getName(id: string): string;
  setLevel(id: string, level: number): void;
  setVoiceFlag(on: boolean): void;
  onSpeaking(): void;
}

export const SPEAKING_THRESHOLD = 0.08;
const LEVEL_STEPS = 20;
const TOKEN_TIMEOUT_MS = 8000;

export const defaultLivekitUrl = (loc: Pick<Location, 'protocol' | 'host'> = location): string =>
  `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/livekit`;

export const mediaSupported = (): boolean => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export function describeMediaError(err: unknown): string {
  const e = err as { name?: string; message?: string } | null;
  if (e?.name === 'NotAllowedError') return 'Permiso denegado (micrófono, cámara o pantalla)';
  if (e?.name === 'NotFoundError') return 'No se encontró el dispositivo (micrófono o cámara)';
  return e?.message || 'No se pudo activar el dispositivo';
}

let chimeCtx: AudioContext | null = null;

/** Aviso corto cuando alguien entra en tu rango audible. */
export function playChime(): void {
  try {
    chimeCtx ??= new AudioContext();
    const ctx = chimeCtx;
    void ctx.resume();
    const t = ctx.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.12, t + i * 0.1 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.1 + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + i * 0.1);
      osc.stop(t + i * 0.1 + 0.2);
    });
  } catch {
    /* sin Web Audio */
  }
}

const INITIAL: VoiceState = { connecting: false, active: false, incomingMuted: false, cam: false, screen: false, level: 0, listeners: 0, error: null, tiles: [] };

export class VoiceController {
  state: VoiceState = INITIAL;
  private room: Room | null = null;
  private audible = new Set<string>();
  private listeners = new Set<() => void>();
  private audioHost: HTMLDivElement | null = null;
  private meterCtx: AudioContext | null = null;
  private meterTimer: ReturnType<typeof setInterval> | undefined;
  private lastLevel = 0;
  private remoteTiles = new Map<string, DockTile>();
  private audioSids = new Map<string, string>(); // sid de publicación de audio -> identidad

  constructor(private readonly deps: VoiceDeps) {}

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  getSnapshot = (): VoiceState => this.state;

  private set(patch: Partial<VoiceState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** Últimos jugadores audibles según el servidor. */
  setAudible(ids: string[]): void {
    const next = new Set(ids);
    const entered = this.state.active && [...next].some((id) => !this.audible.has(id));
    this.audible = next;
    if (entered) playChime();
    this.applySubscriptions();
    this.refreshListeners();
  }

  private applySubscriptions(): void {
    const room = this.room;
    if (!room) return;
    const participants = [...room.remoteParticipants.values()].map((p) => ({ identity: p.identity, publications: [...p.trackPublications.values()] }));
    for (const c of computeSubscriptions<RemoteTrackPublication>(this.audible, participants)) c.publication.setSubscribed(c.subscribe);
  }

  private refreshListeners(): void {
    let n = 0;
    for (const id of this.audioSids.values()) if (this.audible.has(id)) n++;
    if (n !== this.state.listeners) this.set({ listeners: n });
  }

  async enable(): Promise<void> {
    if (this.state.active || this.state.connecting) return;
    if (!mediaSupported()) { this.set({ error: INSECURE_CONTEXT_MSG }); return; }
    this.set({ connecting: true, error: null });
    try {
      const res = await Promise.race([
        this.deps.requestToken(),
        new Promise<VoiceTokenResult>((_, rej) => setTimeout(() => rej(new Error('El servidor no respondió al pedir la voz')), TOKEN_TIMEOUT_MS)),
      ]);
      if (!res.ok) throw new Error(res.error || 'No se pudo activar la voz');
      const url = res.url ?? (await this.deps.getConfigUrl()) ?? defaultLivekitUrl();
      const room = new Room({ adaptiveStream: true, dynacast: true });
      this.room = room;
      this.bind(room);
      await room.connect(url, res.token, { autoSubscribe: false });
      await room.startAudio().catch(() => {});
      await room.localParticipant.setMicrophoneEnabled(true, { echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      this.startMeter(room);
      this.deps.setVoiceFlag(true);
      this.set({ connecting: false, active: true });
      this.applySubscriptions();
      this.syncLocalTiles();
    } catch (err) {
      this.teardown();
      this.set({ connecting: false, active: false, error: describeMediaError(err) });
    }
  }

  disable(): void {
    if (!this.room && !this.state.active) return;
    this.teardown();
    this.deps.setVoiceFlag(false);
    this.set({ ...INITIAL });
  }

  /** Cierra todo al salir del piso (sin avisar al servidor: ya no hay conexión). */
  dispose(): void {
    this.teardown();
    this.listeners.clear();
  }

  toggleIncomingMute(): void {
    const incomingMuted = !this.state.incomingMuted;
    this.audioHost?.querySelectorAll('audio').forEach((a) => { a.muted = incomingMuted; });
    this.set({ incomingMuted });
  }

  async toggleCamera(): Promise<void> {
    const room = this.room;
    if (!room || !this.state.active) return;
    try {
      this.set({ error: null });
      await room.localParticipant.setCameraEnabled(!this.state.cam, { resolution: { width: 640, height: 480, frameRate: 24 } });
      this.syncLocalTiles();
    } catch (err) {
      this.set({ error: describeMediaError(err) });
    }
  }

  async toggleScreen(): Promise<void> {
    const room = this.room;
    if (!room || !this.state.active) return;
    try {
      this.set({ error: null });
      if (this.state.screen) {
        await room.localParticipant.setScreenShareEnabled(false);
      } else {
        await room.localParticipant.setScreenShareEnabled(true, {
          audio: false,
          video: { displaySurface: 'monitor' },
          selfBrowserSurface: 'exclude',
          surfaceSwitching: 'exclude',
          resolution: { width: 1280, height: 720, frameRate: 15 },
        });
        const surface = room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track?.mediaStreamTrack.getSettings().displaySurface;
        if (surface && surface !== 'monitor') {
          await room.localParticipant.setScreenShareEnabled(false);
          this.set({ error: 'Solo se puede proyectar la pantalla completa: elige una pantalla, no una ventana ni una pestaña' });
        }
      }
      this.syncLocalTiles();
    } catch (err) {
      this.set({ error: describeMediaError(err) });
    }
  }

  private bind(room: Room): void {
    room
      .on(RoomEvent.ParticipantConnected, () => this.applySubscriptions())
      .on(RoomEvent.TrackPublished, () => this.applySubscriptions())
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => this.onSubscribed(track, pub, p))
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => this.onUnsubscribed(track, pub, p))
      .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => this.dropParticipant(p.identity))
      .on(RoomEvent.LocalTrackPublished, () => this.syncLocalTiles())
      .on(RoomEvent.LocalTrackUnpublished, () => this.syncLocalTiles())
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => this.onSpeakers(speakers))
      .on(RoomEvent.Disconnected, () => {
        if (this.room !== room) return;
        this.teardown();
        this.deps.setVoiceFlag(false);
        this.set({ ...INITIAL, error: 'Se desconectó la voz' });
      });
  }

  private onSubscribed(track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant): void {
    if (track.kind === Track.Kind.Audio) {
      const el = track.attach();
      el.muted = this.state.incomingMuted;
      this.host().append(el);
      this.audioSids.set(pub.trackSid, p.identity);
      this.refreshListeners();
    } else if (track.kind === Track.Kind.Video) {
      const screen = pub.source === Track.Source.ScreenShare;
      const key = `${p.identity}-${screen ? 'screen' : 'cam'}`;
      const name = this.deps.getName(p.identity);
      this.remoteTiles.set(key, { key, label: screen ? `🖥 ${name}` : name, screen, mine: false, track });
      this.publishTiles();
    }
  }

  private onUnsubscribed(track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant): void {
    track.detach().forEach((el) => el.remove());
    if (track.kind === Track.Kind.Audio) {
      this.audioSids.delete(pub.trackSid);
      this.deps.setLevel(p.identity, 0);
      this.refreshListeners();
    } else {
      this.remoteTiles.delete(`${p.identity}-${pub.source === Track.Source.ScreenShare ? 'screen' : 'cam'}`);
      this.publishTiles();
    }
  }

  private dropParticipant(identity: string): void {
    for (const [sid, id] of this.audioSids) if (id === identity) this.audioSids.delete(sid);
    for (const key of [...this.remoteTiles.keys()]) if (key.startsWith(`${identity}-`)) this.remoteTiles.delete(key);
    this.deps.setLevel(identity, 0);
    this.publishTiles();
    this.refreshListeners();
  }

  private onSpeakers(speakers: Participant[]): void {
    const room = this.room;
    if (!room) return;
    const levels = new Map(speakers.map((s) => [s.identity, s.audioLevel]));
    for (const p of room.remoteParticipants.values()) {
      this.deps.setLevel(p.identity, this.audible.has(p.identity) ? Math.min(1, (levels.get(p.identity) ?? 0) * 3) : 0);
    }
  }

  private localTile(pub: LocalTrackPublication | undefined): DockTile | null {
    return pub?.track ? { key: 'me-cam', label: 'Tú', screen: false, mine: true, track: pub.track } : null;
  }

  private syncLocalTiles(): void {
    const lp = this.room?.localParticipant;
    const cam = !!lp?.getTrackPublication(Track.Source.Camera)?.track;
    const screen = !!lp?.getTrackPublication(Track.Source.ScreenShare)?.track;
    this.set({ cam, screen });
    this.publishTiles();
  }

  private publishTiles(): void {
    const mine = this.localTile(this.room?.localParticipant.getTrackPublication(Track.Source.Camera));
    const tiles = [...(mine ? [mine] : []), ...this.remoteTiles.values()];
    this.set({ tiles });
  }

  private host(): HTMLDivElement {
    if (!this.audioHost) {
      this.audioHost = document.createElement('div');
      this.audioHost.hidden = true;
      document.body.append(this.audioHost);
    }
    return this.audioHost;
  }

  private startMeter(room: Room): void {
    const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
    if (!track) return;
    this.meterCtx = new AudioContext();
    const src = this.meterCtx.createMediaStreamSource(new MediaStream([track]));
    const analyser = this.meterCtx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser); // sin conectar al destino: no hay eco local
    const data = new Uint8Array(analyser.fftSize);
    this.meterTimer = setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) { const d = (v - 128) / 128; sum += d * d; }
      const level = Math.min(1, Math.sqrt(sum / data.length) * 4);
      this.deps.setLevel('me', level);
      if (level > SPEAKING_THRESHOLD) this.deps.onSpeaking();
      const step = Math.round(level * LEVEL_STEPS);
      if (step !== this.lastLevel) { this.lastLevel = step; this.set({ level: step }); }
    }, 80);
  }

  private teardown(): void {
    clearInterval(this.meterTimer);
    this.meterTimer = undefined;
    void this.meterCtx?.close().catch(() => {});
    this.meterCtx = null;
    this.lastLevel = 0;
    this.deps.setLevel('me', 0);
    const room = this.room;
    this.room = null;
    if (room && room.state !== ConnectionState.Disconnected) void room.disconnect();
    this.audioHost?.remove();
    this.audioHost = null;
    this.remoteTiles.clear();
    this.audioSids.clear();
  }
}
