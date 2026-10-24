// Pan, pinch, wheel zoom and fit helpers for the 2D map SVG.
import type { Step } from '../data/types';
import { G, okRoute, state } from '../state';
import { $, isPhone } from '../ui/dom';
import { P, WALL } from './projection';

/** Wired up by main.ts (and the 3D view in milestone 3) so this module stays free of import cycles. */
export const hooks = {
  is3D: () => false,
  isReal: () => false,
  fit3D: (_ids: string[] | null, _floorOnly?: boolean) => {},
  dolly3D: (_f: number) => {},
  onAct: (_el: HTMLElement) => {},
  onRoom: (_id: string) => {},
  /** Called after every 2D map render, so the 3D scene can follow the same state. */
  afterRender: () => {},
  /** Draw a first-person 3D view of a step into the canvas; false when 3D is not available. */
  stepView: (_el: HTMLCanvasElement, _st: Step) => false as boolean,
};

let svg: SVGSVGElement;
let VB = { x: 0, y: 0, w: 900, h: 560 };
const svgRect = () => svg.getBoundingClientRect();
const aspect = () => {
  const r = svgRect();
  return r.width > 0 ? r.height / r.width : 0.62;
};
const maxW = () => (G().bounds[2] - G().bounds[0]) * 2.2;

function setVB() {
  svg.setAttribute('viewBox', `${VB.x} ${VB.y} ${VB.w} ${VB.h}`);
  applyScale();
}

type Box = [number, number, number, number];
function fitBox(b: Box, minW: number) {
  const pad = 0.14,
    a = aspect();
  let w = (b[2] - b[0]) * (1 + pad * 2);
  const h0 = (b[3] - b[1]) * (1 + pad * 2);
  w = Math.min(Math.max(w, h0 / a, minW || 0, 160), maxW());
  const h = w * a,
    cx = (b[0] + b[2]) / 2,
    cy = (b[1] + b[3]) / 2;
  VB = { x: cx - w / 2, y: cy - h / 2, w, h };
  setVB();
}
const bbox = (ps: [number, number][]): Box => [
  Math.min(...ps.map((p) => p[0])),
  Math.min(...ps.map((p) => p[1])),
  Math.max(...ps.map((p) => p[0])),
  Math.max(...ps.map((p) => p[1])),
];

function floorBox(f: string): Box {
  const S = G().site,
    xs: number[] = [],
    ys: number[] = [];
  const add = (x: number, y: number, zs: number[] = [0]) =>
    zs.forEach((z) => {
      const q = P(x, y, z);
      xs.push(q[0]);
      ys.push(q[1]);
    });
  (S.shells[f] || []).forEach((r) =>
    [
      [r[0], r[1]],
      [r[2], r[1]],
      [r[2], r[3]],
      [r[0], r[3]],
    ].forEach(([x, y]) => add(x, y, [WALL, -8])),
  );
  S.places.filter((p) => p.floor === f && p.labelAt).forEach((p) => add(p.labelAt![0], p.labelAt![1] + 10));
  (S.ground?.[f] || []).forEach(([x, y]) => add(x, y));
  (S.shellPoly?.[f] || []).forEach((poly) => poly.forEach(([x, y]) => add(x, y, [WALL, -8])));
  if (!xs.length) return G().bounds;
  return [Math.min(...xs) - 20, Math.min(...ys) - 20, Math.max(...xs) + 20, Math.max(...ys) + 20];
}

export function fitFloor() {
  if (hooks.is3D()) return hooks.fit3D(null, true);
  fitBox(floorBox(state.floor), 0);
}
export function fitRoute() {
  const r = okRoute();
  if (hooks.is3D()) return r && r.path.length > 1 ? hooks.fit3D(r.path) : hooks.fit3D(null, true);
  const g = G(),
    ps: [number, number][] = [];
  r?.path.forEach((id) => {
    const n = g.nodes[id];
    if (n.floor === state.floor) ps.push(P(n.x, n.y));
  });
  const sn = g.nodes[state.start];
  if (sn.floor === state.floor) ps.push(P(sn.x, sn.y));
  if (ps.length < 2) return fitFloor();
  fitBox(bbox(ps), isPhone() ? 300 : 420);
}
export function fitStep(st: Step) {
  const r = okRoute()!;
  // A one-node step (e.g. the start) would zoom out to the whole floor; show the first few metres instead.
  if (hooks.is3D()) return hooks.fit3D(r.path.slice(st.i0, Math.max(st.i1, st.i0 + 2) + 1));
  const g = G(),
    ps: [number, number][] = [];
  for (let i = st.i0; i <= st.i1; i++) {
    const n = g.nodes[r.path[i]];
    if (n.floor === state.floor) ps.push(P(n.x, n.y));
  }
  if (!ps.length) return fitRoute();
  fitBox(bbox(ps), isPhone() ? 260 : 340);
}

