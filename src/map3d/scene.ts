// Shared 3D state, theme colours and the renderer/camera/controls setup.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SCALE } from '../engine/graph';
import { G } from '../state';
import { $ } from '../ui/dom';

export interface Label3 {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  floor: string | null;
  id: string;
  w: number;
  h: number;
}
type Mat = (THREE.MeshLambertMaterial | THREE.LineBasicMaterial | THREE.MeshBasicMaterial | THREE.MeshStandardMaterial) & {
  userData: { floor: string; base: number };
};

export const V3 = {
  on: false,
  R: null as THREE.WebGLRenderer | null,
  scene: null as THREE.Scene | null,
  cam: null as THREE.PerspectiveCamera | null,
  ctl: null as OrbitControls | null,
  stat: null as THREE.Group | null, // static building, rebuilt per site / language / theme
  dyn: null as THREE.Group | null, // route, start ball, destination pin
  mats: {} as Record<string, Mat>,
  byId: {} as Record<string, THREE.Mesh[]>,
  hl: [] as THREE.Mesh[],
  labels: [] as Label3[],
  startLbl: null as Label3 | null,
  fac: {} as Record<string, number>, // per-floor opacity factor
  stack: false,
  raf: 0,
  key: null as string | null,
  /** "Real 3D" style: textured walls and floors, doors with signs, shadows, sky. Built lazily as a second group. */
  real: false,
  statReal: null as THREE.Group | null,
  byIdReal: {} as Record<string, THREE.Mesh[]>,
  matsReal: {} as Record<string, Mat>,
  sun: null as THREE.DirectionalLight | null,
  /** Camera fly-to (walk-in view in Real 3D). */
  tween: null as { p0: THREE.Vector3; p1: THREE.Vector3; t0: THREE.Vector3; t1: THREE.Vector3; start: number; dur: number } | null,
  /** Arrows that move along the route. */
  flow: null as { mesh: THREE.InstancedMesh; pts: THREE.Vector3[]; cum: number[]; spacing: number; speed: number } | null,
};

export const v3el = () => $('#view3d');
/** Phones and low-core devices: lower resolution, no shadows, smaller step pictures. */
export const lowPower = () => window.matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4;
export const m3 = (v: number) => v / SCALE;
export const floorGap = () => (G().site.outdoor ? 0 : 12);
export const elev = (f: string) => {
  const fl = G().floors[f];
  return fl.z != null ? fl.z : fl.i * floorGap();
};
const CATVAR: Record<string, string> = { hall: '--c-ward', food: '--c-test', learn: '--c-opd' };
export const catVar = (c: string) => CATVAR[c] || '--c-' + c;
export const themeKey = () =>
  document.documentElement.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function cssCol(n: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  return new THREE.Color(/^#[0-9a-f]{3,8}$/i.test(v) ? v.slice(0, 7) : '#8899aa');
}

/** One material per (floor, name) so whole floors can be faded together. */
export function fmat(floor: string, name: string, colorVar: string, opacity = 1, line = false): Mat {
  const k = floor + '|' + name;
  if (!V3.mats[k]) {
    const m = (
      line
        ? new THREE.LineBasicMaterial({ color: cssCol(colorVar), transparent: true, opacity })
        : new THREE.MeshLambertMaterial({ color: cssCol(colorVar), transparent: true, opacity })
    ) as Mat;
    m.userData = { floor, base: opacity };
    V3.mats[k] = m;
  }
  return V3.mats[k];
}

/** Material for the Real 3D style: one per (floor, name), registered so floors fade together. */
export function rmat(floor: string, name: string, params: THREE.MeshStandardMaterialParameters): Mat {
  const k = floor + '|' + name;
  if (!V3.matsReal[k]) {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...params, transparent: true }) as Mat;
    m.userData = { floor, base: 1 };
    V3.matsReal[k] = m;
  }
  return V3.matsReal[k];
}

export function disposeGroup(g: THREE.Object3D, withMats: boolean) {
  g.traverse((o) => {
    const me = o as THREE.Mesh;
    me.geometry?.dispose();
    if (withMats && me.material) (Array.isArray(me.material) ? me.material : [me.material]).forEach((m) => m.dispose());
  });
}

export function size3D() {
  if (!V3.R || !V3.cam) return;
  const el = v3el(),
    w = el.clientWidth,
    h = el.clientHeight;
  if (!w || !h) return;
  V3.R.setSize(w, h, false);
  V3.cam.aspect = w / h;
  V3.cam.updateProjectionMatrix();
}

/** Create renderer, camera, lights and controls once. `onPick` gets a place id when a room is tapped. */
export function init3D(onPick: (id: string) => void, canPick: () => boolean) {
  if (V3.R) return;
  const el = v3el();
  const R = new THREE.WebGLRenderer({ antialias: true });
  R.setPixelRatio(Math.min(lowPower() ? 1.5 : 2, window.devicePixelRatio || 1));
  R.shadowMap.enabled = true; // only the Real 3D sun casts shadows
  R.shadowMap.type = THREE.PCFSoftShadowMap;
  el.insertBefore(R.domElement, el.firstChild);
  const scene = new THREE.Scene(),
    cam = new THREE.PerspectiveCamera(42, 1, 0.5, 8000);
  // three r155+ dropped legacy light units: multiply the prototype's r128 intensities by PI to match its look.
  scene.add(new THREE.AmbientLight(0xffffff, 0.3 * Math.PI));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.35 * Math.PI)); // soft sky/ground fill
  const dl = new THREE.DirectionalLight(0xffffff, 0.48 * Math.PI);
  dl.position.set(0.3, 1, 0.5);
  dl.shadow.mapSize.set(lowPower() ? 1024 : 2048, lowPower() ? 1024 : 2048);
  dl.shadow.bias = -0.0005;
  scene.add(dl, dl.target);
  const ctl = new OrbitControls(cam, R.domElement);
  // Phones: one finger moves the map, two fingers turn and zoom. Mouse stays as before (drag turns, right-drag moves).
  ctl.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  ctl.enableDamping = true;
  ctl.dampingFactor = 0.12;
  ctl.maxPolarAngle = Math.PI * 0.47;
  ctl.screenSpacePanning = false;
  Object.assign(V3, { R, scene, cam, ctl, sun: dl });
  new ResizeObserver(size3D).observe(el);

  const hint = $('#v3hint');
  let dn: { x: number; y: number } | null = null;
  R.domElement.addEventListener('pointerdown', (e) => {
    dn = { x: e.clientX, y: e.clientY };
    hint.classList.add('gone');
  });
  setTimeout(() => hint.classList.add('gone'), 9000);
  R.domElement.addEventListener('pointerup', (e) => {
    if (!dn) return;
    const mv = Math.hypot(e.clientX - dn.x, e.clientY - dn.y);
    dn = null;
    const grp = V3.real && V3.statReal ? V3.statReal : V3.stat;
    if (mv > 6 || !canPick() || !grp) return;
    const rc = R.domElement.getBoundingClientRect(),
      ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1), cam);
    const hit = ray
      .intersectObjects(grp.children, false)
      .find((h) => h.object.userData.id && (V3.fac[h.object.userData.floor] || 0) >= 0.4);
    if (hit) onPick(hit.object.userData.id);
  });
}
