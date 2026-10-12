import { officeAt } from './layout';
import { DIRS, Dir, Pet, RoomState, T } from './types';

export const PET_KINDS = [
  { type: 'dog', name: 'Perro' },
  { type: 'cat', name: 'Gato' },
  { type: 'rabbit', name: 'Conejo' },
];
export const PET_COLORS = [
  { id: 'brown', name: 'Café', hex: '#8a5a33' },
  { id: 'black', name: 'Negro', hex: '#2b2b33' },
  { id: 'white', name: 'Blanco', hex: '#ecebe6' },
  { id: 'gray', name: 'Gris', hex: '#8d939e' },
  { id: 'orange', name: 'Naranjo', hex: '#e08a3c' },
  { id: 'golden', name: 'Dorado', hex: '#d8b05a' },
];
export const MAX_PETS = 20;
// Las mascotas solo pisan el suelo de oficinas, oficina del jefe y sala de reuniones
const PET_TILES = new Set<number>([T.OFFICE, T.BOSS, T.CONF]);

const isKind = (k: unknown) => PET_KINDS.some((p) => p.type === k);
const isColor = (c: unknown) => PET_COLORS.some((p) => p.id === c);

type PetRoom = Pick<RoomState, 'tiles' | 'blocked' | 'players'> & { offices: NonNullable<RoomState['offices']>; pets: Pet[] };

export function tileFree(room: PetRoom, x: number, y: number, self: Pet | null): boolean {
  const t = room.tiles[y]?.[x];
  if (t === undefined || !PET_TILES.has(t) || room.blocked.has(`${x},${y}`)) return false;
  for (const p of room.pets) if (p !== self && p.x === x && p.y === y) return false;
  for (const p of room.players.values()) if (p.x === x && p.y === y) return false;
  return true;
}

/** Devuelve un mensaje de error o null si la mascota se puede dejar en (x, y). */
export function validatePet(room: PetRoom, kind: unknown, color: unknown, x: unknown, y: unknown): string | null {
  if (!isKind(kind) || !isColor(color) || !Number.isInteger(x) || !Number.isInteger(y)) return 'Mascota inválida';
  const px = x as number, py = y as number;
  if (room.pets.length >= MAX_PETS) return 'Se alcanzó el máximo de mascotas del piso';
  if (!officeAt(room.offices, px, py)) return 'Las mascotas solo pueden vivir dentro de una oficina o sala';
  if (!tileFree(room, px, py, null)) return 'Aquí no se puede dejar una mascota';
  return null;
}

/** Mueve la mascota un paso al azar sin salir de su recinto. Devuelve true si cambió algo. */
export function stepPet(room: PetRoom, pet: Pet, rnd: () => number = Math.random): boolean {
  if (rnd() < 0.45) return false; // se queda quieta un rato
  const zone = officeAt(room.offices, pet.x, pet.y);
  if (!zone) return false;
  const options: Array<{ dir: Dir; nx: number; ny: number }> = [];
  for (const [dir, [dx, dy]] of Object.entries(DIRS) as Array<[Dir, readonly [number, number]]>) {
    const nx = pet.x + dx, ny = pet.y + dy;
    if (officeAt(room.offices, nx, ny) === zone && tileFree(room, nx, ny, pet)) options.push({ dir, nx, ny });
  }
  if (!options.length) return false;
  const o = options[Math.floor(rnd() * options.length)];
  pet.x = o.nx; pet.y = o.ny; pet.dir = o.dir;
  return true;
}
