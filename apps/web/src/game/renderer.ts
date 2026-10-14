import { T, officeAt, type FloorDecoration, type Tiles } from '@vo/shared';
import type { BuildView } from './build';
import { SPRITE_SCALE, TILE } from './constants';
import { cameraAxis } from './coords';
import { objectSprite } from './objects';
import { drawPet, petSprite } from './pets';
import { chair, desk, deskBoss } from './props';
import { SPRITE_H, SPRITE_W, getSprite, shade } from './sprites';
import { chatBubble, isMoving, type ClientPlayer, type GameState } from './state';

const FLOORS = {
  office: ['#b9a27c', '#b09872'],
  boss: ['#7a4a52', '#703f48'],
  conference: ['#a9b8a2', '#a0af99'],
  lobby: ['#cbb27f', '#c2a976'],
  kitchen: ['#cbb489', '#c3ac81'],
  rest: ['#aebfa6', '#a5b69d'],
  hall: ['#8ea4c4', '#869cbd'],
} as const;

export const SPEAKING_LEVEL = 0.08;
const floorImages = new Map<string, HTMLImageElement>();

function floorImage(url: string): HTMLImageElement {
  let image = floorImages.get(url);
  if (!image) {
    image = new Image();
    image.src = url;
    floorImages.set(url, image);
  }
  return image;
}

function roomKindAt(state: GameState, x: number, y: number): keyof typeof FLOORS {
  const o = officeAt(state.room.offices, x, y);
  return o ? o.kind : 'hall';
}

function drawTileBase(ctx: CanvasRenderingContext2D, state: GameState, t: number, x: number, y: number): void {
  const px = x * TILE, py = y * TILE;
  if (t === T.WALL) {
    ctx.fillStyle = '#4a5270'; ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = '#5d6690'; ctx.fillRect(px, py, TILE, 6);
    ctx.fillStyle = '#383f58'; ctx.fillRect(px, py + TILE - 4, TILE, 4);
    return;
  }
  if (t === T.DOOR) {
    ctx.fillStyle = '#d8c9a6'; ctx.fillRect(px, py, TILE, TILE);
    return;
  }
  const office = officeAt(state.room.offices, x, y);
  const style = office && state.floorStyles.find((entry) => entry.officeId === office.id);
  if (style) {
    const dark = style.pattern === 'checker' && ((x - office!.x + y - office!.y) % 2 === 1);
    ctx.fillStyle = dark ? shade(style.color, -28) : style.color;
  } else {
    const kind = t === T.BOSS ? 'boss' : t === T.CONF ? 'conference' : t === T.LOBBY ? 'lobby' : t === T.OFFICE ? 'office' : t === T.FLOOR ? 'hall' : roomKindAt(state, x, y);
    ctx.fillStyle = FLOORS[kind][(x + y) % 2 === 0 ? 0 : 1];
  }
  ctx.fillRect(px, py, TILE, TILE);
}

