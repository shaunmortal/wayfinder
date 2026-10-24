// Per-render 3D updates: floor fading / stacking, destination highlight, route tube, start ball, pin.
import * as THREE from 'three';
import { G, crowdHour, okRoute, state } from '../state';
import { crowdLevels } from '../engine/crowd';
import { polyCenter } from '../map2d/draw';
import { build3DStatic } from './build';
import { applyStyle, disposeReal, ensureReal } from './real';
import { V3, cssCol, disposeGroup, elev, fmat, m3, rmat, themeKey } from './scene';

/** Floors the route actually stops on (lift/stairs nodes in between don't count). */
export function stopFloors() {
  const s = new Set<string>(),
    g = G(),
    r = okRoute();
  r?.path.forEach((id) => {
    const n = g.nodes[id];
    if (n.kind !== 'lift' && n.kind !== 'stairs') s.add(n.floor);
  });
  return s;
}

export function update3D() {
  if (!V3.scene) return;
  const g = G(),
    S = g.site,
    FL = g.floors;
  const key = [S.id, state.lang, themeKey()].join('|');
  if (V3.key !== key) {
    V3.key = key;
    disposeReal();
    build3DStatic();
  }
  if (V3.real) ensureReal();
  applyStyle(V3.real);

  // A multi-floor route seen from the start floor shows a "stacked" view: lowest route floor solid, others see-through.
  const rf = stopFloors(),
    fac: Record<string, number> = {};
  V3.stack = !state.nav && rf.size > 1 && state.floor === g.nodes[state.start].floor;
  if (V3.stack) {
    const low = [...rf].sort((a, b) => FL[a].i - FL[b].i)[0];
    S.floors.forEach((f) => {
      fac[f.id] = !rf.has(f.id) ? 0.04 : f.id === low ? 1 : 0.42;
    });
  } else {
    S.floors.forEach((f) => {
      fac[f.id] = f.id === state.floor ? 1 : rf.has(f.id) && FL[f.id].i < FL[state.floor].i ? 0.25 : 0.06;
    });
  }
  V3.fac = fac;
  [...Object.values(V3.mats), ...Object.values(V3.matsReal)].forEach((m) => {
    const k = fac[m.userData.floor];
    if (k == null) return;
    m.opacity = m.userData.base * k;
    m.depthWrite = k >= 1;
    m.visible = k > 0.03;
  });

  V3.hl.forEach((me) => {
    me.material = me.userData.orig;
  });
  V3.hl = [];
  if (state.dest) {
    const pf = g.nodes[state.dest].floor,
      dm = fmat(pf, 'dest', '--dest-fill'),
      ds = fmat(pf, 'dest-s', '--danger'),
      // Real 3D: tint only the destination's floor (walls keep their paint).
      rm = rmat(pf, 'dest-floor', { color: '#ffb4a8', roughness: 0.4 });
    (V3.byId[state.dest] || []).forEach((me) => {
      me.material = Array.isArray(me.material) ? me.material.map((m, i) => (i === 2 ? dm : i === 3 ? m : ds)) : dm;
      V3.hl.push(me);
    });
    (V3.byIdReal[state.dest] || []).forEach((me) => {
      if (
        (me.geometry as THREE.BoxGeometry).parameters?.height !== 0.06 &&
        !(me.geometry as THREE.ExtrudeGeometry).type?.includes('Extrude')
      )
        return;
      me.material = rm;
      V3.hl.push(me);
    });
    dm.opacity = fac[pf];
    ds.opacity = fac[pf] * 0.85;
    rm.opacity = fac[pf];
  }

  if (V3.dyn) {
    V3.scene.remove(V3.dyn);
    disposeGroup(V3.dyn, true);
  }
  const grp = new THREE.Group(),
    r = okRoute(),
    rad = S.outdoor ? 1.7 : 0.3,
    lift = S.outdoor ? 0.8 : 0.45;
  const P3 = (id: string) => {
    const n = g.nodes[id];
    return new THREE.Vector3(m3(n.x), elev(n.floor) + lift, m3(n.y));
  };
  const tube = (ids: string[], colorVar: string, radius: number) => {
    const cp = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 0; i < ids.length - 1; i++) {
      const a = P3(ids[i]),
        b = P3(ids[i + 1]);
      if (a.distanceTo(b) > 0.01) cp.add(new THREE.LineCurve3(a, b));
    }
    if (!cp.curves.length) return null;
    return new THREE.Mesh(
      new THREE.TubeGeometry(cp, Math.max(16, ids.length * 16), radius, 10, false),
      new THREE.MeshBasicMaterial({ color: cssCol(colorVar) }),
    );
  };
  if (r && r.path.length > 1) {
    const all = tube(r.path, state.nav ? '--route-dim' : '--route', rad);
    if (all) grp.add(all);
    if (state.nav) {
      const st = r.steps[state.stepIdx],
        cur = tube(r.path.slice(st.i0, st.i1 + 1), '--route', rad * 1.7);
      if (cur) grp.add(cur);
    }
  }
  const sp = P3(state.start);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(rad * 2.6, 24, 16), new THREE.MeshBasicMaterial({ color: cssCol('--route') }));
  ball.position.copy(sp);
  ball.name = 'start';
  grp.add(ball);
  if (state.dest && state.dest !== state.start) {
    const dp = P3(state.dest),
      H = S.outdoor ? 22 : 3.4,
      red = new THREE.MeshLambertMaterial({ color: cssCol('--danger') }),
      pl = g.places[state.dest];
    if (pl?.poly) {
      const c = pl.labelAt || polyCenter(pl.poly);
      dp.set(m3(c[0]), elev(pl.floor) + m3(pl.raise || 0) + 0.2, m3(c[1]));
    } else if (pl?.block && pl.rect) {
      const part = pl.parts ? pl.parts.reduce((a, q) => (((q.h as number) || 0) > ((a.h as number) || 0) ? q : a), pl.parts[0]) : null;
      dp.set(
        m3((pl.rect[0] + pl.rect[2]) / 2),
        elev(pl.floor) + m3(((part ? part.h : pl.h) as number) || 56),
        m3((pl.rect[1] + pl.rect[3]) / 2),
      );
    }
    const cone = new THREE.Mesh(new THREE.ConeGeometry(rad * 2.4, H * 0.55, 20), red);
    cone.rotation.x = Math.PI;
    cone.position.set(dp.x, dp.y + H * 0.275, dp.z);
    const head = new THREE.Mesh(new THREE.SphereGeometry(rad * 2.8, 22, 16), red.clone());
    head.position.set(dp.x, dp.y + H * 0.6, dp.z);
    grp.add(cone, head);
  }
  const lv = crowdLevels(g, crowdHour());
  S.walks.forEach(([a, b]) => {
    const l = Math.min(lv[a] ?? 0, lv[b] ?? 0);
    if (!l) return;
    const A = g.nodes[a],
      B = g.nodes[b],
      ax = m3(A.x),
      az = m3(A.y),
      bx = m3(B.x),
      bz = m3(B.y),
      len = Math.hypot(bx - ax, bz - az);
    if (len < 0.01 || A.floor !== B.floor) return;
    const me = new THREE.Mesh(
      new THREE.BoxGeometry(len + 4, 0.04, 4),
      new THREE.MeshBasicMaterial({
        color: 0xc9342a,
        transparent: true,
        opacity: (0.12 + 0.08 * l) * (fac[A.floor] ?? 1),
        depthWrite: false,
      }),
    );
    me.position.set((ax + bx) / 2, elev(A.floor) + 0.12, (az + bz) / 2);
    me.rotation.y = -Math.atan2(bz - az, bx - ax);
    grp.add(me);
  });
  V3.flow = null;
  if (r && r.path.length > 1) {
    const st = state.nav ? r.steps[state.stepIdx] : null;
    const ids = st ? r.path.slice(st.i0, st.i1 + 1) : r.path;
    const pts: THREE.Vector3[] = [];
    ids.map(P3).forEach((v) => {
      if (!pts.length || pts[pts.length - 1].distanceTo(v) > 0.01) pts.push(v);
    });
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const spacing = S.outdoor ? 14 : 3.2,
      n = Math.min(160, Math.floor(cum[cum.length - 1] / spacing));
    if (n > 0) {
      const geo = new THREE.ConeGeometry(rad * 1.25, rad * 2.8, 12).rotateX(Math.PI / 2);
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: cssCol('--on-primary') }), n);
      V3.flow = { mesh, pts, cum, spacing, speed: S.outdoor ? 10 : 2.6 };
      animateFlow(0);
      grp.add(mesh);
    }
  }
  V3.dyn = grp;
  V3.scene.add(grp);
  V3.labels.forEach((L) => L.el.classList.toggle('dest', L.id === state.dest));
  V3.startLbl?.pos.set(sp.x, sp.y + rad * 3 + 0.6, sp.z);
}

const dummy = new THREE.Object3D(),
  ahead = new THREE.Vector3();
/** Move the route arrows forward; called every frame with the time in seconds. */
export function animateFlow(t: number) {
  const f = V3.flow;
  if (!f) return;
  const { mesh, pts, cum, spacing } = f,
    total = cum[cum.length - 1],
    off = (t * f.speed) % spacing;
  let seg = 0;
  for (let i = 0; i < mesh.count; i++) {
    const d = off + i * spacing;
    if (d > total) {
      mesh.setMatrixAt(i, dummy.matrix.makeScale(0, 0, 0));
      continue;
    }
    while (seg < cum.length - 2 && cum[seg + 1] < d) seg++;
    const a = pts[seg],
      b = pts[seg + 1],
      k = (d - cum[seg]) / (cum[seg + 1] - cum[seg] || 1);
    dummy.position.lerpVectors(a, b, k);
    dummy.lookAt(ahead.copy(dummy.position).add(b).sub(a));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}
