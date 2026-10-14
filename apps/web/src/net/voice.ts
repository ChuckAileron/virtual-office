import type { JanusJS } from 'janus-gateway';
import adapter from 'webrtc-adapter';
import type { VoiceTokenResult } from '@vo/shared';

export const INSECURE_CONTEXT_MSG = 'Tu navegador necesita HTTPS o localhost para usar el micrófono, la cámara y la pantalla.';
export interface DockTile { key: string; label: string; screen: boolean; mine: boolean; stream: MediaStream }
export interface VoiceState {
  connecting: boolean; active: boolean; incomingMuted: boolean; cam: boolean; screen: boolean;
  level: number; listeners: number; error: string | null; tiles: DockTile[];
}
export interface VoiceDeps {
  requestToken(): Promise<VoiceTokenResult>; getConfigUrl(): Promise<string | null>; getName(id: string): string;
  setLevel(id: string, level: number): void; setVoiceFlag(on: boolean): void; onSpeaking(): void;
}
export const SPEAKING_THRESHOLD = 0.08;
export const defaultJanusUrl = (loc: Pick<Location, 'protocol' | 'host'> = location): string =>
  `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/janus`;
export const mediaSupported = (): boolean => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
export function describeMediaError(err: unknown): string {
  const e = err as { name?: string; message?: string } | null;
  if (e?.name === 'NotAllowedError') return 'Permiso denegado (micrófono, cámara o pantalla)';
  if (e?.name === 'NotFoundError') return 'No se encontró el dispositivo (micrófono o cámara)';
  return e?.message || 'No se pudo activar el dispositivo';
}

const INITIAL: VoiceState = { connecting: false, active: false, incomingMuted: false, cam: false, screen: false, level: 0, listeners: 0, error: null, tiles: [] };
const PLUGIN = 'janus.plugin.videoroom';
let janusInitialized: Promise<void> | null = null;
let JanusClient!: typeof import('janus-gateway').default;
function initJanus(): Promise<void> {
  janusInitialized ??= import('janus-gateway').then(({ default: Janus }) => new Promise<void>((resolve) => {
    JanusClient = Janus;
    Janus.init({ debug: false, dependencies: Janus.useDefaultDependencies({ adapter }), callback: resolve });
  }));
  return janusInitialized;
}

export class VoiceController {
  state: VoiceState = INITIAL;
  private session: InstanceType<typeof import('janus-gateway').default> | null = null;
  private publisher: JanusJS.PluginHandle | null = null;
  private readonly subscribers = new Map<number, { handle: JanusJS.PluginHandle; identity: string; stream: MediaStream }>();
  private readonly publishers = new Map<number, { id: number; display?: string }>();
  private audible = new Set<string>();
  private listeners = new Set<() => void>();
  private meterCtx: AudioContext | null = null;
  private meterTimer: ReturnType<typeof setInterval> | undefined;
  private localStream: MediaStream | null = null;
  private placeholderVideo: MediaStreamTrack | null = null;
  private localScreen: MediaStream | null = null;
  private current: { room: number; pin: string; identity: string; token?: string } | null = null;
  private roomRetry = false;
  private audioHost: HTMLDivElement | null = null;

  constructor(private readonly deps: VoiceDeps) {}
  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = (): VoiceState => this.state;
  private set(patch: Partial<VoiceState>): void { this.state = { ...this.state, ...patch }; this.listeners.forEach((fn) => fn()); }

  setAudible(ids: string[]): void {
    this.audible = new Set(ids);
    for (const [feed, sub] of this.subscribers) if (!this.audible.has(sub.identity)) this.dropSubscriber(feed);
    for (const publisher of this.publishers.values()) this.subscribeTo(publisher);
    this.refreshListeners();
  }

  async enable(): Promise<void> {
    if (this.state.active || this.state.connecting) return;
    if (!mediaSupported()) { this.set({ error: INSECURE_CONTEXT_MSG }); return; }
    this.set({ connecting: true, error: null });
    try {
      const result = await this.deps.requestToken();
      if (!result.ok) throw new Error(result.error);
      const url = result.url ?? await this.deps.getConfigUrl() ?? defaultJanusUrl();
      this.current = { room: result.room, pin: result.pin, identity: result.identity, token: result.token };
      await initJanus();
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      await new Promise<void>((resolve, reject) => {
        this.session = new JanusClient({ server: url, ...(result.token ? { token: result.token } : {}), success: () => this.attachPublisher(resolve, reject), error: (e) => reject(new Error(String(e))) });
      });
    } catch (err) {
      this.teardown();
      this.set({ connecting: false, active: false, error: describeMediaError(err) });
    }
  }