function clientToSvg(x: number, y: number) {
  const m = svg.getScreenCTM();
  if (!m) return { x: VB.x + VB.w / 2, y: VB.y + VB.h / 2 };
  const pt = svg.createSVGPoint();
  pt.x = x;
  pt.y = y;
  return pt.matrixTransform(m.inverse());
}
function zoomAt(cx: number, cy: number, f: number) {
  const p = clientToSvg(cx, cy),
    nw = Math.min(Math.max(VB.w * f, 140), maxW()),
    k = nw / VB.w;
  VB = { x: p.x - (p.x - VB.x) * k, y: p.y - (p.y - VB.y) * k, w: nw, h: VB.h * k };
  setVB();
}
export function zoomCenter(f: number) {
  if (hooks.is3D()) return hooks.dolly3D(f);
  const r = svgRect();
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, f);
}

/** Labels and markers keep a constant on-screen size: counter-scale them by the current zoom. */
export function applyScale() {
  const r = svgRect();
  if (!r.width) return;
  const u = VB.w / r.width;
  svg.querySelectorAll<SVGGElement>('.floor[data-on] .cs, #markLayer .cs').forEach((el) => {
    el.setAttribute('transform', `translate(${el.dataset.x} ${el.dataset.y}) scale(${u})`);
    if (el.classList.contains('lbl')) {
      const px = +el.dataset.w! / u,
        keep = el.classList.contains('keep');
      el.classList.toggle('l0', !keep && px < 30);
      el.classList.toggle('l1', px < 92);
    }
  });
}

export function initViewport() {
  svg = $('#map') as unknown as SVGSVGElement;
  new ResizeObserver(() => {
    const cy = VB.y + VB.h / 2;
    VB.h = VB.w * aspect();
    VB.y = cy - VB.h / 2;
    setVB();
  }).observe(svg);

  const ptrs = new Map<number, { x: number; y: number }>();
  let downAt: { x: number; y: number } | null = null,
    downTarget: Element | null = null,
    moved = false;
  let pinch: { d: number; mx: number; my: number } | null = null;

  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) {
      downAt = { x: e.clientX, y: e.clientY };
      downTarget = e.target as Element;
      moved = false;
    }
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      moved = true;
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId)!;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2 && pinch) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y),
        mx = (a.x + b.x) / 2,
        my = (a.y + b.y) / 2;
      if (d > 0) zoomAt(mx, my, pinch.d / d);
      const u = VB.w / svgRect().width;
      VB.x -= (mx - pinch.mx) * u;
      VB.y -= (my - pinch.my) * u;
      setVB();
      pinch = { d, mx, my };
      return;
    }
    if (ptrs.size === 1) {
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) moved = true;
      if (!moved) return;
      svg.classList.add('dragging');
      const u = VB.w / svgRect().width;
      VB.x -= (e.clientX - prev.x) * u;
      VB.y -= (e.clientY - prev.y) * u;
      svg.setAttribute('viewBox', `${VB.x} ${VB.y} ${VB.w} ${VB.h}`);
    }
  });
  const endPtr = (e: PointerEvent) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0) {
      svg.classList.remove('dragging');
      if (!moved && downTarget && e.type === 'pointerup') {
        const b = downTarget.closest<HTMLElement>('[data-act]'),
          room = downTarget.closest<HTMLElement>('.room[data-id]');
        if (b) hooks.onAct(b);
        else if (room && !state.nav) hooks.onRoom(room.dataset.id!);
      }
      downTarget = null;
      downAt = null;
    }
  };
  svg.addEventListener('pointerup', endPtr);
  svg.addEventListener('pointercancel', endPtr);
  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0015));
    },
    { passive: false },
  );
}
