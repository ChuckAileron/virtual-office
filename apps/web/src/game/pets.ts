import type { Dir } from '@vo/shared';
import { TILE } from './constants';

const cache = new Map<string, HTMLCanvasElement>();

function shadeHex(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function paint(kind: string, hex: string, frame: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  if (!g) return c;
  const r = (col: string, x: number, y: number, w: number, h: number) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const dark = shadeHex(hex, -0.3), light = shadeHex(hex, 0.35), line = '#1d1d24';
  const dim = hex === '#2b2b33'; // el negro necesita sombras más claras para verse
  const body = hex, shadow = dim ? shadeHex(hex, 0.18) : dark;
  const step = frame ? 1 : 0;

  r('#00000030', 6, 28, 20, 3);

  if (kind === 'dog') {
    r(shadow, 8, 23 + step, 3, 5 - step); r(shadow, 18, 23 + (1 - step), 3, 5 - (1 - step));
    r(body, 11, 23 + (1 - step), 3, 5 - (1 - step)); r(body, 21, 23 + step, 3, 5 - step);
    r(shadow, 3, 12 + step, 4, 3); r(shadow, 5, 14 + step, 3, 4);
    r(body, 6, 14, 18, 10);
    r(light, 8, 21, 14, 3);
    r(body, 21, 9, 9, 10);
    r(light, 26, 14, 5, 5);
    r(line, 29, 14, 3, 2);
    r(line, 24, 12, 2, 2);
    r(shadow, 20, 9, 4, 8);
    r('#ff7a8a', 27, 18, 3, 2);
  } else if (kind === 'rabbit') {
    const pink = '#ff9db0';
    r('#f4f1ec', 3, 18 + step, 4, 4); r('#fff', 4, 19 + step, 2, 2);
    r(shadow, 19, 24 + step, 3, 4 - step); r(body, 23, 24 + (1 - step), 3, 4 - (1 - step));
    r(shadow, 6, 22, 9, 6 - (step ? 1 : 0)); r(body, 5, 26 - step, 4, 2);
    r(body, 6, 15, 16, 10); r(body, 8, 14, 12, 1);
    r(light, 11, 21, 9, 3);
    r(shadow, 7, 17, 6, 6);
    r(body, 20, 12, 9, 10); r(body, 22, 11, 5, 1);
    r(light, 24, 18, 5, 4);
    r(body, 21, 0, 3, 12); r(body, 25, 1, 3, 11);
    r(shadow, 21, 0, 1, 12); r(shadow, 25, 1, 1, 11);
    r(pink, 22, 2, 1, 9); r(pink, 26, 3, 1, 8);
    r(body, 22, 0, 1, 1); r(body, 26, 1, 1, 1);
    r(line, 24, 15, 2, 2); r('#fff', 24, 15, 1, 1);
    r(pink, 28, 18, 2, 2);
    r(line, 29, 20, 3, 1); r(line, 28, 21, 3, 1);
    r(line, 27, 19, 1, 1);
  } else {
    r(shadow, 9, 23 + step, 2, 5 - step); r(shadow, 17, 23 + (1 - step), 2, 5 - (1 - step));
    r(body, 12, 23 + (1 - step), 2, 5 - (1 - step)); r(body, 21, 23 + step, 2, 5 - step);
    r(shadow, 4, 21, 4, 2); r(shadow, 2, 18, 3, 4); r(shadow, 2, 13 + step, 2, 5); r(shadow, 3, 12 + step, 3, 2);
    r(line, 4, 12 + step, 2, 1);
    r(body, 6, 17, 17, 7);
    r(light, 9, 22, 11, 2);
    r(shadow, 10, 17, 2, 5); r(shadow, 14, 17, 2, 5); r(shadow, 18, 17, 2, 5);
    r(body, 20, 12, 10, 8);
    r(body, 20, 10, 4, 2); r(body, 21, 9, 2, 1);
    r(body, 26, 10, 4, 2); r(body, 27, 9, 2, 1);
    r('#ff9db0', 21, 11, 2, 1); r('#ff9db0', 27, 11, 2, 1);
    r(shadow, 24, 12, 2, 2);
    r(light, 25, 16, 5, 4);
    r('#ff7a8a', 28, 16, 2, 1);
    r('#7be495', 22, 14, 3, 2); r(line, 23, 14, 1, 2);
    r('#7be495', 27, 14, 2, 2); r(line, 28, 14, 1, 2);
    r(line, 30, 17, 2, 1); r(line, 30, 19, 2, 1); r(line, 19, 18, 1, 1);
  }
  return c;
}

export function petSprite(kind: string, colorId: string, hex: string, frame: number): HTMLCanvasElement {
  const key = `${kind}|${colorId}|${frame}`;
  let c = cache.get(key);
  if (!c) { c = paint(kind, hex, frame); cache.set(key, c); }
  return c;
}

export interface DrawablePet {
  kind: string;
  color: string;
  x: number;
  y: number;
  rx: number;
  ry: number;
  dir: Dir;
}

/** Dibuja una mascota en coordenadas de mundo (rx, ry en tiles, con interpolación). */
export function drawPet(ctx: CanvasRenderingContext2D, pet: DrawablePet, hex: string, now: number): void {
  const moving = Math.abs(pet.x - pet.rx) > 0.03 || Math.abs(pet.y - pet.ry) > 0.03;
  const frame = moving ? Math.floor(now / 120) % 2 : 0;
  const spr = petSprite(pet.kind, pet.color, hex, frame);
  const px = pet.rx * TILE, py = pet.ry * TILE - (moving && frame ? 1 : 0);
  if (pet.dir === 'left') {
    ctx.save();
    ctx.translate(px + TILE, py);
    ctx.scale(-1, 1);
    ctx.drawImage(spr, 0, 0);
    ctx.restore();
  } else {
    ctx.drawImage(spr, px, py);
  }
}
