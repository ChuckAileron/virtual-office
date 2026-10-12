import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, createRoom, getConfig, getLayoutSize, getRoom, login, register } from './api';

const appearance = { gender: 'male', style: 0, skin: '#ffdcbc', hair: '#0b0b0b', shirt: '#3b82f6', pants: '#334155', acc: { hat: null, hatColor: '#ef4444', glasses: null, extra: null, extraColor: '#ef4444' } } as const;

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({ ok: status < 400, status, json: () => Promise.resolve(body) });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('api', () => {
  it('login envía JSON y devuelve la sesión', async () => {
    const fn = mockFetch(200, { token: 't', user: { username: 'ana', appearance } });
    const res = await login('ana', 'pw');
    expect(res.token).toBe('t');
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe('/api/login');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ username: 'ana', password: 'pw' });
  });

  it('register incluye la apariencia', async () => {
    const fn = mockFetch(201, { token: 't', user: { username: 'ana', appearance } });
    await register('ana', 'pw', appearance);
    expect(JSON.parse(fn.mock.calls[0][1].body).appearance).toEqual(appearance);
  });

  it('createRoom usa Bearer y convierte offices a número', async () => {
    const fn = mockFetch(201, { code: 'ABCD-EFGH' });
    await createRoom('Espacio', { offices: '4', conference: true, boss: false }, 'tok');
    const init = fn.mock.calls[0][1];
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ name: 'Espacio', offices: 4, conference: true, boss: false });
  });

  it('getLayoutSize arma la query', async () => {
    const fn = mockFetch(200, { width: 10, height: 20 });
    await getLayoutSize({ offices: 6, conference: false, boss: true });
    expect(fn.mock.calls[0][0]).toBe('/api/layout?offices=6&conference=false&boss=true');
  });

  it('getRoom codifica el código y getConfig lee la config', async () => {
    const fn = mockFetch(200, { livekitUrl: null });
    await getRoom('AB CD');
    expect(fn.mock.calls[0][0]).toBe('/api/rooms/AB%20CD');
    expect(await getConfig()).toEqual({ livekitUrl: null });
  });

  it('propaga { message } como ApiRequestError con el status', async () => {
    mockFetch(404, { message: 'Espacio no encontrado' });
    const err = await getRoom('X').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ message: 'Espacio no encontrado', status: 404 });
  });

  it('une mensajes de validación en arreglo', async () => {
    mockFetch(400, { message: ['usuario muy corto', 'clave muy corta'] });
    await expect(login('a', 'b')).rejects.toThrow('usuario muy corto. clave muy corta');
  });

  it('usa un mensaje genérico si el cuerpo no es JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.reject(new Error('x')) }));
    await expect(getConfig()).rejects.toThrow('Error inesperado');
  });

  it('traduce el fallo de red', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(getConfig()).rejects.toMatchObject({ message: 'No se pudo conectar con el servidor', status: 0 });
  });
});
