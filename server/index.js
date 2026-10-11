'use strict';

const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');
const { T, computeFloorSize, generateLayout, isWalkable, officeAt, canTalk } = require('./layout');
const { openDb, normalizeCode, formatCode } = require('./db');
const { validateCredentials, hashPassword, verifyPassword, createSessions, createLimiter } = require('./auth');
const { sanitizeAppearance } = require('./appearance');
const { CATALOG: ACCESSORIES, sanitizeAccessories } = require('./accessories');
const { CATALOG_LIST, rebuildBlocked, validatePlacement } = require('./objects');
const { PET_KINDS, PET_COLORS, validatePet, stepPet } = require('./pets');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'offices.db');
const MOVE_INTERVAL_MS = 90;
const IDLE_MS = Number(process.env.IDLE_MS) || 5 * 60 * 1000;
const VOICE_RADIUS = 5;
const CHAT_RADIUS = 6;

const db = openDb(DB_PATH);
const sessions = createSessions(12 * 60 * 60 * 1000);
const loginLimiter = createLimiter(8, 10 * 60 * 1000);
const DUMMY_HASH = hashPassword('dummy-password'); // iguala el tiempo de respuesta si el usuario no existe

const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

/** Salas en memoria, indexadas por código normalizado (sin guion). @type {Map<string, any>} */
const rooms = new Map();
/** Usuarios conectados (una sola conexión por usuario). @type {Map<number, any>} */
const online = new Map();

const cleanText = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

function toRuntime(r) {
  const room = { code: r.code, name: r.name, size: r.size, tiles: r.tiles, offices: r.offices, players: new Map() };
  for (const o of room.offices) if (o.kind === 'conference') o.name = 'Sala de reuniones'; // pisos creados antes del cambio de nombre
  room.objects = db.loadObjects(r.code);
  room.pets = db.loadPets(r.code);
  rebuildBlocked(room);
  return room;
}
for (const r of db.loadRooms()) rooms.set(r.code, toRuntime(r));

function publicRoom(r) {
  return {
    code: formatCode(r.code),
    name: r.name,
    width: r.size.width,
    height: r.size.height,
    offices: r.offices.length,
    players: r.players.size,
  };
}

const startSession = (user) => ({
  token: sessions.issue(user.username),
  user: { username: user.username, appearance: user.appearance },
});

app.post('/api/register', (req, res) => {
  const { username, password, appearance } = req.body || {};
  const error = validateCredentials(username, password);
  if (error) return res.status(400).json({ error });
  const look = sanitizeAppearance(appearance);
  if (!look) return res.status(400).json({ error: 'Personaje inválido' });
  const user = db.createUser(username, hashPassword(password), look);
  if (!user) return res.status(409).json({ error: 'Ese nombre de usuario ya existe' });
  res.status(201).json(startSession(user));
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Ingresa usuario y contraseña' });
  }
  const key = `${req.ip}|${username.toLowerCase()}`;
  if (loginLimiter.blocked(key)) {
    return res.status(429).json({ error: 'Demasiados intentos fallidos. Intenta más tarde' });
  }
  const user = db.getUser(username);
  const ok = verifyPassword(password, user ? user.password : DUMMY_HASH);
  if (!user || !ok) {
    loginLimiter.fail(key);
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  loginLimiter.reset(key);
  res.json(startSession(user));
});

app.get('/api/layout', (req, res) => {
  res.json(computeFloorSize(req.query));
});

// Consulta por código de invitación; no existe listado público de salas.
app.get('/api/rooms/:code', (req, res) => {
  const room = rooms.get(normalizeCode(req.params.code));
  if (!room) return res.status(404).json({ error: 'Código de invitación inválido' });
  res.json(publicRoom(room));
});

app.post('/api/rooms', (req, res) => {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!match || !sessions.get(match[1])) {
    return res.status(401).json({ error: 'Inicia sesión para crear un piso' });
  }
  const { name, offices, conference, boss } = req.body || {};
  const roomName = cleanText(name, 32);
  if (!roomName) return res.status(400).json({ error: 'El nombre del piso es obligatorio' });
  if (rooms.size >= 1000) return res.status(429).json({ error: 'Demasiados pisos creados' });
  const layout = generateLayout({ offices, conference, boss });
  const code = db.saveRoom({ name: roomName, size: layout.size, tiles: layout.tiles, offices: layout.offices });
  const room = toRuntime({ code, name: roomName, ...layout });
  rooms.set(code, room);
  res.status(201).json(publicRoom(room));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 65536 });

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function broadcast(room, msg, except) {
  const data = JSON.stringify(msg);
  for (const p of room.players.values()) {
    if (p.ws !== except && p.ws.readyState === 1) p.ws.send(data);
  }
}
const view = (p) => ({ id: p.id, name: p.name, appearance: p.appearance, x: p.x, y: p.y, dir: p.dir, voice: !!p.voice, idle: !!p.idle });

