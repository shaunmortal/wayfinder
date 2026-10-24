// 2.5D SVG floor drawing, ported from the prototype. Pure string building; one <g class="floor"> per floor.
import type { Place, Site, XY, Rect } from '../data/types';
import { CT, KY, P, ST, WALL } from './projection';
import { esc } from '../ui/dom';
import { isHi, pShort, tr } from '../ui/bound';
import { G } from '../state';

type Pt = [number, number, number?];
const pts = (arr: Pt[]) => arr.map((a) => P(a[0], a[1], a[2]).join(',')).join(' ');
const quad = (a: XY, b: XY, z0: number, z1: number, cls: string) =>
  `<polygon class="${cls}" points="${pts([
    [a[0], a[1], z0],
    [b[0], b[1], z0],
    [b[0], b[1], z1],
    [a[0], a[1], z1],
  ])}"/>`;
const depth = (r: Rect) => ((r[0] + r[2]) / 2) * ST + ((r[1] + r[3]) / 2) * CT;

interface RoomDef {
  rect: Rect;
  cat: string;
  id?: string;
  door?: XY;
  poly?: XY[];
  raise?: number;
  wallH?: number;
  under?: boolean;
  block?: boolean;
  flat?: boolean;
  h?: number;
}

function roomSVG(r: RoomDef) {
  const [x1, y1, x2, y2] = r.rect,
    H = WALL,
    d = r.door;
  const on = (s: string) => d && (s === 'N' ? d[1] === y1 : s === 'S' ? d[1] === y2 : s === 'W' ? d[0] === x1 : d[0] === x2);
  const door = (s: string) =>
    !on(s)
      ? ''
      : s === 'N' || s === 'S'
        ? quad([d![0] - 8, d![1]], [d![0] + 8, d![1]], 0, H * 0.82, 'm-door')
        : quad([d![0], d![1] - 8], [d![0], d![1] + 8], 0, H * 0.82, 'm-door');
  return (
    `<g class="room c-${r.cat}"${r.id ? ` data-id="${r.id}"` : ''}>` +
    quad([x1, y1], [x2, y1], 0, H, 'w-in') +
    door('N') +
    quad([x1, y1], [x1, y2], 0, H, 'w-in') +
    door('W') +
    `<polygon class="fl" points="${pts([
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
    ])}"/>` +
    quad([x1, y2], [x2, y2], 0, H, 'w-out') +
    door('S') +
    quad([x2, y1], [x2, y2], 0, H, 'w-side') +
    door('E') +
    `<polygon class="rim" points="${pts([
      [x1, y1, H],
      [x2, y1, H],
      [x2, y2, H],
      [x1, y2, H],
    ])}"/></g>`
  );
}

function perimWall(r: Rect, side: string, gapPts: XY[]) {
  const [x1, y1, x2, y2] = r,
    horiz = side === 'N' || side === 'S';
  const fixed = side === 'N' ? y1 : side === 'S' ? y2 : side === 'W' ? x1 : x2;
  const a0 = horiz ? x1 : y1,
    a1 = horiz ? x2 : y2;
  const cls = side === 'S' ? 'w-out' : side === 'E' ? 'w-side' : 'w-in';
  const gaps = gapPts
    .filter((g) => Math.abs((horiz ? g[1] : g[0]) - fixed) < 30)
    .map((g) => (horiz ? g[0] : g[1]))
    .filter((v) => v > a0 && v < a1)
    .sort((a, b) => a - b);
  const segs: [number, number][] = [];
  let cur = a0;
  gaps.forEach((v) => {
    if (v - 22 > cur) segs.push([cur, v - 22]);
    cur = Math.max(cur, v + 22);
  });
  if (a1 > cur) segs.push([cur, a1]);
  return segs.map(([s, e]) => (horiz ? quad([s, fixed], [e, fixed], 0, WALL, cls) : quad([fixed, s], [fixed, e], 0, WALL, cls))).join('');
}

