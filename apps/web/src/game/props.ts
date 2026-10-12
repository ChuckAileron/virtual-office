const cache = new Map<string, HTMLCanvasElement>();
const SCREENS = [
  { bg: '#5ec8ff', fg: '#cdeeff' },
  { bg: '#7be495', fg: '#d5f7de' },
  { bg: '#ffb86b', fg: '#ffe6c7' },
  { bg: '#c9a0ff', fg: '#eadbff' },
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
  const [c, r] = canvas(96, 32);
  r('#6a4224', 1, 28, 4, 4); r('#6a4224', 91, 28, 4, 4);
  r('#5a3519', 0, 14, 96, 16);
  r('#9a6b3d', 0, 12, 96, 14);
  r('#b07f4c', 0, 12, 96, 3);
  r('#6a4224', 0, 26, 96, 2);
  [4, 37, 70].forEach((mx, i) => {
    const s = SCREENS[(variant + i) % SCREENS.length];
    r('#2b2f3a', mx, 1, 22, 15);
    r(s.bg, mx + 2, 3, 18, 10);
    r(s.fg, mx + 4, 5, 10, 1); r(s.fg, mx + 4, 7, 14, 1); r(s.fg, mx + 4, 9, 8, 1);
    r('#2b2f3a', mx + 9, 16, 4, 3);
    r('#3a3f4d', mx + 5, 18, 12, 2);
  });
  r('#d9dde6', 39, 21, 18, 5);
  r('#9aa1b2', 39, 25, 18, 1);
  for (let x = 40; x < 56; x += 3) { r('#8a91a3', x, 22, 2, 1); r('#8a91a3', x, 24, 2, 1); }
  r('#eef0f5', 62, 22, 4, 5); r('#9aa1b2', 63, 23, 2, 1);
  r('#f4f4f4', 8, 21, 6, 5); r('#6b3b1a', 9, 22, 4, 2); r('#f4f4f4', 14, 22, 2, 3);
  r('#fff', 76, 21, 9, 5); r('#c7cddb', 77, 23, 7, 1);
  cache.set(key, c);
  return c;
}

/** Escritorio del jefe: monitores de espaldas hacia la puerta y teclado del lado del jefe. */
export function deskBoss(variant: number): HTMLCanvasElement {
  const key = `deskBoss${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, r] = canvas(96, 32);
  r('#6a4224', 1, 28, 4, 4); r('#6a4224', 91, 28, 4, 4);
  r('#5a3519', 0, 18, 96, 12);
  r('#9a6b3d', 0, 2, 96, 18);
  r('#b07f4c', 0, 2, 96, 3);
  r('#6a4224', 0, 26, 96, 2);
  r('#d9dde6', 39, 5, 18, 5); r('#9aa1b2', 39, 9, 18, 1);
  for (let x = 40; x < 56; x += 3) { r('#8a91a3', x, 6, 2, 1); r('#8a91a3', x, 8, 2, 1); }
  r('#eef0f5', 62, 6, 4, 5); r('#9aa1b2', 63, 7, 2, 1);
  r('#f4f4f4', 8, 5, 6, 5); r('#6b3b1a', 9, 6, 4, 2); r('#f4f4f4', 14, 6, 2, 3);
  r('#fff', 76, 5, 9, 5); r('#c7cddb', 77, 7, 7, 1);
  [4, 37, 70].forEach((mx) => {
    r('#1f232d', mx, 10, 22, 16);
    r('#2b2f3a', mx + 1, 11, 20, 13);
    r('#3a3f4d', mx + 3, 13, 16, 8);
    r('#8a91a3', mx + 9, 16, 4, 3);
    r('#161922', mx, 25, 22, 1);
  });
  cache.set(key, c);
  return c;
}

export function chair(variant: number): HTMLCanvasElement {
  const key = `chair${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, r] = canvas(32, 32);
  const body = ['#3a4a8a', '#8a3a4a', '#2f7a5a', '#555b6e'][Math.abs(variant) % 4];
  r('#222', 15, 22, 2, 5);
  r('#222', 9, 27, 14, 2);
  r('#111', 9, 29, 3, 2); r('#111', 20, 29, 3, 2);
  r(body, 8, 12, 16, 10);
  r('#ffffff22', 9, 13, 14, 2);
  r(body, 10, 3, 12, 10);
  r('#00000033', 10, 11, 12, 2);
  cache.set(key, c);
  return c;
}
