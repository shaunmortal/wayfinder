import type { Graph, Route, RouteOpts } from '../data/types';
import { edgeOf, WALK_MPS } from './graph';
import { buildSteps, stepSecs } from './steps';

// ponytail: linear-scan priority queue, fine for ~500 nodes; switch to a binary heap for city-sized graphs.
/** Dijkstra; `edgeMult` lets crowd estimates make some corridors "longer". */
export function dijkstra(g: Graph, from: string, to: string, o: RouteOpts = {}): { path: string[]; cost: number } | null {
  const dist: Record<string, number> = { [from]: 0 };
  const prev: Record<string, string> = {};
  const done = new Set<string>();
  const pq: [number, string][] = [[0, from]];
  while (pq.length) {
    let bi = 0;
    for (let i = 1; i < pq.length; i++) if (pq[i][0] < pq[bi][0]) bi = i;
    const [d, u] = pq.splice(bi, 1)[0];
    if (done.has(u)) continue;
    done.add(u);
    if (u === to) break;
    for (const e of g.adj[u]) {
      if (o.stepFree && e.type === 'stairs') continue;
      if (o.liftDown && e.type === 'lift') continue;
      if (o.blockedEdges?.has(u + '|' + e.to)) continue;
      if (o.blockedGroups && e.type !== 'walk' && o.blockedGroups.has((g.nodes[u].ref as { group?: string } | undefined)?.group ?? ''))
        continue;
      const k = g.nodes[e.to].kind;
      if ((k === 'place' || k === 'gate') && e.to !== to) continue; // never walk through a room or gate
      const nd = d + e.cost * (o.edgeMult && e.type === 'walk' ? o.edgeMult(u, e.to) : 1);
      if (dist[e.to] === undefined || nd < dist[e.to]) {
        dist[e.to] = nd;
        prev[e.to] = u;
        pq.push([nd, e.to]);
      }
    }
  }
  if (dist[to] === undefined) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev[path[0]]);
  return { path, cost: dist[to] };
}

export function computeRoute(g: Graph, from: string, to: string, o: RouteOpts = {}): Route {
  if (from === to) return { status: 'same', path: [from], steps: [] };
  const r = dijkstra(g, from, to, o);
  if (!r) return { status: 'none' };
  return routeFromPath(g, r, o);
}

/** Steps, distance, time and the step-free check for a path found by `dijkstra`. */
export function routeFromPath(g: Graph, r: { path: string[]; cost: number }, o: RouteOpts = {}): Extract<Route, { status: 'ok' }> {
  const from = r.path[0],
    to = r.path[r.path.length - 1];
  const steps = buildSteps(g, r.path);
  let walk = 0,
    secs = 0;
  for (let i = 0; i < r.path.length - 1; i++) {
    const e = edgeOf(g, r.path[i], r.path[i + 1]);
    if (e.type === 'walk') {
      walk += e.len;
      secs += e.len / WALK_MPS;
    }
  }
  steps.forEach((s) => {
    if (s.kind === 'lift' || s.kind === 'stairs') secs += stepSecs(s);
  });
  const stepFree = !!dijkstra(g, from, to, { ...o, edgeMult: undefined, stepFree: true });
  return { status: 'ok', path: r.path, cost: r.cost, steps, walk, secs, mins: Math.max(1, Math.round(secs / 60)), stepFree };
}

/** The closest of several candidate destinations (e.g. every toilet) by route cost. */
export function nearestOf(g: Graph, from: string, ids: string[], o: RouteOpts = {}): string {
  let best: { id: string; cost: number } | null = null;
  for (const id of ids) {
    const r = dijkstra(g, from, id, o);
    if (r && (!best || r.cost < best.cost)) best = { id, cost: r.cost };
  }
  return best ? best.id : ids[0];
}
