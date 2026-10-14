import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config';
import { JanusService, VIDEO_ROOM_PLUGIN } from '../src/realtime/janus.service';

const fullConfig = () =>
  loadConfig({
    JWT_SECRET: 'test-secret',
    JANUS_ROOM_SECRET: 'test-room-secret',
    JANUS_API_URL: 'http://janus:8088/janus',
    JANUS_AUTH_SECRET: 'auth-secret',
    JANUS_ADMIN_KEY: 'admin-key',
  });

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

interface Call {
  url: string;
  body: { janus?: string; token?: string; body?: Record<string, unknown> };
}

function stubJanus(exists: boolean): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(init.body as string) as Call['body']) : {};
    calls.push({ url, body });
    if (body.janus === 'create') return json({ janus: 'success', data: { id: 1 } });
    if (body.janus === 'attach') return json({ janus: 'success', data: { id: 2 } });
    if (body.body?.request === 'exists') return json({ janus: 'success', plugindata: { plugin: VIDEO_ROOM_PLUGIN, data: { videoroom: 'success', exists } } });
    if (body.body?.request === 'create') return json({ janus: 'success', plugindata: { plugin: VIDEO_ROOM_PLUGIN, data: { videoroom: 'created', room: 100_000 } } });
    return json({ janus: 'success' });
  }));
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('JanusService', () => {
  it('firma tokens con el formato HMAC-SHA1 que exige Janus 1.4.1', () => {
    const token = new JanusService(fullConfig()).mintToken([VIDEO_ROOM_PLUGIN], 60);
    const [data, signature] = token.split(':');
    const [expiry, realm, plugin] = data.split(',');
    expect(realm).toBe('janus');
    expect(plugin).toBe(VIDEO_ROOM_PLUGIN);
    expect(Number(expiry)).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(signature).toBe(createHmac('sha1', 'auth-secret').update(data).digest('base64'));
  });

  it('crea la sala con admin_key, PIN y secreto cuando no existe', async () => {
    const calls = stubJanus(false);
    await new JanusService(fullConfig()).ensureRoom(100_000, 'pin123', 'secret456');
    const create = calls.find((c) => c.body.body?.request === 'create');
    expect(create?.body.body).toMatchObject({ room: 100_000, pin: 'pin123', secret: 'secret456', admin_key: 'admin-key' });
    expect(calls.every((c) => typeof c.body.token === 'string' && c.body.token.includes(',janus,'))).toBe(true);
  });

  it('no crea la sala si ya existe', async () => {
    const calls = stubJanus(true);
    await new JanusService(fullConfig()).ensureRoom(100_000, 'pin123', 'secret456');
    expect(calls.some((c) => c.body.body?.request === 'create')).toBe(false);
  });

  it('no toca la red cuando falta configuración (modo legado)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = new JanusService(loadConfig({ JWT_SECRET: 'test-secret', JANUS_ROOM_SECRET: 'test-room-secret' }));
    expect(service.enabled).toBe(false);
    await service.ensureRoom(100_000, 'pin', 'secret');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
