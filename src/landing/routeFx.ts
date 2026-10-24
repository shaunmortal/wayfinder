// A glowing route through the landing-page building: tube that draws itself, a walking head, start ring and destination beacon.
import * as THREE from 'three';
import { ROOM_H, type Building, type Theme } from './building';
import type { Graph } from '../data/types';

const LIFT = ROOM_H + 0.8; // route floats just above the room boxes
const DRAW_SPEED = 70; // metres per second while the route draws
const TUBE_SIDES = 8;
const HALO_SIDES = 10;
export const ROUTE_BLUE = 0x4cc9ff;
export const ROUTE_ORANGE = 0xff9f1c;
const START = 0x34d399;
const DEST = 0xff5fa2;

export interface RouteFx {
  group: THREE.Group;
  show(path: string[], destId: string, hex?: number): void;
  /** Advance the animation; returns the head position. */
  tick(now: number, still: boolean): THREE.Vector3 | null;
  heading(): THREE.Vector3;
  start: THREE.Vector3;
  dest: THREE.Vector3;
  mid: THREE.Vector3;
  setTheme(t: Theme): void;
}

export function createRouteFx(g: Graph, b: Building): RouteFx {
  const group = new THREE.Group();
  group.renderOrder = 10;
  const mats: THREE.MeshBasicMaterial[] = [];
  const glow = (opacity = 1) => {
    // depthTest off: the route stays visible through floors above it, like an x-ray.
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity, toneMapped: false, depthWrite: false, depthTest: false });
    mats.push(mat);
    return mat;
  };
  const routeMat = glow();
  const haloMat = glow(0.18);
  const headMat = glow();
  const startMat = glow();
  const destMat = glow();
  const beaconMat = glow(0.2);
  const boxMat = glow(0.55);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.3, 20, 14), headMat);
  head.add(new THREE.PointLight(ROUTE_BLUE, 900, 60, 2));
  const startRing = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.2, 40), startMat);
  const destRing = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.6, 40), destMat);
  startRing.rotation.x = destRing.rotation.x = -Math.PI / 2;
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 70, 24, 1, true), beaconMat);
  const destBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), boxMat);

  let curve: THREE.CurvePath<THREE.Vector3> | null = null;
  let tube: THREE.Mesh | null = null;
  let halo: THREE.Mesh | null = null;
  let segs = 0;
  let length = 1;
  let t0 = 0;
  let u = 0;
  let theme: Theme = 'dark';
  let hex = ROUTE_BLUE;
  const fx = { start: new THREE.Vector3(), dest: new THREE.Vector3(), mid: new THREE.Vector3() };

  const paint = () => {
    // Additive glow over a dark sky; plain colour on a light page (additive would wash out to white).
    const dark = theme === 'dark';
    const k = dark ? 2.6 : 1;
    for (const mat of mats) mat.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    routeMat.color.setHex(hex).multiplyScalar(k);
    haloMat.color.setHex(hex).multiplyScalar(k);
    headMat.color.setHex(dark ? 0xffffff : hex).multiplyScalar(dark ? 3 : 1);
    startMat.color.setHex(START).multiplyScalar(k);
    for (const mat of [destMat, beaconMat, boxMat]) mat.color.setHex(DEST).multiplyScalar(k);
    for (const mat of mats) mat.needsUpdate = true;
  };

  function show(path: string[], destId: string, color = ROUTE_BLUE) {
    for (const o of [tube, halo]) {
      if (!o) continue;
      group.remove(o);
      o.geometry.dispose();
    }
    const pts: THREE.Vector3[] = [];
    for (const id of path) {
      const n = g.nodes[id];
      const p = b.toWorld(n.x, n.y, n.floor, LIFT);
      if (!pts.length || pts[pts.length - 1].distanceToSquared(p) > 0.01) pts.push(p);
    }
    if (pts.length < 2) return;
    curve = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 1; i < pts.length; i++) curve.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
    length = curve.getLength();
    segs = Math.min(1200, Math.max(120, Math.round(length * 2)));
    tube = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 0.95, TUBE_SIDES, false), routeMat);
    halo = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 2.6, HALO_SIDES, false), haloMat);
    group.add(tube, halo, head, startRing, destRing, beacon, destBox);

    fx.start.copy(pts[0]);
    fx.dest.copy(pts[pts.length - 1]);
    fx.mid.copy(fx.start).add(fx.dest).multiplyScalar(0.5);
    startRing.position.copy(fx.start).setY(fx.start.y - LIFT + 0.15);
    destRing.position.copy(fx.dest).setY(fx.dest.y - LIFT + 0.15);
    beacon.position.copy(fx.dest).setY(fx.dest.y - LIFT + 35);
    const room = b.room(destId);
    destBox.visible = !!room;
    if (room) {
      const [x1, z1, x2, z2] = room.r;
      destBox.scale.set(x2 - x1, ROOM_H + 0.4, z2 - z1);
      destBox.position.set((x1 + x2) / 2, room.y + (ROOM_H + 0.4) / 2, (z1 + z2) / 2);
    }
    hex = color;
    paint();
    t0 = performance.now();
  }

  function tick(now: number, still: boolean) {
    if (!curve || !tube || !halo) return null;
    const drawSecs = Math.max(1.6, Math.min(4.5, length / DRAW_SPEED));
    const e = still ? 1 : THREE.MathUtils.clamp((now - t0) / 1000 / drawSecs, 0, 1);
    const drawn = 1 - Math.pow(1 - e, 3);
    tube.geometry.setDrawRange(0, Math.floor(drawn * segs) * TUBE_SIDES * 6);
    halo.geometry.setDrawRange(0, Math.floor(drawn * segs) * HALO_SIDES * 6);
    // Once drawn, the head keeps walking the route so it reads as a journey.
    const loop = ((now - t0) / 1000 - drawSecs) / Math.max(4, length / 22);
    u = THREE.MathUtils.clamp(e < 1 ? drawn : loop - Math.floor(loop), 0, 0.999);
    const at = curve.getPointAt(u);
    if (at) head.position.copy(at);
    const pulse = 1 + 0.25 * Math.sin(now / 260);
    destRing.scale.setScalar(pulse);
    startRing.scale.setScalar(2 - pulse);
    beaconMat.opacity = 0.16 + 0.08 * Math.sin(now / 400);
    return head.position;
  }

  return {
    group,
    show,
    tick,
    heading: () => (curve && u > 0.001 ? curve.getTangentAt(u) : new THREE.Vector3(1, 0, 0)),
    ...fx,
    setTheme(t) {
      theme = t;
      paint();
    },
  };
}
