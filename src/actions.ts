// All user actions (data-act handlers) and the document-level event wiring.
import { AiFail, ask, locate, readSlip, sendFeedback } from './ai/client';
import { demoCrowd, endTrip, fetchLive, startTrip } from './ai/live';
import { parseTrip } from './ai/localMatch';
import { nearestOf } from './engine/route';
import { fitFloor, fitRoute, fitStep, zoomCenter, hooks } from './map2d/viewport';
import { buildFloors } from './map2d/draw';
import { renderMap, routeFloors } from './map2d/route2d';
import { G, enterSite, graphById, graphs, okRoute, recompute, state } from './state';
import { $, isPhone, toast } from './ui/dom';
import { dirListHTML } from './ui/directory';
import { closeSugg, renderAiMsg, renderHead, renderSugg } from './ui/head';
import { placeLabel, spotLabel, stepText, tr } from './ui/bound';
import { renderAll, renderBody } from './ui/render';
import { renderChrome } from './ui/shell';
import { nextVoice, noHindiVoice, speak, stopSpeaking, type Bilingual } from './voice/speak';
import { t, type Lang } from './i18n';
import * as T from './engine/text';
import { classifyIssue, type Issue } from './engine/issue';
import type { Core, Step } from './data/types';

/** Load the 3D view on demand; on failure (e.g. offline chunk) stay on the 2D map. */
export async function toggle3D(on: boolean, real = false) {
  if (!on && !hooks.is3D()) return;
  const msg = $('#v3msg');
  if (on) {
    msg.textContent = tr('loading3d');
    msg.hidden = false;
  }
  try {
    (await import('./map3d/view')).set3D(on, real);
  } catch {
    toast(tr('no3d'));
  } finally {
    msg.hidden = true;
  }
  renderChrome(hooks.is3D());
}

interface RecogResult {
  isFinal: boolean;
  0: { transcript: string };
}
type Recog = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<RecogResult> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
let recog: Recog | null = null;

/**
 * Mic input (Web Speech API). Always listens in hi-IN: it understands Hindi, Hinglish and Indian English, and
 * Claude / the offline search read both Devanagari and Latin text. Words appear in the box while speaking.
 */
function listen(onText: (text: string) => void = (text) => askClaude(text, true)) {
  const w = window as unknown as { SpeechRecognition?: new () => Recog; webkitSpeechRecognition?: new () => Recog };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return toast(tr('micNo'));
  if (recog) return recog.stop(); // second tap = stop listening
  const r = new Ctor();
  r.lang = 'hi-IN';
  r.interimResults = true;
  const btn = () => document.querySelector('#micBtn');
  const inp = () => $<HTMLInputElement>('#q');
  let finalText = '',
    failed = false;
  r.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) finalText += res[0].transcript;
      else interim += res[0].transcript;
    }
    if (inp()) inp()!.value = (finalText + interim).trim();
  };
  r.onerror = (e) => {
    failed = true;
    // not-allowed: permission denied, or the page is on plain http (phones need https for the mic)
    const key =
      e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'micDenied'
        : e.error === 'audio-capture'
          ? 'micNone'
          : e.error === 'network'
            ? 'micNet'
            : 'micErr';
    toast(tr(key));
  };
  r.onend = () => {
    recog = null;
    btn()?.classList.remove('on');
    const text = finalText.trim();
    if (text) {
      state.query = text;
      onText(text);
    } else if (!failed) toast(tr('micErr'));
  };
  try {
    r.start();
  } catch {
    toast(tr('micDenied'));
    return;
  }
  recog = r;
  btn()?.classList.add('on');
  toast(tr('listening'));
}

const stepBoth = (st: Step): Bilingual => bi((l) => T.stepText(G(), okRoute()!, st, l));

const scrollTo = (sel: string) => $(sel).scrollIntoView({ behavior: 'smooth', block: 'start' });
const redraw = () => {
  renderChrome(hooks.is3D());
  renderHead();
  renderBody();
  renderMap();
};

export function goTo(id: string) {
  const g = G();
  if (id === 'WC') id = nearestOf(g, state.start, g.wc, { stepFree: state.stepFree, liftDown: state.liftDown });
  if (!g.places[id]) return;
  if (state.ai.status === 'thinking') {
    stopAi();
    state.ai = { status: 'idle' };
  }
  Object.assign(state, { dest: id, nav: false, stepIdx: 0, view: 'home', routeIdx: null, blocked: { groups: [], edges: [] } });
  recompute();
  state.floor = g.nodes[state.start].floor;
  closeSugg();
  redraw();
  fitRoute();
  if (isPhone()) scrollTo('#mapwrap');
  refreshLive();
}

