import './landing.css';
import { loadSites } from '../data/loadSites';
import { buildGraph } from '../engine/graph';
import type { Graph } from '../data/types';
import type { Theme } from './building';
import { createStage, type Anchor, type Stage } from './scene';
import { describe, startStory, storyFacts } from './story';

const THEME_KEY = 'raasta-landing-theme';
const COUNT_MS = 1200;
const PIN_GAP = 14;

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

function initialTheme(): Theme {
  const forced = new URLSearchParams(location.search).get('theme');
  if (forced === 'dark' || forced === 'light') return forced;
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // storage blocked (private mode): fall back to the system preference
  }
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function wireTheme(stage: Stage | null) {
  const apply = (t: Theme) => {
    document.documentElement.dataset.theme = t;
    $('#themeBtn').setAttribute('aria-label', t === 'dark' ? 'Switch to day mode' : 'Switch to night mode');
    stage?.setTheme(t);
  };
  apply(initialTheme());
  $('#themeBtn').addEventListener('click', () => {
    const next: Theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    apply(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // not remembered in private mode; the toggle still works for this visit
    }
  });
}

function countUp(node: HTMLElement, end: number) {
  const t0 = performance.now();
  const tick = (now: number) => {
    const k = Math.min(1, (now - t0) / COUNT_MS);
    node.textContent = String(Math.round(end * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Fade sections in as they arrive, and count the stats up once. */
function wireReveal(g: Graph) {
  const links = Object.values(g.adj).reduce((n, es) => n + es.length, 0) / 2;
  const counts: Record<string, number> = { places: g.site.places.length, floors: g.site.floors.length, links: Math.round(links) };
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        e.target.classList.add('in');
        e.target.querySelectorAll<HTMLElement>('[data-count]').forEach((n) => countUp(n, counts[n.dataset.count!]));
      }
    },
    { threshold: 0.2 },
  );
  document.querySelectorAll('.reveal').forEach((n) => io.observe(n));
}

function fillFacts(g: Graph) {
  const f = storyFacts(g);
  const set = (key: string, text: string) => document.querySelectorAll(`[data-fact="${key}"]`).forEach((n) => (n.textContent = text));
  set('main', describe(f.main));
  set('detour', f.detour ? describe(f.detour) : 'no other way — Raasta says so honestly');
  set('ms', f.rerouteMs < 1 ? `${f.rerouteMs.toFixed(2)} ms` : `${Math.round(f.rerouteMs)} ms`);
  set('lift', f.liftName);
  return f;
}

function trackPins(stage: Stage, destName: () => string) {
  const start = $('#pinStart');
  const dest = $('#pinDest');
  const place = (pin: HTMLElement, a: Anchor) => {
    pin.hidden = !a.visible;
    pin.style.transform = `translate(${a.x}px, ${a.y}px) translate(-50%, calc(-100% - ${PIN_GAP}px))`;
  };
  const loop = () => {
    const a = stage.anchors();
    place(start, a.start);
    place(dest, a.dest);
    dest.textContent = destName();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

async function boot() {
  const g = buildGraph((await loadSites())[0]);
  let stage: Stage | null = null;
  try {
    stage = createStage($<HTMLCanvasElement>('#stage'), g);
  } catch (err) {
    console.error('[landing] 3D view unavailable:', err);
    document.body.classList.add('no-webgl');
  }
  wireTheme(stage);
  wireReveal(g);
  const facts = fillFacts(g);
  if (stage) trackPins(stage, startStory(g, stage, facts));
}

boot().catch((err) => {
  console.error('[landing] failed to start:', err);
  document.body.classList.add('no-webgl');
});
