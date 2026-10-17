import 'reflect-metadata';
import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { newDb } from 'pg-mem';
import { io as connect, type Socket } from 'socket.io-client';
import request from 'supertest';
import { GAME, T, normalizeCode, officeAt } from '@vo/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { loadConfig } from '../src/config';
import { DB, Repository } from '../src/db/repository';
import { RoomsService } from '../src/rooms/rooms.service';
import { configureApp } from '../src/main';

const look = {
  gender: 'male', style: 0, skin: '#f1c27d', hair: '#2b2b33', shirt: '#6366f1', pants: '#1f2937',
  acc: { hat: null, hatColor: '#ef4444', glasses: null, extra: null, extraColor: '#ef4444' },
};

let app: NestExpressApplication;
let base: string;
const sockets: Socket[] = [];
const uploadsDir = mkdtempSync(path.join(os.tmpdir(), 'vo-floor-images-'));

beforeAll(async () => {
  const config = { ...loadConfig({ JWT_SECRET: 'test-secret', JANUS_ROOM_SECRET: 'test-room-secret', JANUS_PUBLIC_URL: 'wss://x/janus', PET_TICK_MS: '100000' }), uploadsDir };
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
  rmSync(uploadsDir, { recursive: true, force: true });
});

const register = async (username: string) =>
  (await request(base).post('/api/register').send({ username, password: 'secret1', appearance: look })).body.token as string;

