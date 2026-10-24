// Scroll story: each [data-shot] section moves the camera; the "reroute" section breaks a lift and lets Dijkstra find a new way.
import { computeRoute } from '../engine/route';
import type { Graph, Route } from '../data/types';
import { DEMOS, answer } from './scenarios';
import { ROUTE_BLUE, ROUTE_ORANGE } from './routeFx';
import type { ShotName, Stage } from './scene';

const FROM = 'GF-GATE3';
const TO = '101'; // Blood Bank, first floor
const CYCLE_MS = 6000;

type Ok = Extract<Route, { status: 'ok' }>;
export interface StoryFacts {
  main: Ok;
  detour: Ok | null;
  rerouteMs: number;
  liftName: string;
}

const via = (r: Ok) => r.steps.find((s) => s.kind === 'lift' || s.kind === 'stairs')?.kind ?? 'walk';
export const describe = (r: Ok) => `${Math.round(r.walk)} m · ${r.mins} min · by ${via(r)}`;

/** The demo trip, and the same trip with the lift it uses switched off (timed, to show it is computed live). */
export function storyFacts(g: Graph): StoryFacts {
  const main = computeRoute(g, FROM, TO);
  if (main.status !== 'ok') throw new Error(`No demo route ${FROM} → ${TO}`);
  const liftNode = main.path.find((id) => g.nodes[id].kind === 'lift');
  const core = g.site.cores.find((c) => c.id === liftNode);
  const t0 = performance.now();
  const detour = core ? computeRoute(g, FROM, TO, { blockedGroups: new Set([core.group]) }) : null;
  const rerouteMs = performance.now() - t0;
  return { main, detour: detour?.status === 'ok' ? detour : null, rerouteMs, liftName: core?.enS ?? core?.en ?? 'Lift' };
}

/** Wire sections to camera shots and routes. Returns the current destination's short name for the map pin. */
export function startStory(g: Graph, stage: Stage, facts: StoryFacts): () => string {
  const lift = facts.main.path.map((id) => g.site.cores.find((c) => c.id === id)).find((c) => c?.kind === 'lift');
  let shown = '';
  let destName = g.places[TO].enS;
  let demo = 0;
  let timer = 0;

  const showMain = (broken: boolean) => {
    const key = broken ? 'detour' : 'main';
    if (shown === key) return;
    shown = key;
    const r = broken && facts.detour ? facts.detour : facts.main;
    stage.building.setCoreDown(broken ? (lift?.group ?? null) : null);
    stage.route.show(r.path, TO, broken ? ROUTE_ORANGE : ROUTE_BLUE);
    destName = g.places[TO].enS;
  };
  const cycle = () => {
    const d = DEMOS[demo++ % DEMOS.length];
    const a = answer(g, d.q, d.from);
    if (a) {
      shown = 'demo';
      stage.building.setCoreDown(null);
      stage.route.show(a.route.path, a.place.id);
      destName = a.place.enS || a.place.en;
    }
    timer = window.setTimeout(cycle, CYCLE_MS);
  };

  const enter = (name: ShotName) => {
    stage.setShot(name);
    clearTimeout(timer);
    if (name === 'overview' || name === 'outro') cycle();
    else showMain(name === 'reroute');
  };

  const sections = [...document.querySelectorAll<HTMLElement>('[data-shot]')];
  const io = new IntersectionObserver(
    (entries) => {
      const hit = entries.find((e) => e.isIntersecting);
      if (hit) enter((hit.target as HTMLElement).dataset.shot as ShotName);
    },
    { rootMargin: '-45% 0px -45% 0px' }, // the section crossing the middle of the screen wins
  );
  sections.forEach((s) => io.observe(s));
  enter('overview');
  return () => destName;
}
