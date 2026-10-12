import { describe, expect, it } from 'vitest';
import { ACCESSORY_COLORS, formatCode, normalizeCode, sanitizeAccessories, sanitizeAppearance, validateCredentials } from '../src';

const ok = { gender: 'female', style: 2, skin: '#FFDCBC', hair: '#0b0b0b', shirt: '#ec4899', pants: '#334155' };

describe('credenciales', () => {
  it('valida usuario y contraseña', () => {
    expect(validateCredentials('ana_01', 'secreto1')).toBeNull();
    expect(validateCredentials('a', 'secreto1')).toBeTruthy();
    expect(validateCredentials('ana bad', 'secreto1')).toBeTruthy();
    expect(validateCredentials('ana', '123')).toBeTruthy();
    expect(validateCredentials({}, 'secreto1')).toBeTruthy();
  });
});

describe('códigos', () => {
  it('normaliza y formatea', () => {
    expect(normalizeCode(' ab-cd 12 34 ')).toBe('ABCD1234');
    expect(formatCode('ABCD1234')).toBe('ABCD-1234');
  });
});

describe('apariencia', () => {
  it('normaliza y rechaza datos inválidos', () => {
    expect(sanitizeAppearance(ok)?.skin).toBe('#ffdcbc');
    expect(sanitizeAppearance({ ...ok, gender: 'x' })).toBeNull();
    expect(sanitizeAppearance({ ...ok, style: 9 })).toBeNull();
    expect(sanitizeAppearance({ ...ok, shirt: 'red;}' })).toBeNull();
    expect(sanitizeAppearance(null)).toBeNull();
  });
});

describe('accesorios', () => {
  it('descarta valores desconocidos', () => {
    const acc = sanitizeAccessories({ hat: 'tophat', hatColor: '#EF4444', glasses: 'hack', extra: 'cape', extraColor: 'red;}' });
    expect(acc).toEqual({ hat: 'tophat', hatColor: '#ef4444', glasses: null, extra: 'cape', extraColor: ACCESSORY_COLORS[0] });
    expect(sanitizeAccessories(null)).toEqual({ hat: null, hatColor: ACCESSORY_COLORS[0], glasses: null, extra: null, extraColor: ACCESSORY_COLORS[0] });
  });
});
