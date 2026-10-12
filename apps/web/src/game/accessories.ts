import type { Accessories, Dir } from '@vo/shared';

export type Painter = (color: string, x: number, y: number, w?: number, h?: number) => void;
export type Shade = (hex: string, amt: number) => string;
type Part = (r: Painter, c: string, d: string, dir: Dir) => void;
type Glasses = (r: Painter, dir: Dir) => void;

const K = '#1a1a1a';

const HAT: Record<string, Part> = {
  cap(r, c, d, dir) {
    r(c, 4, 0, 8, 3); r(d, 4, 3, 8, 1);
    if (dir === 'down') r(d, 3, 3, 10, 1);
    else if (dir === 'right') r(d, 11, 3, 4, 1);
    else if (dir === 'left') r(d, 1, 3, 4, 1);
  },
  beanie(r, c, d) {
    r(c, 4, 0, 8, 4); r(c, 5, -1, 6, 1); r(d, 3, 3, 10, 1);
    r('#f8fafc', 7, -3, 2, 2);
    r(d, 6, 1, 1, 2); r(d, 9, 1, 1, 2);
  },
  tophat(r, c) {
    r(K, 2, 2, 12, 1); r(K, 4, -4, 8, 6); r(c, 4, 1, 8, 1);
    r('#3a3a3a', 5, -3, 1, 4);
  },
  cowboy(r, c, d) {
    r(d, 1, 2, 14, 1); r(c, 2, 1, 12, 1); r(c, 4, -2, 8, 3);
    r(d, 7, -2, 2, 1); r(d, 4, 1, 8, 1);
    r(d, 1, 1, 1, 1); r(d, 14, 1, 1, 1);
  },
  crown(r, c) {
    const g = '#f5c518';
    r(g, 4, -1, 8, 3); r(g, 4, -2, 2, 1); r(g, 7, -2, 2, 1); r(g, 10, -2, 2, 1);
    r('#b8860b', 4, 1, 8, 1); r(c, 7, 0, 2, 1); r('#fff', 5, 0, 1, 1); r('#fff', 10, 0, 1, 1);
  },
  party(r, c, d) {
    r(c, 7, -4, 2, 1); r(c, 7, -3, 2, 1); r(c, 6, -2, 4, 2); r(c, 5, 0, 6, 2);
    r(d, 6, -2, 1, 1); r(d, 8, -1, 1, 1); r(d, 5, 1, 1, 1); r(d, 9, 1, 1, 1);
    r('#fde047', 7, -4, 2, 1);
  },
  hardhat(r, c, d) {
    r(c, 4, -1, 8, 4); r(c, 5, -2, 6, 1); r(d, 7, -2, 2, 4); r(d, 3, 3, 10, 1);
    r('#ffffff55', 5, -1, 1, 2);
  },
  bunnyhat(r, c, d, dir) {
    r(c, 4, 0, 8, 3); r(d, 4, 3, 8, 1);
    const pink = '#f9a8d4';
    if (dir === 'left' || dir === 'right') {
      const x = dir === 'right' ? 5 : 8;
      const lean = dir === 'right' ? -1 : 1;
      r(c, x, -7, 3, 7); r(c, x + lean, -8, 2, 2);
      r(c, x + (dir === 'right' ? 3 : -3), -6, 2, 6);
      r(d, x, -7, 1, 7);
      r(pink, x + 1, -6, 1, 5);
    } else {
      r(c, 4, -7, 3, 7); r(c, 9, -7, 3, 7);
      r(d, 4, -7, 1, 7); r(d, 9, -7, 1, 7);
      if (dir === 'down') { r(pink, 5, -6, 1, 5); r(pink, 10, -6, 1, 5); }
    }
  },
  cathat(r, c, d, dir) {
    r(c, 4, 0, 8, 3); r(d, 4, 3, 8, 1);
    const ear = (x: number, w: number, tall: number, pink: boolean) => {
      for (let i = 0; i < tall; i++) r(c, x, -1 - i, Math.max(1, w - i), 1);
      if (pink) r('#f9a8d4', x + 1, -1, Math.max(1, w - 2), 1);
    };
    if (dir === 'left' || dir === 'right') {
      const right = dir === 'right';
      ear(right ? 7 : 6, 3, 3, true);
      ear(right ? 4 : 10, 2, 2, false);
    } else {
      ear(4, 3, 3, dir === 'down');
      ear(9, 3, 3, dir === 'down');
    }
  },
  doghat(r, c, d, dir) {
    r(c, 4, 0, 8, 3); r(d, 4, 3, 8, 1);
    r(c, 5, -1, 6, 1);
    if (dir === 'left' || dir === 'right') {
      const x = dir === 'left' ? 8 : 4;
      r(d, x, 0, 4, 7); r(c, x, 0, 4, 1);
      r(d, dir === 'left' ? 4 : 10, -1, 2, 2);
    } else {
      r(d, 2, 0, 3, 7); r(d, 11, 0, 3, 7); r(c, 2, 0, 3, 1); r(c, 11, 0, 3, 1);
      if (dir === 'down') { r('#1a1a1a', 7, 1, 2, 1); r(d, 7, 0, 2, 1); }
    }
  },
};

