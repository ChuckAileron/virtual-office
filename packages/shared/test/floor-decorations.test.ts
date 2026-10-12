import { describe, expect, it } from 'vitest';
import { floorDecorationFitsOffice, generateLayout } from '../src';

describe('decoraciones de piso con imagen', () => {
  const office = generateLayout({ offices: 1 }).offices[0];

  it('acepta un rectángulo de tiles dentro del interior de una oficina', () => {
    expect(floorDecorationFitsOffice([office], office.x + 1, office.y + 1, office.w - 2, office.h - 2)).toBe(true);
  });

  it('rechaza paredes, puertas, valores no enteros y tamaños excesivos', () => {
    expect(floorDecorationFitsOffice([office], office.x, office.y + 1, 1, 1)).toBe(false);
    expect(floorDecorationFitsOffice([office], office.x + 1, office.y + office.h - 2, 1, 2)).toBe(false);
    expect(floorDecorationFitsOffice([office], office.x + 1, office.y + 1, 1.5, 1)).toBe(false);
    expect(floorDecorationFitsOffice([office], office.x + 1, office.y + 1, 61, 1)).toBe(false);
  });

  it('no permite que la imagen cruce el límite de dos oficinas', () => {
    const layout = generateLayout({ offices: 2 });
    const first = layout.offices[0];
    expect(floorDecorationFitsOffice(layout.offices, first.x + 1, first.y + 1, first.w, 1)).toBe(false);
  });
});
