// Crowd-aware route choice that works offline: no live counts, only the hospital's usual busy hours (from the
// data) plus spreading visitors across near-equal routes so one corridor does not fill up.
import type { BusyZone, Graph, Route, RouteOpts } from '../data/types';
import { computeRoute, dijkstra, routeFromPath } from './route';

type Ok = Extract<Route, { status: 'ok' }>;

export const zonesAt = (g: Graph, hour: number): BusyZone[] =>
  (g.site.busy ?? []).filter((z) => z.hours.some(([a, b]) => hour >= a && hour < b));

/** node id -> crowd level (0-3) at this hour. */
export function crowdLevels(g: Graph, hour: number): Record<string, number> {
  const lv: Record<string, number> = {};
  for (const z of zonesAt(g, hour)) for (const id of z.nodes) lv[id] = Math.max(lv[id] ?? 0, z.level);
  return lv;
}

/** Live walkers: 10 or more people already on a corridor point counts as very crowded (the "10 log" rule). */
export const LIVE_LIMIT = 10;
export function liveLevels(live: Record<string, number>): Record<string, number> {
  const lv: Record<string, number> = {};
  for (const [id, n] of Object.entries(live)) if (n >= 2) lv[id] = n >= LIVE_LIMIT ? 3 : n >= LIVE_LIMIT / 2 ? 2 : 1;
  return lv;
}

/** Walking along a crowded corridor counts as 1.5x / 2x / 2.5x longer for levels 1 / 2 / 3. */
const multFor = (lv: Record<string, number>) => (a: string, b: string) => 1 + 0.5 * Math.min(lv[a] ?? 0, lv[b] ?? 0);

/** Metres of a route that run through crowded corridors, weighted by level. */
export function crowdScore(g: Graph, path: string[], lv: Record<string, number>) {
  let s = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = g.nodes[path[i]],
      b = g.nodes[path[i + 1]];
    const l = Math.min(lv[path[i]] ?? 0, lv[path[i + 1]] ?? 0);
    if (l && a.floor === b.floor) s += (Math.hypot(a.x - b.x, a.y - b.y) / 8) * l;
  }
  return s;
}

export interface Plan {
  routes: Ok[]; // 1 or 2 options, shortest first
  scores: number[]; // crowd score per option
  pick: number; // suggested option
  spread: boolean; // true when the options are similar and the pick was made to spread visitors
  zones: BusyZone[][]; // per option: crowded zones it walks through right now
  liveMax: number[] | null; // per option: most people on any of its corridor points (null = no live data)
}

const share = (a: string[], b: string[]) => {
  const s = new Set(a);
  return b.filter((id) => s.has(id)).length / Math.max(a.length, b.length);
};

/**
 * Shortest route plus, when one exists, a genuinely different alternative (at most 60% longer).
 * `seed` (0..1, fixed per phone) splits visitors between near-equal options without any network.
 */
export function planRoutes(
  g: Graph,
  from: string,
  to: string,
  o: RouteOpts,
  hour: number,
  avoid: boolean,
  seed: number,
  live: Record<string, number> | null = null,
): Plan | Route {
  const best = computeRoute(g, from, to, o);
  if (best.status !== 'ok') return best;
  const lv = crowdLevels(g, hour);
  if (live) for (const [id, l] of Object.entries(liveLevels(live))) lv[id] = Math.max(lv[id] ?? 0, l);
  // Alternative 1: the crowd-aware route. Alternative 2: the shortest route that avoids reusing the first one's corridors.
  const used = new Set(best.path.slice(1, -1));
  const cands = [
    dijkstra(g, from, to, { ...o, edgeMult: multFor(lv) }),
    dijkstra(g, from, to, { ...o, edgeMult: (a, b) => (used.has(a) && used.has(b) ? 3 : 1) }),
  ];
  let alt: Ok | null = null;
  for (const c of cands) {
    if (!c || share(best.path, c.path) > 0.75) continue;
    const r = routeFromPath(g, c, o);
    if (r.walk <= best.walk * 1.6) {
      alt = r;
      break;
    }
  }
  const routes = alt ? [best, alt] : [best];
  const scores = routes.map((r) => crowdScore(g, r.path, lv));
  // Effective length = metres walked + half a metre per crowded metre per level (same weighting as the routing).
  const eff = routes.map((r, i) => r.walk + 0.5 * scores[i]);
  let pick = 0,
    spread = false;
  if (alt && avoid) {
    if (Math.abs(eff[0] - eff[1]) <= 0.1 * eff[0]) {
      pick = seed < 0.5 ? 0 : 1; // near-equal: half the phones take each route, so neither corridor fills up
      spread = true;
    } else pick = eff[1] < eff[0] ? 1 : 0;
  }
  // Warn only about zones a route actually walks through (at least one corridor stretch inside the zone).
  const active = zonesAt(g, hour);
  const zones = routes.map(({ path: p }) =>
    active.filter((z) => {
      const inZ = new Set(z.nodes);
      return p.some((id, i) => i > 0 && inZ.has(id) && inZ.has(p[i - 1]));
    }),
  );
  // People on the part of each option that is its own (the shared start near the gate would count for both).
  const shared = routes.length > 1 ? new Set(routes[0].path.filter((id) => routes[1].path.includes(id))) : new Set<string>();
  const liveMax = live
    ? routes.map((r) => {
        const own = r.path.filter((id) => !shared.has(id));
        return Math.max(0, ...(own.length ? own : r.path).map((id) => live[id] ?? 0));
      })
    : null;
  return { routes, scores, pick, spread, zones, liveMax };
}
