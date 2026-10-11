'use strict';
// Motor del juego: render en canvas, input, WebSocket.
const TILE = 32;
const SPRITE_SCALE = 2;
const T = { FLOOR: 0, WALL: 1, OFFICE: 2, DESK: 3, PLANT: 4, DOOR: 5, TABLE: 6, CHAIR: 7, BOSS: 8, CONF: 9 };
const MOVE_SEND_MS = 110;
const BUBBLE_MS = 5000;

let G = null; // estado de la partida activa

function startGame({ code, token }) {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'join', code, token }));
  ws.onmessage = (ev) => handleMessage(ev, ws);
  ws.onclose = () => { if (G && G.ws === ws) leaveGame('Conexión cerrada'); };
}

function makePlayer(p) {
  return { ...p, rx: p.x, ry: p.y, bubble: null, bubbleUntil: 0 };
}

function handleMessage(ev, ws) {
  const msg = JSON.parse(ev.data);
  if (msg.type === 'error') {
    document.querySelector('#lobbyError').textContent = msg.error;
    ws.close();
    return;
  }
  if (msg.type === 'welcome') {
    G = {
      ws, you: msg.you, room: msg.room, players: new Map(), keys: new Set(), lastSend: 0, raf: 0, lastT: performance.now(),
      objects: msg.objects || [], catalog: msg.catalog || [], cam: { x: 0, y: 0 },
      pets: new Map(), petKinds: msg.petKinds || [], petColors: msg.petColors || [],
      accessories: msg.accessories,
    };
    (msg.pets || []).forEach((p) => G.pets.set(p.id, { ...p, rx: p.x, ry: p.y }));
    msg.players.forEach((p) => G.players.set(p.id, makePlayer(p)));
    openGameUI();
    return;
  }
  if (!G) return;
  switch (msg.type) {
    case 'joined': G.players.set(msg.player.id, makePlayer(msg.player)); renderPlayers(); Voice.sync(); break;
    case 'left': G.players.delete(msg.id); Voice.closePeer(msg.id); renderPlayers(); Voice.sync(); break;
    case 'moved': {
      const p = G.players.get(msg.id);
      if (p) { p.x = msg.x; p.y = msg.y; p.dir = msg.dir; Voice.sync(); }
      break;
    }
    case 'voice': {
      const p = G.players.get(msg.id);
      if (p) { p.voice = msg.on; Voice.sync(); }
      break;
    }
    case 'signal': Voice.onSignal(msg); break;
    case 'object_add': G.objects.push(msg.object); break;
    case 'object_remove': G.objects = G.objects.filter((o) => o.id !== msg.id); break;
    case 'build_error': Build.error(msg.error); break;
    case 'look': {
      const p = G.players.get(msg.id);
      if (p) { p.appearance = msg.appearance; renderPlayers(); if (msg.id === G.you) Build.refreshLook(); }
      break;
    }
    case 'pet_add': G.pets.set(msg.pet.id, { ...msg.pet, rx: msg.pet.x, ry: msg.pet.y }); break;
    case 'pet_remove': G.pets.delete(msg.id); break;
    case 'pet_move': {
      const p = G.pets.get(msg.id);
      if (p) { p.x = msg.x; p.y = msg.y; p.dir = msg.dir; }
      break;
    }
    case 'presence': {
      const p = G.players.get(msg.id);
      if (p) { p.idle = msg.idle; renderPlayers(); }
      break;
    }
    case 'chat': {
      const p = G.players.get(msg.id);
      if (p) { p.bubble = msg.text; p.bubbleUntil = performance.now() + BUBBLE_MS; }
      addChatLine(msg.name, msg.text);
      break;
    }
  }
}

const els = {
  lobby: () => document.querySelector('#lobby'),
  game: () => document.querySelector('#game'),
  canvas: () => document.querySelector('#canvas'),
};

