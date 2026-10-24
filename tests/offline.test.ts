// Everything except Claude runs on the phone. These tests prove it for every place in every building.
import { describe, expect, it } from 'vitest';
import { localMatch, parseTrip } from '../src/ai/localMatch';
import type { Graph } from '../src/data/types';
import { computeRoute, dijkstra } from '../src/engine/route';
import { stepText } from '../src/engine/text';
import { loadGraph } from './helpers';

const sites = ['hospital'].map(loadGraph);

describe.each(sites.map((g) => [g.site.id, g] as [string, Graph]))('%s works fully offline', (_id, g) => {
  const places = g.site.places;
  const spots = g.startable;

  it('every spot can reach every place (all pairs, no Claude, no network)', () => {
    let pairs = 0;
    const missing: string[] = [];
    for (const a of spots)
      for (const p of places) {
        if (a === p.id) continue;
        pairs++;
        if (!dijkstra(g, a, p.id)) missing.push(`${a}->${p.id}`);
      }
    expect(missing).toEqual([]);
    expect(pairs).toBeGreaterThan(places.length);
  });

  it('every route has readable steps in Hindi and English', () => {
    const from = g.site.defaults.start;
    for (const p of places) {
      const r = computeRoute(g, from, p.id);
      if (r.status !== 'ok') continue;
      for (const lang of ['en', 'hi'] as const)
        for (const st of r.steps) expect(stepText(g, r, st, lang)).not.toMatch(/undefined|null|NaN/);
    }
  });

  it('every place is found by its own English name, Hindi name and code', () => {
    const miss: string[] = [];
    for (const p of places)
      for (const q of [p.enS, p.hiS, p.en, p.id]) {
        const top = localMatch(g, q, p.floor)[0];
        const ok =
          top &&
          (top.id === p.id ||
            (top.en === p.en && top.floor === p.floor) ||
            (top.code === 'WC' && p.code === 'WC' && top.floor === p.floor));
        if (!ok) miss.push(`${p.id} "${q}" → ${top?.id}`);
      }
    expect(miss).toEqual([]);
  });
});

describe('hospital: "I am at X, I need Y" offline for many pairs', () => {
  const g = sites[0];
  const rooms = g.site.places.filter((p) => p.num && !p.gate);
  it('understands "main <room> mein hoon aur mujhe <room> jana hai" for every numbered room pair sample', () => {
    const bad: string[] = [];
    for (let i = 0; i < rooms.length; i += 3)
      for (let j = 1; j < rooms.length; j += 7) {
        const a = rooms[i],
          b = rooms[j];
        if (a.id === b.id) continue;
        const t = parseTrip(g, `main ${a.id} mein hoon aur mujhe ${b.id} jana hai`, 'GF');
        if (t.start !== a.id || t.dest !== b.id) bad.push(`${a.id}->${b.id}: ${JSON.stringify(t)}`);
      }
    expect(bad).toEqual([]);
  });
});
