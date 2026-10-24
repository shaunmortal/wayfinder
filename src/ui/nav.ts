import { stepSecs } from '../engine/steps';
import type { Step } from '../data/types';
import { G, okRoute, state } from '../state';
import { esc, isPhone } from './dom';
import { icon } from './icons';
import { floorName, fmtS, pName, pShort, stepIcon, stepMeta, stepText, tr } from './bound';
import { stepsList } from './home';
import { photoFor, sceneFor } from './scene';
import { hooks } from '../map2d/viewport';
import { voiceName } from '../voice/speak';

const micOk = () => 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;

/** "Problem on the way?": speak it, or tap lift / blocked / stairs; only offers what the rest of the route uses. */
function issueBox(ahead: Step[]) {
  const lift = ahead.some((s) => s.kind === 'lift'),
    stairs = ahead.some((s) => s.kind === 'stairs');
  const note = state.navNote ? `<p class="nv-note">${esc(state.lang === 'hi' ? state.navNote.hi : state.navNote.en)}</p>` : '';
  return `<div class="nv-issue">${note}<b>${esc(tr('issueT'))}</b><div class="nv-issue-btns">
    ${micOk() ? `<button type="button" class="btn primary" data-act="navMic">${icon('mic', 18)}<span>${esc(tr('issueMic'))}</span></button>` : ''}
    ${lift ? `<button type="button" class="btn" data-act="navIssue" data-k="lift">${icon('lift', 18)}<span>${esc(tr('issueLift'))}</span></button>` : ''}
    <button type="button" class="btn" data-act="navIssue" data-k="block">${icon('x', 18)}<span>${esc(tr('issueBlock'))}</span></button>
    ${stairs ? `<button type="button" class="btn" data-act="navIssue" data-k="stairs">${icon('wheel', 18)}<span>${esc(tr('issueStairs'))}</span></button>` : ''}
  </div></div>`;
}

export function renderNav() {
  const r = okRoute()!,
    i = state.stepIdx,
    st = r.steps[i],
    n = r.steps.length,
    last = i === n - 1;
  const p = G().places[state.dest!];
  let rem = 0;
  for (let k = i; k < n; k++) rem += stepSecs(r.steps[k]);
  const meta = stepMeta(st),
    ph = photoFor(st);
  return `<div class="navv">
    <div class="nv-banner"><span class="nv-ic">${icon(stepIcon(st), 32)}</span><div><p class="nv-instr" aria-live="polite">${esc(stepText(st))}</p><p class="nv-meta">${esc(tr('stepOf', i + 1, n))}${meta ? ' · ' + esc(meta) : ''}</p></div></div>
    <div class="nv-prog" aria-hidden="true">${r.steps.map((_, k) => `<span class="${k <= i ? 'on' : ''}"></span>`).join('')}</div>
    ${
      ph
        ? `<figure class="nv-scene"><img class="scene-photo" src="${ph}" alt="${esc(stepText(st))}"><figcaption>${esc(tr('photoCap'))}</figcaption></figure>`
        : hooks.is3D()
          ? `<figure class="nv-scene nv-3d"><canvas id="nvView" width="${isPhone() ? 640 : 960}" height="${isPhone() ? 360 : 540}" role="img" aria-label="${esc(stepText(st))}"></canvas><span class="nv-arrow" aria-hidden="true">${icon(stepIcon(st), 44)}</span><figcaption>${esc(tr('viewCap'))}</figcaption></figure>`
          : `<figure class="nv-scene">${sceneFor(st)}<figcaption>${esc(tr('sceneCap'))}</figcaption></figure>`
    }
    <div class="nv-ctl">
      <button type="button" class="btn" data-act="prev"${i === 0 ? ' disabled' : ''}>${icon('chevL', 18)}<span>${esc(tr('back'))}</span></button>
      ${'speechSynthesis' in window ? `<button type="button" class="btn" data-act="voice" aria-pressed="${state.voice}">${icon('speaker', 18)}<span>${esc(tr('voice'))}</span></button>` : '<span></span>'}
      <button type="button" class="btn primary" data-act="next"><span>${esc(last ? tr('done') : tr('next'))}</span>${icon('chevR', 18)}</button>
    </div>
    ${issueBox(r.steps.slice(i))}
    ${'speechSynthesis' in window ? `<button type="button" class="btn-link nv-voice" data-act="nextVoice">${icon('speaker', 16)}<span>${esc(tr('voiceChange'))}${voiceName() ? ` · ${esc(voiceName())}` : ''}</span></button>` : ''}
    <div class="nv-foot"><div class="nv-dest"><b>${esc(p.num ? p.id : pShort(p))}</b><span>${esc(pName(p))}</span><small>${esc(floorName(p.floor))} · ${esc(fmtS(rem))}</small></div><button type="button" class="btn danger" data-act="navend">${esc(tr('end'))}</button></div>
    <button type="button" class="btn-link" data-act="view" data-v="help">${icon('help', 18)}<span>${esc(tr('lost'))}</span></button>
    <details class="more"><summary>${esc(tr('allSteps'))}</summary>${stepsList(r.steps, i)}</details>
  </div>`;
}
