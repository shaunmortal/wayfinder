import { G, state } from '../state';
import { esc } from './dom';
import { icon } from './icons';
import { placeLabel, tr } from './bound';

const FACES = ['😞', '🙁', '😐', '🙂', '😄'];

export function renderFeedback() {
  let h = `<div class="stack"><h2 class="vh">${esc(tr('v_fb'))}</h2>`;
  if (state.fbSent)
    return (
      h +
      `<div class="card2"><h3>${icon('fb')}${esc(tr('fbThanksT'))}</h3><p>${esc(tr('fbThanksD'))}</p>
      <div><button type="button" class="btn" data-act="fbAgain">${esc(tr('fbAgain'))}</button></div></div></div>`
    );
  const p = state.dest ? G().site.places.find((x) => x.id === state.dest) : undefined;
  h += `<div class="card2 fb"><h3>${icon('fb')}${esc(tr('fbT'))}</h3><p>${esc(p ? tr('fbAbout', placeLabel(p)) : tr('fbD'))}</p>
    <fieldset class="fb-rate"><legend>${esc(tr('fbRate'))}</legend>${FACES.map(
      (f, i) =>
        `<label><input type="radio" name="fbr" value="${i + 1}"><span class="chip" title="${esc(tr('fbR' + (i + 1)))}"><span aria-hidden="true">${f}</span><span>${esc(tr('fbR' + (i + 1)))}</span></span></label>`,
    ).join('')}</fieldset>
    <label class="fb-l" for="fbText">${esc(tr('fbTextL'))}</label>
    <textarea id="fbText" rows="4" maxlength="500" placeholder="${esc(tr('fbPh'))}"></textarea>
    <p class="fb-note">${esc(tr('fbNoPii'))}</p>
    <div><button type="button" class="btn primary" data-act="fbSend">${esc(tr('fbSend'))}</button></div>
    <p id="fbMsg" class="fb-msg" role="status"></p></div>`;
  return h + `</div>`;
}
