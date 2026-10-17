import { T, officeAt, type FloorDecoration, type Tiles } from '@vo/shared';
import type { BuildView } from './build';
import { SPRITE_SCALE, TILE } from './constants';
import { cameraAxis } from './coords';
import { objectSprite } from './objects';
import { drawPet, petSprite } from './pets';
import { chair, desk, deskBoss } from './props';
import { interiorImage, interiorImageReady } from './interiorAssets';
import { SPRITE_H, SPRITE_W, getSprite, shade } from './sprites';
import { chatBubble, isMoving, type ClientPlayer, type GameState } from './state';

const FLOORS = {
  office: ['#b79263', '#b18a5e'],
  boss: ['#b08a5d', '#a78156'],
  conference: ['#b39165', '#aa895f'],
  lobby: ['#bb9a70', '#b28f67'],
  kitchen: ['#8c9597', '#879194'],
  rest: ['#b79263', '#ad895e'],
  hall: ['#718096', '#68798e'],
} as const;

export const SPEAKING_LEVEL = 0.08;
const floorImages = new Map<string, HTMLImageElement>();
const woodPatterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();

function floorImage(url: string): HTMLImageElement {
  let image = floorImages.get(url);
  if (!image) {
    image = new Image();
    image.src = url;
    floorImages.set(url, image);
  }
  return image;
}

/** Rectángulo visible en píxeles del mundo; sirve para descartar lo que queda fuera de cámara. */
interface ViewRect { x0: number; y0: number; x1: number; y1: number; }

const intersects = (v: ViewRect, x: number, y: number, w: number, h: number): boolean =>
  x < v.x1 && x + w > v.x0 && y < v.y1 && y + h > v.y0;

const roomVisible = (v: ViewRect, room: { x: number; y: number; w: number; h: number }, margin = TILE * 2): boolean =>
  intersects(v, room.x * TILE - margin, room.y * TILE - margin, room.w * TILE + margin * 2, room.h * TILE + margin * 2);

/** Margen para no descartar mobiliario cuyo sprite sobresale de su casilla. */
const OBJECT_MARGIN = TILE * 6;

// La capa base (suelos y paredes) se cachea por bloques de TILE_CHUNK casillas. Cada
// fotograma solo se copian los bloques visibles, así el coste deja de crecer con el
// tamaño del mapa y el personaje se mueve fluido aunque haya decenas de oficinas.
const TILE_CHUNK = 16;
interface TileCache { chunks: Map<number, HTMLCanvasElement>; woodHooked: boolean; }
const tileCaches = new WeakMap<GameState, TileCache>();

function roomKindAt(state: GameState, x: number, y: number): keyof typeof FLOORS {
  const o = officeAt(state.room.offices, x, y);
  return o ? o.kind : 'hall';
}

function chairVariant(state: GameState, x: number, y: number): number {
  const room = officeAt(state.room.offices, x, y);
  if (room?.kind === 'conference' || room?.kind === 'kitchen') return 1;
  if (room?.kind === 'lobby') return 2;
  const officeNo = Number(room?.name.match(/\d+/)?.[0] ?? room?.id ?? 0);
  return officeNo % 4 === 1 ? 2 : 1;
}

function drawCheckerTile(ctx: CanvasRenderingContext2D, px: number, py: number, color: string): void {
  ctx.fillStyle = color; ctx.fillRect(px, py, TILE, TILE);
  ctx.fillStyle = '#d9e0e522'; ctx.fillRect(px + 1, py + 1, TILE - 2, 1);
  ctx.fillStyle = '#34405020'; ctx.fillRect(px, py + TILE - 1, TILE, 1);
  ctx.strokeStyle = '#46566a55'; ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
}

function drawWoodTile(ctx: CanvasRenderingContext2D, px: number, py: number, x: number, y: number, base: string, tint?: string): void {
  const texture = interiorImage('woodTile');
  if (interiorImageReady(texture)) {
    let pattern = woodPatterns.get(ctx);
    if (!pattern) { pattern = ctx.createPattern(texture, 'repeat') ?? undefined; if (pattern) woodPatterns.set(ctx, pattern); }
    if (pattern) {
      ctx.fillStyle = pattern; ctx.fillRect(px, py, TILE, TILE);
      if (tint) {
        // Tiñe conservando la veta de la madera: el color cambia, la textura no.
        ctx.save();
        ctx.globalCompositeOperation = 'color';
        ctx.fillStyle = tint; ctx.fillRect(px, py, TILE, TILE);
        ctx.restore();
      }
      return;
    }
  }
  const bandHeight = 8;
  for (let band = 0; band < TILE / bandHeight; band++) {
    const boardRow = Math.floor((py + band * bandHeight) / bandHeight);
    const top = py + band * bandHeight;
    ctx.fillStyle = shade(base, boardRow % 2 === 0 ? 4 : -5);
    ctx.fillRect(px, top, TILE, bandHeight);
    ctx.fillStyle = '#e5c18a55'; ctx.fillRect(px + 1, top + 1, TILE - 2, 1);
    ctx.fillStyle = '#79563866'; ctx.fillRect(px, top + bandHeight - 1, TILE, 1);

    // Tablones de tres casillas con juntas alternadas, como el piso de madera de la referencia.
    const stagger = boardRow % 2 === 0 ? 0 : TILE * 1.5;
    const firstJoint = Math.floor((px - stagger) / (TILE * 3)) * (TILE * 3) + stagger;
    for (let joint = firstJoint; joint <= px + TILE; joint += TILE * 3) {
      if (joint >= px && joint < px + TILE) {
        ctx.fillStyle = '#704f35aa'; ctx.fillRect(joint, top, 1, bandHeight - 1);
        if (joint < px + TILE - 2) { ctx.fillStyle = '#d4ae7b55'; ctx.fillRect(joint + 1, top + 1, 1, bandHeight - 2); }
      }
    }

    const grain = (x * 17 + y * 11 + boardRow * 7) % (TILE - 9);
    ctx.fillStyle = '#efd3a033'; ctx.fillRect(px + 4 + grain, top + 3, 5, 1);
  }
}

