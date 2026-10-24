import type { Core, Place } from '../data/types';
import { G, state } from '../state';
import { esc } from './dom';
import { icon } from './icons';
import { coreName, floorName, pName, tr } from './bound';
import { codeChip } from './head';

export function renderWhere() {
  const g = G(),
    S = g.site;
  let h = `<div class="stack"><div><h2 class="vh">${esc(tr('whereT'))}</h2><p class="vd">${esc(tr('whereD'))}</p></div>`;
  if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    h += `<div class="card2"><h3>${icon('mic')}${esc(tr('whereMicT'))}</h3><p>${esc(tr('whereMicD'))}</p><div><button type="button" class="btn primary" data-act="micWhere">${icon('mic', 18)}<span>${esc(tr('whereMicBtn'))}</span></button></div></div>`;
  if (state.aiOn) {
    const ph = state.photo;
    h += `<div class="card2"><h3>${icon('camera')}${esc(tr('photoT'))}</h3><p>${esc(tr('photoD'))}</p>
      ${ph.status === 'reading' ? `<p class="aimsg" style="display:grid"><span class="spin" aria-hidden="true"></span><span>${esc(tr('photoReading'))}</span><span></span></p>` : `<div><button type="button" class="btn" data-act="photo">${icon('camera', 18)}<span>${esc(tr('photoBtn'))}</span></button></div>`}
      ${ph.status === 'found' || ph.status === 'none' ? `<p class="${ph.status === 'found' ? 'oknote' : 'warnbox'}" id="photoMsg"></p>` : ''}</div>`;
  }
  h += `<p class="vd">${esc(tr('whereDemo'))}</p>`;
  h += S.floors
    .map((f) => {
      const spots = [
        ...S.places.filter((p) => p.floor === f.id && p.gate).map((p) => p.id),
        ...S.cores.filter((c) => c.floor === f.id).map((c) => c.id),
        ...S.places.filter((p) => p.floor === f.id && !p.gate).map((p) => p.id),
      ];
      return `<h3 class="grp">${esc(floorName(f.id))}</h3><ul class="plist">${spots
        .map((id) => {
          const n = g.nodes[id],
            isCore = n.kind === 'lift' || n.kind === 'stairs';
          const chip = isCore ? `<span class="code cat-service">${icon(n.kind, 16)}</span>` : codeChip(n.ref as Place);
          const name = isCore ? coreName(n.ref as Core) : pName(n.ref as Place);
          return `<li><button type="button" class="prow" data-act="start" data-id="${id}"${state.start === id ? ' aria-current="true"' : ''}>${chip}<span><span class="pn">${esc(name)}</span><span class="pf">#${esc(id)}</span></span>${state.start === id ? icon('here', 18) : icon('chevR', 18)}</button></li>`;
        })
        .join('')}</ul>`;
    })
    .join('');
  return h + `<details class="more card2"><summary>${esc(tr('qrT'))}</summary><p>${esc(tr('qrD'))}</p></details></div>`;
}
