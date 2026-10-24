import type { Place, Step } from '../data/types';
import { G, liveNow, state } from '../state';
import { LIVE_LIMIT } from '../engine/crowd';
import { esc } from './dom';
import { icon } from './icons';
import { L, floorName, fmtM, isHi, pName, pShort, stepIcon, stepMeta, stepText, tr } from './bound';
import { codeChip } from './head';

export function stepsList(steps: Step[], cur: number) {
  return `<ol class="steps">${steps
    .map(
      (st, i) =>
        `<li class="k-${st.kind}"><button type="button" class="st-btn${cur === i ? ' cur' : ''}" data-act="step" data-i="${i}"><span class="st-ic">${icon(stepIcon(st), 18)}</span><span class="st-tx">${esc(stepText(st))}</span><span class="st-m">${esc(stepMeta(st))}</span></button></li>`,
    )
    .join('')}</ol>`;
}

export function placeRow(p: Place, act = 'dest') {
  return `<li><button type="button" class="prow" data-act="${act}" data-id="${p.id}">${codeChip(p)}<span><span class="pn">${esc(pName(p))}</span><span class="pf">${esc(floorName(p.floor))} · ${esc(tr('cat_' + p.cat))}</span></span>${icon('chevR', 18)}</button></li>`;
}

const HOURS: [string, number | null][] = [
  ['timeNow', null],
  ['time10', 10],
  ['time15', 15],
  ['time18', 17.5],
  ['time21', 21],
];
const crowdWord = (score: number) => tr(score < 1 ? 'crowdClear' : score < 60 ? 'crowdSome' : 'crowdHigh');

/** Route options with their crowd estimate, the usual-busy-hours warning and the hour picker. */
function crowdPanel() {
  const p = state.plan!,
    cur = Math.min(state.routeIdx ?? p.pick, p.routes.length - 1);
  let h = `<div class="crowd"><div class="crowd-head"><b>${icon('walk', 18)}${esc(tr('crowdT'))}</b>
    <label class="crowd-time"><span>${esc(tr('timeLbl'))}</span><select id="tg-hour">${HOURS.map(([k, v]) => `<option value="${v ?? ''}"${state.hourPick === v ? ' selected' : ''}>${esc(tr(k))}</option>`).join('')}</select></label></div>`;
  if (p.routes.length > 1)
    h += `<div class="ropts" role="group" aria-label="${esc(tr('crowdT'))}">${p.routes
      .map(
        (r, i) =>
          `<button type="button" class="ropt" data-act="pickRoute" data-i="${i}" aria-pressed="${cur === i}"><b>${esc(tr('routeN', i + 1))}</b><span>${esc(tr('m', fmtM(r.walk)))} · ${esc(crowdWord(p.scores[i]))}${p.liveMax?.[i] ? ` · ${esc(tr('peopleN', p.liveMax[i]))}` : ''}</span>${i === p.pick && state.avoidCrowd ? `<em>${esc(tr('suggested'))}</em>` : ''}</button>`,
      )
      .join('')}</div>`;
  const zones = p.zones[cur];
  if (zones.length)
    h += zones
      .map(
        (z) =>
          `<p class="crowd-warn">${esc(tr('crowdNote', isHi() ? z.hi : z.en, z.hours.map(([a, b]) => (a === 0 && b === 24 ? tr('allDay') : `${fmtHour(a)}–${fmtHour(b)}`)).join(', ')))}</p>`,
      )
      .join('');
  if (p.spread && cur === p.pick) h += `<p class="crowd-info">${esc(tr('spreadNote'))}</p>`;
  if (p.liveMax && p.liveMax[0] >= LIVE_LIMIT && p.routes.length > 1 && p.pick === 1)
    h += `<p class="crowd-warn">${esc(tr('limitNote', p.liveMax[0]))}</p>`;
  const live = liveNow();
  h += `<p class="crowd-src ${live ? 'on' : ''}"><i aria-hidden="true"></i>${esc(live ? tr('liveOn', live.trips) : tr('liveOff'))}</p>`;
  if (live?.demo && p.routes.length > 1) h += `<button type="button" class="btn" data-act="demoCrowd">${esc(tr('demoBtn'))}</button>`;
  h += `<label class="tg"><input type="checkbox" id="tg-crowd"${state.avoidCrowd ? ' checked' : ''}><span class="tg-ui" aria-hidden="true"></span><span>${esc(tr('avoidCrowd'))}</span></label>
    <p class="crowd-how">${esc(tr('crowdHow'))}</p></div>`;
  return h;
}
const fmtHour = (h: number) => (h === 0 || h === 24 ? '12 am' : h < 12 ? `${h} am` : h === 12 ? '12 pm' : `${h - 12} pm`);