export function setStart(id: string) {
  if (!G().startable.includes(id)) return;
  Object.assign(state, { start: id, floor: G().nodes[id].floor, view: 'home', nav: false, photo: { status: 'idle' }, routeIdx: null });
  recompute();
  renderAll(hooks.is3D());
  fitRoute();
  toast(tr('startSet', spotLabel(id)));
}

export function switchSite(id: string, startId?: string | null) {
  stopSpeaking();
  stopAi();
  endTrip();
  enterSite(id, startId);
  state.blocked = { groups: [], edges: [] };
  state.live = null;
  refreshLive();
  buildFloors($('#floors'));
  recompute();
  renderAll(hooks.is3D());
  fitRoute();
}

/** The same message in both languages, so switching language (or reading it aloud) never loses it. */
const bi = (f: (l: Lang) => string): Bilingual => ({ en: f('en'), hi: f('hi') });
const biKey = (key: string, ...a: unknown[]) => bi((l) => t(l, key, ...a));
const biPlace = (key: string, id: string) => bi((l) => t(l, key, T.placeLabel(G().places[id], l)));

/** Show a reply under the ask box; read it aloud too when the question was spoken into the mic. */
function reply(src: 'claude' | 'search' | 'note', msg: Bilingual, aloud: boolean) {
  state.ai = { status: 'done', src, ...msg };
  renderAiMsg();
  if (aloud) speak(msg);
}

/** Free-text search without AI: take the best local match. */
function localPick(q: string, afterError = false, aloud = false) {
  const g = G(),
    trip = parseTrip(g, q, g.nodes[state.start].floor);
  if (!trip.start && !trip.dest) return reply('note', biKey('noMatch'), aloud);
  applyTrip(trip.start ?? null, trip.dest ?? null);
  const msg = trip.dest
    ? trip.start
      ? bi((l) => t(l, 'tripSet', T.spotLabel(g, trip.start!, l), T.placeLabel(g.places[state.dest!], l)))
      : biPlace('destSet', state.dest!)
    : bi((l) => t(l, 'hereAsk', T.spotLabel(g, trip.start!, l)));
  reply('search', afterError ? biKey('claudeErr') : msg, aloud);
}

/** Set "you are here" and/or the destination from one sentence; with only a start, keep any destination already chosen. */
function applyTrip(start: string | null, dest: string | null) {
  const g = G();
  if (start && g.startable.includes(start)) Object.assign(state, { start, floor: g.nodes[start].floor, routeIdx: null });
  if (dest) {
    goTo(dest === 'WC' || g.places[dest]?.code === 'WC' ? 'WC' : dest);
    return;
  }
  Object.assign(state, { view: 'home', nav: false });
  recompute();
  renderAll(hooks.is3D());
  fitRoute();
}

let aiCtl: AbortController | null = null;
const stopAi = () => {
  aiCtl?.abort();
  aiCtl = null;
};

/** Ask Claude to understand free text; on any failure use the offline search instead. */
async function askClaude(q: string, aloud = false) {
  q = q.trim();
  if (!q) return;
  if (!state.aiOn) return localPick(q, false, aloud);
  stopAi();
  const ctl = new AbortController(),
    site = state.site;
  aiCtl = ctl;
  state.ai = { status: 'thinking' };
  closeSugg();
  renderAiMsg();
  try {
    const o = await ask(site, q, state.start, state.lang, ctl.signal);
    if (aiCtl !== ctl || state.site !== site) return;
    aiCtl = null;
    const g = G(),
      said = o.reply_en && o.reply_hi ? { en: o.reply_en, hi: o.reply_hi } : null,
      start = o.start_id && g.startable.includes(o.start_id) ? o.start_id : null,
      dest = o.destination_id && g.places[o.destination_id] ? o.destination_id : null;
    if (!start && !dest) return reply('claude', said ?? biKey('noMatch'), aloud);
    applyTrip(start, dest);
    reply('claude', said ?? (dest ? biPlace('destSet', dest) : bi((l) => t(l, 'hereAsk', T.spotLabel(g, start!, l)))), aloud);
  } catch (e) {
    if (aiCtl !== ctl) return;
    aiCtl = null;
    const code = e instanceof AiFail ? e.code : 'upstream';
    if (code === 'cancelled') {
      state.ai = { status: 'idle' };
      renderAiMsg();
      return;
    }
    if (code === 'no_key') state.aiOn = false;
    if (code === 'rate_limited') return reply('note', biKey('rateLim'), aloud);
    localPick(q, true, aloud);
  }
}

