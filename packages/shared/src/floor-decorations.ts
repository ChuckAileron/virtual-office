import type { Office } from './types';

export const MAX_FLOOR_DECORATIONS = 100;
export const MAX_FLOOR_DECORATION_DIMENSION = 60;
export const FLOOR_IMAGE_URL_PATTERN = /^\/api\/floor-images\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpg)$/i;

/** La imagen debe cubrir tiles enteros y quedar dentro del interior de un recinto. */
export function floorDecorationFitsOffice(
  offices: Office[],
  x: unknown,
  y: unknown,
  w: unknown,
  h: unknown,
): boolean {
  if (![x, y, w, h].every(Number.isInteger)) return false;
  const px = x as number, py = y as number, width = w as number, height = h as number;
  if (width < 1 || height < 1 || width > MAX_FLOOR_DECORATION_DIMENSION || height > MAX_FLOOR_DECORATION_DIMENSION) return false;
  return offices.some((office) =>
    px >= office.x + 1 && py >= office.y + 1
    && px + width <= office.x + office.w - 1
    && py + height <= office.y + office.h - 1,
  );
}
