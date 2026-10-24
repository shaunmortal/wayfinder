import { localMatch } from '../ai/localMatch';
import { computeRoute } from '../engine/route';
import type { Graph, Place, Route } from '../data/types';

/** Demo questions the landing page cycles through: real visitor phrasing, answered by the offline matcher + Dijkstra. */
export const DEMOS = [
  { q: 'mausa ko blood chahiye', from: 'GF-GATE3' },
  { q: 'X-ray kahan hai?', from: 'GF-GATE1' },
  { q: 'burns ward jaana hai', from: 'GF-GATE2' },
  { q: 'dawai kahan milegi', from: 'GF-GATE3' },
  { q: 'MS office', from: 'GF-GATE1' },
];

export type Answer = { place: Place; route: Extract<Route, { status: 'ok' }> };

/** Free text → best matching place and the shortest route to it from `from`, or null if nothing matches. */
export function answer(g: Graph, q: string, from: string): Answer | null {
  const place = localMatch(g, q, g.nodes[from].floor)[0];
  if (!place || place.id === from) return null;
  const route = computeRoute(g, from, place.id);
  return route.status === 'ok' ? { place, route } : null;
}
