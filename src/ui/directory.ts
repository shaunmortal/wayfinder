import { localMatch } from '../ai/localMatch';
import { G, state } from '../state';
import { esc } from './dom';
import { icon } from './icons';
import { floorName, tr } from './bound';
import { placeRow } from './home';

export function dirListHTML() {
  const g = G();
  let list = state.dirQ.trim() ? localMatch(g, state.dirQ, g.nodes[state.start].floor) : g.site.places.slice();
  if (state.cat !== 'all') list = list.filter((p) => p.cat === state.cat);
  if (!list.length) return `<p class="vd">${esc(tr('noMatch'))}</p>`;
  if (state.dirQ.trim()) return `<ul class="plist">${list.map((p) => placeRow(p)).join('')}</ul>`;
  return g.site.floors
    .map((f) => {
      const ps = list.filter((p) => p.floor === f.id);
      return ps.length ? `<h3 class="grp">${esc(floorName(f.id))}</h3><ul class="plist">${ps.map((p) => placeRow(p)).join('')}</ul>` : '';
    })
    .join('');
}

export function renderDir() {
  return `<div class="stack"><div><h2 class="vh">${esc(tr('dirT'))}</h2></div>
    <div class="askbox">${icon('search')}<label class="sr" for="dq">${esc(tr('dirSearch'))}</label><input id="dq" type="search" placeholder="${esc(tr('dirPh'))}" value="${esc(state.dirQ)}"></div>
    <div class="chips" role="group">${['all', ...G().site.cats]
      .map(
        (c) =>
          `<button type="button" class="chip${state.cat === c ? ' on' : ''}" data-act="cat" data-c="${c}" aria-pressed="${state.cat === c}">${c === 'all' ? '' : `<i class="sw cat-${c}" aria-hidden="true"></i>`}${esc(c === 'all' ? tr('all') : tr('cat_' + c))}</button>`,
      )
      .join('')}</div>
    <div id="dirList">${dirListHTML()}</div></div>`;
}