function blockSVG(r: RoomDef) {
  const [x1, y1, x2, y2] = r.rect,
    H = r.h || 56,
    d = r.door,
    id = r.id ? ` data-id="${r.id}"` : '';
  if (r.flat)
    return `<g class="room flat c-${r.cat}"${id}><polygon class="fl" points="${pts([
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
    ])}"/></g>`;
  let door = '';
  if (d && d[1] === y2) door = quad([d[0] - 14, d[1]], [d[0] + 14, d[1]], 0, H * 0.45, 'm-door');
  if (d && d[0] === x2) door = quad([d[0], d[1] - 14], [d[0], d[1] + 14], 0, H * 0.45, 'm-door');
  return (
    `<g class="room blk c-${r.cat}"${id}>` +
    quad([x1, y2], [x2, y2], 0, H, 'b-s') +
    quad([x2, y1], [x2, y2], 0, H, 'b-e') +
    door +
    `<polygon class="fl" points="${pts([
      [x1, y1, H],
      [x2, y1, H],
      [x2, y2, H],
      [x1, y2, H],
    ])}"/></g>`
  );
}

function labelSVG(lid: string, x: number, y: number, w: number, line1: string, line2: string, cls: string, word: boolean, z = 0) {
  const [X, Y] = P(x, y, z);
  return (
    `<g class="cs lbl ${cls || ''}" data-x="${X}" data-y="${Y}" data-w="${w}" data-lid="${lid}" transform="translate(${X} ${Y})">` +
    `<text class="${word ? 'lw' : 'lc'}" text-anchor="middle" y="${line2 ? -1 : 4}">${esc(line1)}</text>` +
    (line2 ? `<text class="ln" text-anchor="middle" y="13">${esc(line2)}</text>` : '') +
    `</g>`
  );
}

