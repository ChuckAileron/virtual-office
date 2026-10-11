'use strict';
const assert = require('assert');
const { T, generateLayout, officeAt } = require('../server/layout');
const { rebuildBlocked } = require('../server/objects');
const { MAX_PETS, validatePet, stepPet } = require('../server/pets');
const { openDb } = require('../server/db');

const layout = generateLayout({ offices: 3, conference: true, boss: true });
const mk = () => {
  const room = { tiles: layout.tiles, offices: layout.offices, objects: [], pets: [], players: new Map() };
  rebuildBlocked(room);
  return room;
};
const room = mk();
const office = layout.offices.find((o) => o.kind === 'office');
const px = office.x + 1, py = office.y + 3;

assert.strictEqual(validatePet(room, 'dog', 'brown', px, py), null);
assert.strictEqual(validatePet(room, 'cat', 'black', px, py), null);
assert.ok(validatePet(room, 'bird', 'brown', px, py), 'tipo inválido');
assert.ok(validatePet(room, 'dog', 'pink', px, py), 'color inválido');
assert.ok(validatePet(room, 'dog', 'brown', 1.5, py), 'coordenada no entera');

// Solo dentro de oficina / jefe / sala de reuniones: nunca en el pasillo, paredes, puertas o escritorios
for (let y = 0; y < layout.tiles.length; y++) {
  for (let x = 0; x < layout.tiles[0].length; x++) {
    const t = layout.tiles[y][x];
    if ([T.FLOOR, T.WALL, T.DOOR, T.DESK, T.TABLE, T.PLANT].includes(t)) {
      assert.ok(validatePet(room, 'dog', 'brown', x, y), `tile ${t} en ${x},${y} debería rechazarse`);
    }
  }
}
for (const kind of ['boss', 'conference']) {
  const o = layout.offices.find((r) => r.kind === kind);
  assert.strictEqual(validatePet(room, 'cat', 'gray', o.x + 1, o.y + o.h - 2), null, kind);
}

// No sobre objetos sólidos, otras mascotas ni jugadores
const r2 = mk();
r2.objects.push({ id: 1, type: 'sofa', x: px, y: py });
r2.blocked.add(`${px},${py}`);
assert.ok(validatePet(r2, 'dog', 'brown', px, py), 'objeto sólido');
r2.pets.push({ id: 1, kind: 'dog', color: 'brown', x: px + 2, y: py });
assert.ok(validatePet(r2, 'cat', 'brown', px + 2, py), 'otra mascota');
r2.players.set('a', { x: px + 3, y: py });
assert.ok(validatePet(r2, 'cat', 'brown', px + 3, py), 'jugador');

// Límite de mascotas
const r3 = mk();
r3.pets = Array.from({ length: MAX_PETS }, (_, i) => ({ id: i, x: 0, y: 0 }));
assert.ok(validatePet(r3, 'dog', 'brown', px, py), 'máximo');

// Deambulan al azar sin salir nunca de su recinto
for (const o of layout.offices) {
  const r = mk();
  const start = { x: o.x + 1, y: o.y + o.h - 2 };
  const pet = { id: 1, kind: 'dog', color: 'brown', x: start.x, y: start.y, dir: 'down' };
  r.pets.push(pet);
  const visited = new Set();
  for (let i = 0; i < 3000; i++) {
    stepPet(r, pet);
    assert.strictEqual(officeAt(layout.offices, pet.x, pet.y), o, `salió de ${o.name}`);
    assert.ok([T.OFFICE, T.BOSS, T.CONF].includes(layout.tiles[pet.y][pet.x]), 'pisó algo no permitido');
    visited.add(`${pet.x},${pet.y}`);
  }
  assert.ok(visited.size > 5, `debería explorar ${o.name}`);
}

// Esquiva objetos sólidos y jugadores
{
  const r = mk();
  const o = office;
  const blockedKey = `${o.x + 2},${o.y + 3}`;
  r.blocked.add(blockedKey);
  r.players.set('p', { x: o.x + 3, y: o.y + 3 });
  const pet = { id: 1, x: o.x + 1, y: o.y + 3, dir: 'down' };
  r.pets.push(pet);
  for (let i = 0; i < 2000; i++) {
    stepPet(r, pet);
    assert.notStrictEqual(`${pet.x},${pet.y}`, blockedKey);
    assert.ok(!(pet.x === o.x + 3 && pet.y === o.y + 3), 'pisó a un jugador');
  }
}

// Persistencia
const db = openDb(':memory:');
const code = db.saveRoom({ name: 'T', size: layout.size, tiles: layout.tiles, offices: layout.offices });
const id = db.addPet(code, 'cat', 'orange', px, py);
assert.deepStrictEqual(db.loadPets(code), [{ id, kind: 'cat', color: 'orange', x: px, y: py, dir: 'down' }]);
assert.deepStrictEqual(db.loadPets('OTRO'), []);
assert.strictEqual(db.removePet('OTRO', id), false);
assert.strictEqual(db.removePet(code, id), true);
assert.deepStrictEqual(db.loadPets(code), []);
db.close();

console.log('pets OK');
