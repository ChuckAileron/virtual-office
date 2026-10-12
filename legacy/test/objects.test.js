'use strict';
const assert = require('assert');
const { T, generateLayout } = require('../server/layout');
const { CATALOG, CATALOG_LIST, MAX_OBJECTS, rebuildBlocked, validatePlacement } = require('../server/objects');
const { openDb } = require('../server/db');

const mkRoom = (tiles, objects = []) => {
  const room = { tiles, objects, players: new Map() };
  rebuildBlocked(room);
  return room;
};

// Piso generado: el interior de una oficina admite objetos; paredes, puertas y escritorios no
const layout = generateLayout({ offices: 3, conference: true, boss: true });
const room = mkRoom(layout.tiles);
const office = layout.offices.find((o) => o.kind === 'office');
const px = office.x + 1, py = office.y + 3; // interior libre, lejos de puertas y del frente del escritorio
assert.strictEqual(validatePlacement(room, 'plant', px, py), null);
assert.ok(validatePlacement(room, 'plant', 0, 0), 'pared');
assert.ok(validatePlacement(room, 'plant', -1, 5), 'fuera del mapa');
assert.ok(validatePlacement(room, 'nope', px, py), 'tipo inexistente');
assert.ok(validatePlacement(room, 'toString', px, py), 'clave heredada');
assert.ok(validatePlacement(room, 'plant', 1.5, 2), 'coordenadas no enteras');

// Ni sobre tiles no libres, ni frente a puertas, ni frente a los escritorios
for (let y = 0; y < layout.tiles.length; y++) {
  for (let x = 0; x < layout.tiles[0].length; x++) {
    const t = layout.tiles[y][x];
    if ([T.WALL, T.DOOR, T.DESK, T.TABLE, T.CHAIR, T.PLANT].includes(t)) {
      assert.ok(validatePlacement(room, 'bin', x, y), `tile ${t} en ${x},${y} debería rechazarse`);
    }
    if (layout.tiles[y - 1] && layout.tiles[y - 1][x] === T.DESK) {
      assert.ok(validatePlacement(room, 'bin', x, y), 'frente al escritorio');
    }
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => layout.tiles[y + dy] && layout.tiles[y + dy][x + dx] === T.DOOR)) {
      assert.ok(validatePlacement(room, 'bin', x, y), 'junto a una puerta');
    }
  }
}

// Solapamiento: la alfombra va debajo, lo demás no se superpone
const base = { type: 'plant', id: 1, x: px, y: py };
assert.ok(validatePlacement(mkRoom(layout.tiles, [base]), 'bin', px, py), 'ya ocupado');
assert.strictEqual(validatePlacement(mkRoom(layout.tiles, [base]), 'rug', px, py), null, 'alfombra bajo un objeto');
const rug = { type: 'rug', id: 2, x: px, y: py };
assert.ok(validatePlacement(mkRoom(layout.tiles, [base, rug]), 'rug', px + 1, py + 1), 'alfombra sobre alfombra');
assert.strictEqual(validatePlacement(mkRoom(layout.tiles, [rug]), 'bin', px + 1, py + 1), null, 'objeto sobre alfombra');

// Objetos de 2 tiles
assert.strictEqual(validatePlacement(room, 'sofa', px, py + 2), null);
assert.ok(validatePlacement(mkRoom(layout.tiles, [base]), 'sofa', px, py), 'el sofá se solapa con la planta');

// Un jugador encima impide colocar un objeto sólido, pero no una alfombra
const r3 = mkRoom(layout.tiles);
r3.players.set('a', { x: px, y: py });
assert.ok(validatePlacement(r3, 'bin', px, py));
assert.strictEqual(validatePlacement(r3, 'rug', px, py), null);

// No se puede aislar una zona del piso
const corridor = mkRoom([
  [1, 1, 1, 1, 1],
  [1, 0, 0, 0, 1],
  [1, 1, 1, 1, 1],
]);
assert.ok(validatePlacement(corridor, 'plant', 2, 1), 'tapa el pasillo');
const open = mkRoom([
  [1, 1, 1, 1, 1],
  [1, 0, 0, 0, 1],
  [1, 0, 0, 0, 1],
  [1, 1, 1, 1, 1],
]);
assert.strictEqual(validatePlacement(open, 'plant', 2, 1), null, 'hay rodeo');

// Límite de objetos
const many = Array.from({ length: MAX_OBJECTS }, (_, i) => ({ id: i, type: 'rug', x: 0, y: 0 }));
assert.ok(validatePlacement(mkRoom(layout.tiles, many), 'plant', px, py));

// Catálogo
assert.ok(CATALOG_LIST.length >= 12);
for (const d of CATALOG_LIST) assert.ok(d.name && d.w >= 1 && d.h >= 1 && CATALOG[d.type]);

// Persistencia en SQLite
const db = openDb(':memory:');
const code = db.saveRoom({ name: 'X', ...layout });
const a = db.addObject(code, 'plant', 3, 4);
const b = db.addObject(code, 'sofa', 5, 6);
assert.deepStrictEqual(db.loadObjects(code), [
  { id: a, type: 'plant', x: 3, y: 4 },
  { id: b, type: 'sofa', x: 5, y: 6 },
]);
assert.strictEqual(db.removeObject(code, a), true);
assert.strictEqual(db.removeObject(code, a), false);
assert.strictEqual(db.removeObject('OTROCODE', b), false, 'no borra objetos de otra sala');
assert.strictEqual(db.loadObjects(code).length, 1);
assert.deepStrictEqual(db.loadObjects('OTROCODE'), []);
db.close();

console.log('objects OK');
