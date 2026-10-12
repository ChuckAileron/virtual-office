const cache = new Map<string, HTMLCanvasElement>();
const S = 32;

type R = (col: string, x: number, y: number, w: number, h: number) => void;
type Painter = (r: R, g: CanvasRenderingContext2D) => void;

const circles = (g: CanvasRenderingContext2D, list: number[][]) => {
  list.forEach(([x, y, rad]) => { g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill(); });
};

const painters: Record<string, Painter> = {
  plant(r, g) {
    r('#00000022', 8, 28, 16, 3);
    r('#7a4527', 9, 20, 14, 10); r('#9a5a33', 9, 20, 14, 3); r('#5e3419', 10, 28, 12, 2);
    g.fillStyle = '#2a8a45';
    circles(g, [[16, 8, 8], [9, 13, 6], [23, 13, 6], [16, 14, 7]]);
    g.fillStyle = '#3fbf67';
    circles(g, [[14, 6, 4], [8, 11, 3], [22, 11, 3]]);
  },
  bookshelf(r) {
    r('#00000022', 2, 29, 60, 3);
    r('#5a3519', 1, 2, 62, 28); r('#7a4a28', 3, 4, 58, 24);
    [4, 15].forEach((y) => {
      r('#3b2210', 3, y + 9, 58, 2);
      const cols = ['#d9534f', '#4a7bd0', '#e8b83a', '#3fa86a', '#9b59b6', '#e67e22', '#2c3e50'];
      let x = 5, i = y;
      while (x < 57) { const w = 3 + (i % 3); r(cols[i % cols.length], x, y + (i % 2), w, 9 - (i % 2)); x += w + 1; i += 3; }
    });
    r('#ffffff22', 3, 4, 58, 1);
  },
  filing(r) {
    r('#00000022', 4, 29, 24, 3);
    r('#6c7689', 5, 3, 22, 27); r('#8b95a8', 6, 4, 20, 25);
    [5, 14, 23].forEach((y) => { r('#a4aec0', 7, y, 18, 8); r('#5b6478', 7, y + 8, 18, 1); r('#2f3645', 13, y + 3, 6, 2); r('#e8ecf3', 11, y + 1, 10, 1); });
  },
  sofa(r) {
    r('#00000022', 2, 29, 60, 3);
    r('#7a2f3a', 2, 6, 60, 14); r('#933a47', 4, 8, 56, 10);
    r('#6a2630', 0, 12, 8, 17); r('#6a2630', 56, 12, 8, 17);
    r('#a5434f', 8, 16, 24, 11); r('#a5434f', 32, 16, 24, 11);
    r('#8a3541', 8, 25, 48, 2); r('#7a2f3a', 31, 16, 2, 11);
    r('#ffffff22', 9, 17, 22, 1); r('#ffffff22', 33, 17, 22, 1);
    r('#4a1a22', 4, 29, 3, 2); r('#4a1a22', 57, 29, 3, 2);
  },
  armchair(r) {
    r('#00000022', 3, 29, 26, 3);
    r('#2f6f8f', 5, 5, 22, 16); r('#3a85ab', 7, 7, 18, 12);
    r('#255a75', 2, 12, 6, 17); r('#255a75', 24, 12, 6, 17);
    r('#4a9bc4', 8, 17, 16, 10); r('#ffffff22', 9, 18, 14, 1);
    r('#1c4559', 4, 29, 3, 2); r('#1c4559', 25, 29, 3, 2);
  },
  coffee(r) {
    r('#00000022', 3, 29, 26, 3);
    r('#8a6a45', 3, 18, 26, 12); r('#a58259', 3, 18, 26, 3); r('#6a4f30', 3, 28, 26, 2);
    r('#3a3f4d', 8, 3, 16, 16); r('#4d5466', 9, 4, 14, 8);
    r('#ff6b4a', 11, 6, 3, 2); r('#7be495', 16, 6, 3, 2);
    r('#2a2e39', 11, 11, 10, 7); r('#f4f4f4', 13, 14, 6, 5); r('#6b3b1a', 14, 15, 4, 2);
  },
  cooler(r) {
    r('#00000022', 6, 29, 20, 3);
    r('#c9d3e2', 8, 14, 16, 16); r('#e3e9f3', 9, 15, 14, 14);
    r('#5aa9e6', 10, 2, 12, 13); r('#8cc8f5', 11, 3, 10, 6); r('#ffffff55', 12, 4, 2, 9);
    r('#2f80c0', 12, 0, 8, 3);
    r('#3b82f6', 11, 19, 3, 3); r('#ef4444', 18, 19, 3, 3); r('#8e99ab', 12, 26, 8, 3);
  },
  printer(r) {
    r('#00000022', 3, 29, 26, 3);
    r('#fff', 9, 4, 14, 9); r('#c7cddb', 11, 6, 10, 1); r('#c7cddb', 11, 8, 8, 1);
    r('#7d869a', 3, 12, 26, 15); r('#9aa3b6', 4, 13, 24, 6); r('#5b6478', 3, 25, 26, 2);
    r('#2f3645', 8, 19, 16, 3); r('#fff', 10, 22, 12, 6); r('#c7cddb', 12, 24, 8, 1);
    r('#7be495', 24, 14, 2, 2);
  },
  whiteboard(r) {
    r('#00000022', 2, 29, 60, 3);
    r('#8a93a6', 3, 28, 4, 3); r('#8a93a6', 57, 28, 4, 3);
    r('#5b6478', 2, 2, 60, 26); r('#f7f9fc', 4, 4, 56, 22);
    r('#4a7bd0', 8, 8, 22, 2); r('#4a7bd0', 8, 12, 30, 2); r('#d9534f', 8, 16, 16, 2);
    r('#3fa86a', 36, 17, 18, 5); r('#f7f9fc', 38, 19, 14, 1);
    r('#9aa3b6', 6, 26, 52, 2); r('#d9534f', 10, 25, 5, 2); r('#4a7bd0', 17, 25, 5, 2);
  },
  fridge(r) {
    r('#00000022', 4, 29, 24, 3);
    r('#aeb7c6', 5, 1, 22, 29); r('#dfe5ef', 6, 2, 20, 27);
    r('#9aa3b6', 6, 12, 20, 2);
    r('#7d869a', 22, 5, 2, 5); r('#7d869a', 22, 16, 2, 8);
    r('#ffffff55', 8, 3, 3, 8);
  },
  vending(r) {
    r('#00000022', 4, 29, 24, 3);
    r('#b3302f', 4, 1, 24, 29); r('#d94a48', 5, 2, 22, 27);
    r('#1d2433', 7, 4, 14, 16);
    ['#ffd166', '#7be495', '#5ec8ff'].forEach((c, row) => [8, 12, 16].forEach((x, i) => r(i % 2 ? '#ef476f' : c, x, 6 + row * 5, 3, 4)));
    r('#ffffff22', 8, 5, 2, 14);
    r('#2a2e39', 23, 5, 3, 9); r('#ffd166', 23, 16, 3, 3);
    r('#1d2433', 8, 22, 14, 5); r('#7d0f0f', 22, 22, 4, 5);
  },
  bin(r) {
    r('#00000022', 8, 28, 16, 3);
    r('#58627a', 9, 12, 14, 17); r('#7d869a', 10, 13, 12, 15);
    r('#3a4257', 8, 10, 16, 3);
    [12, 16, 20].forEach((x) => r('#58627a', x, 15, 1, 11));
    r('#fff', 12, 8, 6, 4); r('#e3e8f1', 17, 9, 4, 3);
  },
  lamp(r, g) {
    r('#00000022', 8, 29, 16, 3);
    r('#3a4257', 9, 28, 14, 3); r('#59627a', 15, 8, 2, 20);
    g.fillStyle = '#ffe08a'; g.beginPath(); g.moveTo(8, 10); g.lineTo(24, 10); g.lineTo(20, 1); g.lineTo(12, 1); g.closePath(); g.fill();
    r('#ffc94a', 8, 9, 16, 2); r('#fff3c4', 13, 3, 6, 4);
  },
  giant_tv(r, g) {
    r('#00000033', 13, 59, 70, 4);
    r('#202431', 3, 2, 90, 51); r('#555d70', 5, 3, 86, 48);
    r('#0e111a', 7, 5, 82, 43); r('#101d32', 9, 7, 78, 39);
    g.fillStyle = '#153450'; g.fillRect(9, 7, 78, 39);
    g.fillStyle = '#17677a'; g.beginPath(); g.moveTo(9, 34); g.lineTo(35, 15); g.lineTo(52, 27); g.lineTo(72, 10); g.lineTo(87, 21); g.lineTo(87, 46); g.lineTo(9, 46); g.closePath(); g.fill();
    g.fillStyle = '#53b6a5'; g.beginPath(); g.arc(68, 17, 5, 0, Math.PI * 2); g.fill();
    r('#94e0c9', 10, 8, 21, 1); r('#ffffff44', 10, 10, 2, 20);
    r('#323847', 43, 53, 10, 6); r('#737d91', 30, 58, 36, 3);
    r('#3ddc84', 86, 49, 2, 2);
  },
  rug(r) {
    r('#6d2f4a', 1, 1, 62, 62); r('#a8456f', 3, 3, 58, 58); r('#f2d6a0', 6, 6, 52, 52);
    r('#c9556f', 8, 8, 48, 48); r('#6d2f4a', 12, 12, 40, 40); r('#e8a85a', 14, 14, 36, 36);
    r('#c9556f', 22, 22, 20, 20); r('#f2d6a0', 28, 28, 8, 8);
    for (let i = 4; i < 60; i += 6) { r('#f2d6a0', i, 1, 3, 2); r('#f2d6a0', i, 61, 3, 2); r('#f2d6a0', 1, i, 2, 3); r('#f2d6a0', 61, i, 2, 3); }
  },
};

