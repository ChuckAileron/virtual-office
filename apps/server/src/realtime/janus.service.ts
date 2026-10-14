import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import { APP_CONFIG, AppConfig } from '../config';

/** Plugin de Janus usado para la voz. */
export const VIDEO_ROOM_PLUGIN = 'janus.plugin.videoroom';
/** Realm de Janus para tokens de API (siempre `janus`). */
const REALM = 'janus';
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_PUBLISHERS = 20;

interface JanusResponse {
  janus: string;
  transaction?: string;
  data?: { id?: number | string };
  plugindata?: { plugin: string; data: Record<string, unknown> };
  error?: { code?: number; reason?: string };
}

@Injectable()
export class JanusService {
  private readonly log = new Logger(JanusService.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** Modo completo: API interna + secreto de firma + admin_key presentes. */
  get enabled(): boolean {
    const { apiUrl, authSecret, adminKey } = this.config.janus;
    return Boolean(apiUrl && authSecret && adminKey);
  }

  /**
   * Token firmado que exige Janus cuando `token_auth` está activo. Formato de la
   * versión 1.4.1:
   *   `<expiryUnix>,janus,<plugin1>[,pluginN]:<base64(HMAC-SHA1(secret, datos))>`
   */
  mintToken(plugins: string[] = [VIDEO_ROOM_PLUGIN], ttlSeconds: number = this.config.janus.tokenTtlSeconds): string {
    const secret = this.config.janus.authSecret;
    if (!secret) throw new Error('JANUS_AUTH_SECRET no está configurado');
    const ttl = Math.max(60, Math.floor(ttlSeconds));
    const expiry = Math.floor(Date.now() / 1000) + ttl;
    const data = [String(expiry), REALM, ...plugins].join(',');
    const signature = createHmac('sha1', secret).update(data).digest('base64');
    return `${data}:${signature}`;
  }

  /**
   * Garantiza que la sala existe. Janus exige el `admin_key` para crear salas, así
   * que los navegadores no pueden crearlas ni destruirlas por su cuenta.
   */
  async ensureRoom(room: number, pin: string, secret: string): Promise<void> {
    if (!this.enabled) return;
    const adminKey = this.config.janus.adminKey;
    let session: number | null = null;
    try {
      session = await this.createSession();
      const handle = await this.attach(session, VIDEO_ROOM_PLUGIN);
      const exists = await this.message(session, handle, { request: 'exists', room });
      if (exists.plugindata?.data?.exists === true) return;
      const created = await this.message(session, handle, {
        request: 'create',
        room,
        description: 'Virtual Office',
        publishers: MAX_PUBLISHERS,
        pin,
        secret,
        admin_key: adminKey,
      });
      const reason = this.reasonOf(created);
      // Otra petición pudo crear la sala entre el `exists` y el `create`.
      if (reason && !reason.toLowerCase().includes('exists')) throw new Error(reason);
    } catch (err) {
      this.log.warn(`No se pudo asegurar la sala ${room}: ${(err as Error).message}`);
      throw err;
    } finally {
      if (session !== null) await this.destroy(session).catch(() => undefined);
    }
  }

  private reasonOf(resp: JanusResponse): string | undefined {
    const pluginReason = resp.plugindata?.data?.error;
    if (typeof pluginReason === 'string') return pluginReason;
    return resp.error?.reason;
  }

  private async createSession(): Promise<number> {
    const resp = await this.request('', { janus: 'create' });
    const id = resp.data?.id;
    if (resp.janus !== 'success' || id == null) throw new Error(resp.error?.reason ?? 'No se pudo crear la sesión de Janus');
    return Number(id);
  }

  private async attach(session: number, plugin: string): Promise<number> {
    const resp = await this.request(String(session), { janus: 'attach', plugin });
    const id = resp.data?.id;
    if (resp.janus !== 'success' || id == null) throw new Error(resp.error?.reason ?? `No se pudo adjuntar ${plugin}`);
    return Number(id);
  }

  private async destroy(session: number): Promise<void> {
    await this.request(String(session), { janus: 'destroy' });
  }

  private async message(session: number, handle: number, body: Record<string, unknown>): Promise<JanusResponse> {
    const transaction = randomBytes(8).toString('hex');
    const resp = await this.request(`${session}/${handle}`, { janus: 'message', transaction, body });
    if (resp.janus !== 'ack') return resp;
    return this.poll(session, transaction);
  }

  private async request(path: string, body: Record<string, unknown>): Promise<JanusResponse> {
    const base = this.config.janus.apiUrl as string;
    const url = path ? `${base}/${path}` : base;
    const payload = { transaction: randomBytes(8).toString('hex'), ...body, token: this.mintToken() };
    const data = await this.send(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return Array.isArray(data) ? (data[0] ?? { janus: 'error' }) : data;
  }

  /** Recoge una respuesta que Janus entregó como `ack` en el POST. */
  private async poll(session: number, transaction: string): Promise<JanusResponse> {
    const base = this.config.janus.apiUrl as string;
    const url = `${base}/${session}?rid=${transaction}&maxev=1&token=${encodeURIComponent(this.mintToken())}`;
    const data = await this.send(url, { method: 'GET' });
    const first = Array.isArray(data) ? data[0] : data;
    return first && typeof first === 'object' ? (first as JanusResponse) : { janus: 'ack', transaction };
  }

  private async send(url: string, init: RequestInit): Promise<JanusResponse | JanusResponse[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (!res.ok) throw new Error(`Janus respondió HTTP ${res.status}`);
      return (await res.json()) as JanusResponse | JanusResponse[];
    } finally {
      clearTimeout(timer);
    }
  }
}
