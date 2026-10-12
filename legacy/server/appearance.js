'use strict';

const { sanitizeAccessories } = require('./accessories');

const HEX = /^#[0-9a-f]{6}$/i;
const STYLES = 3;
const COLOR_KEYS = ['skin', 'hair', 'shirt', 'pants'];

/** Valida y normaliza un personaje enviado por el cliente. Devuelve null si es inválido. */
function sanitizeAppearance(a) {
  if (!a || typeof a !== 'object') return null;
  if (a.gender !== 'male' && a.gender !== 'female') return null;
  if (!Number.isInteger(a.style) || a.style < 0 || a.style >= STYLES) return null;
  const out = { gender: a.gender, style: a.style };
  for (const k of COLOR_KEYS) {
    if (typeof a[k] !== 'string' || !HEX.test(a[k])) return null;
    out[k] = a[k].toLowerCase();
  }
  out.acc = sanitizeAccessories(a.acc);
  return out;
}

module.exports = { sanitizeAppearance, STYLES };
