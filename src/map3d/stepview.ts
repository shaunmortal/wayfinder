// First-person view of a navigation step, rendered in the Real 3D style, used when a spot has no real photo.
import * as THREE from 'three';
import type { Step } from '../data/types';
import { G, okRoute } from '../state';
import { V3, elev, m3 } from './scene';
import { applyStyle, ensureReal } from './real';

let rt: THREE.WebGLRenderTarget | null = null;
// Render targets hold linear colour; convert to sRGB for the 2D canvas with a lookup table.
const LUT = new Uint8ClampedArray(256).map((_, i) => {
  const c = i / 255;
  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
});
const cam = new THREE.PerspectiveCamera(64, 16 / 9, 0.1, 900);

/** Path indices of where the visitor stands and what they look towards for this step. */
function viewpoint(st: Step, n: number): [number, number] {
  if (st.kind === 'start') return [0, Math.min(1, n - 1)];
  if (st.kind === 'arrive') return [Math.max(0, n - 2), n - 1];
  if (st.kind === 'lift' || st.kind === 'stairs') return [Math.max(0, st.v0 - 1), st.v0];
  return [st.i0, Math.min(st.i0 + 1, n - 1)];
}

/** Camera position and look target, both kept on the walkable route (never inside a room or behind a wall). */
export function stepCamera(st: Step) {
  const r = okRoute();
  if (!r) return null;
  const g = G(),
    path = r.path,
    outdoor = !!g.site.outdoor;
  const kind = (i: number) => g.nodes[path[i]].kind;
  const pos = (i: number) => {
    const nd = g.nodes[path[i]];
    return new THREE.Vector3(m3(nd.x), elev(nd.floor), m3(nd.y));
  };
  let [a, b] = viewpoint(st, path.length);
  // Starting at a room door or gate: stand on the corridor point just outside instead.
  if (st.kind === 'start' && (kind(a) === 'place' || kind(a) === 'gate') && path.length > 2) [a, b] = [1, 2];
  const from = pos(a);
  while (b < path.length - 1 && pos(b).distanceTo(from) < 2 && g.nodes[path[b + 1]].floor === g.nodes[path[a]].floor) b++;
  const to = pos(b);
  if (to.distanceTo(from) < 0.01) return null;
  const dir = to.clone().sub(from).setY(0).normalize();
  // Step back along the way we came (that stretch is corridor), at most 2.5 m, so the turn is in view.
  let back = new THREE.Vector3();
  if (a > 0 && kind(a - 1) === 'corr') {
    const prev = pos(a - 1),
      seg = from.clone().sub(prev).setY(0);
    back = seg.normalize().multiplyScalar(-Math.min(2.5, prev.distanceTo(from)));
  }
  if (outdoor) back = dir.clone().multiplyScalar(-8);
  const eye = outdoor ? 2.0 : 1.65;
  const p = from
    .clone()
    .add(back)
    .setY(from.y + eye);
  const lookY = kind(b) === 'place' ? 2.0 : 1.2; // at a room, look at the sign above its door
  const t = new THREE.Vector3(to.x + dir.x * (kind(b) === 'place' ? 0 : 6), from.y + lookY, to.z + dir.z * (kind(b) === 'place' ? 0 : 6));
  return { p, t };
}

const stripeMat = new THREE.MeshBasicMaterial({ color: 0x1557e6 }),
  dotMat = new THREE.MeshBasicMaterial({ color: 0xc9342a });
/** The rest of the route from this step on, as a 45 cm painted stripe on the floor, plus a red disc at the destination. */
function floorStripe(st: Step) {
  const grp = new THREE.Group(),
    r = okRoute()!,
    g = G();
  for (let i = st.i0; i < r.path.length - 1; i++) {
    const a = g.nodes[r.path[i]],
      b = g.nodes[r.path[i + 1]];
    if (a.floor !== b.floor) continue;
    const ax = m3(a.x),
      az = m3(a.y),
      bx = m3(b.x),
      bz = m3(b.y),
      len = Math.hypot(bx - ax, bz - az);
    if (len < 0.01) continue;
    const me = new THREE.Mesh(new THREE.BoxGeometry(len + 0.45, 0.02, 0.45), stripeMat);
    me.position.set((ax + bx) / 2, elev(a.floor) + 0.08, (az + bz) / 2);
    me.rotation.y = -Math.atan2(bz - az, bx - ax);
    grp.add(me);
  }
  const d = g.nodes[r.path[r.path.length - 1]];
  const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.03, 32), dotMat);
  dot.position.set(m3(d.x), elev(d.floor) + 0.1, m3(d.y));
  grp.add(dot);
  return grp;
}

export function renderStepView(canvas: HTMLCanvasElement, st: Step): boolean {
  if (!V3.scene || !V3.R) return false;
  ensureReal();
  const view = stepCamera(st);
  if (!view) return false;
  cam.position.copy(view.p);
  cam.lookAt(view.t);
  const R = V3.R,
    w = canvas.width,
    h = canvas.height;
  if (!rt || rt.width !== w || rt.height !== h) {
    rt?.dispose();
    rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
  }
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
  // Eye-level view: the overview's tube, ball and pin would fill the frame, so draw the route as a floor stripe instead.
  const stripe = floorStripe(st);
  if (V3.dyn) V3.dyn.visible = false;
  V3.scene.add(stripe);
  applyStyle(true);
  R.setRenderTarget(rt);
  R.render(V3.scene, cam);
  const buf = new Uint8Array(w * h * 4);
  R.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  R.setRenderTarget(null);
  applyStyle(V3.real);
  V3.scene.remove(stripe);
  stripe.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  if (V3.dyn) V3.dyn.visible = true;
  const img = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    // WebGL rows run bottom-up; canvas rows run top-down.
    const src = (h - 1 - y) * w * 4,
      dst = y * w * 4;
    for (let x = 0; x < w * 4; x += 4) {
      img.data[dst + x] = LUT[buf[src + x]];
      img.data[dst + x + 1] = LUT[buf[src + x + 1]];
      img.data[dst + x + 2] = LUT[buf[src + x + 2]];
      img.data[dst + x + 3] = 255;
    }
  }
  canvas.getContext('2d')!.putImageData(img, 0, 0);
  return true;
}