function drawGlassWallTile(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = '#3c4f5b'; ctx.fillRect(px, py, TILE, TILE);
  ctx.fillStyle = '#8ba9a1'; ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
  ctx.fillStyle = '#d6e4d7'; ctx.fillRect(px + 4, py + 4, 2, TILE - 11);
  ctx.fillStyle = '#e6f3e355';
  ctx.beginPath(); ctx.moveTo(px + 9, py + TILE - 5); ctx.lineTo(px + 19, py + 3); ctx.lineTo(px + 24, py + 3); ctx.lineTo(px + 14, py + TILE - 5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5c7076'; ctx.fillRect(px + TILE - 4, py + 2, 2, TILE - 4);
  ctx.fillStyle = '#a5b8b5'; ctx.fillRect(px + 1, py + TILE - 5, TILE - 2, 3);
  ctx.fillStyle = '#34444b'; ctx.fillRect(px, py + TILE - 2, TILE, 2);
}

function drawWallTile(ctx: CanvasRenderingContext2D, state: GameState, tiles: Tiles, x: number, y: number): void {
  const px = x * TILE, py = y * TILE;
  const room = officeAt(state.room.offices, x, y);
  if (room?.kind === 'conference' && y === room.y + room.h - 1) {
    drawGlassWallTile(ctx, px, py);
    return;
  }
  const wallAt = (dx: number, dy: number): boolean => tiles[y + dy]?.[x + dx] === T.WALL;
  ctx.fillStyle = '#e3dfc7'; ctx.fillRect(px, py, TILE, TILE);
  ctx.fillStyle = '#ece7d5'; ctx.fillRect(px + 2, py + 2, TILE - 4, 8);
  ctx.fillStyle = '#ded9c5'; ctx.fillRect(px + 2, py + 10, TILE - 4, 13);
  ctx.fillStyle = '#b7b49f'; ctx.fillRect(px + 2, py + 23, TILE - 4, 2);
  ctx.fillStyle = '#494b43'; ctx.fillRect(px + 1, py + TILE - 6, TILE - 2, 5);
  ctx.fillStyle = '#aaa992'; ctx.fillRect(px + 2, py + 3, 1, TILE - 10);

  // Los bordes se dibujan solo en el perímetro para que las paredes contiguas
  // se lean como una pared continua y no como una cuadrícula de bloques.
  ctx.fillStyle = '#34343a';
  if (!wallAt(0, -1)) ctx.fillRect(px, py, TILE, 2);
  if (!wallAt(-1, 0)) ctx.fillRect(px, py, 2, TILE);
  if (!wallAt(1, 0)) ctx.fillRect(px + TILE - 2, py, 2, TILE);
  if (!wallAt(0, 1)) ctx.fillRect(px, py + TILE - 2, TILE, 2);
}

function drawWallArt(ctx: CanvasRenderingContext2D, px: number, py: number, width = 52, height = 25): void {
  ctx.fillStyle = '#3f352b55'; ctx.fillRect(px + 2, py + 4, width, height);
  ctx.fillStyle = '#785c42'; ctx.fillRect(px, py, width, height);
  ctx.fillStyle = '#c8c6ab'; ctx.fillRect(px + 3, py + 3, width - 6, height - 6);
  ctx.fillStyle = '#587989'; ctx.fillRect(px + 5, py + 5, width - 10, height - 10);
  ctx.fillStyle = '#d6c19a'; ctx.beginPath();
  ctx.moveTo(px + 5, py + height - 5); ctx.lineTo(px + width / 2, py + 8); ctx.lineTo(px + width - 7, py + height - 5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#718f80'; ctx.beginPath();
  ctx.moveTo(px + 5, py + height - 5); ctx.lineTo(px + width * 0.63, py + 10); ctx.lineTo(px + width - 7, py + height - 5); ctx.closePath(); ctx.fill();
}

function drawWallWhiteboard(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = '#34343a55'; ctx.fillRect(px + 2, py + 4, 66, 26);
  ctx.fillStyle = '#7f948a'; ctx.fillRect(px, py, 66, 26);
  ctx.fillStyle = '#e5eada'; ctx.fillRect(px + 3, py + 3, 60, 20);
  ctx.fillStyle = '#80a3a0'; ctx.fillRect(px + 7, py + 7, 38, 2);
  ctx.fillStyle = '#b1c1a4'; ctx.fillRect(px + 7, py + 14, 47, 2);
}

function drawWallClock(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const cx = x + 10, cy = y + 10;
  ctx.fillStyle = '#546b6d'; ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e9e7cd'; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4a5e5e'; ctx.fillRect(cx - 1, cy - 6, 2, 7); ctx.fillRect(cx, cy - 1, 5, 2);
}

function drawWallCabinet(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = '#34343a44'; ctx.fillRect(px + 2, py + 4, 61, 29);
  ctx.fillStyle = '#755c46'; ctx.fillRect(px, py, 61, 29);
  ctx.fillStyle = '#a77949'; ctx.fillRect(px + 3, py + 3, 55, 2);
  ctx.fillStyle = '#bb986a'; ctx.fillRect(px + 4, py + 6, 25, 18); ctx.fillRect(px + 32, py + 6, 25, 18);
  ctx.fillStyle = '#5a4a3c'; ctx.fillRect(px + 30, py + 6, 2, 18);
  ctx.fillStyle = '#d3c09c'; ctx.fillRect(px + 25, py + 12, 2, 3); ctx.fillRect(px + 34, py + 12, 2, 3);
}

function drawNorthWallFaces(ctx: CanvasRenderingContext2D, state: GameState, view: ViewRect): void {
  for (const room of state.room.offices) {
    if (room.kind === 'lobby') continue;
    const x = room.x * TILE, y = room.y * TILE, width = room.w * TILE, height = TILE * 3;
    if (!intersects(view, x, y, width, height)) continue;
    ctx.fillStyle = '#242a30'; ctx.fillRect(x + 5, y + 7, width, height);
    ctx.fillStyle = '#30363b'; ctx.fillRect(x + 3, y + 4, width, height);
    ctx.fillStyle = '#e5dfc6'; ctx.fillRect(x, y, width, height);
    ctx.fillStyle = '#f4efdc'; ctx.fillRect(x + 2, y + 2, width - 4, 7);
    ctx.fillStyle = '#e6e0c8'; ctx.fillRect(x + 3, y + 10, width - 6, height - 35);
    ctx.fillStyle = '#babaa3'; ctx.fillRect(x + 3, y + height - 15, width - 6, 6);
    ctx.fillStyle = '#3e463d'; ctx.fillRect(x + 2, y + height - 9, width - 4, 7);
    ctx.fillStyle = '#bfc1a7'; ctx.fillRect(x + 2, y + 8, width - 4, 1);
  }
}

/** Decoración fija de pared: no añade colisiones ni modifica la navegación. */
function drawWallDecorations(ctx: CanvasRenderingContext2D, state: GameState, view: ViewRect): void {
  for (const room of state.room.offices) {
    if (!roomVisible(view, room)) continue;
    if (room.kind === 'office') {
      drawWallArt(ctx, room.x * TILE + 40, room.y * TILE + 11);
      drawWallClock(ctx, (room.x + room.w) * TILE - 64, room.y * TILE + 12);
    } else if (room.kind === 'boss') {
      drawWallArt(ctx, room.x * TILE + 40, room.y * TILE + 11);
      drawWallClock(ctx, (room.x + room.w) * TILE - 64, room.y * TILE + 12);
    } else if (room.kind === 'conference') {
      drawWallClock(ctx, (room.x + room.w) * TILE - 65, room.y * TILE + 12);
      drawWallWhiteboard(ctx, room.x * TILE + 40, room.y * TILE + 12);
    } else if (room.kind === 'kitchen') {
      drawWallCabinet(ctx, room.x * TILE + 40, room.y * TILE + 7);
      drawWallCabinet(ctx, (room.x + room.w) * TILE - 101, room.y * TILE + 7);
    } else if (room.kind === 'rest') {
      drawWallArt(ctx, room.x * TILE + 40, room.y * TILE + 12, 56, 25);
    } else if (room.kind === 'lobby') {
      const outerX = (room.x - 1) * TILE, outerY = (room.y - 1) * TILE;
      const outerWidth = (room.w + 2) * TILE;
      drawWallArt(ctx, outerX + 40, outerY + 3, 60, 23);
      drawWallClock(ctx, outerX + outerWidth - 70, outerY + 4);
    }
  }
}

function drawCupAt(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = '#556266'; ctx.fillRect(px + 10, py + 10, 12, 12);
  ctx.fillStyle = '#ece5ce'; ctx.fillRect(px + 11, py + 10, 9, 9);
  ctx.fillStyle = '#6b3b1a'; ctx.fillRect(px + 13, py + 11, 5, 2);
  ctx.strokeStyle = '#d6d5c3'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px + 21, py + 14, 3, -Math.PI / 2, Math.PI / 2); ctx.stroke();
}

function drawKitchenSink(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = '#566c75'; ctx.fillRect(px, py, 49, 24);
  ctx.fillStyle = '#d5d9cc'; ctx.fillRect(px + 3, py + 2, 43, 20);
  ctx.fillStyle = '#566c75'; ctx.fillRect(px + 6, py + 5, 37, 14);
  ctx.fillStyle = '#8ba9a1'; ctx.fillRect(px + 9, py + 7, 31, 9);
  ctx.fillStyle = '#424f55'; ctx.fillRect(px + 22, py - 5, 3, 8); ctx.fillRect(px + 22, py - 5, 13, 3);
  ctx.fillStyle = '#b1c0ba'; ctx.fillRect(px + 32, py - 5, 3, 8);
}

function drawKitchenStove(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = '#3e4548'; ctx.fillRect(px, py, 42, 30);
  ctx.fillStyle = '#959c96'; ctx.fillRect(px + 1, py + 1, 40, 3);
  for (const [cx, cy] of [[11, 9], [30, 9], [11, 22], [30, 22]]) {
    ctx.fillStyle = '#202a30'; ctx.beginPath(); ctx.arc(px + cx, py + cy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#66716d'; ctx.beginPath(); ctx.arc(px + cx, py + cy, 2, 0, Math.PI * 2); ctx.fill();
  }
}

function drawCoffeeMachine(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = '#34343a44'; ctx.fillRect(px + 5, py + 6, 25, 31);
  ctx.fillStyle = '#35464b'; ctx.fillRect(px, py, 25, 31);
  ctx.fillStyle = '#626e70'; ctx.fillRect(px + 2, py + 2, 21, 27);
  ctx.fillStyle = '#b7c4b9'; ctx.fillRect(px + 3, py + 3, 19, 6);
  ctx.fillStyle = '#24353c'; ctx.fillRect(px + 4, py + 11, 17, 12);
  ctx.strokeStyle = '#91a3a0'; ctx.lineWidth = 1; ctx.strokeRect(px + 4.5, py + 11.5, 16, 11);
  ctx.fillStyle = '#a0bc8e'; ctx.fillRect(px + 17, py + 13, 2, 2);
  ctx.fillStyle = '#c7c8b5'; ctx.fillRect(px + 8, py + 22, 8, 8);
  ctx.fillStyle = '#77634b'; ctx.fillRect(px + 10, py + 23, 4, 2);
  ctx.strokeStyle = '#60665b'; ctx.strokeRect(px + 15.5, py + 24, 3, 5);
}

function drawKitchenInterior(ctx: CanvasRenderingContext2D, state: GameState, view: ViewRect): void {
  for (const room of state.room.offices) {
    if (room.kind !== 'kitchen') continue;
    const x = room.x * TILE, y = room.y * TILE;
    if (!intersects(view, x, y, 207 + 40, 207)) continue;
    // Mesada posterior, con fregadero, cocina y cafetera en las anclas de la referencia.
    ctx.fillStyle = '#424f55'; ctx.fillRect(x + 40, y + 88, 207, 47);
    ctx.fillStyle = '#aeb8ae'; ctx.fillRect(x + 43, y + 90, 201, 40);
    ctx.fillStyle = '#d7ddd0'; ctx.fillRect(x + 45, y + 90, 197, 5);
    ctx.fillStyle = '#566c75'; ctx.fillRect(x + 40, y + 132, 207, 3);
    drawKitchenSink(ctx, x + 51, y + 98);
    drawKitchenStove(ctx, x + 120, y + 97);
    drawCoffeeMachine(ctx, x + 200, y + 80);

    // Isla central de seis tiles, dos tazas y dos taburetes.
    ctx.fillStyle = '#424f55'; ctx.fillRect(x + 80, y + 176, 180, 31);
    ctx.fillStyle = '#d5d9cc'; ctx.fillRect(x + 83, y + 178, 174, 23);
    ctx.fillStyle = '#e4e7da'; ctx.fillRect(x + 85, y + 178, 170, 4);
    ctx.fillStyle = '#657168'; ctx.fillRect(x + 80, y + 202, 180, 5);
    drawCupAt(ctx, x + 98, y + 173);
    drawCupAt(ctx, x + 205, y + 173);
  }
}

function drawLobbyReception(ctx: CanvasRenderingContext2D, state: GameState, view: ViewRect): void {
  for (const room of state.room.offices) {
    if (room.kind !== 'lobby') continue;
    if (!roomVisible(view, room)) continue;
    const x = (room.x - 1) * TILE + 96, y = (room.y - 1) * TILE + 120;
    drawReferenceCounter(ctx, x, y, 178, 45);
    drawReferenceCounter(ctx, x, y + 42, 42, 88);

    const mx = x + 109, my = y - 18;
    ctx.fillStyle = '#333b43'; ctx.fillRect(mx, my, 26, 22);
    ctx.fillStyle = '#98b7c0'; ctx.fillRect(mx + 3, my + 3, 20, 14);
    ctx.fillStyle = '#e1ebd6'; ctx.fillRect(mx + 5, my + 5, 12, 1);
    ctx.fillStyle = '#c6ddd0'; ctx.fillRect(mx + 5, my + 9, 15, 1);
    ctx.fillStyle = '#d6e7d1'; ctx.fillRect(mx + 5, my + 13, 8, 1);
    ctx.fillStyle = '#4a4740'; ctx.fillRect(mx + 10, my + 19, 6, 3);
    ctx.fillStyle = '#302e2b'; ctx.fillRect(mx + 6, my + 22, 14, 2);
    ctx.fillStyle = '#cfcfc0'; ctx.fillRect(x + 108, y + 11, 24, 7);
    ctx.fillStyle = '#3b3f42'; ctx.strokeRect(x + 108, y + 11, 24, 7);
    for (let yy = 1; yy < 6; yy += 2) for (let xx = 2; xx < 22; xx += 3) {
      ctx.fillStyle = '#636b70'; ctx.fillRect(x + 108 + xx, y + 11 + yy, 2, 1);
    }
    drawCupAt(ctx, x + 135, y + 3);
    ctx.drawImage(chair(2, 'back'), x + 105, y - 60, 27, 34);
  }
}

function drawReferenceCounter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#242a3080'; ctx.fillRect(x + 5, y + 6, w, h);
  ctx.fillStyle = '#44534e'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#a9b4ae'; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = '#dfe5d6'; ctx.fillRect(x + 3, y + 3, w - 6, 3);
  ctx.fillStyle = '#767f76'; ctx.fillRect(x + 3, y + h - 9, w - 6, 7);
  for (let xx = x + 3; xx < x + w - 3; xx += 34) {
    ctx.fillStyle = '#4f5e54'; ctx.fillRect(xx, y + h - 9, 1, 7);
    ctx.fillStyle = '#bfcbbb'; ctx.fillRect(xx + 10, y + h - 7, 9, 1);
  }
}

function drawRestCoffeeCounter(ctx: CanvasRenderingContext2D, state: GameState, view: ViewRect): void {
  for (const room of state.room.offices) {
    if (room.kind !== 'rest') continue;
    if (!roomVisible(view, room)) continue;
    const x = (room.x + room.w) * TILE - 79, y = room.y * TILE + 145;
    drawReferenceCounter(ctx, x, y, 40, 36);
    drawCoffeeMachine(ctx, x + 6, y - 8);
  }
}

function drawCounterTile(ctx: CanvasRenderingContext2D, state: GameState, x: number, y: number): void {
  const px = x * TILE, py = y * TILE;
  const room = officeAt(state.room.offices, x, y);
  if (room?.kind === 'kitchen' || room?.kind === 'lobby') return;
  if (room?.kind === 'rest' && x === room.x + room.w - 3 && y === room.y + 4) return;
  ctx.fillStyle = '#424644'; ctx.fillRect(px, py + 1, TILE, TILE - 1);
  ctx.fillStyle = '#b1b8b4'; ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 8);
  ctx.fillStyle = '#dce1d7'; ctx.fillRect(px + 3, py + 3, TILE - 6, 4);
  ctx.fillStyle = '#777d72'; ctx.fillRect(px, py + TILE - 6, TILE, 6);
  ctx.fillStyle = '#657168'; ctx.fillRect(px + 5, py + TILE - 8, TILE - 10, 2);

}

