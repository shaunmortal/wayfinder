import { G, state } from '../state';
import { esc } from './dom';
import { icon } from './icons';
import { L, isHi, tr } from './bound';

interface Bi {
  en: string;
  hi: string;
}
interface HelpData {
  desk?: string;
  deskT?: Bi;
  deskD?: Bi;
  phone?: Bi;
  emg?: string;
  emgT?: Bi;
  emgD?: Bi;
}

export function renderHelp() {
  const S = G().site,
    H = (S.help || {}) as HelpData;
  let h = `<div class="stack"><h2 class="vh">${esc(tr('helpT'))}</h2>`;
  h += `<div class="card2"><h3>${icon('fb')}${esc(tr('fbT'))}</h3><p>${esc(tr('fbHelpD'))}</p><div><button type="button" class="btn" data-act="view" data-v="fb">${esc(tr('v_fb'))}</button></div></div>`;
  h += `<div class="card2"><h3>${icon('info')}${esc(tr('offlineT'))}</h3><p>${esc(tr('offlineD'))}</p>
    <label class="tg"><input type="checkbox" id="tg-offline"${state.offlineDemo ? ' checked' : ''}><span class="tg-ui" aria-hidden="true"></span><span>${esc(tr('offlineTg'))}</span></label></div>`;
  if (H.desk)
    h += `<div class="card2"><h3>${icon('help')}${esc(L(H.deskT))}</h3><p>${esc(L(H.deskD))}</p>${H.phone ? `<p>${esc(L(H.phone))}</p>` : ''}<div><button type="button" class="btn" data-act="dest" data-id="${H.desk}">${icon('navi', 18)}<span>${esc(tr('showWay'))}</span></button></div></div>`;
  if (H.emg)
    h += `<div class="card2 emg"><h3>${icon('emg')}${esc(L(H.emgT))}</h3><p>${esc(L(H.emgD))}</p><div><button type="button" class="btn danger" data-act="dest" data-id="${H.emg}">${icon('navi', 18)}<span>${esc(tr('showWay'))}</span></button></div></div>`;
  const about = S.about as Record<'en' | 'hi', string[]> | undefined;
  const ab = about ? (isHi() ? about.hi || about.en : about.en) : null;
  if (ab) h += `<div class="card2 about"><h3>${icon('info')}${esc(tr('aboutT'))}</h3>${ab.map((p) => `<p>${esc(p)}</p>`).join('')}</div>`;
  return h + `</div>`;
}
