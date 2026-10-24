// The real hospital (site.json) as exploded, category-coloured floors for the landing page.
import * as THREE from 'three';
import { SCALE } from '../engine/graph';
import type { Graph, Rect } from '../data/types';

export type Theme = 'dark' | 'light';
export const FLOOR_GAP = 24; // metres between exploded floors
export const ROOM_H = 2.4;
const CORE_H = ROOM_H * 1.6;
const INSET = 0.35; // hairline gap so neighbouring rooms read as separate
const CORE_COL = 0x64748b;
const DOWN_COL = 0xff3b3b;
const CAT: Record<string, number> = {
  opd: 0x5b8cff,
  test: 0x2dd4bf,
  ward: 0xfbbf24,
  emergency: 0xff6b6b,
  service: 0x8aa0bf,
  admin: 0xa78bfa,
  food: 0xfb923c,
};
const LOOK: Record<Theme, { slab: number; shell: number; roomOpacity: number; edge: number }> = {
  dark: { slab: 0x0b1a33, shell: 0x2f5c9a, roomOpacity: 0.42, edge: 0xffffff },
  light: { slab: 0xffffff, shell: 0x9fb3cf, roomOpacity: 0.78, edge: 0x5a6a80 },
};

/** 12 edges of an axis-aligned box as line-segment vertex pairs. */
function boxEdges(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number[] {
  const c = [
    [x1, y1, z1],
    [x2, y1, z1],
    [x2, y1, z2],
    [x1, y1, z2],
    [x1, y2, z1],
    [x2, y2, z1],
    [x2, y2, z2],
    [x1, y2, z2],
  ];
  const e = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
  return e.flatMap((i) => c[i]);
}

export interface Building {
  group: THREE.Group;
  topY: number;
  /** Plan point (plan units) on a floor → world position. */
  toWorld(x: number, y: number, floor: string, lift?: number): THREE.Vector3;
  /** World box [x1, z1, x2, z2] and floor height of a room, if it has one. */
  room(id: string): { r: readonly number[]; y: number } | null;
  /** Paint every lift/stair core of a group red (out of order), or all back to normal with null. */
  setCoreDown(group: string | null): void;
  setTheme(t: Theme): void;
}

export function buildBuilding(g: Graph): Building {
  const shells = Object.values(g.site.shells).flat();
  const cx = (Math.min(...shells.map((r) => r[0])) + Math.max(...shells.map((r) => r[2]))) / 2;
  const cz = (Math.min(...shells.map((r) => r[1])) + Math.max(...shells.map((r) => r[3]))) / 2;
  const wx = (x: number) => (x - cx) / SCALE;
  const wz = (y: number) => (y - cz) / SCALE;
  const floorY = (id: string) => g.floors[id].i * FLOOR_GAP;
  const rectW = (r: Rect) => [wx(r[0]), wz(r[1]), wx(r[2]), wz(r[3])] as const;

  const group = new THREE.Group();
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const slabMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.3, transparent: true, opacity: 0.88 });
  const shellMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9 });
  const roomMat = new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false });
  const edgeMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 });
  const rooms: Record<string, { r: readonly number[]; y: number }> = {};
  const cores: { mesh: THREE.InstancedMesh; i: number; group: string }[] = [];
  const m = new THREE.Matrix4();
  const col = new THREE.Color();

  for (const f of g.site.floors) {
    const y = floorY(f.id);
    const shellEdges: number[] = [];
    for (const r of g.site.shells[f.id] ?? []) {
      const [x1, z1, x2, z2] = rectW(r);
      const slab = new THREE.Mesh(unit, slabMat);
      slab.scale.set(x2 - x1, 0.5, z2 - z1);
      slab.position.set((x1 + x2) / 2, y - 0.25, (z1 + z2) / 2);
      group.add(slab);
      shellEdges.push(...boxEdges(x1, y, z1, x2, y, z2));
    }
    group.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(shellEdges, 3)),
        shellMat,
      ),
    );

    const fRooms = g.site.places.filter((p) => p.floor === f.id && p.rect && !p.gate);
    const fCores = g.site.cores.filter((c) => c.floor === f.id && c.rect);
    const mesh = new THREE.InstancedMesh(unit, roomMat, fRooms.length + fCores.length);
    const edges: number[] = [];
    const cols: number[] = [];
    const addBox = (i: number, r: Rect, h: number, hex: number) => {
      const [x1, z1, x2, z2] = rectW(r);
      m.makeScale(x2 - x1 - INSET, h, z2 - z1 - INSET).setPosition((x1 + x2) / 2, y + h / 2, (z1 + z2) / 2);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, col.setHex(hex));
      const box = boxEdges(x1 + INSET / 2, y, z1 + INSET / 2, x2 - INSET / 2, y + h, z2 - INSET / 2);
      edges.push(...box);
      col.setHex(hex).multiplyScalar(0.9);
      for (let k = 0; k < box.length / 3; k++) cols.push(col.r, col.g, col.b);
    };
    fRooms.forEach((p, i) => {
      addBox(i, p.rect!, ROOM_H, CAT[p.cat] ?? CAT.service);
      rooms[p.id] = { r: rectW(p.rect!), y };
    });
    fCores.forEach((c, i) => {
      addBox(fRooms.length + i, c.rect, CORE_H, CORE_COL);
      cores.push({ mesh, i: fRooms.length + i, group: c.group });
    });
    group.add(mesh);
    const lines = new THREE.BufferGeometry()
      .setAttribute('position', new THREE.Float32BufferAttribute(edges, 3))
      .setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    group.add(new THREE.LineSegments(lines, edgeMat));
  }

  return {
    group,
    topY: (g.site.floors.length - 1) * FLOOR_GAP,
    toWorld: (x, y, floor, lift = 0) => new THREE.Vector3(wx(x), floorY(floor) + lift, wz(y)),
    room: (id) => rooms[id] ?? null,
    setCoreDown(down) {
      for (const c of cores) {
        c.mesh.setColorAt(c.i, col.setHex(c.group === down ? DOWN_COL : CORE_COL));
        c.mesh.instanceColor!.needsUpdate = true;
      }
    },
    setTheme(t) {
      const look = LOOK[t];
      slabMat.color.setHex(look.slab);
      shellMat.color.setHex(look.shell);
      roomMat.opacity = look.roomOpacity;
      edgeMat.color.setHex(look.edge);
    },
  };
}
