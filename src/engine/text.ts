import type { Core, Graph, Place, Route, Step } from '../data/types';
import { t, type Lang } from '../i18n';
import { stepSecs } from './steps';

const hi = (lang: Lang) => lang === 'hi';
const L = (lang: Lang, o?: { en?: string; hi?: string }) => (o ? ((hi(lang) ? o.hi || o.en : o.en) ?? '') : '');

export const pName = (p: Place, lang: Lang) => (hi(lang) ? p.hi : p.en);
export const pShort = (p: Place, lang: Lang) => (hi(lang) ? p.hiS : p.enS);
export const placeLabel = (p: Place, lang: Lang) => (p.num ? `${p.id} ${pName(p, lang)}` : pName(p, lang));
export const floorName = (g: Graph, id: string, lang: Lang) => (hi(lang) ? g.floors[id].hi : g.floors[id].en);

export function coreName(g: Graph, c: Core, lang: Lang): string {
  if (c.en) return L(lang, c);
  return `${t(lang, c.kind === 'lift' ? 'liftLobby' : 'stairsSpot')} · ${floorName(g, c.floor, lang)}`;
}
/** Label for any startable node (room, gate, lift or stairs). */
export function spotLabel(g: Graph, id: string, lang: Lang): string {
  const n = g.nodes[id];
  if (n.kind === 'lift' || n.kind === 'stairs') return coreName(g, n.ref as Core, lang);
  if (n.kind !== 'corr') return placeLabel(n.ref as Place, lang);
  // A corridor point (after rerouting mid-walk): "Corridor near 203 Male Ward B" / a named landmark.
  const lm = g.site.landmarks?.[id];
  if (lm) return lang === 'hi' ? lm.hi : lm.en;
  const near = g.site.places.find((p) => p.via === id);
  return t(lang, 'corrNear', near ? placeLabel(near, lang) : floorName(g, n.floor, lang));
}

export const fmtM = (len: number) => Math.max(5, Math.round(len / 5) * 5);
export function fmtS(s: number, lang: Lang): string {
  return s < 60 ? t(lang, 'sec', Math.max(5, Math.round(s / 5) * 5)) : t(lang, 'min', Math.round(s / 60));
}

/** Name for the node a walk step ends at: a configured landmark, a lift/stairs, or the nearest room door. */
function landmark(g: Graph, id: string, h: [number, number] | undefined, start: string, dest: string, lang: Lang): string | null {
  const lm = g.site.landmarks?.[id];
  if (lm) {
    const north = !!h && h[1] < -0.5;
    return hi(lang) ? (north && lm.hiN) || lm.hi : (north && lm.enN) || lm.en;
  }
  const n = g.nodes[id];
  if (n.kind === 'lift' || n.kind === 'stairs') return coreName(g, n.ref as Core, lang);
  if (n.kind !== 'corr') return null;
  const att = g.site.places.filter((p) => p.floor === n.floor && p.via === id && p.id !== dest && p.id !== start);
  att.sort((a, b) => a.door[1] - b.door[1]);
  return att.length ? placeLabel(att[0], lang) : null;
}

export function stepText(g: Graph, route: Extract<Route, { path: string[] }>, st: Step, lang: Lang): string {
  const path = route.path,
    start = path[0],
    dest = path[path.length - 1];
  const side = (s: string) => t(lang, s);
  if (st.kind === 'start') {
    const n = g.nodes[start];
    if (n.kind === 'gate') return t(lang, 'd_gate', pName(n.ref as Place, lang));
    if (n.kind === 'lift' || n.kind === 'stairs') return t(lang, 'd_lift0', coreName(g, n.ref as Core, lang));
    if (n.kind === 'place') return t(lang, g.site.outdoor ? 'd_placeOut' : 'd_place', placeLabel(n.ref as Place, lang));
    return t(lang, 'd_here');
  }
  if (st.kind === 'walk') {
    const endId = path[st.i1],
      endRef = g.nodes[endId].ref;
    const lm = endId === dest && endRef ? placeLabel(endRef as Place, lang) : landmark(g, endId, st.h, start, dest, lang);
    const d = fmtM(st.len);
    if (st.exitKind) return t(lang, 'd_exit', st.exitKind, st.turn ? side(st.turn) : null, d, lm);
    if (st.turn) return t(lang, 'd_turn', side(st.turn), d, lm);
    return t(lang, 'd_walk', d, lm);
  }
  if (st.kind === 'lift') return t(lang, 'd_lift', st.approach ? side(st.approach) : null, floorName(g, st.to, lang), g.floors[st.to].btn);
  if (st.kind === 'stairs') return t(lang, 'd_stairs', st.approach ? side(st.approach) : null, st.n, st.up, floorName(g, st.to, lang));
  const lbl = spotLabel(g, dest, lang);
  return st.side ? t(lang, 'd_arriveSide', lbl, hi(lang) ? t(lang, st.side + 'Pos') : side(st.side)) : t(lang, 'd_arrive', lbl);
}

export function stepIcon(st: Step): string {
  if (st.kind === 'start') return 'here';
  if (st.kind === 'arrive') return 'pin';
  if (st.kind === 'lift' || st.kind === 'stairs') return st.kind;
  return st.turn ?? 'straight';
}

export function stepMeta(st: Step, lang: Lang): string {
  if (st.kind === 'walk') return `${t(lang, 'm', fmtM(st.len))} · ${fmtS(stepSecs(st), lang)}`;
  if (st.kind === 'lift' || st.kind === 'stairs') return fmtS(stepSecs(st), lang);
  return '';
}
