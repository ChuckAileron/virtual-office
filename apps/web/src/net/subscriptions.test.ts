import { describe, expect, it, vi } from 'vitest';
import { computeSubscriptions } from './subscriptions';

const pub = (isSubscribed: boolean) => ({ isSubscribed, setSubscribed: vi.fn() });

describe('computeSubscriptions', () => {
  it('suscribe a las publicaciones de los audibles y desuscribe a los demás', () => {
    const a = [pub(false), pub(false)];
    const b = [pub(true)];
    const changes = computeSubscriptions(['a'], [
      { identity: 'a', publications: a },
      { identity: 'b', publications: b },
    ]);
    expect(changes.map((c) => [c.identity, c.subscribe])).toEqual([['a', true], ['a', true], ['b', false]]);
    expect(changes[2].publication).toBe(b[0]);
  });

  it('no devuelve cambios cuando ya coincide', () => {
    expect(computeSubscriptions(['a'], [
      { identity: 'a', publications: [pub(true)] },
      { identity: 'b', publications: [pub(false)] },
    ])).toEqual([]);
  });

  it('sin audibles desuscribe todo y tolera participantes sin publicaciones', () => {
    const p = pub(true);
    const changes = computeSubscriptions([], [
      { identity: 'a', publications: [p] },
      { identity: 'c', publications: [] },
    ]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ identity: 'a', subscribe: false });
  });
});