function drawTileBase(ctx: CanvasRenderingContext2D, state: GameState, t: number, x: number, y: number, tiles: Tiles): void {
  const px = x * TILE, py = y * TILE;
  if (t === T.WALL) {
    drawWallTile(ctx, state, tiles, x, y);
    return;
  }
  if (t === T.DOOR) {
    const room = officeAt(state.room.offices, x, y);
    if (room?.kind === 'conference') {
      // Abertura transitable con umbral de madera; la referencia no tiene hojas ni marcos de puerta.
      ctx.fillStyle = '#b99160'; ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = '#cfac78'; ctx.fillRect(px, py, TILE, 2);
      ctx.fillStyle = '#957145'; ctx.fillRect(px, py + 15, TILE, 1); ctx.fillRect(px, py + TILE - 1, TILE, 1);
      return;
    }
    if (room?.kind === 'kitchen') drawCheckerTile(ctx, px, py, FLOORS.kitchen[(x + y) % 2]);
    else if (room) drawWoodTile(ctx, px, py, x, y, FLOORS[room.kind][0]);
    else drawCheckerTile(ctx, px, py, FLOORS.hall[(x + y) % 2]);
    ctx.fillStyle = '#493e34'; ctx.fillRect(px, py, TILE, 2); ctx.fillRect(px, py + TILE - 3, TILE, 3);
    ctx.fillStyle = '#dfb37b'; ctx.fillRect(px, py + TILE - 4, TILE, 1);
    return;
  }
  const office = officeAt(state.room.offices, x, y);
  const style = office && state.floorStyles.find((entry) => entry.officeId === office.id);
  if (style) {
    if (style.pattern === 'wood') { drawWoodTile(ctx, px, py, x, y, style.color, style.color); return; }
    const dark = style.pattern === 'checker' && ((x - office!.x + y - office!.y) % 2 === 1);
    ctx.fillStyle = dark ? shade(style.color, -28) : style.color;
    ctx.fillRect(px, py, TILE, TILE);
    return;
  }
  const kind: keyof typeof FLOORS = t === T.BOSS ? 'boss' : t === T.CONF ? 'conference' : t === T.LOBBY ? 'lobby' : t === T.KITCHEN ? 'kitchen' : t === T.REST ? 'rest' : t === T.OFFICE ? 'office' : 'hall';
  if (kind === 'hall') { drawCheckerTile(ctx, px, py, FLOORS.hall[(x + y) % 2]); return; }
  if (kind === 'kitchen') { drawCheckerTile(ctx, px, py, FLOORS.kitchen[(x + y) % 2]); return; }
  drawWoodTile(ctx, px, py, x, y, FLOORS[kind][0]);
}

