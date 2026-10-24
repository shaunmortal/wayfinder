import { G, state } from '../state';
import { esc } from './dom';
import { floorName, isHi, tr } from './bound';

export function renderFloors() {
  const S = G().site;
  return `<div class="stack"><div><h2 class="vh">${esc(tr('floorsT'))}</h2><p class="vd">${esc(tr('floorsD'))}</p></div>
  <div class="fcards">${S.floors
    .map((f) => {
      const ps = S.places.filter((p) => p.floor === f.id),
        cats = [...new Set(ps.map((p) => p.cat))];
      return `<button type="button" class="fcard" data-act="floor" data-f="${f.id}" aria-pressed="${state.floor === f.id}"><span class="fid">${f.id}</span><b>${esc(floorName(f.id))}</b><p>${esc(isHi() ? f.sumHi || '' : f.sumEn || '')}</p><span class="fid">${esc(tr('places', ps.length))}</span><span class="sws">${cats.map((c) => `<i class="sw cat-${c}" aria-hidden="true"></i>`).join('')}</span></button>`;
    })
    .join('')}</div></div>`;
}
