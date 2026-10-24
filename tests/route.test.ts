import { describe, expect, it } from 'vitest';
import { computeRoute } from '../src/engine/route';
import { stepText } from '../src/engine/text';
import { loadGraph } from './helpers';

const hospital = loadGraph('hospital');

describe('hospital routes', () => {
  const kinds = (o = {}) => {
    const r = computeRoute(hospital, '302', 'G-07', o);
    expect(r.status).toBe('ok');
    return r.status === 'ok' ? { r, kinds: r.steps.map((s) => s.kind) } : null;
  };
  it('302 -> G-07 uses the lift', () => {
    const x = kinds()!;
    expect(x.kinds).toContain('lift');
    expect(x.kinds).not.toContain('stairs');
  });
  it('with liftDown it uses stairs', () => {
    const x = kinds({ liftDown: true })!;
    expect(x.kinds).toContain('stairs');
    expect(x.kinds).not.toContain('lift');
  });
  it('stepFree never uses stairs', () => {
    expect(kinds({ stepFree: true })!.kinds).not.toContain('stairs');
  });
  it('same spot gives a same route; steps read in both languages', () => {
    expect(computeRoute(hospital, '302', '302').status).toBe('same');
    const r = computeRoute(hospital, '302', 'G-07');
    if (r.status !== 'ok') throw new Error('no route');
    for (const lang of ['en', 'hi'] as const) {
      const texts = r.steps.map((s) => stepText(hospital, r, s, lang));
      expect(texts.every((x) => x.length > 0 && !x.includes('undefined') && !x.includes('null'))).toBe(true);
    }
  });
});

describe('hospital: several routes, the shortest depends on where you stand', () => {
  const corridorsUsed = (from: string, to: string) => {
    const r = computeRoute(hospital, from, to);
    if (r.status !== 'ok') throw new Error('no route');
    // which corridors (N/S/E/W ring, L = garden walkway) the path walks along
    return new Set(r.path.map((id) => /^[A-Z0-9]+-([NSEWL])\d+$/.exec(id)?.[1]).filter(Boolean));
  };
  it('main gate → Nephrology OPD takes the garden walkway; ambulance gate → same room goes round the west corridor', () => {
    expect(corridorsUsed('GF-GATE3', 'G-20').has('L')).toBe(true);
    const west = corridorsUsed('GF-GATE1', 'G-20');
    expect(west.has('W')).toBe(true);
    expect(west.has('L')).toBe(false);
  });
  it('every floor has 40-50 rooms', () => {
    for (const f of ['GF', '1F', '2F', '3F']) {
      const n = hospital.site.places.filter((p) => p.floor === f && !p.gate).length;
      expect(n).toBeGreaterThanOrEqual(40);
      expect(n).toBeLessThanOrEqual(50);
    }
  });
});
