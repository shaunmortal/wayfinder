// Simple furniture for rect rooms, chosen from the room's category and name (rendering only, no data needed).
// One InstancedMesh per (floor, kind) keeps hundreds of rooms cheap to draw.
import * as THREE from 'three';
import type { Place } from '../data/types';
import { fmat, m3, rmat } from './scene';

type Kind = 'bed' | 'desk' | 'chair' | 'counter' | 'table' | 'machine' | 'bench' | 'cubicle' | 'shelf';
const COLOR: Record<Kind, string> = {
  bed: '--surface',
  desk: '--sc-door',
  chair: '--route-dim',
  counter: '--sc-door',
  table: '--sc-door',
  machine: '--sc-frame',
  bench: '--sc-door',
  cubicle: '--m-wall-in',
  shelf: '--m-slab',
};
// Real 3D colours: steel beds with white sheets, wooden desks, blue-grey chairs.
const REAL: Record<Kind, THREE.MeshStandardMaterialParameters> = {
  bed: { color: '#f4f6f8', roughness: 0.6 },
  desk: { color: '#9c7350', roughness: 0.55 },
  chair: { color: '#4f6d8f', roughness: 0.5 },
  counter: { color: '#b89a74', roughness: 0.5 },
  table: { color: '#a8825c', roughness: 0.55 },
  machine: { color: '#e9edf1', roughness: 0.3, metalness: 0.2 },
  bench: { color: '#d9dde1', roughness: 0.4, metalness: 0.1 },
  cubicle: { color: '#8fa3b5', roughness: 0.6 },
  shelf: { color: '#7b5a3d', roughness: 0.7 },
};
/** [u centre, v centre, size along u, size along v, height] in metres; u runs along the door wall, v away from it. */
type Item = [Kind, number, number, number, number, number];

const SCAN = /scan|ct |mri|x-ray|ultra|mammo|nuclear|cath|endoscopy|echo|ecg|sleep/i;
const SEATS = /seminar|lecture|exam|conference|waiting|lounge|hall|vaccination|rest area|telemedicine/i;

function layout(p: Place, U: number, D: number): Item[] {
  const out: Item[] = [];
  const name = p.en;
  const grid = (u0: number, u1: number, v0: number, v1: number, du: number, dv: number, f: (u: number, v: number) => void) => {
    for (let v = v0; v <= v1 + 1e-6; v += dv) for (let u = u0; u <= u1 + 1e-6; u += du) f(u, v);
  };
  if (p.code === 'WC') {
    const n = Math.max(1, Math.floor((U - 1) / 1.3));
    for (let i = 0; i < n; i++) out.push(['cubicle', 0.9 + i * 1.3, D - 1.1, 1.1, 1.8, 1.3]);
    out.push(['counter', U / 2, 1.2, Math.min(U - 1.5, 4), 0.55, 0.85]);
  } else if ((p.cat === 'ward' && !/lab|store|station|unit$/i.test(name)) || (p.cat === 'emergency' && !/room|lab|ot/i.test(name))) {
    const n = Math.max(1, Math.floor((U - 1.2) / 1.9));
    for (let i = 0; i < n; i++) {
      const u = 1.3 + i * 1.9;
      out.push(['bed', u, D - 1.7, 1.0, 2.1, 0.6]);
      if (D > 8) out.push(['bed', u, 3.2, 1.0, 2.1, 0.6]);
    }
  } else if (p.cat === 'test' && SCAN.test(name)) {
    out.push(['machine', U / 2, D / 2 + 1.2, Math.min(2.4, U - 1.5), 2.2, 1.6], ['bed', U / 2, D / 2 - 1.3, 0.8, 2.2, 0.7]);
    out.push(['desk', U - 1.4, 1.4, 1.4, 0.7, 0.76]);
  } else if (p.cat === 'test' || /lab|cssd|research|store/i.test(name)) {
    out.push(['bench', U / 2, D - 0.9, U - 1.2, 0.7, 0.9]);
    if (U > 6) out.push(['bench', U / 2, D / 2, U * 0.55, 1.2, 0.9]);
    out.push(['shelf', 0.5, D / 2, 0.5, D * 0.5, 1.4]);
  } else if (p.cat === 'food') {
    grid(1.8, U - 1.6, 2.2, D - 1.8, 2.6, 2.6, (u, v) => {
      out.push(['table', u, v, 1.2, 1.2, 0.75], ['chair', u - 0.9, v, 0.45, 0.45, 0.5], ['chair', u + 0.9, v, 0.45, 0.45, 0.5]);
    });
    out.push(['counter', U / 2, D - 0.7, U - 1.6, 0.6, 1.0]);
  } else if (SEATS.test(name) || p.cat === 'hall' || p.cat === 'learn') {
    grid(1.2, U - 1.2, 1.6, D - 2.4, 0.75, 1.15, (u, v) => out.push(['chair', u, v, 0.5, 0.5, 0.5]));
    if (!/waiting|lounge|rest/i.test(name)) out.push(['desk', U / 2, D - 1.1, Math.min(3, U - 2), 0.8, 0.8]);
  } else if (p.cat === 'opd') {
    out.push(['desk', U / 2, D - 2.0, 1.6, 0.8, 0.76], ['chair', U / 2, D - 1.2, 0.5, 0.5, 0.9]);
    out.push(['chair', U / 2 - 0.5, D - 3.0, 0.45, 0.45, 0.5], ['chair', U / 2 + 0.5, D - 3.0, 0.45, 0.45, 0.5]);
    out.push(['bed', 1.1, D / 2, 0.85, 2.0, 0.65]);
    if (U > 12) grid(3, U - 2, 1.4, D / 2 - 1.5, 0.7, 1.2, (u, v) => out.push(['chair', u, v, 0.45, 0.45, 0.5]));
  } else if (p.cat === 'service') {
    out.push(['counter', U / 2, D * 0.55, U * 0.7, 0.6, 1.05]);
    grid(1.4, U - 1.4, 1.4, D * 0.55 - 1.4, 0.7, 1.2, (u, v) => out.push(['chair', u, v, 0.45, 0.45, 0.5]));
  } else if (p.cat === 'admin' || p.cat === 'ward') {
    if (/library|record/i.test(name)) grid(U / 2, U / 2, 2, D - 1.5, 1, 1.7, (u, v) => out.push(['shelf', u, v, U - 2, 0.5, 1.4]));
    else {
      const tw = Math.min(U - 3, 5);
      out.push(['table', U / 2, D / 2, tw, 1.4, 0.75], ['shelf', U / 2, D - 0.4, U - 1.2, 0.45, 1.4]);
      for (let u = U / 2 - tw / 2 + 0.5; u < U / 2 + tw / 2; u += 1.0)
        out.push(['chair', u, D / 2 - 1.05, 0.45, 0.45, 0.5], ['chair', u, D / 2 + 1.05, 0.45, 0.45, 0.5]);
    }
  }
  return out;
}

