import { interiorImage, interiorImageReady, type InteriorAssetName } from './interiorAssets';

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
    r('#34343a44', 2, 29, 60, 3);
    r('#3e3b37', 1, 2, 62, 28); r('#755c46', 3, 4, 58, 24);
    r('#a77949', 4, 5, 56, 1); r('#433b34', 3, 13, 58, 2); r('#433b34', 3, 22, 58, 2);
    const cols = ['#b39a69', '#455974', '#76677e', '#baa388', '#718f80', '#9a6558', '#637184'];
    [5, 14, 23].forEach((y, row) => {
      let x = 6, i = row * 4;
      while (x < 57) {
        const w = 3 + ((x + row) % 3), h = 7 + ((x + row) % 2);
        r(cols[i % cols.length], x, y + 7 - h, w, h);
        r('#ffffff22', x, y + 7 - h, 1, h - 1);
        x += w + 1; i += 2;
      }
    });
    r('#bb986a', 3, 3, 58, 2); r('#433b34', 1, 29, 62, 2);
  },
  bookshelf_tall(r) {
    r('#34343a44', 2, 61, 60, 3);
    r('#3e3b37', 1, 1, 62, 62); r('#755c46', 3, 3, 58, 58);
    r('#bb986a', 4, 4, 56, 3);
    const cols = ['#b39a69', '#455974', '#76677e', '#baa388', '#718f80', '#9a6558'];
    [5, 23, 41].forEach((y, row) => {
      r('#433b34', 3, y + 13, 58, 2);
      let x = 6, i = row * 3;
      while (x < 57) {
        const w = 3 + ((x + row) % 3), h = 8 + ((x + row) % 6);
        r(cols[i % cols.length], x, y + 12 - h, w, h); r('#ffffff22', x, y + 12 - h, 1, h - 1);
        x += w + 1; i += 2;
      }
    });
    r('#433b34', 1, 61, 62, 2);
  },
  filing(r) {
    r('#34343a44', 4, 29, 24, 3);
    r('#454039', 5, 2, 22, 28); r('#ad8c65', 7, 4, 18, 24);
    r('#c2a078', 8, 5, 16, 1);
    [6, 14, 22].forEach((y) => {
      r('#9b7956', 8, y, 16, 7); r('#d3c09c', 9, y, 14, 1);
      r('#5a4a3c', 8, y + 6, 16, 1); r('#d3c09c', 14, y + 3, 4, 1);
    });
    r('#5a4a3c', 6, 28, 20, 2);
  },
  sofa(r) {
    r('#34343a44', 2, 29, 60, 3);
    r('#3f4440', 2, 6, 60, 23); r('#a3a494', 4, 8, 56, 17);
    r('#49534c', 0, 12, 9, 17); r('#8e9789', 2, 13, 6, 13);
    r('#49534c', 55, 12, 9, 17); r('#8e9789', 57, 13, 6, 13);
    r('#bbbca9', 8, 16, 24, 10); r('#bbbca9', 33, 16, 23, 10);
    r('#757d71', 30, 16, 3, 10); r('#697168', 8, 25, 48, 2);
    r('#d3d1bf', 10, 17, 19, 1); r('#d3d1bf', 35, 17, 18, 1);
    r('#565f5a', 8, 27, 48, 2);
    r('#34343a', 5, 29, 4, 2); r('#34343a', 55, 29, 4, 2);
  },
  sofa_wide(r) {
    r('#34343a44', 4, 61, 120, 3);
    r('#3f4440', 3, 5, 122, 56); r('#a3a494', 6, 8, 116, 45);
    r('#49534c', 2, 12, 13, 44); r('#8e9789', 5, 15, 8, 36);
    r('#49534c', 113, 12, 13, 44); r('#8e9789', 116, 15, 8, 36);
    r('#bbbca9', 16, 28, 47, 27); r('#bbbca9', 65, 28, 46, 27);
    r('#757d71', 62, 28, 3, 27); r('#697168', 16, 53, 95, 4);
    r('#d3d1bf', 19, 30, 40, 2); r('#d3d1bf', 68, 30, 39, 2);
    r('#565f5a', 17, 58, 94, 3); r('#34343a', 10, 61, 8, 3); r('#34343a', 109, 61, 8, 3);
  },
  sofa_blue(r) {
    r('#34343a44', 4, 61, 120, 3);
    r('#364750', 3, 5, 122, 56); r('#657d8b', 6, 8, 116, 45);
    r('#3a5660', 2, 12, 13, 44); r('#718b95', 5, 15, 8, 36);
    r('#3a5660', 113, 12, 13, 44); r('#718b95', 116, 15, 8, 36);
    r('#8da4ab', 16, 28, 47, 27); r('#8da4ab', 65, 28, 46, 27);
    r('#516e7c', 62, 28, 3, 27); r('#d1ddd2', 19, 30, 40, 2); r('#d1ddd2', 68, 30, 39, 2);
    r('#516e7c', 17, 56, 94, 5); r('#263b43', 10, 61, 8, 3); r('#263b43', 109, 61, 8, 3);
  },
  sofa_vertical(r) {
    r('#34343a44', 3, 123, 58, 4); r('#3f4440', 3, 4, 58, 120); r('#a3a494', 6, 7, 52, 113);
    r('#49534c', 3, 2, 58, 13); r('#8e9789', 6, 5, 52, 8);
    r('#49534c', 3, 113, 58, 13); r('#8e9789', 6, 116, 52, 8);
    for (let y = 18; y < 106; y += 28) { r('#697168', 8, y, 48, 3); r('#bbbca9', 9, y + 3, 46, 22); r('#d3d1bf', 12, y + 5, 38, 2); }
    r('#565f5a', 8, 120, 48, 3); r('#34343a', 8, 123, 7, 3); r('#34343a', 49, 123, 7, 3);
  },
  sofa_vertical_blue(r) {
    r('#34343a44', 3, 123, 58, 4); r('#364750', 3, 4, 58, 120); r('#657d8b', 6, 7, 52, 113);
    r('#3a5660', 3, 2, 58, 13); r('#718b95', 6, 5, 52, 8);
    r('#3a5660', 3, 113, 58, 13); r('#718b95', 6, 116, 52, 8);
    for (let y = 18; y < 106; y += 28) { r('#516e7c', 8, y, 48, 3); r('#8da4ab', 9, y + 3, 46, 22); r('#d1ddd2', 12, y + 5, 38, 2); }
    r('#516e7c', 8, 120, 48, 3); r('#263b43', 8, 123, 7, 3); r('#263b43', 49, 123, 7, 3);
  },
  armchair(r) {
    r('#34343a44', 3, 29, 26, 3);
    r('#364750', 5, 5, 22, 17); r('#657d8b', 7, 7, 18, 12);
    r('#3a5660', 2, 12, 7, 17); r('#718b95', 4, 14, 4, 11);
    r('#3a5660', 23, 12, 7, 17); r('#718b95', 24, 14, 4, 11);
    r('#8da4ab', 8, 17, 16, 10); r('#ffffff33', 9, 18, 14, 1);
    r('#516e7c', 8, 26, 16, 2);
    r('#263b43', 4, 29, 4, 2); r('#263b43', 24, 29, 4, 2);
  },
  coffee(r) {
    r('#34343a44', 3, 29, 26, 3);
    r('#333c40', 3, 10, 26, 20); r('#586164', 5, 12, 22, 16); r('#c2c9ba', 4, 10, 24, 4);
    r('#232d32', 8, 4, 16, 12); r('#7c9598', 7, 3, 18, 11); r('#232d32', 9, 5, 14, 8);
    r('#d7e4d8', 11, 6, 8, 2); r('#b9ddd8', 10, 10, 2, 2);
    r('#4c5658', 12, 18, 11, 3); r('#ddd8c2', 14, 20, 8, 5); r('#6b3b1a', 15, 21, 6, 2);
    r('#4c5658', 9, 25, 15, 2);
  },
  cooler(r) {
    r('#00000022', 6, 29, 20, 3);
    r('#3f4c4e', 7, 13, 18, 17); r('#bac4bc', 9, 15, 14, 14);
    r('#657872', 8, 12, 16, 3); r('#8cc8c7', 9, 3, 14, 10); r('#c8e1d7', 10, 4, 12, 6);
    r('#ffffff55', 11, 4, 2, 7); r('#4b605f', 20, 17, 2, 5);
    r('#7f8e83', 11, 20, 10, 2); r('#4b605f', 12, 25, 8, 2);
  },
  printer(r) {
    r('#34343a44', 3, 29, 26, 3);
    r('#dce1d7', 9, 3, 14, 10); r('#f0eee2', 10, 4, 12, 7);
    r('#8e9c96', 12, 6, 9, 1); r('#8e9c96', 12, 8, 7, 1);
    r('#424644', 3, 12, 26, 16); r('#b1b8b4', 5, 13, 22, 7);
    r('#dce1d7', 6, 14, 19, 2); r('#657168', 3, 20, 26, 2);
    r('#2f3c3e', 7, 22, 18, 4); r('#dce1d7', 9, 25, 14, 4);
    r('#aeb8a9', 11, 26, 10, 1); r('#9aaba3', 25, 14, 2, 2);
  },
  whiteboard(r) {
    r('#00000022', 2, 29, 60, 3);
    r('#8a93a6', 3, 28, 4, 3); r('#8a93a6', 57, 28, 4, 3);
    r('#43504e', 2, 2, 60, 26); r('#e7eadf', 4, 4, 56, 22);
    r('#6e98a0', 8, 8, 22, 2); r('#aebda4', 8, 12, 30, 2); r('#aebda4', 8, 16, 16, 2);
    r('#718f80', 37, 9, 16, 8); r('#e7eadf', 39, 11, 12, 1); r('#e7eadf', 39, 14, 9, 1);
    r('#6c7e7c', 6, 26, 52, 2); r('#a25d55', 10, 25, 5, 2); r('#6e98a0', 17, 25, 5, 2);
  },
  fridge(r) {
    r('#00000022', 4, 61, 24, 3);
    r('#3f4c4e', 5, 1, 22, 60); r('#bac4bc', 7, 3, 18, 56);
    r('#657872', 7, 28, 18, 2); r('#4b605f', 21, 7, 2, 16); r('#4b605f', 21, 36, 2, 18);
    r('#e4e9dc', 9, 5, 3, 18); r('#dce1d7', 9, 34, 10, 1);
  },
  vending(r) {
    r('#34343a44', 4, 29, 24, 3);
    r('#343b43', 4, 1, 24, 29); r('#9a6558', 6, 2, 20, 26); r('#b77b6c', 6, 2, 2, 25);
    r('#263238', 8, 4, 13, 16);
    ['#d4ae7b', '#718f80', '#98add1'].forEach((c, row) => [9, 13, 17].forEach((x, i) => {
      r('#45515a', x, 6 + row * 4, 3, 4); r(i % 2 ? '#9a6558' : c, x + 1, 6 + row * 4, 2, 3);
    }));
    r('#ffffff22', 9, 5, 1, 13);
    r('#45515a', 23, 5, 3, 9); r('#d3c09c', 23, 16, 3, 3);
    r('#263238', 8, 22, 13, 5); r('#657872', 10, 23, 9, 3); r('#454039', 22, 22, 5, 5);
  },
  bin(r) {
    r('#00000022', 8, 28, 16, 3);
    r('#3d504e', 8, 11, 16, 18); r('#667775', 10, 14, 12, 14);
    r('#9aaba3', 8, 10, 16, 4);
    [12, 16, 20].forEach((x) => r('#4f625f', x, 16, 1, 10));
    r('#ddd8c2', 12, 7, 7, 4); r('#b7b49f', 18, 8, 4, 3);
  },
  bench(r) {
    r('#34343a44', 5, 29, 118, 3); r('#4d4234', 3, 5, 122, 23); r('#aa8e65', 6, 8, 116, 16);
    r('#d0b081', 8, 9, 112, 2); r('#66533c', 3, 25, 122, 6);
    r('#4d4234', 14, 29, 8, 3); r('#4d4234', 106, 29, 8, 3);
    [31, 63, 95].forEach((x) => { r('#755b3d', x, 9, 2, 15); r('#c6a77a', x + 2, 9, 1, 15); });
  },
  lamp(r, g) {
    r('#34343a44', 8, 29, 16, 3);
    r('#34444b', 8, 28, 16, 3); r('#4f6973', 15, 9, 2, 19);
    r('#34444b', 14, 26, 4, 3); r('#34444b', 9, 29, 14, 2);
    g.fillStyle = '#4f6973'; g.beginPath(); g.moveTo(7, 11); g.lineTo(25, 11); g.lineTo(21, 2); g.lineTo(11, 2); g.closePath(); g.fill();
    r('#34444b', 7, 10, 18, 2); r('#f0ce7d', 10, 5, 12, 5); r('#fff1c2', 12, 4, 8, 2);
    r('#e7b95d', 11, 11, 10, 1);
  },
  giant_tv(r, g) {
    r('#34343a44', 13, 59, 70, 4);
    r('#202b30', 3, 2, 90, 51); r('#555d60', 5, 3, 86, 48);
    r('#343b43', 6, 4, 84, 46); r('#263238', 9, 7, 78, 39);
    g.fillStyle = '#315763'; g.fillRect(9, 7, 78, 39);
    g.fillStyle = '#718f80'; g.beginPath(); g.moveTo(9, 34); g.lineTo(31, 18); g.lineTo(48, 28); g.lineTo(68, 12); g.lineTo(87, 24); g.lineTo(87, 46); g.lineTo(9, 46); g.closePath(); g.fill();
    g.fillStyle = '#98add1'; g.beginPath(); g.arc(68, 17, 5, 0, Math.PI * 2); g.fill();
    r('#dce9d6', 12, 9, 22, 1); r('#ffffff44', 11, 11, 2, 20); r('#b9ddd8', 62, 33, 17, 1);
    r('#323b40', 43, 53, 10, 6); r('#737d78', 30, 58, 36, 3);
    r('#d4ae7b', 86, 49, 2, 2);
  },
  rug(r) {
    // Alfombra de tres tiles de ancho por dos de alto, con marco y tejido interior.
    r('#34343a44', 3, 61, 90, 3);
    r('#4c6168', 1, 1, 94, 62); r('#74878a', 3, 3, 90, 58);
    r('#a2b0a1', 7, 7, 82, 50); r('#74878a', 10, 10, 76, 44);
    r('#607779', 14, 14, 68, 36); r('#82948e', 17, 17, 62, 30);
    r('#74878a', 28, 22, 40, 20); r('#b7b49f', 43, 29, 10, 6);
    for (let x = 6; x < 92; x += 8) {
      r('#a2b0a1', x, 3, 4, 2); r('#a2b0a1', x, 59, 4, 2);
    }
    for (let y = 6; y < 60; y += 8) {
      r('#a2b0a1', 3, y, 2, 4); r('#a2b0a1', 91, y, 2, 4);
    }
    for (let x = 18; x < 78; x += 12) { r('#9eada62b', x, 17, 2, 30); }
  },
};

