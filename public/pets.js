'use strict';
// Sprites procedurales de mascotas (perro y gato) en 32x32, mirando a la derecha; dos cuadros de caminata.
const Pets = (() => {
  const cache = new Map();

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
    const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
  }

  function paint(kind, hex, frame) {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const g = c.getContext('2d');
    const r = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const dark = shade(hex, -0.3), light = shade(hex, 0.35), line = '#1d1d24';
    const dim = hex === '#2b2b33'; // el negro necesita sombras más claras para verse
    const body = hex, shadow = dim ? shade(hex, 0.18) : dark;
    const step = frame ? 1 : 0;

    r('#00000030', 6, 28, 20, 3); // sombra en el piso

    if (kind === 'dog') {
      // patas
      r(shadow, 8, 23 + step, 3, 5 - step); r(shadow, 18, 23 + (1 - step), 3, 5 - (1 - step));
      r(body, 11, 23 + (1 - step), 3, 5 - (1 - step)); r(body, 21, 23 + step, 3, 5 - step);
      // cola
      r(shadow, 3, 12 + step, 4, 3); r(shadow, 5, 14 + step, 3, 4);
      // cuerpo
      r(body, 6, 14, 18, 10);
      r(light, 8, 21, 14, 3);
      // cabeza y hocico
      r(body, 21, 9, 9, 10);
      r(light, 26, 14, 5, 5);
      r(line, 29, 14, 3, 2);
      r(line, 24, 12, 2, 2);
      // oreja caída
      r(shadow, 20, 9, 4, 8);
      r('#ff7a8a', 27, 18, 3, 2);
    } else {
      // patas
      r(shadow, 9, 23 + step, 3, 5 - step); r(shadow, 17, 23 + (1 - step), 3, 5 - (1 - step));
      r(body, 12, 23 + (1 - step), 3, 5 - (1 - step)); r(body, 20, 23 + step, 3, 5 - step);
      // cola larga hacia arriba
      r(shadow, 3, 22, 4, 3); r(shadow, 3, 13 + step, 3, 10); r(shadow, 4, 11 + step, 3, 3);
      // cuerpo
      r(body, 6, 16, 17, 8);
      r(light, 9, 21, 12, 3);
      r(shadow, 10, 16, 2, 8); r(shadow, 15, 16, 2, 8);
      // cabeza y orejas puntiagudas
      r(body, 20, 11, 9, 9);
      r(body, 20, 7, 3, 4); r(body, 26, 7, 3, 4);
      r('#ff9db0', 21, 8, 1, 3); r('#ff9db0', 27, 8, 1, 3);
      r(light, 25, 15, 4, 4);
      r('#ff7a8a', 28, 15, 2, 2);
      // ojos y bigotes
      r('#7be495', 23, 13, 2, 2); r(line, 24, 13, 1, 2);
      r(line, 29, 17, 3, 1); r(line, 29, 19, 3, 1);
    }
    return c;
  }

  function sprite(kind, color, hex, frame) {
    const key = `${kind}|${color}|${frame}`;
    if (!cache.has(key)) cache.set(key, paint(kind, hex, frame));
    return cache.get(key);
  }

  /** Dibuja una mascota en coordenadas de mundo (rx, ry en tiles, con interpolación). */
  function draw(ctx, pet, hex, now) {
    const moving = Math.abs(pet.x - pet.rx) > 0.03 || Math.abs(pet.y - pet.ry) > 0.03;
    const frame = moving ? Math.floor(now / 120) % 2 : 0;
    const spr = sprite(pet.kind, pet.color, hex, frame);
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

  return { sprite, draw };
})();