  private attachPublisher(resolve: () => void, reject: (err: Error) => void): void {
    this.session?.attach({
      plugin: PLUGIN,
      success: (handle) => {
        this.publisher = handle;
        const room = this.current!;
        handle.send({ message: { request: 'join', ptype: 'publisher', room: room.room, pin: room.pin, display: room.identity } });
      },
      error: (e) => reject(new Error(e)),
      onmessage: (msg, jsep) => {
        const data = msg.videoroom;
        if (data === 'joined') {
          this.set({ connecting: false, active: true });
          this.deps.setVoiceFlag(true);
          this.publishAudio();
          (msg.publishers ?? []).forEach((p: any) => this.addPublisher(p));
          resolve();
        } else if (data === 'event') {
          (msg.publishers ?? []).forEach((p: any) => this.addPublisher(p));
          (msg.leaving ? [msg.leaving] : []).forEach((id: number) => { this.publishers.delete(id); this.dropSubscriber(id); });
          (msg.unpublished && msg.unpublished !== 'ok' ? [msg.unpublished] : []).forEach((id: number) => { this.publishers.delete(id); this.dropSubscriber(id); });
        }
        if (msg.error && this.publisher) {
          if (String(msg.error).toLowerCase().includes('no such room')) this.retryJoin();
          else reject(new Error(msg.error));
        }
        if (jsep) this.publisher?.handleRemoteJsep({ jsep });
      },
      oncleanup: () => {},
    });
  }

  /** La sala la crea el servidor; al fallar pedimos otra vez y reintentamos una vez. */
  private retryJoin(): void {
    if (this.roomRetry) return;
    this.roomRetry = true;
    void this.deps.requestToken().then((result) => {
      if (!result.ok) throw new Error(result.error);
      this.current = { room: result.room, pin: result.pin, identity: result.identity, token: result.token };
      this.publisher?.send({ message: { request: 'join', ptype: 'publisher', room: result.room, pin: result.pin, display: result.identity } });
    }).catch((err) => this.set({ error: describeMediaError(err) }));
  }

  private publishAudio(): void {
    const handle = this.publisher;
    const audio = this.localStream?.getAudioTracks()[0];
    if (!handle || !audio) return;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2;
    const placeholder = canvas.captureStream(1).getVideoTracks()[0];
    placeholder.enabled = false;
    this.placeholderVideo = placeholder;
    handle.createOffer({
      tracks: [{ type: 'audio', capture: audio, recv: false }, { type: 'video', capture: placeholder, recv: false }],
      success: (jsep) => handle.send({ message: { request: 'configure', audio: true, video: true }, jsep }),
      error: (e) => this.set({ error: describeMediaError(e) }),
    });
    this.startMeter(audio);
  }

  private subscribeTo(p: { id: number; display?: string }): void {
    if (!this.audible.has(p.display ?? '') || this.subscribers.has(p.id)) return;
    const identity = p.display ?? String(p.id);
    this.session?.attach({
      plugin: PLUGIN,
      success: (handle) => {
        const entry = { handle, identity, stream: new MediaStream() };
        this.subscribers.set(p.id, entry);
        handle.send({ message: { request: 'join', ptype: 'subscriber', room: this.current!.room, feed: p.id, pin: this.current!.pin } });
      },
      error: (e) => this.set({ error: e }),
      onmessage: (msg, jsep) => {
        if (jsep) {
          const handle = this.subscribers.get(p.id)?.handle;
          handle?.createAnswer({ jsep, tracks: [{ type: 'audio', capture: false, recv: true }, { type: 'video', capture: false, recv: true }], success: (answer) => handle.send({ message: { request: 'start', room: this.current!.room }, jsep: answer }), error: (e) => this.set({ error: describeMediaError(e) }) });
        }
        if (msg.publishers) msg.publishers.forEach((pub: any) => this.subscribeTo(pub));
      },
      onremotetrack: (track, _mid, on) => {
        const entry = this.subscribers.get(p.id);
        if (!entry) return;
        if (on) {
          entry.stream.addTrack(track);
          if (track.kind === 'audio') {
            const audio = document.createElement('audio'); audio.autoplay = true; audio.srcObject = new MediaStream([track]);
            (this.audioHost ??= document.createElement('div')).hidden = true;
            if (!this.audioHost.isConnected) document.body.append(this.audioHost);
            this.audioHost.append(audio);
            void audio.play().catch(() => {});
          }
        } else {
          entry.stream.removeTrack(track);
          this.audioHost?.querySelectorAll('audio').forEach((audio) => {
            if ((audio.srcObject as MediaStream | null)?.getTracks().includes(track)) audio.remove();
          });
        }
        this.updateRemoteTiles();
        this.refreshListeners();
      },
      oncleanup: () => this.dropSubscriber(p.id),
    });
  }

  private addPublisher(p: { id: number; display?: string }): void {
    this.publishers.set(p.id, p);
    this.subscribeTo(p);
  }