function drawTileDetails(ctx: CanvasRenderingContext2D, state: GameState, t: number, x: number, y: number, tiles: Tiles): void {
  const px = x * TILE, py = y * TILE;
  const kind = roomKindAt(state, x, y);
  if (t === T.DESK) {
    // Cada escritorio ocupa 3 tiles que comparten un sprite de 96x32
    let start = x;
    while (tiles[y][start - 1] === T.DESK) start--;
    ctx.drawImage((kind === 'boss' ? deskBoss : desk)(start + y), (x - start) * TILE, 0, TILE, TILE, px, py, TILE, TILE);
  } else if (t === T.TABLE) {
    const top = tiles[y - 1]?.[x] !== T.TABLE;
    ctx.fillStyle = '#6a4224'; ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = '#9a6b3d'; ctx.fillRect(px, py + (top ? 2 : 0), TILE, TILE - (top ? 2 : 4));
    if (!top) { ctx.fillStyle = '#5a3519'; ctx.fillRect(px, py + TILE - 4, TILE, 4); }
    if (tiles[y][x - 1] !== T.TABLE) { ctx.fillStyle = '#6a4224'; ctx.fillRect(px, py, 2, TILE); }
    if (tiles[y][x + 1] !== T.TABLE) { ctx.fillStyle = '#6a4224'; ctx.fillRect(px + TILE - 2, py, 2, TILE); }
    if (!top && (x + y) % 3 === 0) { ctx.fillStyle = '#f4f4f4'; ctx.fillRect(px + 8, py + 6, 10, 8); }
  } else if (t === T.CHAIR) {
    // La silla sobre la mesa mira hacia abajo; la de abajo, hacia arriba
    const above = tiles[y + 1]?.[x] === T.TABLE;
    if (!above) {
      ctx.save();
      ctx.translate(px, py + TILE);
      ctx.scale(1, -1);
      ctx.drawImage(chair(x), 0, 0, TILE, TILE);
      ctx.restore();
    } else {
      ctx.drawImage(chair(x), px, py, TILE, TILE);
    }
  } else if (t === T.COUNTER) {
    ctx.fillStyle = '#8a8f99'; ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = '#b9bec8'; ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 7);
    ctx.fillStyle = '#6b7079'; ctx.fillRect(px, py + TILE - 4, TILE, 4);
    ctx.fillStyle = '#5c616b'; ctx.fillRect(px + 6, py + TILE - 6, TILE - 12, 2);
  } else if (t === T.SOFA) {
    // Sillón orientado hacia la mesa cercana; dibujamos respaldo, brazos y cojín por separado.
    const facing = tiles[y + 1]?.[x] === T.ROUND_TABLE ? 0
      : tiles[y - 1]?.[x] === T.ROUND_TABLE ? Math.PI
        : tiles[y][x + 1] === T.ROUND_TABLE ? -Math.PI / 2
          : tiles[y][x - 1] === T.ROUND_TABLE ? Math.PI / 2 : 0;
    ctx.save();
    ctx.translate(px + TILE / 2, py + TILE / 2);
    ctx.rotate(facing);
    ctx.fillStyle = '#00000033'; ctx.beginPath(); ctx.ellipse(0, 10, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#284653'; ctx.fillRect(-14, -13, 28, 26);
    ctx.fillStyle = '#397080'; ctx.fillRect(-11, -12, 22, 8);
    ctx.fillStyle = '#4d8994'; ctx.fillRect(-10, -3, 20, 13);
    ctx.fillStyle = '#70a6a8'; ctx.fillRect(-8, -1, 16, 8);
    ctx.fillStyle = '#2d626e'; ctx.fillRect(-14, -3, 4, 12); ctx.fillRect(10, -3, 4, 12);
    ctx.fillStyle = '#a4c4b9'; ctx.fillRect(-7, -10, 14, 1);
    ctx.fillStyle = '#25404a'; ctx.fillRect(-11, 12, 3, 2); ctx.fillRect(8, 12, 3, 2);
    ctx.restore();
  } else if (t === T.ROUND_TABLE) {
    // Una sola mesa redonda por cada bloque 2x2
    if (tiles[y - 1]?.[x] !== T.ROUND_TABLE && tiles[y][x - 1] !== T.ROUND_TABLE) {
      ctx.save();
      const cx = px + TILE, cy = py + TILE;
      ctx.fillStyle = '#00000033'; ctx.beginPath(); ctx.ellipse(cx, cy + 4, TILE - 4, TILE - 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#54351f'; ctx.beginPath(); ctx.arc(cx, cy, TILE - 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#98633d'; ctx.beginPath(); ctx.arc(cx, cy - 1, TILE - 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#bd8958'; ctx.beginPath(); ctx.arc(cx, cy - 2, TILE - 8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d4a675'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy - 2, TILE - 11, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
      // Pequeño florero para que se lea como mesa de descanso y no como un disco de suelo.
      ctx.fillStyle = '#e6d9b8'; ctx.beginPath(); ctx.ellipse(cx, cy - 1, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#67a978'; ctx.beginPath(); ctx.ellipse(cx - 3, cy - 7, 3, 5, -0.65, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#82c58b'; ctx.beginPath(); ctx.ellipse(cx + 3, cy - 7, 3, 5, 0.65, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
}

function drawFloorDecoration(ctx: CanvasRenderingContext2D, decoration: FloorDecoration): void {
  const image = floorImage(decoration.imageUrl);
  if (!image.complete || !image.naturalWidth) return;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, decoration.x * TILE, decoration.y * TILE, decoration.w * TILE, decoration.h * TILE);
  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, p: ClientPlayer, now: number): void {
  const frame = isMoving(p) ? 1 + (Math.floor(now / 140) % 2) : 0;
  const spr = getSprite(p.appearance, p.dir, frame);
  const w = SPRITE_W * SPRITE_SCALE, h = SPRITE_H * SPRITE_SCALE;
  const cx = (p.rx + 0.5) * TILE, feet = (p.ry + 1) * TILE - 2;
  ctx.fillStyle = '#0005';
  ctx.beginPath(); ctx.ellipse(cx, feet, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(spr, Math.round(cx - w / 2), Math.round(feet - h + 2), w, h);
}

function drawLabel(ctx: CanvasRenderingContext2D, state: GameState, p: ClientPlayer, now: number): void {
  const cx = (p.rx + 0.5) * TILE;
  const top = (p.ry + 1) * TILE - SPRITE_H * SPRITE_SCALE;
  ctx.font = '12px system-ui';
  ctx.textAlign = 'center';
  const label = p.name + (p.idle ? ' 💤' : '');
  const tw = ctx.measureText(label).width + 24;
  ctx.fillStyle = '#000a';
  ctx.fillRect(cx - tw / 2, top - 16, tw, 15);
  ctx.fillStyle = p.idle ? '#f5b301' : '#3ddc84';
  ctx.beginPath(); ctx.arc(cx - tw / 2 + 9, top - 8.5, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p.idle ? '#aaa' : p.id === state.you ? '#ffe27a' : '#fff';
  ctx.fillText(label, cx + 7, top - 5);
  if (p.voice) {
    const speaking = p.level > SPEAKING_LEVEL;
    ctx.textAlign = 'left';
    ctx.fillText(speaking ? '🔊' : '🎙', cx + tw / 2 + 2, top - 4);
    ctx.textAlign = 'center';
    if (speaking) {
      ctx.strokeStyle = '#3ddc84';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, (p.ry + 1) * TILE - 2, 15, 7, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }
  if (p.bubble && now < p.bubbleUntil) {
    const text = chatBubble(p.bubble);
    const bw = ctx.measureText(text).width + 14;
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - bw / 2, top - 40, bw, 20);
    ctx.fillStyle = '#111';
    ctx.fillText(text, cx, top - 26);
  }
}

function highlight(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ok: boolean): void {
  ctx.fillStyle = ok ? '#3ddc8455' : '#ef444477';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = ok ? '#3ddc84' : '#ef4444';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

function removeMark(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 3;
  ctx.strokeRect(x * TILE + 1, y * TILE + 1, w * TILE - 2, h * TILE - 2);
  ctx.fillStyle = '#ef444444';
  ctx.fillRect(x * TILE, y * TILE, w * TILE, h * TILE);
  ctx.restore();
}

/** Vista previa de colocación / retiro (coordenadas del mundo). */
function drawOverlay(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  build: BuildView & { canPlaceHere(): boolean },
  petHex: (color: string) => string,
): void {
  const hover = build.hover;
  if (!build.open || !hover) return;
  const px = hover.x * TILE, py = hover.y * TILE;
  if (build.petKind) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.drawImage(petSprite(build.petKind, build.petColor, petHex(build.petColor), 0), px, py);
    ctx.globalAlpha = 1;
    highlight(ctx, px, py, TILE, TILE, build.canPlaceHere());
    ctx.restore();
  } else if (build.selected) {
    const sel = build.selected;
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.drawImage(objectSprite(sel, build.perspective, build.flipped), px, py);
    ctx.globalAlpha = 1;
    highlight(ctx, px, py, sel.w * TILE, sel.h * TILE, build.canPlaceHere());
    ctx.restore();
  } else if (build.selectedFloorDecoration) {
    const sel = build.selectedFloorDecoration;
    const image = floorImage(sel.imageUrl);
    ctx.save();
    ctx.globalAlpha = 0.72;
    if (image.complete && image.naturalWidth) ctx.drawImage(image, px, py, sel.w * TILE, sel.h * TILE);
    else { ctx.fillStyle = '#a855f766'; ctx.fillRect(px, py, sel.w * TILE, sel.h * TILE); }
    ctx.globalAlpha = 1;
    highlight(ctx, px, py, sel.w * TILE, sel.h * TILE, build.canPlaceHere());
    ctx.restore();
  } else if (build.removing) {
    const pet = [...state.pets.values()].find((p) => p.x === hover.x && p.y === hover.y);
    if (pet) { removeMark(ctx, pet.x, pet.y, 1, 1); return; }
    let found: { x: number; y: number; w: number; h: number } | null = null;
    for (const o of state.objects) {
      const od = state.defs.get(o.type);
      if (od && hover.x >= o.x && hover.x < o.x + od.w && hover.y >= o.y && hover.y < o.y + od.h && (!found || od.layer !== 'floor')) {
        found = { x: o.x, y: o.y, w: od.w, h: od.h };
      }
    }
    if (!found) {
      const decoration = [...state.floorDecorations].reverse().find((d) =>
        hover.x >= d.x && hover.x < d.x + d.w && hover.y >= d.y && hover.y < d.y + d.h,
      );
      if (decoration) found = { x: decoration.x, y: decoration.y, w: decoration.w, h: decoration.h };
    }
    if (found) removeMark(ctx, found.x, found.y, found.w, found.h);
  }
}

/** Dibuja un cuadro completo. Actualiza `state.cam`. */
export function render(
  canvas: HTMLCanvasElement,
  state: GameState,
  build: BuildView & { canPlaceHere(): boolean },
  now: number,
): void {
  const ctx = canvas.getContext('2d');
  const me = state.players.get(state.you);
  if (!ctx || !me) return;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#11141f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const { tiles, size, offices } = state.room;
  const mapW = size.width * TILE, mapH = size.height * TILE;
  const camX = cameraAxis(mapW, canvas.width, (me.rx + 0.5) * TILE);
  const camY = cameraAxis(mapH, canvas.height, (me.ry + 0.5) * TILE);
  state.cam.x = Math.round(camX);
  state.cam.y = Math.round(camY);
  ctx.save();
  ctx.translate(-state.cam.x, -state.cam.y);

  const x0 = Math.max(0, Math.floor(camX / TILE)), x1 = Math.min(size.width - 1, Math.floor((camX + canvas.width) / TILE));
  const y0 = Math.max(0, Math.floor(camY / TILE)), y1 = Math.min(size.height - 1, Math.floor((camY + canvas.height) / TILE));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) drawTileBase(ctx, state, tiles[y][x], x, y);

  // Imágenes de piso: cubren la textura base, pero nunca muebles, objetos ni jugadores.
  for (const decoration of state.floorDecorations) drawFloorDecoration(ctx, decoration);

  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) drawTileDetails(ctx, state, tiles[y][x], x, y, tiles);

  // Silla frente al centro de cada escritorio (decorativa, debajo de los jugadores)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (tiles[y][x] === T.DESK && tiles[y][x - 1] === T.DESK && tiles[y][x + 1] === T.DESK) {
        const boss = roomKindAt(state, x, y) === 'boss';
        ctx.drawImage(chair(x + y), x * TILE, (boss ? y - 1 : y + 1) * TILE, TILE, TILE);
      }
    }
  }

  // Objetos: alfombras debajo y el resto ordenado por fila
  const visible = state.objects.filter((o) => state.defs.has(o.type));
  for (const floorLayer of [true, false]) {
    visible
      .filter((o) => (state.defs.get(o.type)!.layer === 'floor') === floorLayer)
      .sort((a, b) => a.y - b.y)
      .forEach((o) => ctx.drawImage(
        objectSprite(state.defs.get(o.type)!, o.perspective ?? 'front', o.flipped ?? false),
        o.x * TILE,
        o.y * TILE,
      ));
  }

  for (const o of offices) {
    ctx.fillStyle = '#ffffffcc';
    ctx.font = 'bold 12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(o.name, (o.x + o.w / 2) * TILE, (o.y + 0.65) * TILE);
  }

  const hexOf = new Map(state.petColors.map((c) => [c.id, c.hex]));
  const petHex = (id: string) => hexOf.get(id) ?? state.petColors[0]?.hex ?? '#888888';
  [...state.pets.values()].sort((a, b) => a.ry - b.ry).forEach((p) => drawPet(ctx, p, hexOf.get(p.color) ?? '#888888', now));

  const list = [...state.players.values()].sort((a, b) => a.ry - b.ry);
  for (const p of list) drawPlayer(ctx, p, now);
  for (const p of list) drawLabel(ctx, state, p, now);

  // Anillos de teletransporte de la convocatoria a la sala de reuniones.
  for (const fx of state.effects) {
    const t = (now - fx.start) / (fx.until - fx.start);
    if (t < 0 || t > 1) continue;
    const cx = (fx.x + 0.5) * TILE, cy = (fx.y + 0.5) * TILE;
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.85;
    ctx.strokeStyle = '#7c5cff';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, TILE * (0.3 + t * 1.1), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = (1 - t) * 0.4;
    ctx.strokeStyle = '#c4b5fd';
    ctx.beginPath(); ctx.arc(cx, cy, TILE * (0.15 + t * 0.7), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  drawOverlay(ctx, state, build, petHex);
  ctx.restore();
}