// Cualquier actividad (mover, chatear, voz, input en el cliente) reinicia el contador
function touch(p) {
  p.lastActive = Date.now();
  if (p.idle) {
    p.idle = false;
    if (p.room) broadcast(p.room, { type: 'presence', id: p.id, idle: false });
  }
}

const idleSweep = setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    for (const p of room.players.values()) {
      if (!p.idle && now - p.lastActive >= IDLE_MS) {
        p.idle = true;
        broadcast(room, { type: 'presence', id: p.id, idle: true });
      }
    }
  }
}, Math.min(10000, Math.max(100, IDLE_MS / 2)));
idleSweep.unref();

// Las mascotas deambulan al azar dentro de su recinto mientras haya gente conectada
const PET_TICK_MS = Number(process.env.PET_TICK_MS) || 700;
const petTick = setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.players.size || !room.pets.length) continue;
    for (const pet of room.pets) {
      if (stepPet(room, pet)) broadcast(room, { type: 'pet_move', id: pet.id, x: pet.x, y: pet.y, dir: pet.dir });
    }
  }
}, PET_TICK_MS);
petTick.unref();

function removePlayer(p) {
  if (!p.room) return;
  p.room.players.delete(p.id);
  broadcast(p.room, { type: 'left', id: p.id });
  if (online.get(p.userId) === p) online.delete(p.userId);
  p.room = null;
}

