import { esc } from './dom';

function chevrons(): string {
  return [
    [170, 96, 15, 10],
    [150, 68, 11, 8],
    [134, 46, 8, 6],
    [122, 30, 5, 4],
  ]
    .map(
      ([y, w, h, sw]) => `<polyline class="sc-chev" stroke-width="${sw}" points="${160 - w / 2},${y} 160,${y - h} ${160 + w / 2},${y}"/>`,
    )
    .join('');
}
export interface SceneOpt {
  label?: string;
  btn?: string;
  up?: boolean;
  code?: string;
}
export function scene(kind: string, o: SceneOpt = {}): string {
  const opt = o;
  const deep = ['straight', 'left', 'right', 'start'].includes(kind);
  const [bx1, by1, bx2, by2] = deep ? [115, 58, 205, 112] : [78, 34, 242, 140];
  let s =
    `<rect class="sc-ceil" width="320" height="180"/>` +
    `<polygon class="sc-wl" points="0,0 ${bx1},${by1} ${bx1},${by2} 0,180"/>` +
    `<polygon class="sc-wr" points="320,0 ${bx2},${by1} ${bx2},${by2} 320,180"/>` +
    `<polygon class="sc-fl" points="0,180 ${bx1},${by2} ${bx2},${by2} 320,180"/>` +
    `<rect class="sc-bk" x="${bx1}" y="${by1}" width="${bx2 - bx1}" height="${by2 - by1}"/>` +
    `<polygon class="sc-lt" points="132,9 188,9 182,17 138,17"/>`;
  if (deep) {
    s +=
      `<polygon class="sc-door" points="25,66 55,69.6 55,147.5 25,165.2"/><polygon class="sc-door" points="75,72.1 95,74.5 95,123.9 75,135.7"/>` +
      `<polygon class="sc-door" points="295,66 265,69.6 265,147.5 295,165.2"/><polygon class="sc-door" points="245,72.1 225,74.5 225,123.9 245,135.7"/>`;
  }
  if (kind === 'straight') s += chevrons();
  if (kind === 'left' || kind === 'right') {
    const m = (x: number) => (kind === 'left' ? x : 320 - x);
    s +=
      `<polygon class="sc-open" points="${m(97)},71 ${m(112)},73.6 ${m(112)},113.8 ${m(97)},122.7"/>` +
      `<path class="sc-arrow" d="M${m(160)} 178 L${m(160)} 150 Q${m(160)} 124 ${m(126)} 118"/>` +
      `<polygon class="sc-arrowhead" points="${m(100)},117 ${m(126)},103 ${m(126)},131"/>`;
  }
  if (kind === 'start') s += `<circle class="sc-halo" cx="160" cy="152" r="20"/><circle class="sc-dot" cx="160" cy="152" r="8"/>`;
  if (kind === 'lift') {
    s +=
      `<rect class="sc-frame" x="104" y="52" width="112" height="88"/><rect class="sc-liftdoor" x="108" y="57" width="51" height="83"/><rect class="sc-liftdoor" x="161" y="57" width="51" height="83"/>` +
      `<rect class="sc-disp" x="134" y="38" width="52" height="12" rx="2"/><text class="sc-disptx" x="160" y="47" text-anchor="middle">${opt.up ? '▲' : '▼'} ${esc(opt.btn)}</text>` +
      `<rect class="sc-frame" x="222" y="82" width="11" height="22" rx="2"/><circle class="sc-btn" cx="227.5" cy="89" r="2.2"/><circle class="sc-btn" cx="227.5" cy="97" r="2.2"/>` +
      `<polyline class="sc-chev" stroke-width="9" points="128,174 160,158 192,174"/>`;
  }
  if (kind === 'stairs') {
    for (let i = 0; i < 7; i++) {
      const y = 140 - i * 14,
        inset = i * 8;
      s += `<rect class="${i % 2 ? 'sc-tread2' : 'sc-tread'}" x="${88 + inset}" y="${y - 14}" width="${144 - inset * 2}" height="14"/>`;
    }
    s += `<g transform="translate(222 50)"><rect class="sc-sign" x="-14" y="-12" width="28" height="24" rx="4"/><path class="sc-signarrow" d="${opt.up ? 'M0 7V-6M-5-1l5-5 5 5' : 'M0-7V6M-5 1l5 5 5-5'}"/></g>`;
  }
  if (kind === 'arrive') {
    s +=
      `<rect class="sc-frame" x="128" y="62" width="64" height="78"/><rect class="sc-door" x="132" y="66" width="56" height="74"/><circle class="sc-knob" cx="180" cy="104" r="2.6"/>` +
      `<rect class="sc-sign" x="108" y="38" width="104" height="19" rx="3"/><text class="sc-signtx" x="160" y="51.5" text-anchor="middle">${esc(opt.code)}</text>` +
      `<g transform="translate(160 172)"><path class="sc-pin" d="M0 0C-3-7-9-10-9-16a9 9 0 1 1 18 0C9-10 3-7 0 0z"/><circle class="sc-pinin" cy="-16" r="3.4"/></g>`;
  }
  return `<svg viewBox="0 0 320 180" class="scene-svg" role="img" aria-label="${esc(opt.label || '')}">${s}</svg>`;
}

import type { Step } from '../data/types';
import { G, okRoute } from '../state';
import { pShort, stepText } from './bound';

/** Real photo for a step: the node it ends at (or starts from) if the site has one. */
export function photoFor(st: Step): string | null {
  const ph = G().site.photos,
    r = okRoute();
  if (!ph || !r) return null;
  const path = r.path;
  const ids =
    st.kind === 'start'
      ? [path[0], path[Math.min(1, path.length - 1)]]
      : st.kind === 'arrive'
        ? [path[path.length - 1]]
        : st.kind === 'lift' || st.kind === 'stairs'
          ? [path[st.v0]]
          : [path[st.i1], path[st.i0]];
  for (const id of ids) if (ph[id]) return ph[id];
  return null;
}

/** Drawn stand-in used when a spot has no photo. */
export function sceneFor(st: Step): string {
  const label = stepText(st),
    g = G(),
    r = okRoute()!;
  if (st.kind === 'start') return scene('start', { label });
  if (st.kind === 'lift') return scene('lift', { label, btn: g.floors[st.to].btn, up: st.up });
  if (st.kind === 'stairs') return scene('stairs', { label, up: st.up });
  if (st.kind === 'arrive') {
    const p = g.nodes[r.path[r.path.length - 1]].ref as { num?: boolean; id: string; enS: string; hiS: string } | undefined;
    return scene('arrive', { label, code: p ? (p.num ? p.id : pShort(p as never)) : '' });
  }
  return scene(st.turn || 'straight', { label });
}
