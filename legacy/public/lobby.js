'use strict';
// Lobby: autenticación, creación de personaje, creación y unión a pisos.
const $ = (s) => document.querySelector(s);

const showError = (msg) => { $('#lobbyError').textContent = msg || ''; };
const fail = (e) => showError(e instanceof TypeError ? 'No se pudo conectar con el servidor. ¿Está corriendo "npm start"?' : e.message);

async function api(url, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error inesperado');
  return data;
}

// ---- Pisos recordados localmente ----
const loadSaved = () => { try { return JSON.parse(localStorage.getItem('vo.rooms')) || []; } catch { return []; } };
function remember(room) {
  const list = loadSaved().filter((r) => r.code !== room.code);
  list.unshift({ code: room.code, name: room.name });
  localStorage.setItem('vo.rooms', JSON.stringify(list.slice(0, 20)));
}
function forget(code) {
  localStorage.setItem('vo.rooms', JSON.stringify(loadSaved().filter((r) => r.code !== code)));
}

function renderSaved() {
  const ul = $('#roomList');
  ul.innerHTML = '';
  const list = loadSaved();
  if (!list.length) ul.innerHTML = '<li>Aún no tienes pisos. Crea uno o usa un código de invitación.</li>';
  for (const r of list) {
    const li = document.createElement('li');
    const info = document.createElement('div');
    info.textContent = r.name;
    const small = document.createElement('small');
    small.textContent = `Código: ${r.code}`;
    info.append(small);
    const actions = document.createElement('div');
    actions.className = 'actions';
    const go = document.createElement('button');
    go.textContent = 'Entrar';
    go.onclick = () => joinByCode(r.code);
    const del = document.createElement('button');
    del.textContent = '✕';
    del.title = 'Quitar de mi lista';
    del.onclick = () => { forget(r.code); renderSaved(); };
    actions.append(go, del);
    li.append(info, actions);
    ul.append(li);
  }
}

// ---- Creador de personaje (aleatorio) ----
const creator = { gender: 'male', candidates: [], selected: 0 };

function rollCandidates() {
  creator.candidates = Array.from({ length: 8 }, () => Appearance.random(creator.gender));
  creator.selected = 0;
  renderCreator();
}

function renderCreator() {
  document.querySelectorAll('#genderTabs button').forEach((b) => b.classList.toggle('active', b.dataset.gender === creator.gender));
  const box = $('#presets');
  box.innerHTML = '';
  creator.candidates.forEach((a, i) => {
    const el = document.createElement('div');
    el.className = 'preset' + (i === creator.selected ? ' selected' : '');
    const c = document.createElement('canvas');
    c.width = Sprites.W; c.height = Sprites.H;
    c.getContext('2d').drawImage(Sprites.get(a, 'down', 0), 0, 0);
    el.append(c);
    el.onclick = () => { creator.selected = i; renderCreator(); };
    box.append(el);
  });
}

document.querySelectorAll('#genderTabs button').forEach((b) => {
  b.onclick = () => { creator.gender = b.dataset.gender; rollCandidates(); };
});
$('#rollBtn').onclick = rollCandidates;

// ---- Autenticación ----
let authMode = 'login';
let pending = null; // acción a ejecutar una vez autenticado: (token) => Promise

function setMode(mode) {
  authMode = mode;
  document.querySelectorAll('#authTabs button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $('#creator').hidden = mode !== 'register';
  $('#authSubmit').textContent = mode === 'register' ? 'Crear cuenta y entrar' : 'Ingresar';
  $('#authForm').password.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  if (mode === 'register' && !creator.candidates.length) rollCandidates();
}
document.querySelectorAll('#authTabs button').forEach((b) => { b.onclick = () => setMode(b.dataset.mode); });

function showAuth(title, action) {
  pending = action;
  $('#authTitle').textContent = title;
  $('#mainCards').hidden = true;
  $('#authCard').hidden = false;
  $('#authForm').username.value = localStorage.getItem('vo.user') || '';
  $('#authForm').password.value = '';
  setMode('login');
  showError('');
}

function hideAuth() {
  pending = null;
  $('#authForm').password.value = '';
  $('#authCard').hidden = true;
  $('#mainCards').hidden = false;
}
$('#authCancel').onclick = () => { hideAuth(); showError(''); };

$('#authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = { username: f.username.value.trim(), password: f.password.value };
  if (authMode === 'register') body.appearance = creator.candidates[creator.selected];
  try {
    const data = await api(authMode === 'register' ? '/api/register' : '/api/login', { method: 'POST', body });
    localStorage.setItem('vo.user', data.user.username);
    const action = pending;
    hideAuth();
    showError('');
    await action(data.token);
  } catch (err) { fail(err); }
});

// ---- Entrar / crear / unirse ----
function enter(code, token) {
  showError('');
  startGame({ code, token });
}

async function joinByCode(code) {
  try {
    const room = await api('/api/rooms/' + encodeURIComponent(code));
    showAuth(`Entrar a «${room.name}»`, async (token) => { remember(room); enter(room.code, token); });
  } catch (e) { fail(e); }
}

$('#joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $('#joinCode').value.trim();
  if (!code) return showError('Ingresa un código de invitación');
  joinByCode(code);
});

const form = $('#createForm');
const formOptions = () => ({
  offices: form.offices.value,
  conference: form.conference.checked,
  boss: form.boss.checked,
});

async function updateSizeInfo() {
  try {
    const s = await api('/api/layout?' + new URLSearchParams(formOptions()));
    $('#sizeInfo').textContent = `Tamaño del piso (automático): ${s.width}×${s.height} tiles.`;
  } catch { /* servidor no disponible */ }
}
form.addEventListener('input', updateSizeInfo);

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = form.name.value.trim();
  if (!name) return showError('El nombre del piso es obligatorio');
  const options = formOptions();
  showAuth('Inicia sesión para crear el piso', async (token) => {
    const room = await api('/api/rooms', { method: 'POST', body: { name, ...options }, token });
    remember(room);
    enter(room.code, token);
  });
});

updateSizeInfo();
renderSaved();
