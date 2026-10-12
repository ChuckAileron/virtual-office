import { TILE } from './constants';

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** Posición de la cámara en un eje: centra el mapa si cabe, si no sigue al jugador sin salirse. */
export function cameraAxis(mapPx: number, viewPx: number, focusPx: number): number {
  return mapPx <= viewPx ? (mapPx - viewPx) / 2 : clamp(focusPx - viewPx / 2, 0, mapPx - viewPx);
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Convierte coordenadas de mouse (cliente) en coordenadas de tile del mapa. */
export function mouseToTile(
  clientX: number,
  clientY: number,
  rect: Rect,
  canvasW: number,
  canvasH: number,
  cam: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: Math.floor(((clientX - rect.left) * (canvasW / rect.width) + cam.x) / TILE),
    y: Math.floor(((clientY - rect.top) * (canvasH / rect.height) + cam.y) / TILE),
  };
}
