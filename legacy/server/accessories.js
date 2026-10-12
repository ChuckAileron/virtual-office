'use strict';
// Catálogo de accesorios del personaje. Los ids deben coincidir con public/accessories.js.

const HATS = [
  { id: 'cap', name: 'Gorra' },
  { id: 'beanie', name: 'Gorro de lana' },
  { id: 'tophat', name: 'Sombrero de copa' },
  { id: 'cowboy', name: 'Sombrero vaquero' },
  { id: 'crown', name: 'Corona' },
  { id: 'party', name: 'Gorro de fiesta' },
  { id: 'hardhat', name: 'Casco' },
  { id: 'cathat', name: 'Gorro de gato' },
  { id: 'doghat', name: 'Gorro de perro' },
  { id: 'bunnyhat', name: 'Gorro de conejo' },
];

const GLASSES = [
  { id: 'round', name: 'Lentes redondos' },
  { id: 'square', name: 'Lentes cuadrados' },
  { id: 'sun', name: 'Lentes de sol' },
  { id: 'neon', name: 'Lentes de sol rosa' },
];

const EXTRAS = [
  { id: 'headphones', name: 'Audífonos' },
  { id: 'scarf', name: 'Bufanda' },
  { id: 'bowtie', name: 'Humita' },
  { id: 'tie', name: 'Corbata' },
  { id: 'lanyard', name: 'Credencial' },
  { id: 'backpack', name: 'Mochila' },
  { id: 'cape', name: 'Capa' },
];

const COLORS = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#0ea5e9', '#6366f1', '#ec4899', '#f8fafc', '#1f2937'];

const ids = (list) => new Set(list.map((i) => i.id));
const HAT_IDS = ids(HATS), GLASSES_IDS = ids(GLASSES), EXTRA_IDS = ids(EXTRAS);

/** Normaliza los accesorios; los valores desconocidos se descartan. Siempre devuelve un objeto válido. */
function sanitizeAccessories(a) {
  const src = a && typeof a === 'object' ? a : {};
  const color = (c) => (typeof c === 'string' && COLORS.includes(c.toLowerCase()) ? c.toLowerCase() : COLORS[0]);
  return {
    hat: HAT_IDS.has(src.hat) ? src.hat : null,
    hatColor: color(src.hatColor),
    glasses: GLASSES_IDS.has(src.glasses) ? src.glasses : null,
    extra: EXTRA_IDS.has(src.extra) ? src.extra : null,
    extraColor: color(src.extraColor),
  };
}

const CATALOG = { hats: HATS, glasses: GLASSES, extras: EXTRAS, colors: COLORS };

module.exports = { CATALOG, sanitizeAccessories };