function drawRoomTable(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, kind: string): void {
  const conference = kind === 'conference';
  const offsetX = kind === 'rest' ? 3 : kind === 'lobby' ? 37 : 0;
  const offsetY = conference ? 22 : kind === 'rest' ? 3 : kind === 'lobby' ? -3 : 0;
  const px = x * TILE + offsetX, py = y * TILE + offsetY;
  const w = kind === 'rest' ? 90 : kind === 'lobby' ? 99 : width * TILE;
  const h = conference ? 61 : kind === 'rest' ? 48 : kind === 'lobby' ? 54 : height * TILE;
  ctx.fillStyle = '#34343a55'; ctx.fillRect(px + 3, py + 5, w - 1, h - 3);
  ctx.fillStyle = '#473e34'; ctx.fillRect(px, py, w, h - 2);
  ctx.fillStyle = '#6e5338'; ctx.fillRect(px + 3, py + 3, w - 6, h - 7);
  ctx.fillStyle = '#b39165'; ctx.fillRect(px + 5, py + 4, w - 10, h - 13);
  ctx.fillStyle = '#c4a474'; ctx.fillRect(px + 7, py + 6, w - 14, 3);
  ctx.fillStyle = '#8a6745'; ctx.fillRect(px + 4, py + h - 9, w - 8, 3);
  ctx.fillStyle = '#d1b17f'; ctx.fillRect(px + 6, py + h - 6, w - 12, 1);

  if (conference && w >= 128) {
    const center = px + Math.floor(w / 2);
    ctx.fillStyle = '#37434e'; ctx.fillRect(center - 16, py + 10, 32, 20);
    ctx.fillStyle = '#788e9e'; ctx.fillRect(center - 14, py + 12, 28, 14);
    ctx.fillStyle = '#dbe6cd'; ctx.fillRect(center - 11, py + 14, 22, 1);
    ctx.fillStyle = '#afcbcb'; ctx.fillRect(center - 9, py + 18, 18, 1);
    ctx.fillStyle = '#37434e'; ctx.fillRect(center - 3, py + 30, 6, 3);
    ctx.fillStyle = '#d6d9ce'; ctx.fillRect(px + 50, py + 27, 18, 13);
    ctx.fillStyle = '#a7a48d'; ctx.fillRect(px + 53, py + 30, 12, 1); ctx.fillRect(px + 53, py + 34, 9, 1);
    ctx.fillStyle = '#d6d9ce'; ctx.fillRect(px + w - 72, py + 26, 18, 13);
    ctx.fillStyle = '#a7a48d'; ctx.fillRect(px + w - 69, py + 29, 12, 1); ctx.fillRect(px + w - 69, py + 33, 9, 1);
    ctx.fillStyle = '#ece5ce'; ctx.fillRect(px + 100, py + 28, 9, 10);
    ctx.fillStyle = '#6b3b1a'; ctx.fillRect(px + 102, py + 30, 5, 3);
    ctx.strokeStyle = '#d6d5c3'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(px + 109, py + 32, 3, -Math.PI / 2, Math.PI / 2); ctx.stroke();
  } else {
    const detailY = kind === 'rest' ? 13 : kind === 'lobby' ? 15 : h - 19;
    const notebookX = kind === 'rest' ? 20 : kind === 'lobby' ? 22 : 9;
    ctx.fillStyle = '#ece5ce'; ctx.fillRect(px + Math.floor(w * 0.72), py + detailY, 8, 9);
    ctx.fillStyle = '#6b3b1a'; ctx.fillRect(px + Math.floor(w * 0.72) + 2, py + detailY + 2, 4, 3);
    ctx.fillStyle = '#c8c2a9'; ctx.fillRect(px + notebookX, py + detailY, 13, 8);
    ctx.fillStyle = '#8b927e'; ctx.fillRect(px + notebookX + 2, py + detailY + 3, 9, 1);
  }
}