function openGameUI() {
  els.lobby().hidden = true;
  els.game().hidden = false;
  document.querySelector('#hudRoom').textContent = `${G.room.name} (${G.room.size.width}×${G.room.size.height})`;
  const codeBtn = document.querySelector('#codeBtn');
  codeBtn.textContent = `🔑 ${G.room.code}`;
  codeBtn.onclick = () => {
    const done = () => { codeBtn.textContent = '✔ Copiado'; setTimeout(() => { if (G) codeBtn.textContent = `🔑 ${G.room.code}`; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(G.room.code).then(done, () => {});
  };
  document.querySelector('#chatLog').innerHTML = '';
  renderPlayers();
  Build.init();
  resize();
  G.lastT = performance.now();
  G.raf = requestAnimationFrame(frame);
}

function leaveGame(reason) {
  if (!G) return;
  cancelAnimationFrame(G.raf);
  Voice.reset();
  Build.reset();
  try { G.ws.close(); } catch { /* ya cerrado */ }
  G = null;
  els.game().hidden = true;
  els.lobby().hidden = false;
  document.querySelector('#lobbyError').textContent = reason || '';
  renderSaved();
}
document.querySelector('#leaveBtn').onclick = () => leaveGame('');

function renderPlayers() {
  if (!G) return;
  const box = document.querySelector('#players');
  box.innerHTML = '';
  const title = document.createElement('strong');
  title.textContent = `Conectados (${G.players.size})`;
  box.append(title);
  for (const p of G.players.values()) {
    const d = document.createElement('div');
    d.textContent = (p.idle ? '🟡 ' : '🟢 ') + p.name + (p.id === G.you ? ' (tú)' : '') + (p.idle ? ' · inactivo' : '');
    d.style.opacity = p.idle ? '0.6' : '1';
    box.append(d);
  }
}

function addChatLine(name, text) {
  const log = document.querySelector('#chatLog');
  const d = document.createElement('div');
  const b = document.createElement('b');
  b.textContent = name + ': ';
  d.append(b, document.createTextNode(text));
  log.append(d);
  while (log.children.length > 8) log.firstChild.remove();
}

// ---- Input ----
const KEYMAP = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
const chatInput = document.querySelector('#chatInput');

window.addEventListener('keydown', (e) => {
  if (!G) return;
  if (document.activeElement === chatInput) {
    if (e.key === 'Escape') chatInput.blur();
    return;
  }
  if (e.key === 'Enter') { e.preventDefault(); chatInput.focus(); return; }
  const dir = KEYMAP[e.key];
  if (dir) { e.preventDefault(); G.keys.delete(dir); G.keys.add(dir); }
});
window.addEventListener('keyup', (e) => { if (G && KEYMAP[e.key]) G.keys.delete(KEYMAP[e.key]); });
window.addEventListener('blur', () => { if (G) G.keys.clear(); });

// Avisa al servidor de actividad del usuario (limitado a 1 aviso cada 2 s)
let lastActivitySent = 0;
function reportActivity() {
  if (!G || G.ws.readyState !== 1) return;
  const now = performance.now();
  if (now - lastActivitySent < 2000) return;
  lastActivitySent = now;
  G.ws.send(JSON.stringify({ type: 'activity' }));
}
['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'].forEach((ev) => window.addEventListener(ev, reportActivity, { passive: true }));
document.querySelector('#chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (text && G) G.ws.send(JSON.stringify({ type: 'chat', text }));
  chatInput.value = '';
  chatInput.blur();
});
window.addEventListener('resize', resize);

function resize() {
  const c = els.canvas();
  c.width = c.clientWidth;
  c.height = c.clientHeight;
}

// ---- Render ----
function frame(now) {
  if (!G) return;
  const dt = Math.min(0.1, (now - G.lastT) / 1000);
  G.lastT = now;

  // Última tecla pulsada manda
  if (G.keys.size && now - G.lastSend >= MOVE_SEND_MS && G.ws.readyState === 1) {
    const dir = [...G.keys].pop();
    G.ws.send(JSON.stringify({ type: 'move', dir }));
    G.lastSend = now;
  }

  for (const p of [...G.players.values(), ...G.pets.values()]) {
    const k = Math.min(1, dt * (p.kind ? 7 : 14));
    p.rx += (p.x - p.rx) * k;
    p.ry += (p.y - p.ry) * k;
    if (Math.abs(p.x - p.rx) < 0.01) p.rx = p.x;
    if (Math.abs(p.y - p.ry) < 0.01) p.ry = p.y;
  }
  draw(now);
  G.raf = requestAnimationFrame(frame);
}

function draw(now) {
  const canvas = els.canvas();
  if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) resize();
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#11141f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const { tiles, size, offices } = G.room;
  const me = G.players.get(G.you);
  const mapW = size.width * TILE, mapH = size.height * TILE;
  const camX = mapW <= canvas.width ? (mapW - canvas.width) / 2 : clamp((me.rx + 0.5) * TILE - canvas.width / 2, 0, mapW - canvas.width);
  const camY = mapH <= canvas.height ? (mapH - canvas.height) / 2 : clamp((me.ry + 0.5) * TILE - canvas.height / 2, 0, mapH - canvas.height);
  ctx.save();
  G.cam.x = Math.round(camX); G.cam.y = Math.round(camY);
  ctx.translate(-G.cam.x, -G.cam.y);

  const x0 = Math.max(0, Math.floor(camX / TILE)), x1 = Math.min(size.width - 1, Math.floor((camX + canvas.width) / TILE));
  const y0 = Math.max(0, Math.floor(camY / TILE)), y1 = Math.min(size.height - 1, Math.floor((camY + canvas.height) / TILE));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) drawTile(ctx, tiles[y][x], x, y, tiles);

  // Silla frente al centro de cada escritorio (decorativa, debajo de los jugadores)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (tiles[y][x] === T.DESK && tiles[y][x - 1] === T.DESK && tiles[y][x + 1] === T.DESK) {
        const boss = roomKindAt(x, y) === 'boss';
        ctx.drawImage(Props.chair(x + y), x * TILE, (boss ? y - 1 : y + 1) * TILE, TILE, TILE);
      }
    }
  }

  // Objetos decorativos: alfombras debajo y el resto ordenado por fila
  const defs = new Map(G.catalog.map((d) => [d.type, d]));
  const visible = G.objects.filter((o) => defs.has(o.type));
  for (const layer of ['floor', 'obj']) {
    visible
      .filter((o) => (defs.get(o.type).layer === 'floor') === (layer === 'floor'))
      .sort((a, b) => a.y - b.y)
      .forEach((o) => ctx.drawImage(Objects.sprite(defs.get(o.type)), o.x * TILE, o.y * TILE));
  }

  for (const o of offices) {
    ctx.fillStyle = '#ffffffcc';
    ctx.font = 'bold 12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(o.name, (o.x + o.w / 2) * TILE, (o.y + 0.65) * TILE);
  }

  // Mascotas: debajo de los jugadores, ordenadas por fila
  const hexOf = new Map(G.petColors.map((c) => [c.id, c.hex]));
  [...G.pets.values()].sort((a, b) => a.ry - b.ry).forEach((p) => Pets.draw(ctx, p, hexOf.get(p.color) || '#888888', now));

  // Jugadores ordenados por Y para el solapamiento
  const list = [...G.players.values()].sort((a, b) => a.ry - b.ry);
  for (const p of list) drawPlayer(ctx, p, now);
  for (const p of list) drawLabel(ctx, p, now);
  Build.drawOverlay(ctx);
  ctx.restore();

  const office = offices.find((o) => me.x >= o.x && me.x < o.x + o.w && me.y >= o.y && me.y < o.y + o.h);
  document.querySelector('#hudWhere').textContent = office ? `📍 ${office.name}` : '📍 Pasillo';
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const FLOORS = {
  office: ['#b9a27c', '#b09872'],
  boss: ['#7a4a52', '#703f48'],
  conference: ['#a9b8a2', '#a0af99'],
  hall: ['#8ea4c4', '#869cbd'],
};

