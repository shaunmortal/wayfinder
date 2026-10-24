export interface Bi {
  en: string;
  hi: string;
}
export type XY = [number, number];
export type Rect = [number, number, number, number];

export interface Floor {
  id: string;
  en: string;
  hi: string;
  btn: string;
  sumEn?: string;
  sumHi?: string;
  z?: number;
}
export interface Point {
  id: string;
  floor: string;
  x: number;
  y: number;
}
export interface Link {
  site: string;
  node: string;
  label: Bi;
}

export interface Place {
  id: string;
  floor: string;
  door: XY;
  via: string;
  cat: string;
  en: string;
  hi: string;
  enS: string;
  hiS: string;
  code: string;
  num: boolean;
  kw?: string;
  subEn?: string;
  subHi?: string;
  gate?: boolean;
  rect?: Rect;
  poly?: XY[];
  parts?: { r: Rect; [k: string]: unknown }[];
  labelAt?: XY;
  mat?: XY[];
  box?: string | Rect;
  raise?: number;
  wallH?: number;
  h?: number;
  under?: boolean;
  block?: boolean;
  flat?: boolean;
  link?: Link;
}
export interface Core {
  id: string;
  floor: string;
  kind: 'lift' | 'stairs';
  group: string;
  rect: Rect;
  at: XY;
  door: XY;
  via: string;
  en?: string;
  hi?: string;
  enS?: string;
  hiS?: string;
}
export interface Landmark {
  en: string;
  hi: string;
  enN?: string;
  hiN?: string;
}

export interface Site {
  id: string;
  outdoor?: boolean;
  tab: Bi;
  name: Bi;
  parent?: Link;
  floors: Floor[];
  shells: Record<string, Rect[]>;
  shellPoly?: Record<string, XY[][]>;
  planImg?: Record<string, { src: string; x: number; y: number; w: number; h: number }>;
  ground?: Record<string, XY[]>;
  /** Tree positions per floor (drawn in 2D and 3D). */
  trees?: Record<string, XY[]>;
  /** Gaps in shell walls where corridors pass between building blocks. */
  openings?: { floor: string; at: XY }[];
  busy?: BusyZone[];
  roads?: Record<string, unknown>;
  points: Point[];
  walks: [string, string][];
  places: Place[];
  cores: Core[];
  landmarks: Record<string, Landmark>;
  photos?: Record<string, string>;
  defaults: { start: string; dest: string };
  quick: string[];
  popular: string[];
  cats: string[];
  askPh: { en: string; hi: string };
  notice?: unknown;
  help: unknown;
  about: unknown;
  aiRules: string;
  blood?: unknown;
}

export type NodeKind = 'corr' | 'place' | 'gate' | 'lift' | 'stairs';
export type EdgeType = 'walk' | 'lift' | 'stairs';
export interface GNode {
  id: string;
  floor: string;
  x: number;
  y: number;
  kind: NodeKind;
  ref?: Place | Core;
}
export interface Edge {
  to: string;
  type: EdgeType;
  len: number;
  cost: number;
}

export interface Graph {
  site: Site;
  nodes: Record<string, GNode>;
  adj: Record<string, Edge[]>;
  places: Record<string, Place>;
  floors: Record<string, Floor & { i: number }>;
  startable: string[];
  wc: string[];
  bounds: [number, number, number, number];
}

export type Turn = 'left' | 'right' | null;
interface Transit {
  approach: Turn;
  i0: number;
  i1: number;
  v0: number;
  v1: number;
  from: string;
  to: string;
  n: number;
  up: boolean;
  floor: string;
}
export type Step =
  | { kind: 'start'; i0: number; i1: number; floor: string }
  | { kind: 'walk'; turn: Turn; len: number; i0: number; i1: number; floor: string; h: [number, number]; exitKind?: 'lift' | 'stairs' }
  | ({ kind: 'lift' } & Transit)
  | ({ kind: 'stairs' } & Transit)
  | { kind: 'arrive'; side: Turn; i0: number; i1: number; floor: string };

/** A corridor stretch that is usually crowded at certain hours (an estimate kept in the data, not live tracking). */
export interface BusyZone {
  id: string;
  en: string;
  hi: string;
  /** 1 = some people, 2 = busy, 3 = very crowded */
  level: 1 | 2 | 3;
  /** [from, to) in hours, 24h clock, e.g. [[8, 13]] */
  hours: [number, number][];
  nodes: string[];
}

export interface RouteOpts {
  stepFree?: boolean;
  liftDown?: boolean;
  /** Extra cost factor for walking from a to b (crowds); 1 = no change. */
  edgeMult?: (a: string, b: string) => number;
  /** Reported on the way: lift/stairs groups that are out of order, and corridor stretches that are blocked ("a|b"). */
  blockedGroups?: Set<string>;
  blockedEdges?: Set<string>;
}
export type Route =
  | { status: 'none' }
  | { status: 'same'; path: string[]; steps: Step[] }
  | { status: 'ok'; path: string[]; cost: number; steps: Step[]; walk: number; secs: number; mins: number; stepFree: boolean };
