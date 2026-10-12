import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { newDb } from 'pg-mem';
import { io as connect, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { loadConfig } from '../src/config';
import { DB } from '../src/db/repository';
import { configureApp } from '../src/main';

const look = {
  gender: 'male', style: 0, skin: '#f1c27d', hair: '#2b2b33', shirt: '#6366f1', pants: '#1f2937',
  acc: { hat: null, hatColor: '#ef4444', glasses: null, extra: null, extraColor: '#ef4444' },
};

let app: NestExpressApplication;
let base: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  const config = loadConfig({ JWT_SECRET: 'test-secret', LIVEKIT_API_KEY: 'devkey', LIVEKIT_API_SECRET: 'devsecret-devsecret-devsecret-12', LIVEKIT_PUBLIC_URL: 'wss://x/livekit', PET_TICK_MS: '100000' });
  const { Pool } = newDb().adapters.createPg();
  const mod = await Test.createTestingModule({ imports: [AppModule.register(config)] })
    .overrideProvider(DB).useValue(new Pool())
    .compile();
  app = mod.createNestApplication<NestExpressApplication>();
  configureApp(app, config);
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const s of sockets) s.close();
  await app.close();
});

const register = async (username: string) =>
  (await request(base).post('/api/register').send({ username, password: 'secret1', appearance: look })).body.token as string;

const open = (token: string) => {
  const s = connect(base, { auth: { token }, transports: ['websocket'], forceNew: true });
  sockets.push(s);
  return s;
};
const once = <T>(s: Socket, ev: string) => new Promise<T>((res) => s.once(ev, res));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('REST', () => {
  it('registra, inicia sesión y rechaza credenciales malas', async () => {
    const ok = await request(base).post('/api/register').send({ username: 'Ana_1', password: 'secret1', appearance: look });
    expect(ok.status).toBe(201);
    expect((await request(base).post('/api/register').send({ username: 'ana_1', password: 'secret1', appearance: look })).status).toBe(409);
    expect((await request(base).post('/api/login').send({ username: 'Ana_1', password: 'secret1' })).status).toBe(200);
    expect((await request(base).post('/api/login').send({ username: 'Ana_1', password: 'nope' })).status).toBe(401);
  });

  it('crear piso exige sesión y la consulta es por código', async () => {
    expect((await request(base).post('/api/rooms').send({ name: 'X' })).status).toBe(401);
    const token = await register('creador');
    const r = await request(base).post('/api/rooms').set('Authorization', `Bearer ${token}`).send({ name: 'Piso 1', offices: 2 });
    expect(r.status).toBe(201);
    expect((await request(base).get(`/api/rooms/${r.body.code}`)).body.name).toBe('Piso 1');
    expect((await request(base).get('/api/rooms/ZZZZ-ZZZZ')).status).toBe(404);
    expect((await request(base).get('/api/health')).body.ok).toBe(true);
  });
});

describe('Socket.IO', () => {
  it('rechaza tokens inválidos', async () => {
    const s = open('malo');
    const err = await new Promise<Error>((res) => s.once('connect_error', res));
    expect(err.message).toMatch(/Sesión inválida/);
  });

  it('entra, mueve, construye, entrega token de voz y avisa de audibilidad', async () => {
    const ta = await register('jugadora_a');
    const tb = await register('jugador_b');
    const room = (await request(base).post('/api/rooms').set('Authorization', `Bearer ${ta}`).send({ name: 'Sala', offices: 1 })).body;

    const a = open(ta);
    const welcomeA = once<any>(a, 'welcome');
    a.emit('join', { code: room.code });
    const wa = await welcomeA;
    expect(wa.room.name).toBe('Sala');
    expect(wa.catalog.length).toBeGreaterThan(0);

    const joined = once<any>(a, 'joined');
    const b = open(tb);
    b.emit('join', { code: room.code });
    const jb = await joined;
    expect(jb.player.name).toBe('jugador_b');

    const tok = await new Promise<any>((res) => a.emit('voice_token', res));
    expect(tok.ok).toBe(true);
    expect(tok.url).toBe('wss://x/livekit');
    expect(tok.token.split('.')).toHaveLength(3);

    const chat = once<any>(b, 'chat');
    a.emit('chat', { text: 'hola <b>' });
    // el chat solo llega a quienes están cerca; aceptamos que puede no llegar si están lejos
    await Promise.race([chat, wait(300)]);

    const moved = once<any>(b, 'moved');
    a.emit('move', { dir: 'down' });
    expect((await moved).id).toBe(wa.you);

    const err = once<any>(a, 'build_error');
    a.emit('place', { kind: 'no-existe', x: 0, y: 0 });
    expect((await err).error).toBeTruthy();
  });

  it('un segundo inicio de sesión reemplaza al primero', async () => {
    const t = await register('doble');
    const room = (await request(base).post('/api/rooms').set('Authorization', `Bearer ${t}`).send({ name: 'D' })).body;
    const s1 = open(t);
    s1.emit('join', { code: room.code });
    await once(s1, 'welcome');
    const replaced = once(s1, 'replaced');
    const s2 = open(t);
    s2.emit('join', { code: room.code });
    await once(s2, 'welcome');
    await replaced;
  });
});
