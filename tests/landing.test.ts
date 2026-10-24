import { describe, expect, it } from 'vitest';
import { buildGraph } from '../src/engine/graph';
import { parseSite } from '../src/data/loadSites';
import { DEMOS, answer } from '../src/landing/scenarios';
import { storyFacts } from '../src/landing/story';
import hospital from '../public/sites/hospital/site.json';

const g = buildGraph(parseSite(hospital));

describe('landing demos', () => {
  it('every demo question finds a place and a route', () => {
    for (const d of DEMOS) {
      const a = answer(g, d.q, d.from);
      expect(a, d.q).not.toBeNull();
      expect(a!.route.path.length).toBeGreaterThan(1);
    }
  });

  it('"mausa ko blood chahiye" goes to the Blood Bank on the first floor', () => {
    const a = answer(g, 'mausa ko blood chahiye', 'GF-GATE3');
    expect(a?.place.id).toBe('101');
    expect(a?.place.floor).toBe('1F');
  });

  it('returns null for nonsense', () => {
    expect(answer(g, 'zzqqxx', 'GF-GATE3')).toBeNull();
  });
});

describe('landing story', () => {
  it('the demo trip uses a lift, and the detour avoids that lift', () => {
    const f = storyFacts(g);
    const liftGroups = (path: string[]) =>
      path
        .map((id) => g.site.cores.find((c) => c.id === id))
        .filter((c) => c?.kind === 'lift')
        .map((c) => c!.group);
    const used = liftGroups(f.main.path);
    expect(used.length).toBeGreaterThan(0);
    expect(f.detour).not.toBeNull();
    expect(liftGroups(f.detour!.path)).not.toContain(used[0]);
  });
});
