import type { Graph, GNode, Edge, EdgeType, Site } from '../data/types';
import { P, WALL } from '../map2d/projection';

export const SCALE = 8; // plan units per metre
export const WALK_MPS = 1.0;

export const edgeOf = (g: Graph, a: string, b: string): Edge => g.adj[a].find((e) => e.to === b)!;
export const STARTABLE_KINDS = ['place', 'gate', 'lift', 'stairs'];

export function buildGraph(site: Site): Graph {
  const nodes: Record<string, GNode> = {};
  const adj: Record<string, Edge[]> = {};
  const floors: Graph['floors'] = {};
  site.floors.forEach((f, i) => {
    floors[f.id] = { ...f, i };
  });

  const add = (n: GNode) => {
    if (nodes[n.id]) throw new Error('Duplicate node ' + n.id);
    nodes[n.id] = n;
    adj[n.id] = [];
  };
  const link = (a: string, b: string, type: EdgeType, extra = 0, len?: number) => {
    const A = nodes[a],
      B = nodes[b];
    if (!A || !B) throw new Error(`Unknown node in link: ${a} / ${b}`);
    const l = len ?? Math.hypot(A.x - B.x, A.y - B.y) / SCALE;
    const cost = l + extra;
    adj[a].push({ to: b, type, len: l, cost });
    adj[b].push({ to: a, type, len: l, cost });
  };

  site.points.forEach((p) => add({ id: p.id, floor: p.floor, x: p.x, y: p.y, kind: 'corr' }));
  site.walks.forEach(([a, b]) => link(a, b, 'walk'));
  site.cores.forEach((c) => {
    add({ id: c.id, floor: c.floor, x: c.at[0], y: c.at[1], kind: c.kind, ref: c });
    link(c.id, c.via, 'walk', c.kind === 'lift' ? 10 : 0);
  });
  const places: Graph['places'] = {};
  site.places.forEach((p) => {
    places[p.id] = p;
    add({ id: p.id, floor: p.floor, x: p.door[0], y: p.door[1], kind: p.gate ? 'gate' : 'place', ref: p });
    link(p.id, p.via, 'walk');
  });

  // Same `group` on several floors = one lift/stair shaft: lift 3 per floor, stairs 25 per floor.
  const groups: Record<string, Site['cores']> = {};
  site.cores.forEach((c) => (groups[c.group] ??= []).push(c));
  Object.values(groups).forEach((cs) => {
    cs.sort((a, b) => floors[a.floor].i - floors[b.floor].i);
    for (let i = 0; i < cs.length - 1; i++) {
      const gap = floors[cs[i + 1].floor].i - floors[cs[i].floor].i;
      link(cs[i].id, cs[i + 1].id, cs[i].kind, cs[i].kind === 'lift' ? 3 * gap : 25 * gap, 0);
    }
  });

  return {
    site,
    nodes,
    adj,
    places,
    floors,
    startable: Object.keys(nodes).filter((id) => STARTABLE_KINDS.includes(nodes[id].kind)),
    wc: site.places.filter((p) => p.code === 'WC').map((p) => p.id),
    bounds: boundsOf(site),
  };
}

/** Projected bounding box (with margin) used to frame the 2D map. */
function boundsOf(site: Site): Graph['bounds'] {
  const xs: number[] = [],
    ys: number[] = [];
  const push = (x: number, y: number) =>
    [WALL, -8].forEach((z) => {
      const q = P(x, y, z);
      xs.push(q[0]);
      ys.push(q[1]);
    });
  Object.values(site.shells).forEach((l) =>
    l.forEach((r) => {
      push(r[0], r[1]);
      push(r[2], r[1]);
      push(r[2], r[3]);
      push(r[0], r[3]);
    }),
  );
  Object.values(site.shellPoly ?? {}).forEach((l) => l.forEach((poly) => poly.forEach(([x, y]) => push(x, y))));
  site.places.forEach((p) => {
    if (p.labelAt) push(p.labelAt[0], p.labelAt[1] + 10);
    push(p.door[0], p.door[1]);
    if (p.rect) {
      push(p.rect[0], p.rect[1]);
      push(p.rect[2], p.rect[3]);
    }
    (p.parts ?? []).forEach((q) => {
      push(q.r[0], q.r[1]);
      push(q.r[2], q.r[3]);
    });
    (p.poly ?? []).forEach(([x, y]) => push(x, y));
  });
  site.points.forEach((p) => push(p.x, p.y));
  Object.values(site.ground ?? {}).forEach((poly) => poly.forEach(([x, y]) => push(x, y)));
  return [Math.min(...xs) - 24, Math.min(...ys) - 24, Math.max(...xs) + 24, Math.max(...ys) + 24];
}