const GLASSES: Record<string, Glasses> = {
  round(r, dir) {
    const f = K;
    if (dir === 'down') {
      for (const x of [4, 8]) { r(f, x, 5, 4, 1); r(f, x, 8, 4, 1); r(f, x, 6, 1, 2); r(f, x + 3, 6, 1, 2); }
      r(f, 3, 6, 1, 1); r(f, 12, 6, 1, 1);
    } else if (dir === 'up') { r(f, 3, 6, 1, 1); r(f, 12, 6, 1, 1); }
    else {
      const x = dir === 'left' ? 4 : 8;
      r(f, x, 5, 4, 1); r(f, x, 8, 4, 1); r(f, x, 6, 1, 2); r(f, x + 3, 6, 1, 2);
      r(f, dir === 'left' ? 8 : 4, 6, 4, 1);
    }
  },
  square(r, dir) {
    const f = '#7a3b1e', lens = '#bfe3ff99';
    if (dir === 'down') {
      for (const x of [4, 8]) { r(f, x, 5, 4, 4); r(lens, x + 1, 6, 2, 2); }
      r(f, 3, 6, 1, 1); r(f, 12, 6, 1, 1);
    } else if (dir === 'up') { r(f, 3, 6, 1, 1); r(f, 12, 6, 1, 1); }
    else {
      const x = dir === 'left' ? 4 : 8;
      r(f, x, 5, 4, 4); r(lens, x + 1, 6, 2, 2);
      r(f, dir === 'left' ? 8 : 4, 6, 4, 1);
    }
  },
  sun(r, dir) {
    if (dir === 'down') {
      r(K, 4, 6, 8, 2); r(K, 3, 6, 1, 1); r(K, 12, 6, 1, 1);
      r('#555', 5, 6, 1, 1); r('#555', 9, 6, 1, 1);
    } else if (dir === 'up') { r(K, 3, 6, 1, 1); r(K, 12, 6, 1, 1); }
    else {
      const x = dir === 'left' ? 4 : 8;
      r(K, x, 5, 4, 3); r('#555', x + 1, 6, 1, 1);
      r(K, dir === 'left' ? 8 : 4, 6, 4, 1);
    }
  },
  neon(r, dir) {
    const p = '#ec4899';
    if (dir === 'down') {
      r(K, 4, 5, 8, 1); r(p, 4, 6, 3, 2); r(p, 9, 6, 3, 2); r(K, 7, 6, 2, 1);
      r(K, 3, 6, 1, 1); r(K, 12, 6, 1, 1);
    } else if (dir === 'up') { r(K, 3, 6, 1, 1); r(K, 12, 6, 1, 1); }
    else {
      const x = dir === 'left' ? 4 : 8;
      r(K, x, 5, 4, 1); r(p, x, 6, 4, 2);
      r(K, dir === 'left' ? 8 : 4, 6, 4, 1);
    }
  },
};

const HEAD: Record<string, Part> = {
  headphones(r, c, d, dir) {
    if (dir === 'left' || dir === 'right') {
      r(K, 4, 0, 8, 1); r(K, 6, 1, 1, 3); r(K, 9, 1, 1, 3);
      r(c, 6, 4, 4, 4); r(d, 7, 5, 2, 2);
    } else {
      r(K, 4, 0, 8, 1); r(K, 3, 1, 1, 4); r(K, 12, 1, 1, 4);
      r(c, 2, 4, 2, 5); r(c, 12, 4, 2, 5); r(d, 2, 5, 1, 3); r(d, 13, 5, 1, 3);
    }
  },
};

