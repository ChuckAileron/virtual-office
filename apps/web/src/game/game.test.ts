import { describe, expect, it } from 'vitest';
import { cameraAxis, clamp, mouseToTile } from './coords';
import { approach, chatBubble, interpolate, isMoving, KeyStack, makePlayer, whereLabel, type GameState } from './state';
import { MoveIntent } from './moveIntent';
import { canPlaceObject } from './placement';
import { randomAppearance } from './appearance';
import { sanitizeAppearance } from '@vo/shared';

describe('coords', () => {
  it('clamp y cameraAxis', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(cameraAxis(100, 200, 50)).toBe(-50);
    expect(cameraAxis(1000, 200, 20)).toBe(0);
    expect(cameraAxis(1000, 200, 990)).toBe(800);
    expect(cameraAxis(1000, 200, 500)).toBe(400);
  });

  it('mouseToTile considera escala del canvas y cámara', () => {
    const rect = { left: 10, top: 20, width: 400, height: 200 };
    expect(mouseToTile(10, 20, rect, 400, 200, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(mouseToTile(10 + 65, 20 + 33, rect, 400, 200, { x: 0, y: 0 })).toEqual({ x: 2, y: 1 });
    // canvas con el doble de resolución que su tamaño en pantalla
    expect(mouseToTile(10 + 33, 20 + 17, rect, 800, 400, { x: 0, y: 0 })).toEqual({ x: 2, y: 1 });
    expect(mouseToTile(10, 20, rect, 400, 200, { x: 64, y: 96 })).toEqual({ x: 2, y: 3 });
  });
});

describe('estado e interpolación', () => {
  it('approach avanza y encaja al llegar', () => {
    const mid = approach(0, 10, 0.016, 14);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(10);
    expect(approach(9.995, 10, 0.016, 14)).toBe(10);
    expect(approach(0, 10, 1, 14)).toBe(10);
  });

  it('interpolate acerca a jugadores y mascotas', () => {
    const p = makePlayer({ id: 'a', name: 'A', appearance: randomAppearance('male'), x: 0, y: 0, dir: 'down', voice: false, idle: false, role: 'member' });
    p.x = 3;
    const state = { players: new Map([['a', p]]), pets: new Map() } as unknown as GameState;
    expect(isMoving(p)).toBe(true);
    for (let i = 0; i < 200; i++) interpolate(state, 0.016);
    expect(p.rx).toBe(3);
    expect(isMoving(p)).toBe(false);
  });

  it('KeyStack: manda la última tecla', () => {
    const k = new KeyStack();
    expect(k.current).toBeNull();
    k.press('up');
    k.press('left');
    expect(k.current).toBe('left');
    k.release('left');
    expect(k.current).toBe('up');
    k.press('up');
    k.clear();
    expect(k.current).toBeNull();
  });

  it('chatBubble recorta y whereLabel usa Pasillo', () => {
    expect(chatBubble('x'.repeat(50))).toBe(`${'x'.repeat(40)}…`);
    expect(chatBubble('hola')).toBe('hola');
    expect(whereLabel([], 1, 1)).toBe('📍 Pasillo');
    expect(whereLabel([{ name: 'Oficina 1', x: 0, y: 0, w: 5, h: 5 } as never], 2, 2)).toMatch(/📍/);
  });
});

describe('MoveIntent (toque vs. pulsación)', () => {
  const makeIntent = (events: string[], now: () => number): MoveIntent =>
    new MoveIntent(
      { move: (d) => events.push(`move:${d}`), turn: (d) => events.push(`turn:${d}`) },
      140,
      110,
      now,
    );

  it('un toque breve solo gira; una pulsación mantenida avanza de forma continua', () => {
    const events: string[] = [];
    let t = 0;
    const intent = makeIntent(events, () => t);

    // Toque breve: se suelta antes del umbral → solo gira.
    intent.press('left');
    t = 80;
    intent.tick('left');
    intent.release('left');
    expect(events).toEqual(['turn:left']);

    // Pulsación mantenida: avanza cada sendMs y no gira al soltar.
    events.length = 0;
    t = 1000;
    intent.press('up');
    t = 1200; // supera el umbral → primer avance
    intent.tick('up');
    t = 1300; // aún no pasan 110ms
    intent.tick('up');
    t = 1320; // segundo avance
    intent.tick('up');
    intent.release('up');
    expect(events).toEqual(['move:up', 'move:up']);
  });

  it('soltar una tecla corta mientras se mantiene otra no interrumpe el movimiento', () => {
    const events: string[] = [];
    let t = 0;
    const intent = makeIntent(events, () => t);
    intent.press('right');
    t = 200;
    intent.tick('right'); // empieza a moverse a la derecha
    intent.press('up'); // combinación: nueva dirección dominante, sin giro
    t = 260;
    intent.release('up'); // toque corto, pero hay otra tecla mantenida → no gira
    t = 320;
    intent.tick('right'); // vuelve a moverse a la derecha
    expect(events).toEqual(['move:right', 'move:right']);
  });

  it('no gira con toques cortos si se camina con otra tecla mantenida', () => {
    const events: string[] = [];
    let t = 0;
    const intent = makeIntent(events, () => t);
    intent.press('left');
    t = 200;
    intent.tick('left'); // caminando a la izquierda
    intent.press('right'); // pulsación corta a la derecha
    t = 240;
    intent.release('right'); // sin giro: es una combinación
    expect(events).toEqual(['move:left']);
    // Al soltar del todo la izquierda, un toque aislado sí gira.
    t = 300;
    intent.release('left');
    events.length = 0;
    t = 400;
    intent.press('up');
    t = 450;
    intent.release('up');
    expect(events).toEqual(['turn:up']);
  });

  it('isWalking: al caminar no se gira, y al parar vuelve a permitirse', () => {
    const events: string[] = [];
    let t = 0;
    const intent = makeIntent(events, () => t);
    expect(intent.isWalking).toBe(false);
    intent.press('left');
    t = 80;
    intent.tick('left');
    intent.release('left'); // toque corto estando quieto → gira
    expect(events).toEqual(['turn:left']);
    expect(intent.isWalking).toBe(false);

    // Caminando: un toque a la derecha no gira aunque se pulse y suelte rápido.
    events.length = 0;
    t = 1000;
    intent.press('left');
    t = 1200;
    intent.tick('left');
    expect(intent.isWalking).toBe(true);
    t = 1300;
    intent.press('right');
    t = 1360;
    intent.release('right');
    expect(events).toEqual(['move:left']);

    // Al soltar la tecla de marcha deja de caminar y el siguiente toque sí gira.
    t = 1400;
    intent.release('left');
    expect(intent.isWalking).toBe(false);
    events.length = 0;
    t = 1500;
    intent.press('up');
    t = 1560;
    intent.release('up');
    expect(events).toEqual(['turn:up']);
  });

  it('al cambiar de dirección mientras camina, el movimiento empieza sin delay', () => {
    const events: string[] = [];
    let t = 0;
    const intent = makeIntent(events, () => t);
    intent.press('left');
    t = 200;
    intent.tick('left');
    intent.press('up');
    intent.tick('up');
    expect(events).toEqual(['move:left', 'move:up']);
    expect(intent.isWalking).toBe(true);
  });
});

describe('placement', () => {
  it('rechaza objetos fuera del mapa', () => {
    const state = {
      room: { size: { width: 4, height: 4 }, tiles: Array.from({ length: 4 }, () => [0, 0, 0, 0]), offices: [] },
      objects: [], defs: new Map(), pets: new Map(),
    } as never;
    const def = { type: 'plant', name: 'Planta', w: 1, h: 1, layer: 'floor' } as never;
    expect(canPlaceObject(state, def, -1, 0)).toBe(false);
    expect(canPlaceObject(state, def, 9, 9)).toBe(false);
  });
});

describe('randomAppearance', () => {
  it.each(['male', 'female'] as const)('genera apariencias válidas (%s)', (g) => {
    for (let i = 0; i < 50; i++) {
      const a = randomAppearance(g);
      expect(a.gender).toBe(g);
      expect(sanitizeAppearance(a)).toEqual(a);
    }
  });

  it('es determinista con un rng fijo', () => {
    expect(randomAppearance('female', () => 0)).toEqual(randomAppearance('female', () => 0));
  });
});