/** Sprites laterales dibujados específicamente para los objetos que admiten esa perspectiva. */
const sidePainters: Record<string, Painter> = {
  bookshelf(r) {
    r('#34343a44', 8, 29, 48, 3);
    r('#3e3b37', 12, 2, 42, 28); r('#755c46', 14, 4, 38, 24);
    r('#433b34', 14, 12, 38, 2); r('#433b34', 14, 21, 38, 2);
    const colors = ['#b39a69', '#455974', '#76677e', '#baa388', '#718f80'];
    [5, 14, 23].forEach((y, row) => {
      let x = 17;
      while (x < 49) {
        const w = 3 + ((x + row) % 3), h = 6 + ((x + row) % 3);
        r(colors[(x + row) % colors.length], x, y + 8 - h, w, h); r('#ffffff22', x, y + 8 - h, 1, h - 1);
        x += w + 2;
      }
    });
    r('#433b34', 54, 3, 4, 27); r('#bb986a', 15, 4, 1, 24); r('#433b34', 12, 29, 46, 2);
  },
  filing(r) {
    r('#34343a44', 6, 29, 20, 3);
    r('#454039', 9, 2, 17, 28); r('#ad8c65', 11, 4, 13, 23);
    [5, 13, 21].forEach((y) => { r('#c2a078', 12, y, 11, 6); r('#5a4a3c', 12, y + 5, 11, 1); r('#d3c09c', 16, y + 2, 4, 1); });
    r('#d3c09c', 12, 4, 2, 22); r('#5a4a3c', 24, 4, 2, 25); r('#454039', 9, 28, 17, 2);
  },
  sofa(r) {
    r('#34343a44', 3, 29, 58, 3);
    r('#364750', 9, 4, 47, 22); r('#657d8b', 11, 6, 42, 17);
    r('#3a5660', 4, 10, 10, 18); r('#718b95', 6, 12, 7, 13);
    r('#8da4ab', 15, 18, 36, 9); r('#516e7c', 15, 15, 35, 4);
    r('#a9b9b5', 16, 19, 16, 7); r('#8da4ab', 33, 19, 16, 7);
    r('#263b43', 10, 28, 4, 3); r('#263b43', 51, 27, 4, 4);
    r('#ffffff33', 15, 7, 34, 1); r('#3a5660', 31, 19, 2, 7);
  },
  armchair(r) {
    r('#34343a44', 4, 29, 24, 3);
    r('#364750', 7, 4, 18, 22); r('#657d8b', 9, 6, 14, 17);
    r('#3a5660', 4, 10, 8, 18); r('#718b95', 6, 12, 5, 14);
    r('#8da4ab', 12, 18, 11, 9); r('#516e7c', 12, 15, 11, 4);
    r('#263b43', 8, 28, 4, 3); r('#263b43', 22, 27, 4, 4);
    r('#ffffff33', 10, 7, 1, 9); r('#3a5660', 12, 24, 11, 2);
  },
  giant_tv(r, g) {
    // Vista de canto: panel plano estrecho y un haz de proyección con una imagen simulada.
    const beam = g.createLinearGradient(52, 0, 92, 0);
    beam.addColorStop(0, '#b9ddd855');
    beam.addColorStop(1, '#b9ddd800');
    g.fillStyle = beam;
    g.beginPath(); g.moveTo(51, 11); g.lineTo(92, 2); g.lineTo(92, 54); g.lineTo(51, 46); g.closePath(); g.fill();
    g.fillStyle = '#718f8055';
    g.beginPath(); g.moveTo(56, 37); g.lineTo(70, 21); g.lineTo(78, 29); g.lineTo(87, 17); g.lineTo(92, 22); g.lineTo(92, 46); g.lineTo(56, 42); g.closePath(); g.fill();
    g.fillStyle = '#d4ae7b'; g.beginPath(); g.arc(82, 14, 3, 0, Math.PI * 2); g.fill();
    r('#b9ddd866', 58, 16, 19, 1); r('#e0f4de55', 60, 19, 13, 1);
    r('#34343a44', 35, 59, 28, 4);
    r('#202b30', 44, 5, 8, 48);
    r('#555d60', 45, 6, 2, 46);
    r('#263238', 47, 7, 4, 43);
    r('#323b40', 46, 53, 5, 6);
    r('#737d78', 35, 58, 28, 3);
    r('#d4ae7b', 47, 49, 1, 2);
  },
};

