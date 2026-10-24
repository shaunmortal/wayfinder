import { describe, expect, it } from 'vitest';
import { classifyIssue } from '../src/engine/issue';
import { computeRoute } from '../src/engine/route';
import type { Core } from '../src/data/types';
import { loadGraph } from './helpers';

const g = loadGraph('hospital');
const ok = (r: ReturnType<typeof computeRoute>) => {
  if (r.status !== 'ok') throw new Error('no route');
  return r;
};

describe('problems reported on the way (offline)', () => {
  it.each([
    ['lift kharab hai', 'lift'],
    ['लिफ्ट बंद है', 'lift'],
    ['the lift is not working', 'lift'],
    ['aage rasta band hai', 'block'],
    ['yahan safai chal rahi hai, geela hai', 'block'],
    ['main seedhi nahi chadh sakta', 'stairs'],
    ['wheelchair hai mere paas', 'stairs'],
    ['kitna time lagega', null],
  ])('%s → %s', (text, want) => expect(classifyIssue(text)).toBe(want));

  it('203 → 304: with its lift out of order the route uses another lift or the stairs', () => {
    const r = ok(computeRoute(g, '203', '304'));
    const ls = r.steps.find((s) => s.kind === 'lift');
    expect(ls).toBeTruthy();
    const group = (g.nodes[r.path[ls!.kind === 'lift' ? ls!.v0 : 0]].ref as Core).group;
    const r2 = ok(computeRoute(g, '203', '304', { blockedGroups: new Set([group]) }));
    const used = r2.steps
      .filter((s) => s.kind === 'lift' || s.kind === 'stairs')
      .map((s) => (g.nodes[r2.path[s.kind === 'lift' || s.kind === 'stairs' ? s.v0 : 0]].ref as Core).group);
    expect(used).not.toContain(group);
  });

  it('a blocked corridor stretch is avoided', () => {
    const r = ok(computeRoute(g, 'GF-GATE3', 'G-20'));
    // a stretch in the middle of the walk (blocking the only way in from a gate would leave no route at all)
    const i = Math.floor(r.path.length / 2);
    const a = r.path[i],
      b = r.path[i + 1];
    const r2 = ok(computeRoute(g, 'GF-GATE3', 'G-20', { blockedEdges: new Set([`${a}|${b}`, `${b}|${a}`]) }));
    expect(r2.path.some((id, k) => id === a && r2.path[k + 1] === b)).toBe(false);
  });
});
