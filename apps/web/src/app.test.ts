import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('arranque de la app', () => {
  it('muestra el loader mientras carga y luego la pantalla de inicio de sesión', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ janusUrl: null }) })));
    root = createRoot(container);
    await act(async () => { root.render(createElement(App)); });

    expect(container.querySelector('#loader')).not.toBeNull();
    expect(container.querySelector('#authCard')).toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(600); });

    expect(container.querySelector('#loader')).toBeNull();
    expect(container.querySelector('#authCard')).not.toBeNull();
  });

  it('muestra un error con reintento si el servidor no responde', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin conexión'); }));
    root = createRoot(container);
    await act(async () => { root.render(createElement(App)); });
    await act(async () => { await Promise.resolve(); });

    const loader = container.querySelector('#loader');
    expect(loader).not.toBeNull();
    expect(loader!.textContent).toContain('No se pudo conectar con el servidor');
    expect(loader!.querySelector('button')).not.toBeNull();
  });
});
