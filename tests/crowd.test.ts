import { describe, expect, it } from 'vitest';
import { planRoutes, zonesAt, type Plan } from '../src/engine/crowd';
import { loadGraph } from './helpers';

const g = loadGraph('hospital');
const plan = (from: string, to: string, hour: number, avoid = true, seed = 0.3) => planRoutes(g, from, to, {}, hour, avoid, seed) as Plan;

describe('crowd-aware routes (offline estimate from usual busy hours)', () => {
  it('Gate 3 → Blood Bank at 10 am suggests the route that skips the registration rush', () => {
    const p = plan('GF-GATE3', '101', 10);
    expect(p.routes).toHaveLength(2);
    expect(p.pick).toBe(1);
    expect(p.scores[1]).toBeLessThan(p.scores[0]);
    expect(p.routes[1].walk).toBeLessThanOrEqual(p.routes[0].walk * 1.6);
    expect(p.zones[0].map((z) => z.id)).toContain('reg-rush');
  });
  it('the same trip at 9 pm takes the shortest route', () => {
    expect(plan('GF-GATE3', '101', 21).pick).toBe(0);
  });
  it('with "avoid crowds" off it always takes the shortest route', () => {
    expect(plan('GF-GATE3', '101', 10, false).pick).toBe(0);
  });
  it('near-equal routes are split between phones by their fixed seed', () => {
    const a = plan('GF-GATE3', 'G-24', 21, true, 0.2),
      b = plan('GF-GATE3', 'G-24', 21, true, 0.8);
    expect(a.spread && b.spread).toBe(true);
    expect([a.pick, b.pick].sort()).toEqual([0, 1]);
  });
  it('busy hours come from the data', () => {
    expect(zonesAt(g, 10).map((z) => z.id)).toEqual(expect.arrayContaining(['reg-rush', 'billing']));
    expect(zonesAt(g, 17).map((z) => z.id)).toContain('visiting');
  });
});