export const polyCenter = (poly: XY[]): XY => {
  let x = 0,
    y = 0;
  poly.forEach((q) => {
    x += q[0];
    y += q[1];
  });
  return [x / poly.length, y / poly.length];
};
export const bboxOf = (poly: XY[]): Rect => {
  const xs = poly.map((q) => q[0]),
    ys = poly.map((q) => q[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
function inPoly(x: number, y: number, poly: XY[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export function polyEdges(poly: XY[]) {
  return poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      L = Math.hypot(dx, dy) || 1;
    let n: XY = [dy / L, -dx / L];
    const mx = (a[0] + b[0]) / 2,
      my = (a[1] + b[1]) / 2;
    if (inPoly(mx + n[0] * 2, my + n[1] * 2, poly)) n = [-n[0], -n[1]]; // make the normal point outward
    return { a, b, n, front: n[0] * ST + n[1] * CT > 0 };
  });
}
export function segGaps(a: XY, b: XY, gaps: XY[], half: number): [XY, XY][] {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    L2 = dx * dx + dy * dy,
    L = Math.sqrt(L2) || 1;
  const cuts: [number, number][] = [];
  gaps.forEach((g) => {
    const t = ((g[0] - a[0]) * dx + (g[1] - a[1]) * dy) / (L2 || 1);
    if (t < -0.02 || t > 1.02) return;
    if (Math.hypot(g[0] - (a[0] + t * dx), g[1] - (a[1] + t * dy)) > 9) return;
    cuts.push([t - half / L, t + half / L]);
  });
  cuts.sort((u, v) => u[0] - v[0]);
  const segs: [number, number][] = [];
  let cur = 0;
  cuts.forEach(([s0, e0]) => {
    if (s0 > cur) segs.push([cur, s0]);
    cur = Math.max(cur, e0);
  });
  if (cur < 1) segs.push([cur, 1]);
  return segs
    .filter(([s0, e0]) => e0 - s0 > 0.001)
    .map(
      ([s0, e0]) =>
        [
          [a[0] + s0 * dx, a[1] + s0 * dy],
          [a[0] + e0 * dx, a[1] + e0 * dy],
        ] as [XY, XY],
    );
}
function polyWalls(poly: XY[], which: 'front' | 'back', gaps: XY[], H: number, half: number) {
  return polyEdges(poly)
    .filter((e) => (which === 'front') === e.front)
    .map((e) => {
      const cls = e.front ? (Math.abs(e.n[0]) > Math.abs(e.n[1]) ? 'w-side' : 'w-out') : 'w-in';
      return segGaps(e.a, e.b, gaps, half)
        .map(([q, r]) => quad(q, r, 0, H, cls))
        .join('');
    })
    .join('');
}
function polyRoomSVG(r: RoomDef) {
  const poly = r.poly!,
    H = r.wallH || WALL * 0.9,
    gaps = r.door ? [r.door] : [],
    z0 = r.raise || 0;
  return (
    `<g class="room c-${r.cat}"${r.id ? ` data-id="${r.id}"` : ''}>` +
    polyWalls(poly, 'back', gaps, H, 8) +
    `<polygon class="fl" points="${pts(poly.map(([x, y]) => [x, y, z0] as Pt))}"/>` +
    polyWalls(poly, 'front', gaps, H, 8) +
    `<polygon class="rim" points="${pts(poly.map(([x, y]) => [x, y, H] as Pt))}"/></g>`
  );
}

function floorSVG(S: Site, fid: string) {
  const shells = S.shells[fid] || [],
    gates = S.places.filter((p) => p.gate && p.floor === fid);
  const gapPts: XY[] = [...gates.map((g) => g.door), ...(S.openings || []).filter((o) => o.floor === fid).map((o) => o.at)];
  let s = '';
  const ground = S.ground?.[fid];
  if (ground) s += `<polygon class="m-lawn" points="${pts(ground)}"/>`;
  ((S.roads?.[fid] as { w?: number; pts: XY[] }[]) || []).forEach((rd) => {
    s += `<polyline class="m-road" stroke-width="${rd.w || 56}" points="${pts(rd.pts)}"/>`;
  });
  (S.trees?.[fid] || []).forEach(([x, y]) => {
    const [cx, cy] = P(x, y, 18);
    s += `<circle class="m-tree" cx="${cx}" cy="${cy}" r="11"/>`;
  });
  shells.forEach(([X1, Y1, X2, Y2]) => {
    s += `<polygon class="m-shadow" points="${pts([
      [X1 + 12, Y1 + 16, -8],
      [X2 + 12, Y1 + 16, -8],
      [X2 + 12, Y2 + 16, -8],
      [X1 + 12, Y2 + 16, -8],
    ])}"/>`;
  });
  shells.forEach(([X1, Y1, X2, Y2]) => {
    s +=
      quad([X1, Y2], [X2, Y2], 0, -8, 'm-slab') +
      quad([X2, Y1], [X2, Y2], 0, -8, 'm-slab2') +
      `<polygon class="m-corr" points="${pts([
        [X1, Y1],
        [X2, Y1],
        [X2, Y2],
        [X1, Y2],
      ])}"/>`;
  });
  shells.forEach((r) => {
    s += perimWall(r, 'N', gapPts) + perimWall(r, 'W', gapPts);
  });
  const sp = S.shellPoly?.[fid] || [];
  sp.forEach((poly) => {
    s += `<polygon class="m-shadow" points="${pts(poly.map(([x, y]) => [x + 12, y + 16, -8] as Pt))}"/>`;
  });
  sp.forEach((poly) => {
    s +=
      polyEdges(poly)
        .filter((e) => e.front)
        .map((e) => quad(e.a, e.b, 0, -8, 'm-slab'))
        .join('') + `<polygon class="m-corr" points="${pts(poly)}"/>`;
  });
  const pim = S.planImg?.[fid];
  if (pim)
    s += `<image class="planimg" href="${pim.src}" x="${pim.x}" y="${pim.y}" width="${pim.w}" height="${pim.h}" preserveAspectRatio="none" transform="matrix(${CT} ${ST * KY} ${-ST} ${CT * KY} 0 0)"/>`;
  sp.forEach((poly) => {
    s += polyWalls(poly, 'back', gapPts, WALL, 20);
  });
  gates.forEach((g) => {
    if (g.mat) s += `<polygon class="m-gate" points="${pts(g.mat)}"/>`;
  });

  const rooms: RoomDef[] = [];
  S.places
    .filter((p) => p.floor === fid && (p.rect || p.parts || p.poly))
    .forEach((p) => {
      if (p.poly)
        rooms.push({
          poly: p.poly,
          rect: bboxOf(p.poly),
          cat: p.cat,
          id: p.id,
          door: p.door,
          raise: p.raise,
          wallH: p.wallH,
          under: p.under,
        });
      else if (p.parts)
        p.parts.forEach((q) => rooms.push({ rect: q.r, cat: p.cat, id: p.id, door: p.door, block: true, h: q.h as number }));
      else rooms.push({ rect: p.rect!, cat: p.cat, id: p.id, door: p.door, block: p.block, flat: p.flat, h: p.h });
    });
  S.cores.filter((c) => c.floor === fid && c.rect).forEach((c) => rooms.push({ rect: c.rect, cat: 'core', door: c.door }));
  const rk = (r: RoomDef) => (r.flat ? -1e9 : 0) + (r.under ? -1e8 : 0) + depth(r.rect);
  rooms.sort((a, b) => rk(a) - rk(b)); // painter's algorithm: back to front
  rooms.forEach((r) => {
    s += r.poly ? polyRoomSVG(r) : r.block || r.flat ? blockSVG(r) : roomSVG(r);
  });
  shells.forEach((r) => {
    s += perimWall(r, 'S', gapPts) + perimWall(r, 'E', gapPts);
  });
  sp.forEach((poly) => {
    s += polyWalls(poly, 'front', gapPts, WALL, 20);
  });

  let l = '';
  S.places
    .filter((p) => p.floor === fid)
    .forEach((p: Place) => {
      if (p.poly) {
        const c = p.labelAt || polyCenter(p.poly),
          bb = bboxOf(p.poly);
        l += labelSVG(p.id, c[0], c[1], Math.round((bb[2] - bb[0]) * CT), pShort(p), '', '', true, p.raise || 0);
        return;
      }
      if (!p.rect) {
        const at = p.labelAt || [p.door[0], p.door[1] + 40];
        l += labelSVG(p.id, at[0], at[1], 240, pShort(p), isHi() ? p.subHi || '' : p.subEn || '', 'keep', true);
        return;
      }
      const [x1, y1, x2, y2] = p.rect,
        w = Math.round((x2 - x1) * CT);
      const z = p.parts ? ((p.parts.find((q) => q.r.join() === p.rect!.join()) || p.parts[0]).h as number) : p.block ? p.h || 56 : 0;
      l += p.num
        ? labelSVG(p.id, (x1 + x2) / 2, (y1 + y2) / 2, w, p.id, pShort(p), '', false, z)
        : labelSVG(p.id, (x1 + x2) / 2, (y1 + y2) / 2, w, pShort(p), '', '', true, z);
    });
  S.cores
    .filter((c) => c.floor === fid)
    .forEach((c) => {
      const r = c.rect || [c.at[0] - 20, c.at[1] - 20, c.at[0] + 20, c.at[1] + 20];
      const word = c.enS ? (isHi() ? c.hiS || c.enS : c.enS) : tr(c.kind === 'lift' ? 'liftWord' : 'stairsWord');
      l += labelSVG(c.id, (r[0] + r[2]) / 2, (r[1] + r[3]) / 2 + 5, Math.round((r[2] - r[0]) * CT), word, '', 'core', true);
    });
  return s + `<g class="labels">${l}</g>`;
}

/** Re-draw every floor of the current site into #floors (call again when the language changes). */
export function buildFloors(el: Element) {
  const S = G().site;
  el.innerHTML = S.floors.map((f) => `<g class="floor" data-floor="${f.id}" display="none">${floorSVG(S, f.id)}</g>`).join('');
}
