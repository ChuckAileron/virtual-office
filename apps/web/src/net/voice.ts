import type { JanusJS } from 'janus-gateway';
import adapter from 'webrtc-adapter';
import type { VoiceTokenResult } from '@vo/shared';

export const INSECURE_CONTEXT_MSG = 'Tu navegador necesita HTTPS o localhost para usar el micrófono, la cámara y la pantalla.';
export interface DockTile { key: string; label: string; screen: boolean; mine: boolean; stream: MediaStream }
export interface VoiceState {
  connecting: boolean; micConnecting: boolean; active: boolean; incomingMuted: boolean; cam: boolean; screen: boolean;
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

const INITIAL: VoiceState = { connecting: false, micConnecting: false, active: false, incomingMuted: false, cam: false, screen: false, level: 0, listeners: 0, error: null, tiles: [] };
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
  private publisherVideoTrack: MediaStreamTrack | null = null;
  private publisherAudioTrack: MediaStreamTrack | null = null;
  private publisherVideoNegotiated = false;
  private publisherAudioNegotiated = false;
  private localScreen: MediaStream | null = null;
  private current: { room: number; pin: string; identity: string; token?: string } | null = null;
  private connectionPromise: Promise<void> | null = null;
  private publisherReady = false;
  private micStarting = false;
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
    if (this.audible.size && !this.publisherReady) {
      void this.ensureConnection().catch((err) => this.set({ error: describeMediaError(err) }));
    }
  }

  async enable(): Promise<void> {
    if (this.state.active || this.micStarting) return;
    if (!mediaSupported()) { this.set({ error: INSECURE_CONTEXT_MSG }); return; }
    this.micStarting = true;
    this.set({ micConnecting: true, error: null });
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      await this.ensureConnection();
      await this.publishAudio(stream.getAudioTracks()[0]);
      this.set({ active: true, micConnecting: false, connecting: false });
      this.deps.setVoiceFlag(true);
    } catch (err) {
      stream?.getTracks().forEach((track) => track.stop());
      this.set({ micConnecting: false, active: false, error: describeMediaError(err) });
    } finally {
      this.micStarting = false;
    }
  }

  private async ensureConnection(): Promise<void> {
    if (this.publisherReady && this.session && this.publisher) return;
    if (this.connectionPromise) return this.connectionPromise;

    this.set({ connecting: true, error: null });
    const operation = (async () => {
      const result = await this.deps.requestToken();
      if (!result.ok) throw new Error(result.error);
      const url = result.url ?? await this.deps.getConfigUrl() ?? defaultJanusUrl();
      this.current = { room: result.room, pin: result.pin, identity: result.identity, token: result.token };
      await initJanus();
      await new Promise<void>((resolve, reject) => {
        this.session = new JanusClient({ server: url, ...(result.token ? { token: result.token } : {}), success: () => this.attachPublisher(resolve, reject), error: (e) => reject(new Error(String(e))) });
      });
    })();
    this.connectionPromise = operation;
    try {
      await operation;
    } catch (err) {
      this.teardown();
      this.set({ connecting: false });
      throw err;
    } finally {
      if (this.connectionPromise === operation) this.connectionPromise = null;
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
          this.publisherReady = true;
          this.set({ connecting: false });
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

  private makePlaceholderVideo(): MediaStreamTrack {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2;
    const track = canvas.captureStream(1).getVideoTracks()[0];
    track.enabled = false;
    this.placeholderVideo = track;
    return track;
  }

  private async publishAudio(audio: MediaStreamTrack): Promise<void> {
    const handle = this.publisher;
    if (!handle) throw new Error('No hay conexión de voz');
    const stream = this.localStream ??= new MediaStream();

    if (this.publisherAudioNegotiated) {
      await new Promise<void>((resolve, reject) => handle.replaceTracks({
        tracks: [{ type: 'audio', capture: audio, replace: true, recv: false }],
        success: () => {
          handle.unmuteAudio();
          handle.send({ message: { request: 'configure', audio: true, video: !!this.publisherVideoTrack } });
          resolve();
        },
        error: reject,
      }));
    } else {
      const tracks: JanusJS.TrackOption[] = [{ type: 'audio', capture: audio, add: true, recv: false }];
      if (!this.publisherVideoNegotiated) {
        const placeholder = this.makePlaceholderVideo();
        tracks.push({ type: 'video', capture: placeholder, add: true, recv: false });
        this.publisherVideoTrack = placeholder;
        this.publisherVideoNegotiated = true;
      }
      await new Promise<void>((resolve, reject) => handle.createOffer({
        tracks,
        success: (jsep) => {
          this.publisherAudioNegotiated = true;
          handle.send({ message: { request: 'configure', audio: true, video: !!this.publisherVideoTrack }, jsep });
          resolve();
        },
        error: reject,
      }));
    }

    this.publisherAudioTrack = audio;
    stream.addTrack(audio);
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
            const audio = document.createElement('audio'); audio.autoplay = true; audio.muted = this.state.incomingMuted; audio.srcObject = new MediaStream([track]);
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
    const previous = this.publisherVideoTrack;
    const next = track ?? (this.placeholderVideo ?? this.makePlaceholderVideo());
    try {
      if (!this.publisherVideoNegotiated) {
        if (!track) return;
        await new Promise<void>((resolve, reject) => handle.createOffer({
          tracks: [{ type: 'video', capture: track, add: true, recv: false }],
          success: (jsep) => {
            this.publisherVideoNegotiated = true;
            handle.send({ message: { request: 'configure', audio: !!this.publisherAudioTrack, video: true }, jsep });
            resolve();
          },
          error: reject,
        }));
      } else {
        await new Promise<void>((resolve, reject) => handle.replaceTracks({
          tracks: [{ type: 'video', capture: next, replace: true, recv: false }],
          success: () => {
            handle.send({ message: { request: 'configure', audio: !!this.publisherAudioTrack, video: !!track } });
            resolve();
          },
          error: reject,
        }));
      }

      if (previous && previous !== this.placeholderVideo) {
        this.localStream?.removeTrack(previous);
        if (previous !== track) previous.stop();
      }
      if (track) {
        this.localStream ??= new MediaStream();
        if (!this.localStream.getTracks().includes(track)) this.localStream.addTrack(track);
      }
      this.publisherVideoTrack = next;
      this.localScreen = screen && track ? new MediaStream([track]) : null;
      this.updateRemoteTiles();
    } catch (err) {
      track?.stop();
      this.set({ error: describeMediaError(err) });
    }
  }

  async toggleCamera(): Promise<void> {
    let track: MediaStreamTrack | undefined;
    try {
      if (this.state.cam) await this.replaceVideo(null, false);
      else {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 24 } });
        track = stream.getVideoTracks()[0];
        await this.ensureConnection();
        await this.replaceVideo(track, false);
      }
    } catch (err) { track?.stop(); this.set({ error: describeMediaError(err) }); }
  }
  async toggleScreen(): Promise<void> {
    let track: MediaStreamTrack | undefined;
    try {
      if (this.state.screen) await this.replaceVideo(null, false);
      else {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 } });
        track = stream.getVideoTracks()[0];
        await this.ensureConnection();
        track.onended = () => { void this.replaceVideo(null, false); };
        await this.replaceVideo(track, true);
      }
    } catch (err) { track?.stop(); this.set({ error: describeMediaError(err) }); }
  }
  toggleIncomingMute(): void { const muted = !this.state.incomingMuted; this.audioHost?.querySelectorAll('audio').forEach((a) => { a.muted = muted; }); this.set({ incomingMuted: muted }); }
  disable(): void {
    const audio = this.publisherAudioTrack;
    if (audio && this.publisher) {
      this.publisher.replaceTracks({
        tracks: [{ type: 'audio', capture: false, replace: true, recv: false }],
        success: () => this.publisher?.send({ message: { request: 'configure', audio: false, video: !!this.publisherVideoTrack } }),
        error: (err) => this.set({ error: describeMediaError(err) }),
      });
      this.localStream?.removeTrack(audio);
      audio.stop();
      this.publisherAudioTrack = null;
    }
    clearInterval(this.meterTimer); this.meterTimer = undefined;
    void this.meterCtx?.close().catch(() => {}); this.meterCtx = null;
    this.deps.setLevel('me', 0);
    this.deps.setVoiceFlag(false);
    this.set({ active: false, micConnecting: false, level: 0 });
    this.updateRemoteTiles();
  }
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
    this.publisherVideoTrack = null;
    this.publisherAudioTrack = null;
    this.publisherVideoNegotiated = false;
    this.publisherAudioNegotiated = false;
    this.localScreen?.getTracks().forEach((t) => t.stop()); this.localScreen = null;
    this.current = null;
    this.roomRetry = false;
    this.publisherReady = false;
    this.connectionPromise = null;
    this.micStarting = false;
    this.publishers.clear();
  }
}