/** Sprites laterales dibujados específicamente para los objetos que admiten esa perspectiva. */
const sidePainters: Record<string, Painter> = {
  bookshelf(r) {
    r('#00000022', 8, 29, 48, 3);
    r('#422713', 12, 2, 42, 28); r('#79502c', 14, 4, 38, 24);
    r('#3b2210', 14, 12, 38, 2); r('#3b2210', 14, 21, 38, 2);
    const colors = ['#d9534f', '#4a7bd0', '#e8b83a', '#3fa86a', '#9b59b6'];
    [5, 14, 23].forEach((y, row) => {
      let x = 17;
      while (x < 49) { const w = 3 + ((x + row) % 3); r(colors[(x + row) % colors.length], x, y, w, 8); x += w + 2; }
    });
    r('#2b1a10', 54, 3, 4, 27); r('#a77949', 15, 4, 1, 24);
  },
  filing(r) {
    r('#00000022', 6, 29, 20, 3);
    r('#586174', 9, 2, 17, 28); r('#9aa3b6', 11, 3, 14, 26);
    [5, 14, 23].forEach((y) => { r('#bac2d0', 12, y, 11, 7); r('#697286', 12, y + 6, 11, 1); r('#3b4252', 19, y + 2, 2, 2); });
    r('#d9e0eb', 11, 3, 2, 24); r('#444c5e', 25, 4, 2, 25);
  },
  sofa(r) {
    r('#00000022', 3, 29, 58, 3);
    r('#68232e', 9, 4, 47, 22); r('#913744', 11, 6, 42, 17);
    r('#5c202a', 4, 10, 10, 18); r('#7a2f3a', 6, 12, 7, 13);
    r('#a5434f', 15, 18, 36, 9); r('#81303c', 15, 15, 35, 4);
    r('#b8525d', 16, 19, 16, 7); r('#a5434f', 33, 19, 16, 7);
    r('#4a1a22', 10, 28, 4, 3); r('#4a1a22', 51, 27, 4, 4);
    r('#ffffff22', 15, 7, 34, 1);
  },
  armchair(r) {
    r('#00000022', 4, 29, 24, 3);
    r('#255a75', 7, 4, 18, 22); r('#3a85ab', 9, 6, 14, 17);
    r('#1e4b62', 4, 10, 8, 18); r('#2c6d8a', 6, 12, 5, 14);
    r('#4a9bc4', 12, 18, 11, 9); r('#347895', 12, 15, 11, 4);
    r('#1c4559', 8, 28, 4, 3); r('#1c4559', 22, 27, 4, 4);
    r('#ffffff33', 10, 7, 1, 9);
  },
  giant_tv(r, g) {
    // Vista de canto: panel plano estrecho y un haz de proyección con una imagen simulada.
    const beam = g.createLinearGradient(52, 0, 92, 0);
    beam.addColorStop(0, '#72d9ff66');
    beam.addColorStop(1, '#72d9ff00');
    g.fillStyle = beam;
    g.beginPath(); g.moveTo(51, 11); g.lineTo(92, 2); g.lineTo(92, 54); g.lineTo(51, 46); g.closePath(); g.fill();
    g.fillStyle = '#53b6a544';
    g.beginPath(); g.moveTo(56, 37); g.lineTo(70, 21); g.lineTo(78, 29); g.lineTo(87, 17); g.lineTo(92, 22); g.lineTo(92, 46); g.lineTo(56, 42); g.closePath(); g.fill();
    g.fillStyle = '#d5fbff88'; g.beginPath(); g.arc(82, 14, 3, 0, Math.PI * 2); g.fill();
    r('#b5f2ff66', 58, 16, 19, 1); r('#d5fbff55', 60, 19, 13, 1);
    r('#00000033', 35, 59, 28, 4);
    r('#202431', 44, 5, 8, 48);
    r('#555d70', 45, 6, 2, 46);
    r('#0e111a', 47, 7, 4, 43);
    r('#323847', 46, 53, 5, 6);
    r('#737d91', 35, 58, 28, 3);
    r('#3ddc84', 47, 49, 1, 2);
  },
};

/** Sprite de catálogo en perspectiva frontal/lateral y con volteo horizontal opcional. */
export function objectSprite(
  def: { type: string; w: number; h: number },
  perspective: 'front' | 'side' = 'front',
  flipped = false,
): HTMLCanvasElement {
  const key = `${def.type}:${perspective}:${flipped ? 'flip' : 'normal'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = def.w * S;
  c.height = def.h * S;
  const g = c.getContext('2d');
  if (g) {
    const r: R = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const painter = perspective === 'side' ? sidePainters[def.type] ?? painters[def.type] : painters[def.type];
    if (painter) {
      if (flipped) { g.translate(c.width, 0); g.scale(-1, 1); }
      painter(r, g);
    }
  }
  cache.set(key, c);
  return c;
}
