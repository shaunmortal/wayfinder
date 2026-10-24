import { describe, expect, it } from 'vitest';
import { computeRoute } from '../src/engine/route';
import { loadGraph } from './helpers';

describe.each(['hospital'])('%s: every place is reachable from defaults.start', (id) => {
  const g = loadGraph(id);
  it('routes to all places', () => {
    const bad = g.site.places.map((p) => p.id).filter((p) => computeRoute(g, g.site.defaults.start, p).status === 'none');
    expect(bad).toEqual([]);
  });
});
