import type { Site } from './types';

/** Structural checks on a normalised site. Returns a list of problems (empty = valid). */
export function validateSite(s: Site): string[] {
  const errs: string[] = [];
  const floorIds = new Set(s.floors.map((f) => f.id));
  const seen = new Set<string>();
  const kind: Record<string, string> = {};
  const reg = (id: string, k: string, floor: string) => {
    if (seen.has(id)) errs.push(`duplicate id ${id}`);
    seen.add(id);
    kind[id] = k;
    if (!floorIds.has(floor)) errs.push(`${id}: unknown floor ${floor}`);
  };
  s.points.forEach((p) => reg(p.id, 'point', p.floor));
  s.cores.forEach((c) => reg(c.id, 'core', c.floor));
  s.places.forEach((p) => reg(p.id, 'place', p.floor));

  s.walks.forEach(([a, b]) => {
    for (const id of [a, b]) if (kind[id] !== 'point') errs.push(`walk ${a}-${b}: ${id} is not a point`);
  });
  s.cores.forEach((c) => {
    if (kind[c.via] !== 'point') errs.push(`core ${c.id}: via ${c.via} is not a point`);
    if (!c.at) errs.push(`core ${c.id}: missing at`);
  });
  s.places.forEach((p) => {
    if (kind[p.via] !== 'point') errs.push(`place ${p.id}: via ${p.via} is not a point`);
    if (!Array.isArray(p.door) || p.door.length !== 2) errs.push(`place ${p.id}: missing door`);
  });

  const placeIds = new Set(s.places.map((p) => p.id));
  const known = (id: string) => id in kind;
  for (const id of [s.defaults.start, s.defaults.dest, ...s.quick, ...s.popular]) {
    // `WC` in quick is a shortcut for "nearest toilet", not a node id
    if (id !== 'WC' && !known(id)) errs.push(`unknown id in defaults/quick/popular: ${id}`);
  }
  Object.keys(s.landmarks ?? {}).forEach((id) => {
    if (!known(id)) errs.push(`landmark on unknown node ${id}`);
  });
  (s.busy ?? []).forEach((z) =>
    z.nodes.forEach((id) => {
      if (!known(id)) errs.push(`busy zone ${z.id}: unknown node ${id}`);
    }),
  );
  Object.keys(s.photos ?? {}).forEach((id) => {
    if (!known(id)) errs.push(`photo on unknown node ${id}`);
  });
  if (!placeIds.has(s.defaults.start) && !known(s.defaults.start)) errs.push('defaults.start is not a node');

  // Every place must be reachable from defaults.start (any edge type, ignoring user toggles).
  const adj: Record<string, string[]> = {};
  const link = (a: string, b: string) => {
    (adj[a] ??= []).push(b);
    (adj[b] ??= []).push(a);
  };
  s.walks.forEach(([a, b]) => link(a, b));
  s.cores.forEach((c) => link(c.id, c.via));
  s.places.forEach((p) => link(p.id, p.via));
  const groups: Record<string, string[]> = {};
  s.cores.forEach((c) => (groups[c.group] ??= []).push(c.id));
  Object.values(groups).forEach((ids) => ids.slice(1).forEach((id) => link(ids[0], id)));
  const reach = new Set([s.defaults.start]);
  const queue = [s.defaults.start];
  while (queue.length)
    for (const v of adj[queue.shift()!] ?? [])
      if (!reach.has(v)) {
        reach.add(v);
        queue.push(v);
      }
  s.places.forEach((p) => {
    if (!reach.has(p.id)) errs.push(`place ${p.id} is not reachable from ${s.defaults.start}`);
  });
  return errs;
}
