'use strict';
const { T, officeAt } = require('./layout');

const PET_KINDS = [
  { type: 'dog', name: 'Perro' },
  { type: 'cat', name: 'Gato' },
];
const PET_COLORS = [
  { id: 'brown', name: 'Café', hex: '#8a5a33' },
  { id: 'black', name: 'Negro', hex: '#2b2b33' },
  { id: 'white', name: 'Blanco', hex: '#ecebe6' },
  { id: 'gray', name: 'Gris', hex: '#8d939e' },
  { id: 'orange', name: 'Naranjo', hex: '#e08a3c' },
  { id: 'golden', name: 'Dorado', hex: '#d8b05a' },
];
const MAX_PETS = 20;
// Las mascotas solo pisan el suelo de oficinas, oficina del jefe y sala de reuniones
const PET_TILES = new Set([T.OFFICE, T.BOSS, T.CONF]);
const DIR_STEPS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const isKind = (k) => PET_KINDS.some((p) => p.type === k);
const isColor = (c) => PET_COLORS.some((p) => p.id === c);

function tileFree(room, x, y, self) {
  const t = room.tiles[y] && room.tiles[y][x];
  if (!PET_TILES.has(t) || room.blocked.has(`${x},${y}`)) return false;
  for (const p of room.pets) if (p !== self && p.x === x && p.y === y) return false;
  for (const p of room.players.values()) if (p.x === x && p.y === y) return false;
  return true;
}

/** Devuelve un mensaje de error o null si la mascota se puede dejar en (x, y). */
function validatePet(room, kind, color, x, y) {
  if (!isKind(kind) || !isColor(color) || !Number.isInteger(x) || !Number.isInteger(y)) return 'Mascota inválida';
  if (room.pets.length >= MAX_PETS) return 'Se alcanzó el máximo de mascotas del piso';
  if (!officeAt(room.offices, x, y)) return 'Las mascotas solo pueden vivir dentro de una oficina o sala';
  if (!tileFree(room, x, y, null)) return 'Aquí no se puede dejar una mascota';
  return null;
}

/** Mueve la mascota un paso al azar sin salir de su recinto. Devuelve true si cambió algo. */
function stepPet(room, pet, rnd = Math.random) {
  if (rnd() < 0.45) return false; // se queda quieta un rato
  const zone = officeAt(room.offices, pet.x, pet.y);
  if (!zone) return false;
  const options = [];
  for (const [dir, [dx, dy]] of Object.entries(DIR_STEPS)) {
    const nx = pet.x + dx, ny = pet.y + dy;
    if (officeAt(room.offices, nx, ny) === zone && tileFree(room, nx, ny, pet)) options.push({ dir, nx, ny });
  }
  if (!options.length) return false;
  const o = options[Math.floor(rnd() * options.length)];
  pet.x = o.nx; pet.y = o.ny; pet.dir = o.dir;
  return true;
}

module.exports = { PET_KINDS, PET_COLORS, MAX_PETS, PET_TILES, validatePet, stepPet, tileFree };
