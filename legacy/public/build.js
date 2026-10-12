'use strict';
// Modo decorar: catálogo de objetos, vista previa en el piso y colocación/retiro.
const Build = (() => {
  const PLACEABLE = new Set([T.FLOOR, T.OFFICE, T.BOSS, T.CONF]);
  const DEFAULT_MSG = 'Elige un objeto y haz clic en el piso. Clic derecho o Esc para cancelar.';
  let selected = null;
  let petSel = null; // tipo de mascota elegido ('dog' | 'cat')
  let petColor = null; // id del color elegido
  let removing = false;
  let hover = null;
  let errTimer = 0;
  let tab = 'office';

  const $ = (s) => document.querySelector(s);
  const isOpen = () => !$('#buildPanel').hidden;
  const defOf = (type) => G.catalog.find((d) => d.type === type);
  const cells = (def, x, y) => {
    const out = [];
    for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) out.push([x + dx, y + dy]);
    return out;
  };

  // Comprobación local (solo para colorear la vista previa); el servidor decide
  function canPlace(def, x, y) {
    const { tiles } = G.room;
    const mine = cells(def, x, y);
    const has = (px, py) => mine.some(([cx, cy]) => cx === px && cy === py);
    for (const [cx, cy] of mine) {
      if (!tiles[cy] || !PLACEABLE.has(tiles[cy][cx])) return false;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tiles[cy + dy] && tiles[cy + dy][cx + dx] === T.DOOR)) return false;
      if (tiles[cy - 1] && tiles[cy - 1][cx] === T.DESK) return false;
      if (tiles[cy][cx] === T.BOSS && tiles[cy + 1] && tiles[cy + 1][cx] === T.DESK) return false;
    }
    for (const o of G.objects) {
      const od = defOf(o.type);
      if (od && (od.layer === 'floor') === (def.layer === 'floor') && cells(od, o.x, o.y).some(([ox, oy]) => has(ox, oy))) return false;
    }
    if (def.solid) for (const p of G.players.values()) if (has(p.x, p.y)) return false;
    return true;
  }

  // Objeto bajo una casilla; los de encima tienen prioridad sobre las alfombras
  function petAt(x, y) {
    return [...G.pets.values()].find((p) => p.x === x && p.y === y) || null;
  }

  const PET_FLOORS = new Set([T.OFFICE, T.BOSS, T.CONF]);
  function canPlacePet(x, y) {
    const t = G.room.tiles[y] && G.room.tiles[y][x];
    if (!PET_FLOORS.has(t)) return false;
    if (petAt(x, y)) return false;
    for (const p of G.players.values()) if (p.x === x && p.y === y) return false;
    return !G.objects.some((o) => {
      const od = defOf(o.type);
      return od && od.solid && cells(od, o.x, o.y).some(([cx, cy]) => cx === x && cy === y);
    });
  }
  const petHex = () => (G.petColors.find((c) => c.id === petColor) || G.petColors[0]).hex;

  function objectAt(x, y) {
    let found = null;
    for (const o of G.objects) {
      const od = defOf(o.type);
      if (od && cells(od, o.x, o.y).some(([cx, cy]) => cx === x && cy === y) && (!found || od.layer !== 'floor')) found = o;
    }
    return found;
  }

  function toTile(ev) {
    const c = $('#canvas');
    const r = c.getBoundingClientRect();
    return {
      x: Math.floor(((ev.clientX - r.left) * (c.width / r.width) + G.cam.x) / TILE),
      y: Math.floor(((ev.clientY - r.top) * (c.height / r.height) + G.cam.y) / TILE),
    };
  }

  function message(text, isError) {
    const el = $('#buildMsg');
    el.textContent = text;
    el.classList.toggle('err', !!isError);
    clearTimeout(errTimer);
    if (isError) errTimer = setTimeout(() => message(DEFAULT_MSG), 3500);
  }

  function select(def) {
    selected = def;
    petSel = null;
    removing = false;
    $('#buildRemove').classList.remove('on');
    document.querySelectorAll('#buildItems button').forEach((b) => b.classList.toggle('on', !!def && b.dataset.type === def.type));
    document.querySelectorAll('#petKinds button').forEach((b) => b.classList.remove('on'));
    message(def ? `${def.name}: haz clic en el piso para colocarlo` : DEFAULT_MSG);
  }

  function selectPet(kind) {
    selected = null;
    removing = false;
    petSel = kind;
    $('#buildRemove').classList.remove('on');
    document.querySelectorAll('#buildItems button').forEach((b) => b.classList.remove('on'));
    document.querySelectorAll('#petKinds button').forEach((b) => b.classList.toggle('on', b.dataset.kind === kind));
    const k = G.petKinds.find((p) => p.type === kind);
    message(k ? `${k.name}: haz clic dentro de una oficina o sala` : DEFAULT_MSG);
  }

  function renderPets() {
    const kinds = $('#petKinds');
    kinds.innerHTML = '';
    for (const k of G.petKinds) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.kind = k.type;
      b.title = k.name;
      const c = document.createElement('canvas');
      c.width = 56; c.height = 56;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(Pets.sprite(k.type, petColor, petHex(), 0), 0, 0, 56, 56);
      const label = document.createElement('span');
      label.textContent = k.name;
      b.append(c, label);
      b.classList.toggle('on', petSel === k.type);
      b.onclick = () => (petSel === k.type ? select(null) : selectPet(k.type));
      kinds.append(b);
    }
    const colors = $('#petColors');
    colors.innerHTML = '';
    for (const c of G.petColors) {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = c.name;
      b.style.background = c.hex;
      b.classList.toggle('on', c.id === petColor);
      b.onclick = () => { petColor = c.id; renderPets(); };
      colors.append(b);
    }
  }

  const EMPTY_ACC = { hat: null, hatColor: null, glasses: null, extra: null, extraColor: null };
  const me = () => (G && G.players.get(G.you)) || null;
  const myAcc = () => {
    const a = me() && me().appearance.acc;
    const colors = G.accessories.colors;
    return { ...EMPTY_ACC, hatColor: colors[0], extraColor: colors[0], ...(a || {}) };
  };
  const sendLook = (acc) => G.ws.readyState === 1 && G.ws.send(JSON.stringify({ type: 'set_look', acc }));

  function accIcon(item, slot, acc) {
    const sample = { ...acc, hat: null, glasses: null, extra: null, [slot]: item.id };
    const dir = slot === 'extra' && (item.id === 'backpack' || item.id === 'cape') ? 'up' : 'down';
    const spr = Sprites.get({ ...me().appearance, acc: sample }, dir, 0);
    const c = document.createElement('canvas');
    const crop = slot === 'extra' ? [8, 22] : slot === 'hat' ? [0, 20] : [4, 16];
    c.width = Sprites.W; c.height = crop[1];
    c.getContext('2d').drawImage(spr, 0, crop[0], Sprites.W, crop[1], 0, 0, Sprites.W, crop[1]);
    return c;
  }

  function renderAccSlot(boxId, colorsId, slot, list, colorKey) {
    const acc = myAcc();
    const box = $(boxId);
    box.innerHTML = '';
    for (const item of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = item.name;
      b.classList.toggle('on', acc[slot] === item.id);
      b.append(accIcon(item, slot, acc));
      b.onclick = () => sendLook({ ...acc, [slot]: acc[slot] === item.id ? null : item.id });
      box.append(b);
    }
    if (!colorsId) return;
    const colors = $(colorsId);
    colors.hidden = !acc[slot];
    colors.innerHTML = '';
    for (const hex of G.accessories.colors) {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.background = hex;
      b.classList.toggle('on', acc[colorKey] === hex);
      b.onclick = () => sendLook({ ...acc, [colorKey]: hex });
      colors.append(b);
    }
  }

  function renderChar() {
    if (!me()) return;
    renderAccSlot('#accHats', '#accHatColors', 'hat', G.accessories.hats, 'hatColor');
    renderAccSlot('#accGlasses', null, 'glasses', G.accessories.glasses);
    renderAccSlot('#accExtras', '#accExtraColors', 'extra', G.accessories.extras, 'extraColor');
  }

  function setTab(name) {
    if (name === tab) return;
    tab = name;
    select(null);
    hover = null;
    document.querySelectorAll('#buildTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $('#officeTab').hidden = tab !== 'office';
    $('#charTab').hidden = tab !== 'char';
    if (tab === 'char') { renderChar(); message('Elige gorro, lentes y accesorios: se aplican al instante. Clic de nuevo para quitarlos.'); }
  }

  document.querySelectorAll('#buildTabs button').forEach((b) => { b.onclick = () => setTab(b.dataset.tab); });
  $('#accClear').onclick = () => sendLook({ ...EMPTY_ACC, hatColor: myAcc().hatColor, extraColor: myAcc().extraColor });

  function icon(def) {
    const spr = Objects.sprite(def);
    const c = document.createElement('canvas');
    c.width = 56; c.height = 44;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const k = Math.min(56 / spr.width, 44 / spr.height, 2);
    const w = Math.round(spr.width * k), h = Math.round(spr.height * k);
    g.drawImage(spr, Math.round((56 - w) / 2), Math.round((44 - h) / 2), w, h);
    return c;
  }

  function init() {
    const box = $('#buildItems');
    box.innerHTML = '';
    for (const def of G.catalog) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.type = def.type;
      b.title = def.name;
      const label = document.createElement('span');
      label.textContent = def.name;
      b.append(icon(def), label);
      b.onclick = () => select(selected && selected.type === def.type ? null : def);
      box.append(b);
    }
    petSel = null;
    petColor = G.petColors[0].id;
    renderPets();
    tab = 'char';
    setTab('office');
    close();
  }

  function open() {
    $('#buildPanel').hidden = false;
    $('#buildBtn').classList.add('on');
    select(null);
  }
  function close() {
    selected = null; petSel = null; removing = false; hover = null;
    $('#buildPanel').hidden = true;
    $('#buildBtn').classList.remove('on');
  }

  $('#buildBtn').onclick = () => { if (G) (isOpen() ? close() : open()); };
  $('#buildClose').onclick = close;
  $('#buildRemove').onclick = () => {
    removing = !removing;
    selected = null;
    petSel = null;
    document.querySelectorAll('#buildItems button, #petKinds button').forEach((b) => b.classList.remove('on'));
    $('#buildRemove').classList.toggle('on', removing);
    message(removing ? 'Haz clic sobre un objeto o mascota para quitarlo' : DEFAULT_MSG);
  };

  const canvas = $('#canvas');
  canvas.addEventListener('mousemove', (e) => { if (G && isOpen()) hover = toTile(e); });
  canvas.addEventListener('mouseleave', () => { hover = null; });
  canvas.addEventListener('click', (e) => {
    if (!G || !isOpen() || G.ws.readyState !== 1) return;
    const t = toTile(e);
    if (removing) {
      const pet = petAt(t.x, t.y);
      if (pet) { G.ws.send(JSON.stringify({ type: 'remove_pet', id: pet.id })); return; }
      const o = objectAt(t.x, t.y);
      if (o) G.ws.send(JSON.stringify({ type: 'remove_object', id: o.id }));
    } else if (petSel) {
      G.ws.send(JSON.stringify({ type: 'place_pet', kind: petSel, color: petColor, x: t.x, y: t.y }));
    } else if (selected) {
      G.ws.send(JSON.stringify({ type: 'place', kind: selected.type, x: t.x, y: t.y }));
    }
  });
  canvas.addEventListener('contextmenu', (e) => {
    if (!G || !isOpen()) return;
    e.preventDefault();
    select(null);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !G || !isOpen() || document.activeElement === $('#chatInput')) return;
    if (selected || removing || petSel) select(null); else close();
  });

  /** Dibujo del fantasma de colocación (coordenadas del mundo). */
  function drawOverlay(ctx) {
    if (!G || !hover || !isOpen()) return;
    if (petSel) {
      const ok = canPlacePet(hover.x, hover.y);
      const px = hover.x * TILE, py = hover.y * TILE;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.drawImage(Pets.sprite(petSel, petColor, petHex(), 0), px, py);
      ctx.globalAlpha = 1;
      ctx.fillStyle = ok ? '#3ddc8455' : '#ef444477';
      ctx.fillRect(px, py, TILE, TILE);
      ctx.strokeStyle = ok ? '#3ddc84' : '#ef4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
      ctx.restore();
      return;
    }
    if (selected) {
      const ok = canPlace(selected, hover.x, hover.y);
      const px = hover.x * TILE, py = hover.y * TILE;
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.drawImage(Objects.sprite(selected), px, py);
      ctx.globalAlpha = 1;
      ctx.fillStyle = ok ? '#3ddc8455' : '#ef444477';
      ctx.fillRect(px, py, selected.w * TILE, selected.h * TILE);
      ctx.strokeStyle = ok ? '#3ddc84' : '#ef4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, selected.w * TILE - 2, selected.h * TILE - 2);
      ctx.restore();
    } else if (removing) {
      const pet = petAt(hover.x, hover.y);
      if (pet) {
        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.strokeRect(pet.x * TILE + 1, pet.y * TILE + 1, TILE - 2, TILE - 2);
        ctx.fillStyle = '#ef444444';
        ctx.fillRect(pet.x * TILE, pet.y * TILE, TILE, TILE);
        ctx.restore();
        return;
      }
      const o = objectAt(hover.x, hover.y);
      const od = o && defOf(o.type);
      if (od) {
        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.strokeRect(o.x * TILE + 1, o.y * TILE + 1, od.w * TILE - 2, od.h * TILE - 2);
        ctx.fillStyle = '#ef444444';
        ctx.fillRect(o.x * TILE, o.y * TILE, od.w * TILE, od.h * TILE);
        ctx.restore();
      }
    }
  }

  return { init, reset: close, drawOverlay, error: (m) => message(m, true), refreshLook: () => { if (tab === 'char' && isOpen()) renderChar(); } };
})();