function roomKindAt(x, y) {
  const o = G.room.offices.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  return o ? o.kind || 'office' : 'hall';
}

function drawTile(ctx, t, x, y, tiles) {
  const px = x * TILE, py = y * TILE;
  const checker = (x + y) % 2 === 0;
  if (t === T.WALL) {
    ctx.fillStyle = '#4a5270'; ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = '#5d6690'; ctx.fillRect(px, py, TILE, 6);
    ctx.fillStyle = '#383f58'; ctx.fillRect(px, py + TILE - 4, TILE, 4);
    return;
  }
  if (t === T.DOOR) {
    ctx.fillStyle = '#d8c9a6'; ctx.fillRect(px, py, TILE, TILE);
    return;
  }
  const kind = t === T.BOSS ? 'boss' : t === T.CONF ? 'conference' : t === T.OFFICE ? 'office' : t === T.FLOOR ? 'hall' : roomKindAt(x, y);
  ctx.fillStyle = FLOORS[kind][checker ? 0 : 1];
  ctx.fillRect(px, py, TILE, TILE);

  if (t === T.DESK) {
    // Cada escritorio ocupa 3 tiles que comparten un sprite de 96x32
    let start = x;
    while (tiles[y][start - 1] === T.DESK) start--;
    ctx.drawImage((kind === 'boss' ? Props.deskBoss : Props.desk)(start + y), (x - start) * TILE, 0, TILE, TILE, px, py, TILE, TILE);
  } else if (t === T.TABLE) {
    const top = tiles[y - 1][x] !== T.TABLE;
    ctx.fillStyle = '#6a4224'; ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = '#9a6b3d'; ctx.fillRect(px, py + (top ? 2 : 0), TILE, TILE - (top ? 2 : 4));
    if (!top) { ctx.fillStyle = '#5a3519'; ctx.fillRect(px, py + TILE - 4, TILE, 4); }
    if (tiles[y][x - 1] !== T.TABLE) { ctx.fillStyle = '#6a4224'; ctx.fillRect(px, py, 2, TILE); }
    if (tiles[y][x + 1] !== T.TABLE) { ctx.fillStyle = '#6a4224'; ctx.fillRect(px + TILE - 2, py, 2, TILE); }
    if (!top && (x + y) % 3 === 0) { ctx.fillStyle = '#f4f4f4'; ctx.fillRect(px + 8, py + 6, 10, 8); }
  } else if (t === T.CHAIR) {
    // Silla arriba de la mesa mira hacia abajo; la de abajo, hacia arriba
    const above = tiles[y + 1][x] === T.TABLE;
    ctx.save();
    if (!above) { ctx.translate(px, py + TILE); ctx.scale(1, -1); ctx.drawImage(Props.chair(x), 0, 0, TILE, TILE); }
    else ctx.drawImage(Props.chair(x), px, py, TILE, TILE);
    ctx.restore();
  } else if (t === T.PLANT) {
    ctx.fillStyle = '#8a4b2a'; ctx.fillRect(px + 10, py + 20, 12, 10);
    ctx.fillStyle = '#2e9e4f'; ctx.beginPath(); ctx.arc(px + 16, py + 14, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3fbf67'; ctx.beginPath(); ctx.arc(px + 13, py + 11, 5, 0, Math.PI * 2); ctx.fill();
  }
}

function drawPlayer(ctx, p, now) {
  const moving = p.rx !== p.x || p.ry !== p.y;
  const frameIdx = moving ? 1 + (Math.floor(now / 140) % 2) : 0;
  const spr = Sprites.get(p.appearance, p.dir, frameIdx);
  const w = Sprites.W * SPRITE_SCALE, h = Sprites.H * SPRITE_SCALE;
  const cx = (p.rx + 0.5) * TILE, feet = (p.ry + 1) * TILE - 2;
  ctx.fillStyle = '#0005';
  ctx.beginPath(); ctx.ellipse(cx, feet, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(spr, Math.round(cx - w / 2), Math.round(feet - h + 2), w, h);
}

function drawLabel(ctx, p, now) {
  const cx = (p.rx + 0.5) * TILE;
  const top = (p.ry + 1) * TILE - Sprites.H * SPRITE_SCALE;
  ctx.font = '12px system-ui';
  ctx.textAlign = 'center';
  const label = p.name + (p.idle ? ' 💤' : '');
  const tw = ctx.measureText(label).width + 24;
  ctx.fillStyle = '#000a';
  ctx.fillRect(cx - tw / 2, top - 16, tw, 15);
  ctx.fillStyle = p.idle ? '#f5b301' : '#3ddc84';
  ctx.beginPath(); ctx.arc(cx - tw / 2 + 9, top - 8.5, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p.idle ? '#aaa' : (p.id === G.you ? '#ffe27a' : '#fff');
  ctx.fillText(label, cx + 7, top - 5);
  if (p.voice) {
    const speaking = (p.level || 0) > 0.08;
    ctx.textAlign = 'left';
    ctx.fillText(p.id === G.you && Voice.isMuted() ? '🔇' : (speaking ? '🔊' : '🎙'), cx + tw / 2 + 2, top - 4);
    ctx.textAlign = 'center';
    if (speaking) {
      ctx.strokeStyle = '#3ddc84';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, (p.ry + 1) * TILE - 2, 15, 7, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }

  if (p.bubble && now < p.bubbleUntil) {
    const text = p.bubble.length > 40 ? p.bubble.slice(0, 40) + '…' : p.bubble;
    const bw = ctx.measureText(text).width + 14;
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - bw / 2, top - 40, bw, 20);
    ctx.fillStyle = '#111';
    ctx.fillText(text, cx, top - 26);
  }
}