const BACK: Record<string, Part> = {
  backpack(r, c, d, dir) {
    if (dir === 'up') { r(c, 3, 10, 10, 8); r(d, 5, 14, 6, 3); r(d, 3, 10, 10, 1); }
    else if (dir === 'down') { r(c, 3, 11, 1, 6); r(c, 12, 11, 1, 6); r(d, 5, 11, 1, 5); r(d, 10, 11, 1, 5); }
    else { const x = dir === 'right' ? 1 : 11; r(c, x, 11, 4, 7); r(d, x, 11, 4, 1); r(d, x + (dir === 'right' ? 0 : 1), 15, 3, 2); }
  },
  cape(r, c, d, dir) {
    if (dir === 'up') { r(c, 3, 10, 10, 11); r(d, 3, 20, 10, 1); r(d, 7, 11, 2, 9); r('#f5c518', 6, 10, 4, 1); }
    else if (dir === 'down') { r(c, 3, 10, 2, 11); r(c, 11, 10, 2, 11); r(d, 3, 20, 2, 1); r(d, 11, 20, 2, 1); r('#f5c518', 6, 10, 4, 1); }
    else { const x = dir === 'right' ? 1 : 11; r(c, x, 10, 4, 11); r(d, x, 20, 4, 1); }
  },
};

const NECK: Record<string, Part> = {
  scarf(r, c, d, dir) {
    r(c, 4, 10, 8, 2); r(d, 4, 11, 8, 1);
    if (dir === 'down') { r(c, 9, 12, 2, 4); r(d, 9, 15, 2, 1); }
    else if (dir === 'right') { r(c, 3, 11, 2, 5); }
    else if (dir === 'left') { r(c, 11, 11, 2, 5); }
  },
  bowtie(r, c, d, dir) {
    if (dir === 'down') { r(c, 5, 10, 2, 2); r(c, 9, 10, 2, 2); r(d, 7, 10, 2, 2); }
    else if (dir !== 'up') { r(c, dir === 'left' ? 4 : 10, 10, 2, 2); r(d, dir === 'left' ? 5 : 9, 10, 1, 2); }
  },
  tie(r, c, d, dir) {
    if (dir === 'down') { r('#f8fafc', 6, 10, 4, 1); r(c, 7, 10, 2, 1); r(c, 7, 11, 2, 4); r(d, 7, 15, 2, 1); }
    else if (dir !== 'up') { const x = dir === 'left' ? 4 : 11; r(c, x, 10, 1, 5); r(d, x, 14, 1, 1); }
  },
  lanyard(r, c, d, dir) {
    if (dir === 'down') { r(c, 6, 10, 1, 3); r(c, 9, 10, 1, 3); r(c, 7, 13, 2, 1); r('#f8fafc', 7, 14, 2, 2); r(d, 7, 14, 2, 1); }
    else if (dir === 'up') r(c, 5, 10, 6, 1);
    else { const x = dir === 'left' ? 4 : 11; r(c, x, 10, 1, 4); r('#f8fafc', dir === 'left' ? 3 : 12, 13, 1, 3); }
  },
};

type ExtraKind = 'back' | 'neck' | 'head';
const kindOf = (extra: string | null): ExtraKind | null =>
  !extra ? null : Object.hasOwn(BACK, extra) ? 'back' : Object.hasOwn(NECK, extra) ? 'neck' : Object.hasOwn(HEAD, extra) ? 'head' : null;

export type Stage = 'pre' | 'head' | 'hat' | 'glasses' | 'post';

/** Dibuja una etapa del personaje sobre el sprite base. */
export function drawAccessories(stage: Stage, r: Painter, acc: Accessories | undefined, dir: Dir, shade: Shade): void {
  if (!acc) return;
  const extra = acc.extra;
  const ec = acc.extraColor || '#ef4444';
  const kind = kindOf(extra);
  if (stage === 'pre') {
    if (kind === 'back' && dir === 'down') BACK[extra!](r, ec, shade(ec, -35), dir);
  } else if (stage === 'head') {
    if (kind === 'head') HEAD[extra!](r, ec, shade(ec, -35), dir);
  } else if (stage === 'hat') {
    const hc = acc.hatColor || '#ef4444';
    if (acc.hat && Object.hasOwn(HAT, acc.hat)) HAT[acc.hat](r, hc, shade(hc, -40), dir);
  } else if (stage === 'glasses') {
    if (acc.glasses && Object.hasOwn(GLASSES, acc.glasses)) GLASSES[acc.glasses](r, dir);
  } else if (stage === 'post') {
    if (kind === 'back' && dir !== 'down') BACK[extra!](r, ec, shade(ec, -35), dir);
    else if (kind === 'neck') NECK[extra!](r, ec, shade(ec, -35), dir);
  }
}

export const accessoriesKey = (acc: Accessories | undefined): string =>
  acc ? `${acc.hat}|${acc.hatColor}|${acc.glasses}|${acc.extra}|${acc.extraColor}` : '';