function spawnPoint(room) {
  const free = [];
  for (let y = 0; y < room.tiles.length; y++) {
    for (let x = 0; x < room.tiles[0].length; x++) {
      if (room.tiles[y][x] === T.FLOOR && !room.blocked.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  return free[Math.floor(Math.random() * free.length)];
}

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

wss.on('connection', (ws) => {
  let player = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'join' && !player) {
      const session = sessions.get(msg.token);
      const user = session && db.getUser(session.username);
      if (!user) return send(ws, { type: 'error', error: 'Sesión inválida. Inicia sesión de nuevo' });
      const room = rooms.get(normalizeCode(msg.code));
      if (!room) return send(ws, { type: 'error', error: 'Código de invitación inválido' });

      const previous = online.get(user.id);
      if (previous) {
        removePlayer(previous);
        previous.ws.close();
      }

      const spawn = spawnPoint(room);
      player = {
        id: crypto.randomBytes(4).toString('hex'),
        userId: user.id,
        ws,
        room,
        name: user.username,
        appearance: user.appearance,
        x: spawn.x,
        y: spawn.y,
        dir: 'down',
        lastMove: 0,
        lastActive: Date.now(),
        idle: false,
      };
      room.players.set(player.id, player);
      online.set(user.id, player);
      send(ws, {
        type: 'welcome',
        you: player.id,
        room: { code: formatCode(room.code), name: room.name, size: room.size, tiles: room.tiles, offices: room.offices },
        objects: room.objects,
        catalog: CATALOG_LIST,
        pets: room.pets,
        petKinds: PET_KINDS,
        petColors: PET_COLORS,
        accessories: ACCESSORIES,
        players: [...room.players.values()].map(view),
      });
      broadcast(room, { type: 'joined', player: view(player) }, ws);
      return;
    }

    if (!player || !player.room) return;
    if (['activity', 'move', 'chat', 'voice', 'place', 'remove_object', 'place_pet', 'remove_pet', 'set_look'].includes(msg.type)) touch(player);
    if (msg.type === 'activity') return;
    const room = player.room;

    if (msg.type === 'move') {
      const d = DIRS[msg.dir];
      const now = Date.now();
      if (!d || now - player.lastMove < MOVE_INTERVAL_MS) return;
      player.lastMove = now;
      player.dir = msg.dir;
      const nx = player.x + d[0];
      const ny = player.y + d[1];
      if (isWalkable(room.tiles, nx, ny) && !room.blocked.has(`${nx},${ny}`)) { player.x = nx; player.y = ny; }
      broadcast(room, { type: 'moved', id: player.id, x: player.x, y: player.y, dir: player.dir });
    } else if (msg.type === 'place' || msg.type === 'remove_object') {
      const now = Date.now();
      if (now - (player.lastEdit || 0) < 120) return;
      player.lastEdit = now;
      if (msg.type === 'place') {
        const error = validatePlacement(room, msg.kind, msg.x, msg.y);
        if (error) return send(ws, { type: 'build_error', error });
        const object = { id: db.addObject(room.code, msg.kind, msg.x, msg.y), type: msg.kind, x: msg.x, y: msg.y };
        room.objects.push(object);
        rebuildBlocked(room);
        broadcast(room, { type: 'object_add', object });
      } else {
        const idx = room.objects.findIndex((o) => o.id === msg.id);
        if (idx < 0) return send(ws, { type: 'build_error', error: 'Ese objeto ya no existe' });
        db.removeObject(room.code, msg.id);
        room.objects.splice(idx, 1);
        rebuildBlocked(room);
        broadcast(room, { type: 'object_remove', id: msg.id });
      }
    } else if (msg.type === 'place_pet' || msg.type === 'remove_pet') {
      const now = Date.now();
      if (now - (player.lastEdit || 0) < 120) return;
      player.lastEdit = now;
      if (msg.type === 'place_pet') {
        const error = validatePet(room, msg.kind, msg.color, msg.x, msg.y);
        if (error) return send(ws, { type: 'build_error', error });
        const pet = { id: db.addPet(room.code, msg.kind, msg.color, msg.x, msg.y), kind: msg.kind, color: msg.color, x: msg.x, y: msg.y, dir: 'down' };
        room.pets.push(pet);
        broadcast(room, { type: 'pet_add', pet });
      } else {
        const idx = room.pets.findIndex((p) => p.id === msg.id);
        if (idx < 0) return send(ws, { type: 'build_error', error: 'Esa mascota ya no existe' });
        db.removePet(room.code, msg.id);
        room.pets.splice(idx, 1);
        broadcast(room, { type: 'pet_remove', id: msg.id });
      }
    } else if (msg.type === 'set_look') {
      const now = Date.now();
      if (now - (player.lastLook || 0) < 100) return;
      player.lastLook = now;
      player.appearance = { ...player.appearance, acc: sanitizeAccessories(msg.acc) };
      db.updateAppearance(player.userId, player.appearance);
      broadcast(room, { type: 'look', id: player.id, appearance: player.appearance });
    } else if (msg.type === 'voice') {
      player.voice = msg.on === true;
      broadcast(room, { type: 'voice', id: player.id, on: player.voice });
    } else if (msg.type === 'signal') {
      // Señalización WebRTC: solo se reenvía entre jugadores que pueden hablarse
      const target = typeof msg.to === 'string' ? room.players.get(msg.to) : null;
      if (!target || target === player || !canTalk(room.offices, player, target, VOICE_RADIUS)) return;
      if (!msg.data || typeof msg.data !== 'object') return;
      send(target.ws, { type: 'signal', from: player.id, data: msg.data });
    } else if (msg.type === 'chat') {
      const text = cleanText(msg.text, 200);
      if (!text) return;
      const myOffice = officeAt(room.offices, player.x, player.y);
      const out = JSON.stringify({ type: 'chat', id: player.id, name: player.name, text });
      for (const p of room.players.values()) {
        const near = Math.hypot(p.x - player.x, p.y - player.y) <= CHAT_RADIUS;
        const sameOffice = myOffice && officeAt(room.offices, p.x, p.y) === myOffice;
        if ((near || sameOffice) && p.ws.readyState === 1) p.ws.send(out);
      }
    }
  });

  ws.on('close', () => { if (player) removePlayer(player); });
});

if (require.main === module) {
  const onListenError = (err) => {
    if (err.code === 'EADDRINUSE') console.error(`El puerto ${PORT} ya está en uso (¿otro servidor corriendo?). Ciérralo o usa otro puerto: PORT=3001 npm start`);
    else console.error(err);
    process.exit(1);
  };
  server.on('error', onListenError);
  wss.on('error', onListenError);
  server.listen(PORT, () => console.log(`Oficina virtual en http://localhost:${PORT}`));
}

module.exports = { app, server };