  private updateRemoteTiles(): void {
    const tiles = [...this.subscribers.values()].filter((s) => s.stream.getVideoTracks().length).map((s) => ({ key: s.identity, label: this.deps.getName(s.identity), screen: false, mine: false, stream: s.stream }));
    const local = this.localStream;
    if (local?.getVideoTracks().length) tiles.unshift({ key: 'me-cam', label: 'Tú', screen: this.state.screen, mine: true, stream: local });
    this.set({ tiles, cam: !!local?.getVideoTracks().length && !this.state.screen, screen: !!this.localScreen });
  }

  private dropSubscriber(feed: number): void {
    const sub = this.subscribers.get(feed);
    if (!sub) return;
    this.subscribers.delete(feed);
    sub.handle.detach();
    this.deps.setLevel(sub.identity, 0);
    this.updateRemoteTiles();
    this.refreshListeners();
  }
  private refreshListeners(): void { this.set({ listeners: [...this.subscribers.values()].filter((s) => this.audible.has(s.identity) && s.stream.getAudioTracks().length).length }); }

  private async replaceVideo(track: MediaStreamTrack | null, screen: boolean): Promise<void> {
    const handle = this.publisher;
    if (!handle) return;
    const old = this.localStream?.getVideoTracks()[0];
    if (track && this.localStream) {
      if (old) this.localStream.removeTrack(old);
      this.localStream.addTrack(track);
    }
    const tracks: JanusJS.TrackOption[] = track
      ? [{ type: 'video', capture: track, ...(old ? { replace: true } : { add: true }), recv: false }]
      : old ? [{ type: 'video', capture: false, remove: true, recv: false }] : [];
    if (!tracks.length) return;
    handle.replaceTracks({ tracks, success: (jsep: any) => {
      if (jsep) handle.send({ message: { request: 'configure', audio: true, video: !!track }, jsep });
      if (old && old !== track) { this.localStream?.removeTrack(old); old.stop(); }
      this.localScreen = screen && track ? new MediaStream([track]) : null;
      this.updateRemoteTiles();
    }, error: (e) => this.set({ error: describeMediaError(e) }) });
  }

  async toggleCamera(): Promise<void> {
    try {
      if (this.state.cam) await this.replaceVideo(null, false);
      else { const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 24 } }); await this.replaceVideo(stream.getVideoTracks()[0], false); }
    } catch (err) { this.set({ error: describeMediaError(err) }); }
  }
  async toggleScreen(): Promise<void> {
    try {
      if (this.state.screen) await this.replaceVideo(null, false);
      else { const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 } }); const track = stream.getVideoTracks()[0]; track.onended = () => { void this.replaceVideo(null, false); }; await this.replaceVideo(track, true); }
    } catch (err) { this.set({ error: describeMediaError(err) }); }
  }
  toggleIncomingMute(): void { const muted = !this.state.incomingMuted; this.audioHost?.querySelectorAll('audio').forEach((a) => { a.muted = muted; }); this.set({ incomingMuted: muted }); }
  disable(): void { this.teardown(); this.deps.setVoiceFlag(false); this.set({ ...INITIAL }); }
  dispose(): void { this.teardown(); this.listeners.clear(); }

  private startMeter(track: MediaStreamTrack): void {
    this.meterCtx = new AudioContext();
    const src = this.meterCtx.createMediaStreamSource(new MediaStream([track]));
    const analyser = this.meterCtx.createAnalyser(); analyser.fftSize = 512; src.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    this.meterTimer = setInterval(() => {
      analyser.getByteTimeDomainData(data); let sum = 0;
      for (const v of data) { const d = (v - 128) / 128; sum += d * d; }
      const level = Math.min(1, Math.sqrt(sum / data.length) * 4); this.deps.setLevel('me', level);
      if (level > SPEAKING_THRESHOLD) this.deps.onSpeaking(); this.set({ level: Math.round(level * 20) });
    }, 80);
  }
  private teardown(): void {
    clearInterval(this.meterTimer); this.meterTimer = undefined;
    void this.meterCtx?.close().catch(() => {}); this.meterCtx = null;
    this.deps.setLevel('me', 0);
    for (const id of this.subscribers.keys()) this.dropSubscriber(id);
    this.publisher?.detach(); this.publisher = null;
    this.session?.destroy({}); this.session = null;
    this.audioHost?.remove(); this.audioHost = null;
    this.localStream?.getTracks().forEach((t) => t.stop()); this.localStream = null;
    this.placeholderVideo?.stop(); this.placeholderVideo = null;
    this.localScreen?.getTracks().forEach((t) => t.stop()); this.localScreen = null;
    this.current = null;
    this.roomRetry = false;
    this.publishers.clear();
  }
}