/** Sprite de catálogo en perspectiva frontal/lateral y con volteo horizontal opcional. */
export function objectSprite(
  def: { type: string; w: number; h: number },
  perspective: 'front' | 'side' = 'front',
  flipped = false,
): HTMLCanvasElement {
  const key = `${def.type}:${perspective}:${flipped ? 'flip' : 'normal'}`;
  const referenceNames: Partial<Record<string, InteriorAssetName>> = {
    bookshelf_tall: 'bookshelf', armchair: 'chairBlue', sofa: perspective === 'side' ? 'sofaVertical' : 'sofaBeige',
    sofa_wide: 'sofaBeige', sofa_blue: 'sofaBlue', sofa_vertical: 'sofaVertical', sofa_vertical_blue: 'sofaBlue',
  };
  const referenceName = referenceNames[def.type];
  const reference = referenceName ? interiorImage(referenceName) : null;
  const referenceReady = reference !== null && interiorImageReady(reference);
  const hit = cache.get(key);
  if (hit && (!reference || referenceReady)) return hit;
  const c = document.createElement('canvas');
  c.width = def.w * S;
  c.height = def.h * S;
  const g = c.getContext('2d');
  if (g) {
    const r: R = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    if (flipped) { g.translate(c.width, 0); g.scale(-1, 1); }
    if (reference && referenceReady) {
      g.imageSmoothingEnabled = false;
      if (def.type === 'sofa_vertical_blue' || (def.type === 'sofa' && perspective === 'side')) {
        g.save(); g.translate(c.width, 0); g.rotate(Math.PI / 2);
        g.drawImage(reference, 0, 0, c.height, c.width); g.restore();
      } else {
        const scale = Math.min(c.width / reference.naturalWidth, c.height / reference.naturalHeight);
        const width = Math.round(reference.naturalWidth * scale), height = Math.round(reference.naturalHeight * scale);
        g.drawImage(reference, Math.floor((c.width - width) / 2), Math.floor((c.height - height) / 2), width, height);
      }
    } else {
      const painter = perspective === 'side' ? sidePainters[def.type] ?? painters[def.type] : painters[def.type];
      if (painter) {
      painter(r, g);
      }
    }
  }
  if (!reference || referenceReady) cache.set(key, c);
  return c;
}
