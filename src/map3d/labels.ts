// HTML labels over the 3D canvas: project each frame, show start/destination first, hide overlaps.
import * as THREE from 'three';
import { state } from '../state';
import { V3, v3el } from './scene';

const v = new THREE.Vector3();

export function place3DLabels() {
  const el = v3el(),
    w = el.clientWidth,
    h = el.clientHeight,
    boxes: number[][] = [];
  const cand: { L: (typeof V3.labels)[number]; pri: number; x: number; y: number; d: number }[] = [];
  V3.labels.forEach((L) => {
    const pri = L.id === '__start' ? 0 : L.id === state.dest ? 1 : 2;
    const need = L.id === '__fl' ? 0.4 : V3.stack ? 0.4 : 1;
    if (pri === 2 && (V3.fac[L.floor!] || 0) < need) {
      L.el.style.display = 'none';
      return;
    }
    v.copy(L.pos).project(V3.cam!);
    if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) {
      L.el.style.display = 'none';
      return;
    }
    cand.push({ L, pri, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, d: v.z });
  });
  cand.sort((a, b) => a.pri - b.pri || a.d - b.d);
  cand.forEach((c) => {
    const L = c.L;
    L.el.style.display = '';
    if (!L.w) {
      L.w = L.el.offsetWidth;
      L.h = L.el.offsetHeight;
    }
    const bx = [c.x - L.w / 2 - 2, c.y - L.h - 2, c.x + L.w / 2 + 2, c.y + 2];
    if (c.pri === 2 && boxes.some((o) => bx[0] < o[2] && bx[2] > o[0] && bx[1] < o[3] && bx[3] > o[1])) {
      L.el.style.display = 'none';
      return;
    }
    boxes.push(bx);
    L.el.style.transform = `translate(${c.x.toFixed(1)}px,${c.y.toFixed(1)}px) translate(-50%,-100%)`;
  });
}
