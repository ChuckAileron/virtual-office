import { sanitizeAccessories } from './accessories';
import { Appearance } from './types';

const HEX = /^#[0-9a-f]{6}$/i;
export const STYLES = 3;
const COLOR_KEYS = ['skin', 'hair', 'shirt', 'pants'] as const;

/** Valida y normaliza un personaje enviado por el cliente. Devuelve null si es inválido. */
export function sanitizeAppearance(a: unknown): Appearance | null {
  if (!a || typeof a !== 'object') return null;
  const src = a as Record<string, unknown>;
  if (src.gender !== 'male' && src.gender !== 'female') return null;
  if (typeof src.style !== 'number' || !Number.isInteger(src.style) || src.style < 0 || src.style >= STYLES) return null;
  const colors: Partial<Record<(typeof COLOR_KEYS)[number], string>> = {};
  for (const k of COLOR_KEYS) {
    const v = src[k];
    if (typeof v !== 'string' || !HEX.test(v)) return null;
    colors[k] = v.toLowerCase();
  }
  return {
    gender: src.gender,
    style: src.style,
    skin: colors.skin!,
    hair: colors.hair!,
    shirt: colors.shirt!,
    pants: colors.pants!,
    acc: sanitizeAccessories(src.acc),
  };
}
