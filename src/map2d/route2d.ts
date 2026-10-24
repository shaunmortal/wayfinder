// Route polyline, step highlight, start/destination markers, lift/stairs badges, floor tabs.
import type { Place } from '../data/types';
import { edgeOf } from '../engine/graph';
import { applyScale, hooks } from './viewport';
import { P } from './projection';
import { G, crowdHour, okRoute, state } from '../state';
import { crowdLevels } from '../engine/crowd';
import { $, esc } from '../ui/dom';
import { floorName, pShort, tr } from '../ui/bound';

const cv = document.createElement('canvas').getContext('2d')!;
function textW(s: string, font = '600 12.5px Hind, sans-serif') {
  try {
    cv.font = font;
    return Math.ceil(cv.measureText(s).width);
  } catch {
    return String(s).length * 7;
  }
}

/** Index runs of consecutive walk edges that stay on floor `f`, within path[i0..i1]. */
function runsOn(path: string[], f: string, i0 = 0, i1 = path.length - 1) {
  const g = G(),
    runs: number[][] = [];
  let cur: number[] | null = null;
  for (let i = i0; i < i1; i++) {
    const a = g.nodes[path[i]],
      b = g.nodes[path[i + 1]],
      e = edgeOf(g, path[i], path[i + 1]);
    if (a.floor === f && b.floor === f && e.type === 'walk') {
      if (!cur) {
        cur = [i];
        runs.push(cur);
      }
      cur.push(i + 1);
    } else cur = null;
  }
  return runs;
}
const ptsOf = (path: string[], run: number[]) =>
  run
    .map((i) => {
      const n = G().nodes[path[i]];
      return P(n.x, n.y).join(',');
    })
    .join(' ');

function markStart(n: { x: number; y: number }) {
  const [x, y] = P(n.x, n.y),
    lab = tr('youAreHere'),
    w = textW(lab) + 22;
  return (
    `<g class="cs mk" data-x="${x}" data-y="${y}" transform="translate(${x} ${y})"><circle class="halo" r="18"/><circle class="ring" r="9"/><circle class="core" r="6"/>` +
    `<g transform="translate(14 -40)"><rect class="callout" width="${w}" height="26" rx="8"/><text class="callout-t" x="11" y="17.5">${esc(lab)}</text></g></g>`
  );
}
function markDest(n: { x: number; y: number; ref?: unknown }) {
  const [x, y] = P(n.x, n.y),
    p = n.ref as Place,
    lab = p.num ? p.id : pShort(p);
  const w = textW(lab, '600 12.5px "IBM Plex Mono", monospace') + 20;
  return (
    `<g class="cs mk" data-x="${x}" data-y="${y}" transform="translate(${x} ${y})"><path class="pin" d="M0 0C-4-9-13-14-13-23a13 13 0 1 1 26 0C13-14 4-9 0 0z"/><circle class="pin-in" cy="-23" r="4.8"/>` +
    `<g transform="translate(${-w / 2} -66)"><rect class="callout" width="${w}" height="26" rx="8"/><text class="${p.num ? 'callout-c' : 'callout-t'}" x="${w / 2}" y="17.5" text-anchor="middle">${esc(lab)}</text></g></g>`
  );
}
function badge(n: { x: number; y: number }, label: string, targetFloor: string) {
  const [x, y] = P(n.x, n.y),
    w = textW(label) + 26;
  return `<g class="cs bdg" data-act="floor" data-f="${targetFloor}" role="button" tabindex="0" aria-label="${esc(label)}" data-x="${x}" data-y="${y}" transform="translate(${x} ${y})"><rect x="${-w / 2}" y="-50" width="${w}" height="30" rx="15"/><text x="0" y="-30" text-anchor="middle">${esc(label)}</text></g>`;
}

