'use strict';
// Sprites procedurales 16x24 (4 direcciones x 3 frames) a partir de una apariencia.
const Sprites = (() => {
  const W = 16, H = 24;
  const cache = new Map();
  const EYE = '#1b1b22';

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, v + amt));
    return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
  }

  function drawHair(r, p, female, style, dir, hairD) {
    const h = p.hair;
    if (dir === 'down') {
      if (style === 1 && !female) {
        r(h, 4, 2, 8, 2);
      } else {
        r(h, 4, 1, 8, 3); r(h, 3, 2, 1, 4); r(h, 12, 2, 1, 4);
        if (female) {
          r(h, 5, 4, 2, 1);
          if (style === 0) { r(h, 3, 5, 2, 9); r(h, 11, 5, 2, 9); }
          else if (style === 1) { r(h, 3, 5, 2, 4); r(h, 11, 5, 2, 4); }
          else { r(h, 6, 0, 4, 1); r(h, 3, 5, 1, 2); r(h, 12, 5, 1, 2); }
        } else {
          r(h, 4, 4, 1, 1); r(h, 11, 4, 1, 1);
          if (style === 2) { r(h, 5, 0, 2, 1); r(h, 8, 0, 2, 1); r(h, 11, 0, 1, 1); }
        }
      }
      r(hairD, 4, 3, 8, 1);
    } else if (dir === 'up') {
      if (style === 1 && !female) {
        r(h, 4, 1, 8, 7);
      } else {
        r(h, 3, 1, 10, 9);
        if (female) {
          if (style === 0) r(h, 3, 10, 10, 5);
          else if (style === 1) r(h, 3, 10, 10, 1);
          else { r(h, 6, 0, 4, 1); r(h, 7, 10, 2, 5); }
        } else if (style === 2) {
          r(h, 5, 0, 2, 1); r(h, 8, 0, 2, 1); r(h, 11, 0, 1, 1);
        }
      }
      r(hairD, 4, 8, 8, 1);
    } else {
      const left = dir === 'left';
      const bx = left ? 8 : 3;
      r(h, 4, 1, 8, 3);
      if (style === 1 && !female) {
        r(h, bx, 1, 5, 5);
      } else {
        r(h, bx, 1, 5, 8);
        if (female) {
          if (style === 0) r(h, bx, 8, 5, 6);
          else if (style === 1) r(h, bx, 8, 5, 2);
          else { r(h, 6, 0, 4, 1); r(h, left ? 11 : 3, 8, 2, 5); }
        } else if (style === 2) {
          r(h, 6, 0, 2, 1); r(h, 9, 0, 2, 1);
        }
      }
      r(hairD, 4, 3, 8, 1);
    }
  }

  function draw(ctx, a, dir, frame) {
    const r = (c, x, y, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    const female = a.gender === 'female';
    const p = a;
    const side = dir === 'left' || dir === 'right';
    const sx = dir === 'left' ? -1 : 1;
    const shirtD = shade(p.shirt, -35);
    const skinD = shade(p.skin, -30);
    const hairD = shade(p.hair, -25);

    // Piernas
    const lLen = frame === 1 ? 3 : 5;
    const rLen = frame === 2 ? 3 : 5;
    const legTop = female ? 20 : 18;
    const legColor = female ? p.skin : p.pants;
    const adj = female ? -2 : 0;
    if (side) {
      const fwd = frame === 1 ? sx : 0, back = frame === 2 ? -sx : 0;
      const full = 5 + adj;
      r(legColor, 6 + fwd, legTop, 3, full - (frame === 1 ? 1 : 0));
      r(legColor, 7 + back, legTop, 3, full - (frame === 2 ? 1 : 0));
      r('#222', 6 + fwd, legTop + full - (frame === 1 ? 1 : 0), 3, 1);
      r('#222', 7 + back, legTop + full - (frame === 2 ? 1 : 0), 3, 1);
    } else {
      r(legColor, 5, legTop, 3, lLen + adj);
      r(legColor, 8, legTop, 3, rLen + adj);
      r('#222', 5, legTop + lLen + adj, 3, 1);
      r('#222', 8, legTop + rLen + adj, 3, 1);
    }
    if (female) {
      r(p.pants, 3, 16, 10, 4);
      r(shade(p.pants, -25), 3, 19, 10, 1);
    }

    // Torso y brazos
    r(p.shirt, 4, 10, 8, female ? 6 : 8);
    r(shirtD, 4, 15, 8, 1);
    if (side) {
      const ax = dir === 'left' ? 6 : 8;
      const sw = frame === 1 ? -1 : frame === 2 ? 1 : 0;
      r(p.shirt, ax, 11, 2, 3);
      r(p.skin, ax, 14 + sw, 2, 2);
    } else {
      const sl = frame === 1 ? 1 : 0, sr = frame === 2 ? 1 : 0;
      r(p.shirt, 2, 11, 2, 3); r(p.skin, 2, 14 - sl, 2, 2);
      r(p.shirt, 12, 11, 2, 3); r(p.skin, 12, 14 - sr, 2, 2);
    }

    // Cabeza
    r(p.skin, 4, 2, 8, 8);
    r(skinD, 4, 9, 8, 1);
    drawHair(r, p, female, a.style | 0, dir, hairD);

    // Rostro
    if (dir === 'down') {
      r(EYE, 5, 6, 2, 2); r(EYE, 9, 6, 2, 2);
      r('#fff', 5, 6, 1, 1); r('#fff', 9, 6, 1, 1);
      r(female ? '#d6567a' : skinD, 7, 9, 2, 1);
    } else if (side) {
      const ex = dir === 'left' ? 5 : 9;
      r(EYE, ex, 6, 2, 2);
      r('#fff', ex + (dir === 'left' ? 0 : 1), 6, 1, 1);
      r(skinD, dir === 'left' ? 4 : 11, 7, 1, 1);
    }
  }

  /** Devuelve el canvas del sprite (cacheado) para una apariencia, dirección y frame. */
  function get(a, dir, frame) {
    const key = `${a.gender}|${a.style}|${a.skin}|${a.hair}|${a.shirt}|${a.pants}|${dir}|${frame}`;
    let c = cache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = W; c.height = H;
    draw(c.getContext('2d'), a, dir, frame);
    cache.set(key, c);
    return c;
  }

  return { W, H, get };
})();
