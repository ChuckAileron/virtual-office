'use strict';
// Catálogo de objetos decorativos y reglas de colocación (el servidor es la autoridad).
const { T, isWalkable } = require('./layout');

// layer 'floor': se dibuja bajo el resto y puede coexistir con otros objetos (alfombra)
const CATALOG = {
  plant: { name: 'Planta grande', w: 1, h: 1, solid: true },
  bookshelf: { name: 'Librero', w: 2, h: 1, solid: true },
  filing: { name: 'Archivador', w: 1, h: 1, solid: true },
  sofa: { name: 'Sofá', w: 2, h: 1, solid: true },
  armchair: { name: 'Sillón', w: 1, h: 1, solid: true },
  coffee: { name: 'Cafetera', w: 1, h: 1, solid: true },
  cooler: { name: 'Dispensador de agua', w: 1, h: 1, solid: true },
  printer: { name: 'Impresora', w: 1, h: 1, solid: true },
  whiteboard: { name: 'Pizarra', w: 2, h: 1, solid: true },
  fridge: { name: 'Refrigerador', w: 1, h: 1, solid: true },
  vending: { name: 'Máquina expendedora', w: 1, h: 1, solid: true },
  bin: { name: 'Papelera', w: 1, h: 1, solid: true },
  lamp: { name: 'Lámpara de pie', w: 1, h: 1, solid: true },
  rug: { name: 'Alfombra', w: 2, h: 2, solid: false, layer: 'floor' },
};

const CATALOG_LIST = Object.entries(CATALOG).map(([type, d]) => ({ type, ...d }));
const MAX_OBJECTS = 300;
const PLACEABLE = new Set([T.FLOOR, T.OFFICE, T.BOSS, T.CONF]);

const defOf = (type) => (typeof type === 'string' && Object.hasOwn(CATALOG, type) ? CATALOG[type] : null);

function footprint(def, x, y) {
  const cells = [];
  for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) cells.push([x + dx, y + dy]);
  return cells;
}

function rebuildBlocked(room) {
  room.blocked = new Set();
  for (const o of room.objects) {
    const def = defOf(o.type);
    if (def && def.solid) for (const [cx, cy] of footprint(def, o.x, o.y)) room.blocked.add(`${cx},${cy}`);
  }
}

function nearDoor(tiles, x, y) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tiles[y + dy] && tiles[y + dy][x + dx] === T.DOOR);
}

function reachableCount(tiles, blocked, start) {
  const w = tiles[0].length;
  const seen = new Set([start.y * w + start.x]);
  const queue = [start];
  while (queue.length) {
    const { x, y } = queue.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      const k = ny * w + nx;
      if (!seen.has(k) && isWalkable(tiles, nx, ny) && !blocked.has(`${nx},${ny}`)) {
        seen.add(k);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return seen.size;
}

// El objeto no puede aislar ninguna zona caminable del piso
function keepsFloorConnected(room, cells) {
  const after = new Set(room.blocked);
  cells.forEach(([cx, cy]) => after.add(`${cx},${cy}`));
  let start = null;
  for (let y = 0; y < room.tiles.length && !start; y++) {
    for (let x = 0; x < room.tiles[0].length; x++) {
      if (room.tiles[y][x] === T.FLOOR && !after.has(`${x},${y}`)) { start = { x, y }; break; }
    }
  }
  if (!start) return false;
  return reachableCount(room.tiles, after, start) === reachableCount(room.tiles, room.blocked, start) - cells.length;
}

/** Devuelve un mensaje de error o null si el objeto se puede colocar en (x, y). */
function validatePlacement(room, type, x, y) {
  const def = defOf(type);
  if (!def || !Number.isInteger(x) || !Number.isInteger(y)) return 'Objeto inválido';
  if (room.objects.length >= MAX_OBJECTS) return 'Se alcanzó el máximo de objetos del piso';
  const cells = footprint(def, x, y);
  for (const [cx, cy] of cells) {
    const t = room.tiles[cy] && room.tiles[cy][cx];
    if (!PLACEABLE.has(t)) return 'Aquí no se puede colocar (solo sobre el piso libre)';
    if (nearDoor(room.tiles, cx, cy)) return 'No bloquees las puertas';
    if (room.tiles[cy - 1] && room.tiles[cy - 1][cx] === T.DESK) return 'Deja libre el frente del escritorio';
    if (t === T.BOSS && room.tiles[cy + 1] && room.tiles[cy + 1][cx] === T.DESK) return 'Deja libre la silla del jefe';
  }
  const inCells = (px, py) => cells.some(([cx, cy]) => cx === px && cy === py);
  for (const o of room.objects) {
    const od = defOf(o.type);
    if (!od || (od.layer === 'floor') !== (def.layer === 'floor')) continue;
    if (footprint(od, o.x, o.y).some(([ox, oy]) => inCells(ox, oy))) return 'Ya hay un objeto aquí';
  }
  if (def.solid) {
    for (const p of room.players.values()) if (inCells(p.x, p.y)) return 'Hay alguien en ese lugar';
    for (const p of room.pets || []) if (inCells(p.x, p.y)) return 'Hay una mascota en ese lugar';
    if (!keepsFloorConnected(room, cells)) return 'Eso bloquearía el paso';
  }
  return null;
}

module.exports = { CATALOG, CATALOG_LIST, MAX_OBJECTS, defOf, footprint, rebuildBlocked, validatePlacement };