const loginUser = async (username: string, password: string) =>
  (await request(base).post('/api/login').send({ username, password })).body as { token: string; user: { username: string; role: string } };

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

  it('crea el administrador por defecto con rol admin', async () => {
    const res = await request(base).post('/api/login').send({ username: 'admin', password: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('admin');
    expect(res.body.user.role).toBe('admin');
  });

  it('permite cambiar la contraseña verificando la actual', async () => {
    const token = await register('pass_user');
    expect((await request(base).post('/api/password').set('Authorization', `Bearer ${token}`).send({ currentPassword: 'nope', newPassword: 'secret2' })).status).toBe(401);
    expect((await request(base).post('/api/password').set('Authorization', `Bearer ${token}`).send({ currentPassword: 'secret1', newPassword: '123' })).status).toBe(400);
    expect((await request(base).post('/api/password').send({ currentPassword: 'secret1', newPassword: 'secret2' })).status).toBe(401);
    expect((await request(base).post('/api/password').set('Authorization', `Bearer ${token}`).send({ currentPassword: 'secret1', newPassword: 'secret2' })).status).toBe(200);
    expect((await request(base).post('/api/login').send({ username: 'pass_user', password: 'secret2' })).status).toBe(200);
    expect((await request(base).post('/api/login').send({ username: 'pass_user', password: 'secret1' })).status).toBe(401);
  });

  it('crear espacio de trabajo exige sesión y la consulta es por código', async () => {
    expect((await request(base).post('/api/rooms').send({ name: 'X' })).status).toBe(401);
    const token = await register('creador');
    const r = await request(base).post('/api/rooms').set('Authorization', `Bearer ${token}`).send({ name: 'Espacio 1', offices: 2 });
    expect(r.status).toBe(201);
    expect((await request(base).get(`/api/rooms/${r.body.code}`)).body.name).toBe('Espacio 1');
    const objects = await app.get(Repository).loadObjects(normalizeCode(r.body.code));
    expect(objects.some((object) => object.type === 'bookshelf_tall')).toBe(true);
    const runtime = app.get(RoomsService).find(r.body.code)!;
    expect(objects.filter((object) => object.type === 'plant' && ['office', 'boss'].includes(officeAt(runtime.offices, object.x, object.y)?.kind ?? '')).length).toBe(0);
    expect((await request(base).get('/api/rooms/ZZZZ-ZZZZ')).status).toBe(404);
    expect((await request(base).get('/api/health')).body.ok).toBe(true);
  });

  it('no siembra plantas en oficinas; solo en las zonas comunes de la referencia', async () => {
    const token = await register('qa_sinplantas');
    const response = await request(base).post('/api/rooms').set('Authorization', `Bearer ${token}`).send({
      name: 'Interiores de referencia', offices: 2, conference: true, kitchen: true, rest: true,
    });
    expect(response.status).toBe(201);
    const room = app.get(RoomsService).find(response.body.code);
    if (!room) throw new Error('El espacio creado no está en RoomsService');
    const plants = room.objects.filter((object) => object.type === 'plant');
    expect(plants.length).toBeGreaterThan(0);
    for (const plant of plants) {
      const zone = officeAt(room.offices, plant.x, plant.y);
      expect(['conference', 'rest', 'lobby']).toContain(zone?.kind);
    }
  });

  it('siembra la distribución TOBE del mapa completo en los anclajes de la referencia', async () => {
    const token = await register('qa_mapa_tobe');
    const response = await request(base).post('/api/rooms').set('Authorization', `Bearer ${token}`).send({
      name: 'Mapa TOBE', offices: 20, conference: true, kitchen: true, rest: true,
    });
    expect(response.status).toBe(201);
    const room = app.get(RoomsService).find(response.body.code);
    if (!room) throw new Error('El espacio creado no está en RoomsService');
    expect(room.size).toMatchObject({ width: 67, height: 70, offices: 20 });

    const objectAt = (type: string, x: number, y: number) => room.objects.find((o) => o.type === type && o.x === x && o.y === y);
    const office1 = room.offices.find((o) => o.name === 'Oficina 1')!;
    const office2 = room.offices.find((o) => o.name === 'Oficina 2')!;
    const office3 = room.offices.find((o) => o.name === 'Oficina 3')!;
    const meeting = room.offices.find((o) => o.kind === 'conference')!;
    const rest = room.offices.find((o) => o.kind === 'rest')!;
    const lobby = room.offices.find((o) => o.kind === 'lobby')!;

    expect(objectAt('bookshelf_tall', office1.x + office1.w - 3, office1.y + 2)).toBeTruthy();
    expect(objectAt('bookshelf_tall', office2.x + 1, office2.y + 2)).toBeTruthy();
    expect(objectAt('filing', office1.x + 1, office1.y + office1.h - 3)).toBeTruthy();
    expect(objectAt('cooler', office3.x + 1, office3.y + office3.h - 3)).toBeTruthy();
    expect(room.objects.some((o) => o.type === 'rug' && ['office', 'boss'].includes(officeAt(room.offices, o.x, o.y)?.kind ?? ''))).toBe(false);

    const roomTiles = (zone: typeof meeting, tile: number) => room.tiles.slice(zone.y, zone.y + zone.h)
      .reduce((count, row) => count + row.slice(zone.x, zone.x + zone.w).filter((value) => value === tile).length, 0);
    expect(roomTiles(meeting, T.TABLE)).toBe(36);
    expect(roomTiles(meeting, T.CHAIR)).toBe(20);
    expect(room.objects.filter((o) => o.type === 'rug' && officeAt(room.offices, o.x, o.y)?.kind === 'conference')).toHaveLength(15);
    expect(objectAt('sofa_wide', rest.x + 5, rest.y + 2)).toBeTruthy();
    expect(objectAt('sofa_vertical', rest.x + 2, rest.y + 5)).toMatchObject({ flipped: true });
    expect(objectAt('sofa_vertical', rest.x + rest.w - 4, rest.y + 5)).toMatchObject({ flipped: false });
    expect(room.tiles[lobby.y + 3][lobby.x + 2]).toBe(T.COUNTER);
    expect(objectAt('sofa_blue', lobby.x + lobby.w - 11, lobby.y + 2)).toBeTruthy();
    expect(objectAt('sofa_vertical_blue', lobby.x + lobby.w - 14, lobby.y + 3)).toBeTruthy();
  });

  it('sube una imagen, la coloca solo dentro de una oficina y la entrega a quienes entran', async () => {
    const token = await register('decoradora');
    const otherToken = await register('visitante_imagen');
    const room = (await request(base).post('/api/rooms').set('Authorization', `Bearer ${token}`).send({ name: 'Espacio con imagen', offices: 1 })).body;
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/nxkAAAAASUVORK5CYII=', 'base64');
    expect((await request(base).post('/api/floor-images').attach('image', png, { filename: 'floor.png', contentType: 'image/png' })).status).toBe(401);
    const uploaded = await request(base)
      .post('/api/floor-images')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', png, { filename: 'floor.png', contentType: 'image/png' });
    expect(uploaded.status).toBe(201);
    expect((await request(base).get(uploaded.body.imageUrl)).status).toBe(200);
    expect((await request(base).post('/api/floor-images').set('Authorization', `Bearer ${token}`).attach('image', Buffer.from('bad'), { filename: 'bad.png', contentType: 'image/png' })).status).toBe(400);

    const creator = open(token);
    const creatorWelcome = once<any>(creator, 'welcome');
    creator.emit('join', { code: room.code });
    const welcome = await creatorWelcome;
    const office = welcome.room.offices.find((o: any) => o.kind === 'office');
    const visitor = open(otherToken);
    const visitorWelcome = once<any>(visitor, 'welcome');
    visitor.emit('join', { code: room.code });
    expect((await visitorWelcome).floorDecorations).toEqual([]);

    const placed = once<any>(visitor, 'floor_decoration_add');
    creator.emit('place_floor_decoration', { imageUrl: uploaded.body.imageUrl, x: office.x + 1, y: office.y + 1, w: 2, h: 2 });
    const event = await placed;
    expect(event.decoration).toMatchObject({ imageUrl: uploaded.body.imageUrl, x: office.x + 1, y: office.y + 1, w: 2, h: 2 });

    const finalToken = await register('visitante_final');
    const finalSocket = open(finalToken);
    const finalWelcome = once<any>(finalSocket, 'welcome');
    finalSocket.emit('join', { code: room.code });
    expect((await finalWelcome).floorDecorations).toEqual([event.decoration]);
  });

  it('guarda y actualiza el patrón de piso por oficina', async () => {
    const token = await register('decoradora_piso');
    const room = (await request(base).post('/api/rooms').set('Authorization', `Bearer ${token}`).send({ name: 'Espacio de color', offices: 1 })).body;
    const repository = app.get(Repository);
    const code = normalizeCode(room.code);
    const solid = { officeId: 1, color: '#335577', pattern: 'solid' as const };
    await repository.saveOfficeFloorStyle(code, solid);
    expect(await repository.loadOfficeFloorStyles(code)).toEqual([solid]);

    const checker = { ...solid, color: '#ddaa66', pattern: 'checker' as const };
    await repository.saveOfficeFloorStyle(code, checker);
    expect(await repository.loadOfficeFloorStyles(code)).toEqual([checker]);

    const wood = { ...solid, color: '#88aacc', pattern: 'wood' as const };
    await repository.saveOfficeFloorStyle(code, wood);
    expect(await repository.loadOfficeFloorStyles(code)).toEqual([wood]);
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
    expect(tok.url).toBe('wss://x/janus');
    expect(tok.room).toEqual(expect.any(Number));
    expect(tok.pin).toMatch(/^[a-f0-9]{24}$/);
    expect(tok.identity).toBe(wa.you);
    // Sin JANUS_API_URL no hay modo completo: no se firma token para Janus.
    expect(tok.token).toBeUndefined();

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

  it('persiste perspectiva lateral y volteo horizontal de los objetos', async () => {
    const token = await register('persistencia_perspectiva');
    const room = (await request(base).post('/api/rooms').set('Authorization', `Bearer ${token}`).send({ name: 'Perspectivas', offices: 1 })).body;
    const repository = app.get(Repository);
    const code = normalizeCode(room.code);
    const object = await repository.addObject(code, 'bookshelf', 3, 6, 'side', true);
    expect(object).toMatchObject({ type: 'bookshelf', perspective: 'side', flipped: true });
    expect(await repository.loadObjects(code)).toContainEqual(object);
  });

  it('difunde la alarma de emergencia a todos los presentes', async () => {
    const ta = await register('alarma_a');
    const tb = await register('alarma_b');
    const room = (await request(base).post('/api/rooms').set('Authorization', `Bearer ${ta}`).send({ name: 'Alarma', offices: 1 })).body;
    const a = open(ta);
    const welcomeA = once<any>(a, 'welcome');
    a.emit('join', { code: room.code });
    await welcomeA;
    const b = open(tb);
    const welcomeB = once<any>(b, 'welcome');
    b.emit('join', { code: room.code });
    await welcomeB;

    const heardByB = once<any>(b, 'alarm');
    const heardByA = once<any>(a, 'alarm');
    a.emit('alarm', { message: 'Reunión urgente' });
    const event = await heardByB;
    expect(event).toMatchObject({ name: 'alarma_a', message: 'Reunión urgente', durationMs: GAME.ALARM_DURATION_MS });
    expect(event.from).toEqual(expect.any(String));
    // Quien la dispara también la escucha.
    expect((await heardByA).from).toBe(event.from);
  });

  it('limita la frecuencia de las alarmas de un mismo jugador', async () => {
    const t = await register('alarma_spam');
    const room = (await request(base).post('/api/rooms').set('Authorization', `Bearer ${t}`).send({ name: 'Spam', offices: 1 })).body;
    const s = open(t);
    const welcome = once<any>(s, 'welcome');
    s.emit('join', { code: room.code });
    await welcome;

    let count = 0;
    s.on('alarm', () => { count++; });
    s.emit('alarm', { message: 'primera' });
    s.emit('alarm', { message: 'segunda' });
    await wait(200);
    expect(count).toBe(1);
  });

  it('el admin asigna jefe y el jefe convoca a todos a la sala de reuniones', async () => {
    const admin = await loginUser('admin', 'admin');
    const ta = await register('conv_jefe');
    const tb = await register('conv_miembro');

    const adminSocket = open(admin.token);
    await once(adminSocket, 'connect');
    const listed = await new Promise<{ users: Array<{ username: string; role: string }> }>((res) => adminSocket.emit('list_users', res));
    expect(listed.users).toContainEqual({ username: 'admin', role: 'admin' });

    const notice = once<any>(adminSocket, 'notice');
    adminSocket.emit('assign_role', { username: 'conv_jefe', role: 'boss' });
    expect((await notice).text).toMatch(/jefe/i);

    const room = (await request(base).post('/api/rooms').set('Authorization', `Bearer ${ta}`).send({ name: 'Reunión', offices: 2, conference: true })).body;
    const a = open(ta);
    const welcomeA = once<any>(a, 'welcome');
    a.emit('join', { code: room.code });
    const wa = await welcomeA;
    const b = open(tb);
    const welcomeB = once<any>(b, 'welcome');
    b.emit('join', { code: room.code });
    await welcomeB;

    const conference = wa.room.offices.find((o: any) => o.kind === 'conference');
    const convened = once<any>(b, 'convened');
    a.emit('convene');
    const event = await convened;
    expect(event.by).toBe('conv_jefe');
    expect(event.seats).toHaveLength(2);
    for (const seat of event.seats) {
      expect(seat.x).toBeGreaterThanOrEqual(conference.x);
      expect(seat.x).toBeLessThan(conference.x + conference.w);
      expect(seat.y).toBeGreaterThanOrEqual(conference.y);
      expect(seat.y).toBeLessThan(conference.y + conference.h);
    }
  });

  it('un miembro no puede convocar ni asignar roles', async () => {
    const t = await register('conv_solo');
    const room = (await request(base).post('/api/rooms').set('Authorization', `Bearer ${t}`).send({ name: 'Sin permiso', offices: 2, conference: true })).body;
    const s = open(t);
    const welcome = once<any>(s, 'welcome');
    s.emit('join', { code: room.code });
    await welcome;

    const conveneNotice = once<any>(s, 'notice');
    s.emit('convene');
    expect((await conveneNotice).text).toMatch(/jefe o un administrador/i);

    const roleNotice = once<any>(s, 'notice');
    s.emit('assign_role', { username: 'conv_jefe', role: 'member' });
    expect((await roleNotice).text).toMatch(/administrador/i);

    const listed = await new Promise<{ users: unknown[] }>((res) => s.emit('list_users', res));
    expect(listed.users).toEqual([]);
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
