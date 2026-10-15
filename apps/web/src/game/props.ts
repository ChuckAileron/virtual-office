import { interiorImage, interiorImageReady } from './interiorAssets';

const cache = new Map<string, HTMLCanvasElement>();
const SCREENS = [
  { bg: '#82babd', fg: '#e0f4de' },
  { bg: '#98add1', fg: '#e8eef8' },
  { bg: '#d4ae7b', fg: '#fff0d5' },
  { bg: '#718f80', fg: '#dce9d6' },
];

function canvas(w: number, h: number): [HTMLCanvasElement, (col: string, x: number, y: number, w: number, h: number) => void] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  return [c, (col, x, y, rw, rh) => { if (g) { g.fillStyle = col; g.fillRect(x, y, rw, rh); } }];
}

/** Escritorio de 3x1 tiles (96x32) con tres monitores. */
export function desk(variant: number): HTMLCanvasElement {
  const key = `desk${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, r] = canvas(128, 70);
  const reference = interiorImage('desk');
  if (interiorImageReady(reference)) {
    c.getContext('2d')?.drawImage(reference, 0, 0, c.width, c.height);
    cache.set(key, c);
    return c;
  }
  // Silueta, faldón y veta inspirados en los escritorios de los interiores HTML/CSS.
  r('#34343a44', 5, 65, 118, 4);
  r('#443c36', 5, 55, 7, 14); r('#443c36', 116, 55, 7, 14);
  r('#634a35', 0, 34, 128, 30);
  r('#b68a56', 0, 29, 128, 28);
  r('#dfb37b', 3, 30, 122, 3);
  r('#866141', 0, 53, 128, 5);
  r('#634a35', 0, 58, 128, 5);
  r('#c49a68', 4, 35, 120, 2);
  [8, 50, 92].forEach((mx, i) => {
    const s = SCREENS[(variant + i) % SCREENS.length];
    r('#584536', mx + 1, 6, 27, 21);
    r('#343b43', mx, 4, 27, 21);
    r('#263238', mx + 2, 6, 23, 15);
    r(s.bg, mx + 3, 7, 21, 13);
    r('#ffffff44', mx + 4, 7, 3, 11);
    r(s.fg, mx + 6, 10, 11, 2); r('#b9ddd8', mx + 6, 14, 15, 1);
    r('#45433b', mx + 11, 25, 5, 5);
    r('#272b30', mx + 6, 30, 16, 3); r('#737d78', mx + 7, 30, 14, 1);
  });
  r('#45433b', 48, 39, 30, 10); r('#d3d1c0', 50, 40, 26, 8);
  r('#a7a391', 50, 46, 26, 2);
  for (let x = 52; x < 75; x += 4) { r('#77796f', x, 42, 2, 1); r('#77796f', x, 45, 2, 1); }
  r('#45433b', 83, 39, 9, 10); r('#e7e4d5', 85, 40, 5, 7); r('#a7a391', 86, 42, 3, 1);
  r('#ddd8c2', 16, 40, 10, 8); r('#6b3b1a', 18, 42, 6, 4); r('#4c5658', 26, 43, 2, 4);
  r('#e7eadf', 101, 40, 14, 8); r('#9aa39a', 103, 43, 10, 2);
  if (interiorImageReady(reference)) cache.set(key, c);
  return c;
}

/** Escritorio del jefe: monitores de espaldas hacia la puerta y teclado del lado del jefe. */
export function deskBoss(variant: number): HTMLCanvasElement {
  const key = `deskBoss${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, r] = canvas(128, 70);
  r('#34343a44', 5, 65, 118, 4);
  r('#634a35', 5, 57, 7, 13); r('#634a35', 116, 57, 7, 13);
  r('#634a35', 0, 38, 128, 26);
  r('#b68a56', 0, 5, 128, 35);
  r('#dfb37b', 3, 6, 122, 3);
  r('#866141', 0, 36, 128, 4);
  r('#d3d1c0', 48, 9, 30, 10); r('#a7a391', 50, 16, 26, 2);
  for (let x = 52; x < 75; x += 4) { r('#77796f', x, 11, 2, 1); r('#77796f', x, 14, 2, 1); }
  r('#45433b', 83, 9, 9, 8); r('#e7e4d5', 85, 10, 5, 5); r('#a7a391', 86, 12, 3, 1);
  r('#ddd8c2', 16, 9, 10, 8); r('#6b3b1a', 18, 11, 6, 4); r('#4c5658', 26, 12, 2, 4);
  r('#e7eadf', 101, 9, 14, 8); r('#9aa39a', 103, 12, 10, 2);
  [8, 50, 92].forEach((mx) => {
    r('#272b30', mx, 28, 27, 25);
    r('#343b43', mx + 2, 30, 23, 20);
    r('#263238', mx + 5, 32, 17, 15);
    r('#b9ddd8', mx + 8, 35, 10, 2); r('#8da8a5', mx + 8, 40, 12, 2);
    r('#272b30', mx, 51, 27, 2);
  });
  cache.set(key, c);
  return c;
}

