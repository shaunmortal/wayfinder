import type { Place } from '../data/types';
import { localMatch } from '../ai/localMatch';
import { G, state } from '../state';
import { $, esc } from './dom';
import { icon } from './icons';
import { L, floorName, pName, pShort, spotLabel, tr } from './bound';
import { siteSwitch } from './shell';

const micOk = () => 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;

export const codeChip = (p: Place) => `<span class="code cat-${p.cat}">${esc(p.num ? p.id : p.code)}</span>`;

export function renderHead() {
  const g = G(),
    S = g.site,
    sn = g.nodes[state.start];
  const notice = S.notice as { en?: string; hi?: string } | undefined;
  $('#head').innerHTML =
    `${siteSwitch()}${S.parent ? `<button type="button" class="btn-link backsite" data-act="link" data-s="${S.parent.site}" data-n="${S.parent.node}">${icon('chevL', 16)}<span>${esc(L(S.parent.label))}</span></button>` : ''}${notice ? `<p class="notice">${icon('info', 16)}<span>${esc(L(notice))}</span></p>` : ''}
  <div class="startchip">
    <span class="here-dot" aria-hidden="true"></span>
    <div class="sc-tx"><span class="eyebrow">${esc(tr('youAreHere'))}</span><b>${esc(spotLabel(state.start))}</b><span class="sub">${esc(floorName(sn.floor))}</span></div>
    <button type="button" class="btn-link" data-act="view" data-v="where">${esc(tr('change'))}</button>
  </div>
  <form class="ask" id="askForm" autocomplete="off" role="search">
    <div class="ask-row"><label class="ask-label" for="q">${esc(tr('askLabel'))}</label><span class="mode-badge ${state.aiOn ? 'ai' : 'off'}" title="${esc(tr(state.aiOn ? 'modeAiT' : 'modeOffT'))}"><i aria-hidden="true"></i>${esc(tr(state.aiOn ? 'modeAi' : 'modeOff'))}</span></div>
    <div class="askbox">${icon('search')}<input id="q" type="search" placeholder="${esc(L(S.askPh))}" value="${esc(state.query)}" enterkeyhint="go" aria-controls="sugg" aria-autocomplete="list">${state.aiOn ? `<button class="askmic" id="slipBtn" type="button" data-act="slip" aria-label="${esc(tr('slipAria'))}" title="${esc(tr('slipAria'))}">${icon('slip')}</button>` : ''}${micOk() ? `<button class="askmic" id="micBtn" type="button" data-act="mic" aria-label="${esc(tr('micAria'))}" title="${esc(tr('micAria'))}">${icon('mic')}</button>` : ''}<button class="askgo" type="submit" aria-label="${esc(tr('go'))}">${icon('arrow')}</button></div>
    <div class="sugg" id="sugg" role="listbox" hidden></div>${micOk() ? `<button type="button" class="btn-link onego" data-act="mic">${icon('mic', 16)}<span>${esc(tr('oneGo'))}</span></button>` : ''}
  </form>
  <div class="aimsg" id="aimsg" hidden></div>
  <div class="quick" role="group" aria-label="${esc(tr('quickT'))}">${S.quick
    .map((id) => {
      if (id === 'WC')
        return g.wc.length
          ? `<button type="button" class="chip cat-service" data-act="dest" data-id="WC"><i class="sw" aria-hidden="true"></i>${esc(tr('toilets'))}</button>`
          : '';
      const p = g.places[id];
      return p
        ? `<button type="button" class="chip cat-${p.cat}" data-act="dest" data-id="${p.id}"><i class="sw" aria-hidden="true"></i>${esc(pShort(p))}</button>`
        : '';
    })
    .join('')}</div>`;
  renderAiMsg();
}

export function renderSugg() {
  const box = $('#sugg'),
    inp = $<HTMLInputElement>('#q');
  if (!box || !inp) return;
  const q = inp.value.trim();
  state.query = inp.value;
  if (!q || document.activeElement !== inp) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  const ms = localMatch(G(), q, G().nodes[state.start].floor).slice(0, 5);
  let h = ms
    .map(
      (p) =>
        `<button type="button" class="sg" role="option" data-act="dest" data-id="${p.id}">${codeChip(p)}<span class="sg-n">${esc(pName(p))}</span><span class="sg-f">${esc(floorName(p.floor))}</span></button>`,
    )
    .join('');
  if (state.aiOn)
    h += `<button type="button" class="sg sg-ai" data-act="ask">${icon('spark', 18)}<span>${esc(tr('askClaude', q.slice(0, 60)))}</span></button>`;
  if (!h) h = `<p class="sg-empty">${esc(tr('noMatch'))}</p>`;
  box.innerHTML = h;
  box.hidden = false;
}
export function closeSugg() {
  const b = $('#sugg');
  if (b) {
    b.hidden = true;
    b.innerHTML = '';
  }
}

export function renderAiMsg() {
  const el = $('#aimsg'),
    a = state.ai;
  if (!el) return;
  if (a.status === 'idle') {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.classList.toggle('note', a.src === 'note' || a.src === 'search');
  if (a.status === 'thinking') {
    el.innerHTML = `<span class="spin" aria-hidden="true"></span><p>${esc(tr('thinking'))}</p><button type="button" class="btn-link" data-act="stopai">${esc(tr('stop'))}</button>`;
    return;
  }
  const src = a.src === 'claude' ? tr('viaClaude') : a.src === 'search' ? tr('viaSearch') : '';
  el.innerHTML = `${icon(a.src === 'claude' ? 'spark' : 'info', 18)}<p>${src ? `<span class="src">${esc(src)}</span>` : ''}</p><button type="button" class="icon-btn" data-act="closeai" aria-label="${esc(tr('clear'))}">${icon('x', 16)}</button>`;
  el.querySelector('p')!.append(document.createTextNode((state.lang === 'hi' ? a.hi || a.en : a.en || a.hi) || ''));
}