/** "Where am I" by voice: any place named ("main 203 mein hoon", "OT ke bahar") becomes "you are here". */
async function whereByVoice(text: string) {
  const g = G(),
    trip = parseTrip(g, text, g.nodes[state.start].floor),
    local = trip.start ?? trip.dest;
  const confirm = (id: string) => {
    setStart(id);
    reply(
      'search',
      bi((l) => t(l, 'hereAsk', T.spotLabel(g, id, l))),
      true,
    );
  };
  if (local && g.startable.includes(local)) return confirm(local);
  if (!state.aiOn) return reply('note', biKey('noMatch'), true);
  try {
    const o = await ask(state.site, text, state.start, state.lang);
    const id = [o.start_id, o.destination_id].find((x) => x && g.startable.includes(x));
    if (id) return confirm(id);
  } catch {
    /* fall through */
  }
  reply('note', biKey('noMatch'), true);
}

/** OPD slip / prescription photo → Claude reads the department or room → route there. */
async function slipToRoute(file: File) {
  const site = state.site;
  stopAi();
  state.ai = { status: 'thinking' };
  closeSugg();
  renderAiMsg();
  try {
    const o = await readSlip(site, file);
    if (state.site !== site) return;
    const g = G();
    if (!o.destination_id || !g.places[o.destination_id]) return reply('note', biKey('slipNone'), false);
    goTo(o.destination_id);
    reply('claude', o.reply_en && o.reply_hi ? { en: o.reply_en, hi: o.reply_hi } : biPlace('destSet', o.destination_id), false);
  } catch (e) {
    const code = e instanceof AiFail ? e.code : 'upstream';
    if (code === 'no_key') state.aiOn = false;
    reply('note', biKey(code === 'rate_limited' ? 'rateLim' : 'slipNone'), false);
  }
}

/** "Where am I" from a photo of a nearby sign (Claude vision). */
async function locateByPhoto(file: File) {
  const site = state.site;
  state.photo = { status: 'reading' };
  renderBody();
  try {
    const o = await locate(site, file);
    if (state.site !== site) return;
    const g = G(),
      id = o.node_id && g.startable.includes(o.node_id) ? o.node_id : null;
    if (id) {
      Object.assign(state, { start: id, floor: g.nodes[id].floor });
      recompute();
      state.photo = { status: 'found', text: tr('photoFound', spotLabel(id), o.text_read) };
    } else state.photo = { status: 'none', text: tr('photoNone') };
  } catch (e) {
    const code = e instanceof AiFail ? e.code : 'upstream';
    if (code === 'no_key') state.aiOn = false;
    state.photo = { status: 'none', text: code === 'rate_limited' ? tr('rateLim') : tr('photoNone') };
  }
  renderHead();
  renderBody();
  renderMap();
  fitRoute();
}

/**
 * A problem reported mid-walk: mark the lift / corridor / stairs as unusable and route again from where the visitor
 * is now (the start of the current step), without leaving step-by-step mode. Works offline.
 */