export function renderHome() {
  const g = G(),
    S = g.site;
  if (!state.dest) {
    return `<div class="stack"><div><h2 class="vh">${esc(tr('popularT'))}</h2><p class="vd">${esc(tr('popularD'))}</p></div>
      <ul class="plist">${S.popular
        .filter((id) => g.places[id])
        .map((id) => placeRow(g.places[id]))
        .join('')}</ul></div>`;
  }
  const p = g.places[state.dest],
    r = state.route;
  let h = `<article class="dest"><div class="dest-top"><div class="thumb cat-${p.cat}"><span>${esc(p.num ? p.id : p.code)}</span></div>
    <div><h2>${esc(p.num ? p.id : pShort(p))}</h2><p class="dest-name">${esc(pName(p))}</p><p class="crumb">${esc(tr('cat_' + p.cat))} · ${esc(floorName(p.floor))}</p></div>
    <button type="button" class="icon-btn" data-act="clear" aria-label="${esc(tr('clear'))}">${icon('x', 18)}</button></div>`;
  if (S.photos?.[p.id]) h += `<img class="dest-photo" src="${S.photos[p.id]}" alt="${esc(pName(p))}">`;
  if (p.link)
    h += `<button type="button" class="btn linkbtn" data-act="link" data-s="${p.link.site}" data-n="${p.link.node}">${icon('floors', 18)}<span>${esc(L(p.link.label))}</span></button>`;
  if (r?.status === 'same') h += `<p class="oknote">${esc(tr('same'))}</p>`;
  else if (!r || r.status === 'none') h += `<p class="warnbox">${esc(tr('noRoute'))}</p>`;
  else
    h += `<button type="button" class="btn primary big" data-act="navstart">${icon('navi')}<span>${esc(tr('start'))}</span></button>
    <div class="dest-meta"><span>${icon('clock', 18)}${esc(tr('min', r.mins))}</span><span class="sep" aria-hidden="true"></span><span>${icon('walk', 18)}${esc(tr('m', fmtM(r.walk)))}</span></div>
    <p class="sf${r.stepFree ? '' : ' warn'}">${icon('wheel', 18)}${esc(r.stepFree ? tr('sfYes') : tr('sfNo'))}</p>`;
  if (S.cores.length)
    h += `<div class="toggles"><label class="tg"><input type="checkbox" id="tg-sf"${state.stepFree ? ' checked' : ''}><span class="tg-ui" aria-hidden="true"></span><span>${esc(tr('stepFree'))}</span></label>
    <label class="tg"><input type="checkbox" id="tg-lift"${state.liftDown ? ' checked' : ''}><span class="tg-ui" aria-hidden="true"></span><span>${esc(tr('liftDown'))}</span></label></div>`;
  if (r?.status === 'ok' && S.busy?.length) h += crowdPanel();
  h += `</article>`;
  if (r?.status === 'ok' && r.steps.length)
    h += `<section style="margin-top:18px"><h3 class="sec-t">${esc(tr('stepsT'))}</h3>${stepsList(r.steps, -1)}</section>`;
  return h;
}
