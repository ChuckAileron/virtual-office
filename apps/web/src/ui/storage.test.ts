import { beforeEach, describe, expect, it } from 'vitest';
import { loadRooms, loadSession, saveSession, upsertRoom } from './storage';

describe('persistencia local del lobby', () => {
  beforeEach(() => localStorage.clear());

  it('conserva el piso en Mis pisos al cerrar sesión y volver a cargar', () => {
    const room = { code: 'ABCD-2345', name: 'Piso de prueba' };
    saveSession({ token: 'test-token', user: { username: 'test', appearance: {
      gender: 'male', style: 0, skin: '#ffdcbc', hair: '#0b0b0b', shirt: '#3b82f6', pants: '#334155',
      acc: { hat: null, hatColor: '#ef4444', glasses: null, extra: null, extraColor: '#ef4444' },
    } } });
    upsertRoom([], room);

    // Cerrar sesión elimina el token, no los pisos guardados.
    saveSession(null);

    expect(loadSession()).toBeNull();
    expect(loadRooms()).toEqual([room]);
  });
});
