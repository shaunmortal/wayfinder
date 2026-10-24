import type { Graph, Route } from './data/types';
import type { Lang } from './i18n';
import { planRoutes, type Plan } from './engine/crowd';
import type { Live } from './ai/live';

export interface AppState {
  lang: Lang;
  site: string;
  start: string;
  dest: string | null;
  view: 'home' | 'dir' | 'floors' | 'where' | 'help' | 'fb';
  /** Feedback sent on this visit: the feedback view shows the thank-you note. */
  fbSent: boolean;
  floor: string;
  stepFree: boolean;
  liftDown: boolean;
  nav: boolean;
  stepIdx: number;
  voice: boolean;
  route: Route | null;
  query: string;
  cat: string;
  dirQ: string;
  ai: { status: 'idle' | 'thinking' | 'done'; src?: 'claude' | 'search' | 'note'; en?: string; hi?: string };
  photo: { status: 'idle' | 'reading' | 'found' | 'none'; text?: string };
  /** Server has a Claude key (checked at boot; switched off after a no_key error). */
  aiOn: boolean;
  /** Claude reachable at boot (aiOn = aiAvail && !offlineDemo). */
  aiAvail: boolean;
  /** "Offline demo" switch: run without Claude and without the live counter, to show the fallbacks. */
  offlineDemo: boolean;
  /** Prefer routes that avoid usually-crowded corridors at this hour. */
  avoidCrowd: boolean;
  /** Hour used for crowd estimates; null = the phone's clock (a picker lets a demo show 10 am at 3 pm). */
  hourPick: number | null;
  /** Route option the visitor tapped; null = the suggested one. */
  routeIdx: number | null;
  plan: Plan | null;
  /** Latest live walker counts from the server; null when offline. */
  live: Live | null;
  /** Reported during this trip: lift/stairs groups out of order and blocked corridor stretches ("a|b"). */
  blocked: { groups: string[]; edges: string[] };
  /** Last rerouting message shown on the navigation screen. */
  navNote: { en: string; hi: string } | null;
}

export const graphs: Graph[] = [];
export const DEFAULT_SITE = 'hospital';

export const state: AppState = {
  lang: 'en',
  site: DEFAULT_SITE,
  start: '',
  dest: null,
  view: 'home',
  fbSent: false,
  floor: '',
  stepFree: false,
  liftDown: false,
  nav: false,
  stepIdx: 0,
  voice: false,
  route: null,
  query: '',
  cat: 'all',
  dirQ: '',
  ai: { status: 'idle' },
  photo: { status: 'idle' },
  aiOn: false,
  aiAvail: false,
  offlineDemo: false,
  avoidCrowd: true,
  hourPick: null,
  routeIdx: null,
  plan: null,
  live: null,
  blocked: { groups: [], edges: [] },
  navNote: null,
};
try {
  const l = localStorage.getItem('raasta-lang');
  if (l === 'hi' || l === 'en') state.lang = l;
} catch {
  /* storage blocked: stay on English */
}

/** Graph of the site currently shown. */
export const G = (): Graph => graphs.find((g) => g.site.id === state.site) ?? graphs[0];
export const graphById = (id: string) => graphs.find((g) => g.site.id === id);

/** The current route only when it is a real one (has steps to show). */
export const okRoute = () => (state.route && state.route.status === 'ok' ? state.route : null);

/** A fixed random number per phone, used to split visitors between near-equal routes without any network. */
let seed = 0.5;
try {
  seed = Number(localStorage.getItem('raasta-seed') ?? NaN);
  if (!(seed >= 0 && seed < 1)) localStorage.setItem('raasta-seed', String((seed = Math.random())));
} catch {
  seed = Math.random();
}

export const crowdHour = () => state.hourPick ?? new Date().getHours() + new Date().getMinutes() / 60;

/** Live counts for the current building if fetched in the last 90 s, else null (offline estimate only). */
export const liveNow = () => (state.live && state.live.site === state.site && Date.now() - state.live.at < 90_000 ? state.live : null);

export function recompute() {
  state.plan = null;
  if (!state.dest) {
    state.route = null;
    return;
  }
  const p = planRoutes(
    G(),
    state.start,
    state.dest,
    {
      stepFree: state.stepFree,
      liftDown: state.liftDown,
      blockedGroups: new Set(state.blocked.groups),
      blockedEdges: new Set(state.blocked.edges),
    },
    crowdHour(),
    state.avoidCrowd,
    seed,
    liveNow()?.counts ?? null,
  );
  if ('routes' in p) {
    state.plan = p;
    state.route = p.routes[Math.min(state.routeIdx ?? p.pick, p.routes.length - 1)];
  } else state.route = p;
}

export function enterSite(id: string, startId?: string | null) {
  const g = graphById(id) ?? graphs[0];
  state.site = g.site.id;
  state.start = startId && g.startable.includes(startId) ? startId : g.site.defaults.start;
  state.dest = startId ? null : g.site.defaults.dest || null;
  state.floor = g.nodes[state.start].floor;
  Object.assign(state, {
    nav: false,
    stepIdx: 0,
    view: 'home',
    query: '',
    dirQ: '',
    cat: 'all',
    ai: { status: 'idle' },
    photo: { status: 'idle' },
  });
}