export type ChairView = 'front' | 'back';

export function chair(variant: number, view: ChairView = 'back'): HTMLCanvasElement {
  const key = `chair${variant}:${view}`;
  const reference = interiorImage(Math.abs(variant) % 4 === 2 ? 'chair' : 'chairBlue');
  const referenceReady = interiorImageReady(reference);
  const hit = cache.get(key);
  if (hit && referenceReady) return hit;
  const [c, r] = canvas(32, 32);
  if (referenceReady) {
    const g = c.getContext('2d');
    if (g) {
      g.imageSmoothingEnabled = false;
      g.drawImage(reference, 2, -1, 28, 34);
      if (view === 'back') { r('#26323855', 9, 12, 14, 1); r('#d4dbcb66', 10, 5, 2, 5); }
      else { r('#d4dbcb88', 9, 22, 14, 1); r('#3c4a50aa', 10, 24, 12, 1); }
    }
    cache.set(key, c);
    return c;
  }
  const body = ['#526171', '#65798e', '#675b4f', '#60746f'][Math.abs(variant) % 4];
  const bodyShade = ['#3d4854', '#4d6174', '#51483f', '#4c5e59'][Math.abs(variant) % 4];
  const edge = variant % 4 === 2 ? '#3e3b37' : '#30353d';
  r('#34343a44', 7, 29, 18, 2);
  r(edge, 15, 22, 2, 5); r(edge, 9, 26, 14, 2);
  r('#242b34', 7, 28, 6, 3); r('#242b34', 19, 28, 6, 3);
  r('#34343a', 8, 28, 16, 1); r('#657168', 9, 29, 3, 1); r('#657168', 20, 29, 3, 1);

  // El asiento común conserva la vista cenital; respaldo frontal y trasero
  // tienen paneles distintos para que las sillas de ambos lados de la mesa
  // no parezcan copias invertidas.
  r(edge, 5, 13, 22, 12);
  r('#3d4854', 7, 15, 18, 8);
  r(body, 8, 16, 16, 6);
  r('#ffffff22', 9, 17, 14, 1);
  r(edge, 4, 14, 4, 8); r(edge, 24, 14, 4, 8);
  r('#718290', 5, 15, 2, 5); r('#718290', 25, 15, 2, 5);

  if (view === 'back') {
    r(edge, 7, 1, 18, 14); r(body, 9, 3, 14, 10);
    r('#ffffff33', 10, 4, 2, 7); r(bodyShade, 10, 11, 12, 2);
    r('#3d4854', 8, 14, 16, 2);
  } else {
    r(edge, 6, 2, 20, 14); r(body, 8, 4, 16, 9);
    r('#ffffff33', 9, 5, 2, 6); r(bodyShade, 9, 12, 14, 2);
    r('#8794a0', 11, 6, 1, 4); r('#8794a0', 20, 6, 1, 4);
    r('#3d4854', 8, 14, 16, 2);
  }
  if (referenceReady) cache.set(key, c);
  return c;
}