function navIssue(kind: Issue, aloud: boolean) {
  const r = okRoute();
  if (!r || !state.nav) return;
  const g = G(),
    path = r.path,
    st = r.steps[state.stepIdx];
  if (kind === 'block' && st.kind === 'lift') kind = 'lift'; // "blocked" while at the lift means the lift
  const hereIdx = st.kind === 'lift' || st.kind === 'stairs' ? st.v0 : st.i0;
  const here = path[hereIdx];
  let liftName: Bilingual | null = null;
  if (kind === 'lift') {
    const ls = r.steps.slice(state.stepIdx).find((s) => s.kind === 'lift');
    if (!ls) return say(biKey('issueNoLift'), aloud);
    const core = g.nodes[path[ls.v0]].ref as Core;
    if (!state.blocked.groups.includes(core.group)) state.blocked.groups.push(core.group);
    liftName = bi((l) => T.coreName(g, core, l));
  } else if (kind === 'stairs') {
    state.stepFree = true;
  } else {
    // Block the stretch ahead of the visitor (both directions).
    const a = path[hereIdx],
      b = path[hereIdx + 1];
    if (b && g.nodes[a].floor === g.nodes[b].floor) state.blocked.edges.push(`${a}|${b}`, `${b}|${a}`);
  }
  const before = state.start;
  Object.assign(state, { start: here, floor: g.nodes[here].floor, routeIdx: null });
  recompute();
  const nr = okRoute();
  if (!nr) {
    state.start = before;
    recompute();
    return say(biKey('issueNone'), aloud);
  }
  state.stepIdx = 0;
  startTrip(state.site, nr.path, nr.secs);
  const m = T.fmtM(nr.walk);
  const msg =
    kind === 'lift'
      ? bi((l) => t(l, 'issueLiftOk', liftName![l], m))
      : kind === 'stairs'
        ? biKey('issueStairsOk', m)
        : biKey('issueBlockOk', m);
  state.navNote = msg;
  focusStep();
  renderChrome(hooks.is3D());
  say(msg, aloud);
}

/** Toast + (when the visitor spoke) read aloud, used on the step-by-step screen where the reply box is hidden. */
function say(msg: Bilingual, aloud: boolean) {
  toast(state.lang === 'hi' ? msg.hi : msg.en);
  if (aloud) speak(msg);
}

function focusStep() {
  const r = okRoute()!,
    st = r.steps[state.stepIdx];
  state.floor = st.floor;
  renderBody();
  renderMap();
  fitStep(st);
  $('#body').scrollTop = 0;
  if (state.voice) speak(stepBoth(st));
}
/** Fetch live walker counts; if they changed the suggestion, show the new options (never mid-walk). */
async function refreshLive() {
  const site = state.site,
    live = state.offlineDemo ? null : await fetchLive(site);
  if (state.site !== site) return;
  state.live = live;
  if (state.dest && !state.nav) {
    recompute();
    renderBody();
    renderMap();
  }
}

function navStart(i = 0) {
  const r = okRoute();
  if (!r || !r.steps.length) return;
  if (!state.nav) {
    startTrip(state.site, r.path, r.secs); // count this phone on its route (no-op offline)
    state.navNote = null;
  }
  Object.assign(state, { nav: true, stepIdx: i });
  renderChrome(hooks.is3D());
  focusStep();
  if (isPhone()) scrollTo('#mapwrap');
}
function navEnd(arrived: boolean) {
  endTrip();
  state.navNote = null;
  state.nav = false;
  stopSpeaking();
  // Ask for feedback once per phone, after the first trip that ends with "I have arrived"; never again after that.
  if (arrived && !seen(FB_ASKED)) {
    state.view = 'fb';
    state.fbSent = false;
  }
  redraw();
  fitRoute();
  if (arrived) toast(tr('arrived'));
}

const FB_ASKED = 'raasta-fb-asked';
/** Reads and sets a one-time flag; without storage (private mode) it says "seen" so we never nag. */
function seen(key: string) {
  try {
    if (localStorage.getItem(key)) return true;
    localStorage.setItem(key, '1');
    return false;
  } catch {
    return true;
  }
}

function fbSend() {
  const rating = Number(document.querySelector<HTMLInputElement>('input[name="fbr"]:checked')?.value || 0);
  const msg = $('#fbMsg'),
    btn = $<HTMLButtonElement>('[data-act="fbSend"]');
  if (!rating) {
    msg.textContent = tr('fbPick');
    return;
  }
  btn.disabled = true;
  msg.textContent = tr('fbSending');
  const text = $<HTMLTextAreaElement>('#fbText').value;
  sendFeedback({ siteId: state.site, rating, text, dest: state.dest, lang: state.lang })
    .then(() => {
      state.fbSent = true;
      try {
        localStorage.setItem(FB_ASKED, '1');
      } catch {
        /* storage blocked */
      }
      if (state.view === 'fb') renderBody();
    })
    .catch(() => {
      // ponytail: no offline outbox; the visitor can press Send again once online.
      btn.disabled = false;
      msg.textContent = tr('fbFail');
    });
}

