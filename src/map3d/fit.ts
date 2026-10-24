// Camera fit for a route, a step or a floor: binary-search the distance until every corner is on screen.
import * as THREE from 'three';
import { G, state } from '../state';
import { stopFloors } from './route3d';
import { V3, elev, m3, size3D } from './scene';

export function fit3D(ids: string[] | null, floorOnly = false) {
  if (!V3.cam || !V3.ctl) return;
  size3D();
  const g = G(),
    S = g.site;
  let pts: THREE.Vector3[] = [];
  (ids || []).forEach((id) => {
    const n = g.nodes[id];
    if (n && (!floorOnly || n.floor === state.floor)) pts.push(new THREE.Vector3(m3(n.x), elev(n.floor), m3(n.y)));
  });
  const dpl = state.dest ? g.places[state.dest] : null;
  const withDest = !!ids && ids.length > 1 && !!dpl && (!floorOnly || dpl.floor === state.floor) && ids.includes(state.dest!);
  if (withDest && dpl!.poly) {
    const y = elev(dpl!.floor);
    dpl!.poly.forEach(([x, z]) => pts.push(new THREE.Vector3(m3(x), y, m3(z))));
  }
  if (withDest && dpl!.rect) {
    const y = elev(dpl!.floor) + (dpl!.block ? m3(dpl!.h || 56) : 0);
    (dpl!.parts ? dpl!.parts.map((q) => q.r) : [dpl!.rect]).forEach((rc) =>
      [
        [0, 1],
        [2, 1],
        [2, 3],
        [0, 3],
      ].forEach(([a, c]) => pts.push(new THREE.Vector3(m3(rc[a]), y, m3(rc[c])))),
    );
  }
  if (V3.stack && !floorOnly) {
    stopFloors().forEach((f) => {
      const y = elev(f);
      (S.shells[f] || []).forEach((r) => pts.push(new THREE.Vector3(m3(r[0]), y, m3(r[1])), new THREE.Vector3(m3(r[2]), y, m3(r[3]))));
    });
  }
  if (pts.length < 2) {
    pts = [];
    S.floors.forEach((f) => {
      if (floorOnly && f.id !== state.floor) return;
      const y = elev(f.id);
      (S.shells[f.id] || []).forEach((r) => pts.push(new THREE.Vector3(m3(r[0]), y, m3(r[1])), new THREE.Vector3(m3(r[2]), y, m3(r[3]))));
      (S.shellPoly?.[f.id] || []).forEach((poly) => poly.forEach(([x, z]) => pts.push(new THREE.Vector3(m3(x), y, m3(z)))));
      (S.ground?.[f.id] || []).forEach(([x, z]) => pts.push(new THREE.Vector3(m3(x), y, m3(z))));
    });
  }
  const b = new THREE.Box3().setFromPoints(pts),
    c = b.getCenter(new THREE.Vector3()),
    minS = S.outdoor ? 70 : 26;
  b.expandByVector(new THREE.Vector3(Math.max(0, (minS - (b.max.x - b.min.x)) / 2), 0, Math.max(0, (minS - (b.max.z - b.min.z)) / 2)));
  b.max.y += S.outdoor ? 14 : 2.5;
  const cs: THREE.Vector3[] = [];
  [b.min.x, b.max.x].forEach((x) =>
    [b.min.y, b.max.y].forEach((y) => [b.min.z, b.max.z].forEach((z) => cs.push(new THREE.Vector3(x, y, z)))),
  );
  const dir = (V3.stack ? new THREE.Vector3(0.5, 0.7, 1) : new THREE.Vector3(0.35, 1.1, 1)).normalize();
  const cam = V3.cam,
    v = new THREE.Vector3();
  const fits = (d: number) => {
    cam.position.copy(c).addScaledVector(dir, d);
    cam.near = d / 200;
    cam.far = d * 40;
    cam.updateProjectionMatrix();
    cam.lookAt(c);
    cam.updateMatrixWorld(true);
    return cs.every((q) => {
      v.copy(q).project(cam);
      return v.z < 1 && Math.abs(v.x) <= 0.84 && Math.abs(v.y) <= 0.8;
    });
  };
  let lo = 1,
    hi = 8000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  fits(hi);
  V3.ctl.target.copy(c);
  V3.ctl.minDistance = S.outdoor ? 15 : 4;
  V3.ctl.maxDistance = Math.max(hi * 3, S.outdoor ? 1500 : 200);
  V3.ctl.update();
}

export function dolly3D(f: number) {
  if (!V3.cam || !V3.ctl) return;
  const v = V3.cam.position.clone().sub(V3.ctl.target).multiplyScalar(f);
  V3.cam.position.copy(V3.ctl.target).add(v);
  V3.ctl.update();
}