function drawTileDetails(ctx: CanvasRenderingContext2D, state: GameState, t: number, x: number, y: number, tiles: Tiles): void {
  const px = x * TILE, py = y * TILE;
  if (t === T.DESK) {
    // El tablero ocupa cuatro tiles; el sprite incluye pantallas, teclado y patas.
    let start = x;
    while (tiles[y][start - 1] === T.DESK) start--;
    if (x === start) ctx.drawImage((roomKindAt(state, x, y) === 'boss' ? deskBoss : desk)(start + y), start * TILE, py - 24);
  } else if (t === T.TABLE) {
    if (tiles[y - 1]?.[x] === T.TABLE || tiles[y][x - 1] === T.TABLE) return;
    let width = 1, height = 1;
    while (tiles[y][x + width] === T.TABLE) width++;
    while (tiles[y + height]?.[x] === T.TABLE) height++;
    const room = officeAt(state.room.offices, x, y);
    drawRoomTable(ctx, x, y, width, height, room?.kind ?? '');
  } else if (t === T.CHAIR) {
    const tableBelow = tiles[y + 1]?.[x] === T.TABLE;
    const tableAbove = tiles[y - 1]?.[x] === T.TABLE;
    const counterAbove = tiles[y - 1]?.[x] === T.COUNTER;
    const room = officeAt(state.room.offices, x, y);
    if (room?.kind === 'lobby') {
      return; // La silla de recepción se dibuja en su ancla exacta de píxeles.
    } else if (room?.kind === 'kitchen' && counterAbove) {
      ctx.drawImage(chair(chairVariant(state, x, y), 'front'), px + (x - room.x === 3 ? 8 : 24), py - 6, 27, 34);
    } else if (tableAbove) {
      ctx.save();
      ctx.translate(px, py + TILE);
      ctx.scale(1, -1);
      ctx.drawImage(chair(chairVariant(state, x, y), 'back'), 0, 0, TILE, TILE);
      ctx.restore();
    } else {
      ctx.drawImage(chair(chairVariant(state, x, y), tableBelow ? 'front' : 'back'), px, py, TILE, TILE);
    }
  } else if (t === T.COUNTER) {
    drawCounterTile(ctx, state, x, y);
  } else if (t === T.SOFA) {
    // Sillón orientado hacia la mesa cercana; dibujamos respaldo, brazos y cojín por separado.
    const facing = tiles[y + 1]?.[x] === T.ROUND_TABLE ? 0
      : tiles[y - 1]?.[x] === T.ROUND_TABLE ? Math.PI
        : tiles[y][x + 1] === T.ROUND_TABLE ? -Math.PI / 2
          : tiles[y][x - 1] === T.ROUND_TABLE ? Math.PI / 2 : 0;
    ctx.save();
    ctx.translate(px + TILE / 2, py + TILE / 2);
    ctx.rotate(facing);
    ctx.fillStyle = '#34343a44'; ctx.beginPath(); ctx.ellipse(0, 10, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#364750'; ctx.fillRect(-14, -13, 28, 26);
    ctx.fillStyle = '#657d8b'; ctx.fillRect(-11, -12, 22, 8);
    ctx.fillStyle = '#8da4ab'; ctx.fillRect(-10, -3, 20, 13);
    ctx.fillStyle = '#a9b9b5'; ctx.fillRect(-8, -1, 16, 8);
    ctx.fillStyle = '#3a5660'; ctx.fillRect(-14, -3, 4, 12); ctx.fillRect(10, -3, 4, 12);
    ctx.fillStyle = '#d1ddd2'; ctx.fillRect(-7, -10, 14, 1);
    ctx.fillStyle = '#263b43'; ctx.fillRect(-11, 12, 3, 2); ctx.fillRect(8, 12, 3, 2);
    ctx.restore();
  } else if (t === T.ROUND_TABLE) {
    // Una sola mesa redonda por cada bloque 2x2
    if (tiles[y - 1]?.[x] !== T.ROUND_TABLE && tiles[y][x - 1] !== T.ROUND_TABLE) {
      ctx.save();
      const cx = px + TILE, cy = py + TILE;
      ctx.fillStyle = '#34343a44'; ctx.beginPath(); ctx.ellipse(cx, cy + 4, TILE - 4, TILE - 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#473e34'; ctx.beginPath(); ctx.arc(cx, cy, TILE - 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6e5338'; ctx.beginPath(); ctx.arc(cx, cy - 1, TILE - 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b39165'; ctx.beginPath(); ctx.arc(cx, cy - 2, TILE - 8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#c4a474'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy - 2, TILE - 11, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
       // Taza y libreta: detalles pequeños de la mesa baja, sin vegetación.
       ctx.fillStyle = '#4c5658'; ctx.fillRect(cx - 8, cy - 6, 8, 7);
       ctx.fillStyle = '#dbd2b1'; ctx.fillRect(cx - 7, cy - 6, 6, 5);
       ctx.fillStyle = '#aaa383'; ctx.fillRect(cx - 6, cy - 4, 4, 1);
       ctx.fillStyle = '#ece5ce'; ctx.fillRect(cx + 4, cy - 4, 5, 5);
       ctx.fillStyle = '#6b3b1a'; ctx.fillRect(cx + 5, cy - 3, 3, 2);
       ctx.strokeStyle = '#d6d5c3'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx + 9, cy - 2, 2, -Math.PI / 2, Math.PI / 2); ctx.stroke();
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

/** Escala los sprites iniciales a las mismas medidas y anclas en píxeles de la maqueta. */
function drawPlacedFurniture(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  object: GameState['objects'][number],
  def: { type: string; w: number; h: number },
): void {
  const room = officeAt(state.room.offices, object.x, object.y);
  const faceFlipped = room?.kind === 'rest' && def.type === 'sofa_vertical' && object.x === room.x + 2;
  const image = objectSprite(def, object.perspective ?? 'front', !!object.flipped || faceFlipped);
  let x = object.x * TILE, y = object.y * TILE, w = def.w * TILE, h = def.h * TILE;
  if (room?.kind === 'office' || room?.kind === 'boss') {
    if (def.type === 'bookshelf_tall') { w = 56; h = 72; }
    else if (def.type === 'filing') { x = room.x * TILE + 40; y = (room.y + room.h) * TILE - 96; w = 40; h = 48; }
    else if (def.type === 'cooler') { x = room.x * TILE + 40; y = (room.y + room.h) * TILE - 96; w = 30; h = 45; }
    else if (def.type === 'sofa_blue' && room.kind === 'boss') {
      x = (room.x + room.w) * TILE - 150; y = (room.y + room.h) * TILE - 88; w = 110; h = 38;
    }
  } else if (room?.kind === 'conference') {
    if (def.type === 'bookshelf_tall') { x = room.x * TILE + 42; y = room.y * TILE + 76; w = 53; h = 65; }
    else if (def.type === 'plant') {
      x = object.x === room.x + 1 ? room.x * TILE + 44 : (room.x + room.w) * TILE - 79;
      y = (room.y + room.h) * TILE - 91; w = 32; h = 52;
    }
  } else if (room?.kind === 'kitchen' && def.type === 'fridge') {
    x = (room.x + room.w) * TILE - 80; y = room.y * TILE + 79; w = 45; h = 78;
  } else if (room?.kind === 'rest') {
    const center = (room.x + room.w / 2) * TILE;
    if (def.type === 'sofa_wide') { x = center - 85; y = room.y * TILE + 80; w = 170; h = 51; }
    else if (def.type === 'sofa_vertical') {
      x = object.x === room.x + 2 ? center - 158 : center + 104; y = room.y * TILE + 169; w = 54; h = 117;
    } else if (def.type === 'plant') {
      x = object.y === room.y + 2 && object.x === room.x + 1
        ? room.x * TILE + 42
        : (room.x + room.w) * TILE - (object.y === room.y + 2 ? 79 : 75);
      y = object.y === room.y + 2 ? room.y * TILE + 87 : (room.y + room.h) * TILE - 88;
      w = 32; h = 52;
    }
  } else if (room?.kind === 'lobby') {
    const outerX = (room.x - 1) * TILE, outerY = (room.y - 1) * TILE;
    const outerW = (room.w + 2) * TILE, wx = outerX + outerW - 410, wy = outerY + 64;
    if (def.type === 'sofa_blue') { x = wx + 45; y = wy + 16; w = 175; h = 52; }
    else if (def.type === 'sofa_vertical_blue') {
      x = object.x === room.x + room.w - 14 ? wx - 23 : wx + 262;
      y = wy + 91; w = 50; h = 105;
    } else if (def.type === 'plant') {
      x = object.x === room.x + room.w - 14 ? wx - 32 : wx + 276;
      y = wy - (object.x === room.x + room.w - 14 ? 14 : 16); w = 32; h = 52;
    }
  }
  ctx.drawImage(image, x, y, w, h);
}

function drawReferenceRug(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = '#34343a3b'; ctx.fillRect(x + 5, y + 6, w, h);
  ctx.fillStyle = '#4f686d'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#acb8a7'; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
  ctx.fillStyle = color; ctx.fillRect(x + 7, y + 7, w - 14, h - 14);
  for (let yy = y + 9; yy < y + h - 8; yy += 4) {
    for (let xx = x + 9; xx < x + w - 8; xx += 4) {
      ctx.fillStyle = ((xx + yy) % 8) ? '#728789' : '#91a29b';
      ctx.fillRect(xx, yy, 2, 2);
    }
  }
}

/** Une los módulos persistidos del preset en las alfombras únicas de la maqueta. */
function drawPresetRugs(ctx: CanvasRenderingContext2D, state: GameState, view: ViewRect): Set<number> {
  const hidden = new Set<number>();
  let rugs: Map<string, GameState['objects'][number]> | null = null;
  for (const room of state.room.offices) {
    if (room.kind !== 'conference' && room.kind !== 'rest' && room.kind !== 'lobby') continue;
    if (!roomVisible(view, room, TILE * 6)) continue;
    if (!rugs) rugs = new Map(state.objects.filter((object) => object.type === 'rug').map((object) => [`${object.x}:${object.y}`, object]));
    let positions: Array<[number, number]> = [];
    let rect: { x: number; y: number; w: number; h: number; color: string } | null = null;
    if (room.kind === 'conference') {
      const perSide = Math.ceil(state.room.size.offices / 2);
      const tableWidth = perSide + 2;
      const tableX = room.x + 1 + Math.floor((room.w - 2 - tableWidth) / 2);
      const columns = Math.min(Math.floor((room.w - 2) / 3), Math.ceil((tableWidth + 2) / 3));
      const startX = tableX + Math.ceil((tableWidth - columns * 3) / 2);
      for (const y of [room.y + 3, room.y + 5, room.y + 7]) {
        for (let column = 0; column < columns; column++) positions.push([startX + column * 3, y]);
      }
      rect = { x: tableX * TILE - 33, y: room.y * TILE + 97, w: tableWidth * TILE + 66, h: 169, color: '#829491' };
    } else if (room.kind === 'rest') {
      positions = [room.y + 4, room.y + 6].flatMap((y) => [room.x + 3, room.x + 6, room.x + 9].map((x) => [x, y] as [number, number]));
      rect = { x: (room.x + room.w / 2) * TILE - 123, y: room.y * TILE + 151, w: 246, h: 148, color: '#83908b' };
    } else if (room.kind === 'lobby') {
      positions = [room.y + 2, room.y + 4, room.y + 6].flatMap((y) =>
        Array.from({ length: 4 }, (_, column) => [room.x + room.w - 14 + column * 3, y] as [number, number]),
      );
      const outerX = (room.x - 1) * TILE, outerY = (room.y - 1) * TILE;
      const outerW = (room.w + 2) * TILE, wx = outerX + outerW - 410, wy = outerY + 64;
      rect = { x: wx - 23, y: wy + 35, w: 335, h: 180, color: '#738990' };
    }
    if (!rect || positions.length === 0) continue;
    const rugMap = rugs;
    const objects = positions.map(([x, y]) => rugMap.get(`${x}:${y}`));
    if (objects.some((object) => !object)) continue;
    drawReferenceRug(ctx, rect.x, rect.y, rect.w, rect.h, rect.color);
    for (const object of objects) if (object) hidden.add(object.id);
  }
  return hidden;
}

function chunkKey(cx: number, cy: number): number { return cy * 8192 + cx; }

function buildTileChunk(state: GameState, cx: number, cy: number): HTMLCanvasElement {
  const { tiles, size } = state.room;
  const x0 = cx * TILE_CHUNK, y0 = cy * TILE_CHUNK;
  const tw = Math.max(1, Math.min(TILE_CHUNK, size.width - x0));
  const th = Math.max(1, Math.min(TILE_CHUNK, size.height - y0));
  const canvas = document.createElement('canvas');
  canvas.width = tw * TILE;
  canvas.height = th * TILE;
  const g = canvas.getContext('2d');
  if (g) {
    g.imageSmoothingEnabled = false;
    g.translate(-x0 * TILE, -y0 * TILE);
    for (let y = y0; y < y0 + th; y++) for (let x = x0; x < x0 + tw; x++) drawTileBase(g, state, tiles[y][x], x, y, tiles);
  }
  return canvas;
}

function tileChunk(state: GameState, cx: number, cy: number): HTMLCanvasElement {
  let cache = tileCaches.get(state);
  if (!cache) { cache = { chunks: new Map(), woodHooked: false }; tileCaches.set(state, cache); }
  const key = chunkKey(cx, cy);
  let chunk = cache.chunks.get(key);
  if (!chunk) { chunk = buildTileChunk(state, cx, cy); cache.chunks.set(key, chunk); }
  if (!cache.woodHooked) {
    const wood = interiorImage('woodTile');
    if (!interiorImageReady(wood)) {
      cache.woodHooked = true;
      wood.addEventListener('load', () => tileCaches.delete(state), { once: true });
    }
  }
  return chunk;
}

/** Invalida la capa base cacheada (p. ej. al cambiar el estilo de suelo de una oficina). */
export function invalidateTiles(state: GameState | null): void {
  if (state) tileCaches.delete(state);
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

  const view: ViewRect = {
    x0: state.cam.x, y0: state.cam.y,
    x1: state.cam.x + canvas.width, y1: state.cam.y + canvas.height,
  };

  // Capa base desde caché por bloques: solo se reconstruye al cambiar el mapa, los estilos
  // de suelo o al cargar la textura de madera. El coste por fotograma ya no crece con el mapa.
  const chunkPx = TILE_CHUNK * TILE;
  const chunkCols = Math.ceil(size.width / TILE_CHUNK);
  const chunkRows = Math.ceil(size.height / TILE_CHUNK);
  const cx0 = Math.max(0, Math.floor(view.x0 / chunkPx));
  const cy0 = Math.max(0, Math.floor(view.y0 / chunkPx));
  const cx1 = Math.min(chunkCols - 1, Math.floor((view.x1 - 1) / chunkPx));
  const cy1 = Math.min(chunkRows - 1, Math.floor((view.y1 - 1) / chunkPx));
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    ctx.drawImage(tileChunk(state, cx, cy), cx * chunkPx, cy * chunkPx);
  }

  drawNorthWallFaces(ctx, state, view);
  drawWallDecorations(ctx, state, view);
  drawKitchenInterior(ctx, state, view);
  drawLobbyReception(ctx, state, view);
  drawRestCoffeeCounter(ctx, state, view);

  // Imágenes de piso: cubren la textura base, pero nunca muebles, objetos ni jugadores.
  for (const decoration of state.floorDecorations) {
    if (intersects(view, decoration.x * TILE, decoration.y * TILE, decoration.w * TILE, decoration.h * TILE)) {
      drawFloorDecoration(ctx, decoration);
    }
  }

  // Alfombras se dibujan antes del mobiliario fijo para que nunca lo tapen.
  const visible = state.objects.filter((o) => {
    const def = state.defs.get(o.type);
    if (!def) return false;
    if (intersects(view, o.x * TILE - OBJECT_MARGIN, o.y * TILE - OBJECT_MARGIN, def.w * TILE + OBJECT_MARGIN * 2, def.h * TILE + OBJECT_MARGIN * 2)) return true;
    const room = officeAt(offices, o.x, o.y);
    return room ? roomVisible(view, room) : false;
  });
  const referenceRugs = drawPresetRugs(ctx, state, view);
  visible
    .filter((o) => state.defs.get(o.type)!.layer === 'floor')
    .filter((o) => !referenceRugs.has(o.id))
    .sort((a, b) => a.y - b.y)
    .forEach((o) => {
      const def = state.defs.get(o.type)!;
      const image = objectSprite(def, o.perspective ?? 'front', o.flipped ?? false);
      ctx.drawImage(image, o.x * TILE, o.y * TILE);
    });

  const x0 = Math.max(0, Math.floor(camX / TILE)), x1 = Math.min(size.width - 1, Math.floor((camX + canvas.width) / TILE));
  const y0 = Math.max(0, Math.floor(camY / TILE)), y1 = Math.min(size.height - 1, Math.floor((camY + canvas.height) / TILE));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) drawTileDetails(ctx, state, tiles[y][x], x, y, tiles);

  // Silla frente al centro de cada escritorio (decorativa, debajo de los jugadores)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (tiles[y][x] === T.DESK) {
        let start = x;
        while (tiles[y][start - 1] === T.DESK) start--;
        if (x !== start + 1) continue;
        ctx.drawImage(chair(chairVariant(state, x, y), 'back'), start * TILE + 48, (y + 1) * TILE, TILE, TILE);
      }
    }
  }

  // Mobiliario sólido sobre los pisos y debajo de personajes/interfaz.
  visible
    .filter((o) => state.defs.get(o.type)!.layer !== 'floor')
    .sort((a, b) => a.y - b.y)
    .forEach((o) => drawPlacedFurniture(ctx, state, o, state.defs.get(o.type)!));

  for (const o of offices) {
    if (!roomVisible(view, o)) continue;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = (o.x + o.w / 2) * TILE;
    if (o.kind === 'lobby') {
      ctx.font = 'bold 14px system-ui';
      ctx.fillStyle = '#f5edcf';
      ctx.fillText('Entrada', cx, (o.y + 0.4) * TILE);
      continue;
    }
    ctx.font = '13px system-ui';
    ctx.fillStyle = '#3f483c';
    ctx.fillText(o.name, cx, (o.y + 0.72) * TILE);
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