export function act(el: { dataset: DOMStringMap; classList?: DOMTokenList; setAttribute?: (k: string, v: string) => void }) {
  const d = el.dataset;
  switch (d.act) {
    case 'view': {
      const S = G().site,
        emg = (S.help as { emg?: string } | undefined)?.emg;
      if (d.v === 'emg') {
        if (emg) goTo(emg);
        return;
      }
      state.view = d.v as typeof state.view;
      if (state.nav) {
        state.nav = false;
        stopSpeaking();
      }
      redraw();
      if (isPhone() && state.view !== 'home') scrollTo('#body');
      break;
    }
    case 'site':
      if (d.s !== state.site) switchSite(d.s!);
      break;
    case 'link': {
      switchSite(d.s!, d.n);
      const S = G().site;
      if (S.parent && S.defaults.dest && S.defaults.dest !== state.start) goTo(S.defaults.dest);
      break;
    }
    case 'dest':
      goTo(d.id!);
      break;
    case 'start':
      setStart(d.id!);
      break;
    case 'ask':
      askClaude($<HTMLInputElement>('#q')?.value ?? '');
      break;
    case 'stopai':
      stopAi();
      state.ai = { status: 'idle' };
      renderAiMsg();
      break;
    case 'slip':
      $<HTMLInputElement>('#slipIn').click();
      break;
    case 'photo':
      $<HTMLInputElement>('#photoIn').click();
      break;
    case 'closeai':
      state.ai = { status: 'idle' };
      renderAiMsg();
      break;
    case 'clear':
      Object.assign(state, { dest: null, route: null, ai: { status: 'idle' } });
      renderHead();
      renderBody();
      renderMap();
      fitFloor();
      break;
    case 'floor':
      state.floor = d.f!;
      if (state.view === 'floors') renderBody();
      renderMap();
      (routeFloors().has(state.floor) ? fitRoute : fitFloor)();
      if (isPhone() && el.classList?.contains('fcard')) scrollTo('#mapwrap');
      break;
    case 'zin':
      zoomCenter(0.75);
      break;
    case 'zout':
      zoomCenter(1.33);
      break;
    case 'zfit':
      fitFloor();
      break;
    case 'lang':
      state.lang = state.lang === 'hi' ? 'en' : 'hi';
      try {
        localStorage.setItem('raasta-lang', state.lang);
      } catch {
        /* storage blocked */
      }
      if (state.photo.status !== 'reading') state.photo = { status: 'idle' };
      buildFloors($('#floors'));
      renderAll(hooks.is3D());
      break;
    case 'navstart':
      navStart(0);
      break;
    case 'fbSend':
      fbSend();
      break;
    case 'fbAgain':
      state.fbSent = false;
      renderBody();
      break;
    case 'navend':
      navEnd(false);
      break;
    case 'step':
      navStart(+d.i!);
      break;
    case 'next': {
      const r = okRoute()!;
      if (state.stepIdx < r.steps.length - 1) {
        state.stepIdx++;
        focusStep();
      } else navEnd(true);
      break;
    }
    case 'prev':
      if (state.stepIdx > 0) {
        state.stepIdx--;
        focusStep();
      }
      break;
    case 'nextVoice': {
      const name = nextVoice();
      toast(name ? tr('voiceNow', name) : tr('voiceOnly'));
      if (state.nav) speak(stepBoth(okRoute()!.steps[state.stepIdx]));
      renderBody();
      break;
    }
    case 'voice':
      state.voice = !state.voice;
      el.setAttribute?.('aria-pressed', String(state.voice));
      if (state.voice) {
        speak(stepBoth(okRoute()!.steps[state.stepIdx]));
        if (noHindiVoice()) toast(tr('noHindiVoice'));
      } else stopSpeaking();
      break;
    case 'cat':
      state.cat = d.c!;
      renderBody();
      break;
    case 'vmode': {
      const m = d.m as '2d' | '3d' | 'real';
      try {
        localStorage.setItem('raasta-view', m);
      } catch {
        /* storage blocked */
      }
      toggle3D(m !== '2d', m === 'real');
      break;
    }
    case 'demoCrowd': {
      const p = state.plan;
      if (p) demoCrowd(state.site, p.routes[0].path).then(refreshLive);
      break;
    }
    case 'pickRoute':
      state.routeIdx = +d.i!;
      recompute();
      renderBody();
      renderMap();
      fitRoute();
      break;
    case 'mic':
      listen();
      break;
    case 'navIssue':
      navIssue(d.k as Issue, false);
      break;
    case 'navMic':
      listen((text) => {
        const k = classifyIssue(text);
        if (k) navIssue(k, true);
        else say(biKey('issueUnknown'), true);
      });
      break;
    case 'micWhere':
      listen(whereByVoice);
      break;
  }
}

