import { sanitizeAccessories } from './accessories';
import { Appearance } from './types';

const HEX = /^#[0-9a-f]{6}$/i;

/** Apariencia por defecto, usada al crear cuentas sin personaje personalizado. */
export const DEFAULT_APPEARANCE: Appearance = {
  gender: 'male',
  style: 0,
  skin: '#f1c27d',
  hair: '#2b2b33',
  shirt: '#4f8cff',
  pants: '#1f2937',
  acc: sanitizeAccessories({}),
};
export const STYLES = 4;
/** Peinado de calvo, reservado a los personajes masculinos. */
export const BALD_STYLE = 3;
const COLOR_KEYS = ['skin', 'hair', 'shirt', 'pants'] as const;

/** Cambio parcial permitido en la apariencia: peinado y colores del cuerpo. */
export type AppearancePatch = Partial<Pick<Appearance, 'style' | 'skin' | 'hair' | 'shirt' | 'pants'>>;

/** Indica si un peinado es válido para el género dado (el calvo solo es masculino). */
export function styleAllowed(gender: Appearance['gender'], style: number): boolean {
  if (!Number.isInteger(style) || style < 0 || style >= STYLES) return false;
  return style !== BALD_STYLE || gender === 'male';
}

/**
 * Valida y normaliza un cambio parcial de apariencia (peinado / colores).
 * Descarta los campos inválidos; siempre devuelve un objeto.
 */
export function sanitizeAppearancePatch(p: unknown): AppearancePatch {
  if (!p || typeof p !== 'object') return {};
  const src = p as Record<string, unknown>;
  const out: AppearancePatch = {};
  if (typeof src.style === 'number' && Number.isInteger(src.style) && src.style >= 0 && src.style < STYLES) out.style = src.style;
  for (const k of COLOR_KEYS) {
    const v = src[k];
    if (typeof v === 'string' && HEX.test(v)) out[k] = v.toLowerCase();
  }
  return out;
}

/** Valida y normaliza un personaje enviado por el cliente. Devuelve null si es inválido. */
export function sanitizeAppearance(a: unknown): Appearance | null {
  if (!a || typeof a !== 'object') return null;
  const src = a as Record<string, unknown>;
  if (src.gender !== 'male' && src.gender !== 'female') return null;
  if (typeof src.style !== 'number' || !styleAllowed(src.gender, src.style)) return null;
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