/** Corridors that are usually crowded at the chosen hour, shaded under the route (darker = busier). */
function busyOverlay() {
  const g = G(),
    lv = crowdLevels(g, crowdHour());
  return g.site.walks
    .filter(([a, b]) => g.nodes[a].floor === state.floor && lv[a] && lv[b])
    .map(([a, b]) => {
      const A = g.nodes[a],
        B = g.nodes[b];
      return `<polyline class="busy busy-${Math.min(lv[a], lv[b])}" points="${P(A.x, A.y).join(',')} ${P(B.x, B.y).join(',')}"/>`;
    })
    .join('');
}

export function routeFloors(): Set<string> {
  const s = new Set<string>(),
    r = okRoute();
  if (r) r.path.forEach((id) => s.add(G().nodes[id].floor));
  return s;
}

export function renderTabs() {
  const rf = routeFloors(),
    el = $('#ftabs');
  el.setAttribute('aria-label', tr('floorsAria'));
  el.innerHTML = G()
    .site.floors.map(
      (f) =>
        `<button type="button" class="ftab" data-act="floor" data-f="${f.id}" aria-pressed="${state.floor === f.id}"><span class="ft-l">${esc(floorName(f.id))}</span><span class="ft-s">${f.id}</span>${rf.has(f.id) && rf.size > 1 ? '<span class="ft-dot" aria-hidden="true"></span>' : ''}</button>`,
    )
    .join('');
}

export function renderMap() {
  const svg = $('#map'),
    g = G();
  svg.querySelectorAll('.floor').forEach((fg) => {
    if ((fg as SVGGElement).dataset.floor === state.floor) {
      fg.removeAttribute('display');
      fg.setAttribute('data-on', '');
    } else {
      fg.setAttribute('display', 'none');
      fg.removeAttribute('data-on');
    }
  });
  svg.querySelectorAll('.room.is-dest').forEach((r) => r.classList.remove('is-dest'));
  svg.querySelectorAll('.lbl.keep2').forEach((r) => r.classList.remove('keep', 'keep2'));
  if (state.dest) {
    svg.querySelectorAll(`.room[data-id="${state.dest}"]`).forEach((r) => r.classList.add('is-dest'));
    const l = svg.querySelector(`.lbl[data-lid="${state.dest}"]`);
    if (l && !l.classList.contains('keep')) l.classList.add('keep', 'keep2');
  }
  const r = okRoute();
  let s = '',
    badges = '';
  if (r && r.path.length > 1) {
    const f = state.floor,
      path = r.path;
    runsOn(path, f).forEach((run) => {
      const p = ptsOf(path, run);
      s += `<polyline class="rt-case" points="${p}"/><polyline class="rt-line${state.nav ? ' dim' : ''}" points="${p}"/>`;
    });
    if (state.nav) {
      const st = r.steps[state.stepIdx];
      runsOn(path, f, st.i0, st.i1).forEach((run) => {
        s += `<polyline class="rt-cur" points="${ptsOf(path, run)}"/>`;
      });
    }
    r.steps.forEach((st) => {
      if (st.kind !== 'lift' && st.kind !== 'stairs') return;
      const word = tr(st.kind === 'lift' ? 'liftWord' : 'stairsWord');
      const A = g.nodes[path[st.v0]],
        B = g.nodes[path[st.v1]];
      if (A.floor === f) badges += badge(A, `${word} → ${st.to}`, st.to);
      if (B.floor === f) badges += badge(B, tr('fromFloor', st.from), st.from);
    });
  }
  $('#routeLayer').innerHTML = busyOverlay() + s;
  let m = '';
  const sn = g.nodes[state.start];
  if (sn.floor === state.floor) m += markStart(sn);
  if (state.dest && state.dest !== state.start) {
    const dn = g.nodes[state.dest];
    if (dn.floor === state.floor) m += markDest(dn);
  }
  $('#markLayer').innerHTML = m + badges;
  svg.setAttribute('aria-label', tr('mapAria', floorName(state.floor)));
  renderTabs();
  applyScale();
  hooks.afterRender();
}
