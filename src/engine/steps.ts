import type { Graph, Step, Turn } from '../data/types';
import { edgeOf, WALK_MPS } from './graph';

type H = [number, number];
type Raw =
  | { type: 'walk'; i0: number; i1: number; h: H; len: number; turn?: Turn; exitKind?: 'lift' | 'stairs' }
  | { type: 'lift' | 'stairs'; i0: number; i1: number; v0: number; v1: number; approach?: Turn };

const unitVec = (a: { x: number; y: number }, b: { x: number; y: number }): H => {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
};
// y points down the screen, so cross > 0 means a right turn.
const turnOf = (h1: H, h2: H): Turn => {
  if (h1[0] * h2[0] + h1[1] * h2[1] > 0.85) return null;
  return h1[0] * h2[1] - h1[1] * h2[0] > 0 ? 'right' : 'left';
};

export function buildSteps(g: Graph, path: string[]): Step[] {
  const N = path.map((id) => g.nodes[id]);
  const raw: Raw[] = [];
  for (let i = 0; i < path.length - 1;) {
    const e = edgeOf(g, path[i], path[i + 1]);
    if (e.type !== 'walk') {
      let j = i + 1;
      while (j < path.length - 1 && edgeOf(g, path[j], path[j + 1]).type === e.type) j++;
      raw.push({ type: e.type, i0: i, i1: j, v0: i, v1: j });
      i = j;
      continue;
    }
    const h = unitVec(N[i], N[i + 1]);
    let len = e.len,
      j = i + 1;
    while (j < path.length - 1) {
      const e2 = edgeOf(g, path[j], path[j + 1]);
      if (e2.type !== 'walk') break;
      const h2 = unitVec(N[j], N[j + 1]);
      if (h[0] * h2[0] + h[1] * h2[1] < 0.85) break;
      len += e2.len;
      j++;
    }
    raw.push({ type: 'walk', i0: i, i1: j, h, len });
    i = j;
  }
  let prevH: H | null = null;
  raw.forEach((r) => {
    if (r.type === 'walk') {
      r.turn = prevH ? turnOf(prevH, r.h) : null;
      prevH = r.h;
    } else prevH = null;
  });

  const steps: Step[] = [{ kind: 'start', i0: 0, i1: 0, floor: N[0].floor }];
  let k = 0;
  const first = raw[0];
  if (first && first.type === 'walk' && first.len < 6 && N[0].kind !== 'gate') {
    steps[0].i1 = first.i1;
    k = 1;
  }
  let afterV: 'lift' | 'stairs' | null = null;
  for (; k < raw.length; k++) {
    const r = raw[k],
      nx = raw[k + 1],
      last = k === raw.length - 1;
    if (r.type === 'walk') {
      // A short walk just before a lift/stairs folds into it as "turn left to the lift".
      if (nx && nx.type !== 'walk' && r.len < 6) {
        nx.approach = r.turn;
        nx.i0 = r.i0;
        continue;
      }
      // A short walk right after a lift/stairs folds into the next walk as its exit.
      if (afterV && r.len < 6 && nx && nx.type === 'walk') {
        nx.exitKind = afterV;
        nx.i0 = r.i0;
        afterV = null;
        continue;
      }
      if (last && r.len < 5 && r.turn) {
        steps.push({ kind: 'arrive', side: r.turn, i0: r.i0, i1: r.i1, floor: N[r.i1].floor });
        continue;
      }
      const st: Step = { kind: 'walk', turn: r.turn ?? null, len: r.len, i0: r.i0, i1: r.i1, floor: N[r.i0].floor, h: r.h };
      if (r.exitKind) st.exitKind = r.exitKind;
      if (afterV) {
        st.exitKind = afterV;
        afterV = null;
      }
      steps.push(st);
      if (last) steps.push({ kind: 'arrive', side: null, i0: r.i1, i1: r.i1, floor: N[r.i1].floor });
    } else {
      const from = N[r.v0].floor,
        to = N[r.v1].floor;
      steps.push({
        kind: r.type,
        approach: r.approach ?? null,
        i0: r.i0,
        i1: r.i1,
        v0: r.v0,
        v1: r.v1,
        from,
        to,
        n: Math.abs(g.floors[to].i - g.floors[from].i),
        up: g.floors[to].i > g.floors[from].i,
        floor: from,
      });
      afterV = r.type;
      if (last) steps.push({ kind: 'arrive', side: null, i0: r.i1, i1: r.i1, floor: to });
    }
  }
  return steps;
}

export function stepSecs(st: Step): number {
  if (st.kind === 'walk') return st.len / WALK_MPS;
  if (st.kind === 'lift') return 40 + 6 * st.n;
  if (st.kind === 'stairs') return 25 * st.n;
  return 0;
}
