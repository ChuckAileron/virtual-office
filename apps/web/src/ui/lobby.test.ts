import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicRoom } from '@vo/shared';
import { Lobby } from './Lobby';
import { loadRooms, saveSession, type StoredSession } from './storage';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const room: PublicRoom = {
  code: 'ABCD-2345', name: 'Piso de prueba', width: 24, height: 20, offices: 3, players: 0,
};
const session: StoredSession = {
  token: 'test-token',
  user: {
    username: 'test-user',
    appearance: {
      gender: 'male', style: 0, skin: '#ffdcbc', hair: '#0b0b0b', shirt: '#3b82f6', pants: '#334155',
      acc: { hat: null, hatColor: '#ef4444', glasses: null, extra: null, extraColor: '#ef4444' },
    },
  },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const data = url.startsWith('/api/layout') ? { width: 24, height: 20, offices: 3, conference: false, boss: false } : room;
    return { ok: true, json: async () => data };
  }));
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('lista Mis pisos', () => {
  it.each(['crear', 'entrar por código'])('guarda un piso antes de salir del lobby al %s', async (flow) => {
    function AppHarness() {
      const [entered, setEntered] = useState(false);
      return entered
        ? createElement('div', null, 'Dentro del piso')
        : createElement(Lobby, {
          session,
          notice: '',
          onSession: () => {},
          onEnter: () => setEntered(true),
        });
    }

    root = createRoot(container);
    await act(async () => root.render(createElement(AppHarness)));

    if (flow === 'crear') {
      const form = container.querySelector<HTMLFormElement>('#createForm');
      expect(form).not.toBeNull();
      await act(async () => {
        form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    } else {
      const input = container.querySelector<HTMLInputElement>('#joinCode')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, room.code);
      await act(async () => input.dispatchEvent(new Event('input', { bubbles: true })));
      const form = container.querySelector<HTMLFormElement>('#joinForm')!;
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    expect(container.textContent).toContain('Dentro del piso');
    expect(loadRooms()).toEqual([{ code: room.code, name: room.name }]);

    // Cierre de sesión y nuevo montaje del lobby: el piso aún debe aparecer.
    await act(async () => root.unmount());
    saveSession(null);
    root = createRoot(container);
    await act(async () => root.render(createElement(Lobby, {
      session: null,
      notice: '',
      onSession: () => {},
      onEnter: () => {},
    })));
    expect(container.textContent).toContain(room.name);
    expect(container.textContent).toContain(room.code);
  });
});