const readHash = () => {
  try {
    return decodeURIComponent((location.hash || '').slice(1));
  } catch {
    return '';
  }
};

/** `#<siteId>` opens a site; `#<nodeId>` sets "you are here". Returns true if the hash named something. */
export function applyHash(initial: boolean) {
  const h = readHash();
  if (!h) return false;
  const bySite = graphById(h);
  const owner = bySite ?? graphs.find((g) => g.startable.includes(h));
  if (!owner) return false;
  if (initial) enterSite(owner.site.id, bySite ? null : h);
  else if (owner.site.id !== state.site) switchSite(owner.site.id, bySite ? null : h);
  else if (!bySite) setStart(h);
  return true;
}

export function wireEvents() {
  hooks.onAct = (el) => act(el);
  hooks.onRoom = (id) => goTo(id);
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('#map')) return;
    const el = target.closest<HTMLElement>('[data-act]');
    if (el && !(el as HTMLButtonElement).disabled) {
      act(el);
      return;
    }
    if (!target.closest('.ask')) closeSugg();
  });
  document.addEventListener('keydown', (e) => {
    const el = e.target as HTMLElement;
    if ((e.key === 'Enter' || e.key === ' ') && el.classList?.contains('bdg')) {
      e.preventDefault();
      act(el as unknown as HTMLElement);
      return;
    }
    if (e.key === 'Escape') closeSugg();
    if (state.nav && !/INPUT|TEXTAREA/.test(el.tagName || '')) {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        act({ dataset: { act: 'next' } });
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        act({ dataset: { act: 'prev' } });
      }
    }
  });
  document.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'q') renderSugg();
    if (t.id === 'dq') {
      state.dirQ = t.value;
      const l = $('#dirList');
      if (l) l.innerHTML = dirListHTML();
    }
  });
  document.addEventListener('focusin', (e) => {
    if ((e.target as HTMLElement).id === 'q') renderSugg();
  });
  document.addEventListener('submit', (e) => {
    if ((e.target as HTMLElement).id !== 'askForm') return;
    e.preventDefault();
    const inp = $<HTMLInputElement>('#q'),
      q = inp.value.trim();
    if (!q) return;
    state.query = inp.value;
    closeSugg();
    askClaude(q);
  });
  document.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'tg-sf') {
      state.stepFree = t.checked;
      recompute();
      renderBody();
      renderMap();
      fitRoute();
    }
    if (t.id === 'tg-lift') {
      state.liftDown = t.checked;
      recompute();
      renderBody();
      renderMap();
      fitRoute();
    }
    if (t.id === 'tg-crowd' || t.id === 'tg-hour') {
      if (t.id === 'tg-crowd') state.avoidCrowd = t.checked;
      else state.hourPick = (t as unknown as HTMLSelectElement).value === '' ? null : Number((t as unknown as HTMLSelectElement).value);
      state.routeIdx = null;
      recompute();
      renderBody();
      renderMap();
      fitRoute();
    }
    if (t.id === 'slipIn') {
      const f = t.files?.[0];
      t.value = '';
      if (f) slipToRoute(f);
    }
    if (t.id === 'tg-offline') {
      state.offlineDemo = t.checked;
      state.aiOn = state.aiAvail && !t.checked;
      state.ai = { status: 'idle' };
      toast(tr(t.checked ? 'offlineOn' : 'offlineOff'));
      refreshLive();
      renderAll(hooks.is3D());
    }
    if (t.id === 'photoIn') {
      const f = t.files?.[0];
      t.value = '';
      if (f) locateByPhoto(f);
    }
  });
  // Keep live counts fresh while choosing a route; stop counting this phone when the page is closed.
  setInterval(() => {
    if (state.dest && !state.nav && document.visibilityState === 'visible') refreshLive();
  }, 20_000);
  window.addEventListener('pagehide', () => endTrip());
  refreshLive();
  window.addEventListener('hashchange', () => {
    applyHash(false);
  });
}