/** Add instanced furniture for every rect room on one floor. */
export function addFurniture(grp: THREE.Group, places: Place[], floor: string, y: number, real = false) {
  const byKind: Partial<Record<Kind, THREE.Matrix4[]>> = {};
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    s = new THREE.Vector3(),
    t = new THREE.Vector3();
  for (const p of places) {
    if (p.floor !== floor || !p.rect || p.gate || p.block || p.flat || p.poly || p.parts) continue;
    const [x1, z1, x2, z2] = p.rect.map(m3),
      [dx, dz] = p.door.map(m3);
    // Local frame: u along the door wall, v from the door wall inwards.
    const doorN = Math.abs(dz - z1) < 0.05,
      doorS = Math.abs(dz - z2) < 0.05,
      doorW = Math.abs(dx - x1) < 0.05;
    const along = doorN || doorS;
    const U = along ? x2 - x1 : z2 - z1,
      D = along ? z2 - z1 : x2 - x1;
    for (const [kind, cu, cv, su, sv, h] of layout(p, U, D)) {
      if (cu < 0 || cu > U || cv < 0 || cv > D) continue;
      const wx = along ? x1 + cu : doorW ? x1 + cv : x2 - cv;
      const wz = along ? (doorN ? z1 + cv : z2 - cv) : z1 + cu;
      t.set(wx, y + h / 2 + 0.08, wz);
      s.set(Math.max(0.05, along ? su : sv), h, Math.max(0.05, along ? sv : su));
      (byKind[kind] ??= []).push(m.compose(t, q, s).clone());
    }
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (const [kind, mats] of Object.entries(byKind) as [Kind, THREE.Matrix4[]][]) {
    const mat = real ? rmat(floor, 'f-' + kind, REAL[kind]) : fmat(floor, 'f-' + kind, COLOR[kind]);
    const mesh = new THREE.InstancedMesh(box, mat, mats.length);
    mesh.castShadow = mesh.receiveShadow = real;
    mats.forEach((mm, i) => mesh.setMatrixAt(i, mm));
    mesh.userData = { floor };
    grp.add(mesh);
  }
}

/** Trees: trunk + crown, instanced. The Real 3D version clusters three leafy blobs with varied greens. */
export function addTrees(grp: THREE.Group, pts: [number, number][], floor: string, y: number, big: boolean, real = false) {
  if (!pts.length) return;
  const k = big ? 1.6 : 1;
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    s = new THREE.Vector3(),
    t = new THREE.Vector3(),
    col = new THREE.Color();
  const trunkMat = real ? rmat(floor, 'trunk', { color: '#6b4f3a', roughness: 0.9 }) : fmat(floor, 'trunk', '--trunk');
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16 * k, 0.26 * k, 2.6 * k, 7), trunkMat, pts.length);
  // three crown blobs per tree in Real 3D, one in the plain style
  const blobs = real
    ? [
        [0, 3.3, 0, 1.7],
        [0.9, 2.9, 0.4, 1.25],
        [-0.7, 3.0, -0.6, 1.3],
      ]
    : [[0, 2.9, 0, 1.7]];
  const crownMat = real ? rmat(floor, 'leaves', { color: '#ffffff', roughness: 0.95 }) : fmat(floor, 'tree', '--tree');
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, real ? 1 : 0), crownMat, pts.length * blobs.length);
  pts.forEach(([x, z], i) => {
    const r = 0.8 + ((i * 37) % 10) / 20; // deterministic variety
    trunk.setMatrixAt(i, m.compose(t.set(m3(x), y + 1.3 * k * r, m3(z)), q.identity(), s.set(r, r, r)));
    blobs.forEach(([bx, by, bz, br], j) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.7 + j);
      const rr = br * k * r;
      crown.setMatrixAt(
        i * blobs.length + j,
        m.compose(t.set(m3(x) + bx * k * r, y + by * k * r, m3(z) + bz * k * r), q, s.set(rr, rr * 0.9, rr)),
      );
      if (real) crown.setColorAt(i * blobs.length + j, col.setHSL(0.26 + ((i * 13 + j * 7) % 10) / 160, 0.45, 0.32 + ((i + j) % 5) / 40));
    });
  });
  trunk.userData = crown.userData = { floor };
  trunk.castShadow = crown.castShadow = real;
  grp.add(trunk, crown);
}
