// "Real 3D" style: the same site data drawn with textures, full-height walls, door frames with room signs,
// stair steps, lit lifts, facades, real-looking trees and shadows. Built once per site as a second group.
import * as THREE from 'three';
import type { Place, Rect, XY } from '../data/types';
import { polyEdges, segGaps } from '../map2d/draw';
import { G } from '../state';
import { isHi } from '../ui/bound';
import { addFurniture, addTrees } from './furniture';
import { V3, disposeGroup, elev, lowPower, m3, rmat } from './scene';
import { asphalt, facade, grass, paint, pavers, signAtlas, sky, tiles, uvScale, vinyl } from './textures';

export const REAL_WALL = 3.0;
const DOOR_H = 2.2;
// Daylight floor tints per category (independent of the light/dark UI theme).
const TINT: Record<string, string> = {
  opd: '#dfe9fb',
  test: '#dcf1e3',
  ward: '#fbeedb',
  emergency: '#fadcd8',
  service: '#eef0f3',
  admin: '#ece4f7',
  food: '#e3f2df',
  hall: '#f6ead2',
  learn: '#e2ebf9',
  stay: '#f7e1ea',
  park: '#e6e8ec',
  core: '#d7dde4',
};

const shape3 = (poly: XY[]) => new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(m3(x), -m3(z))));
const rectPoly = (r: number[]): XY[] => [
  [r[0], r[1]],
  [r[2], r[1]],
  [r[2], r[3]],
  [r[0], r[3]],
];

function box(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number) {
  const me = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.03, w), Math.max(0.02, h), Math.max(0.03, d)), mat);
  me.position.set(x, y, z);
  return me;
}

/** A painted wall segment between two plan points (metres), 3 m high, texture kept at real size. */
function wall(a: number[], b: number[], y: number, h: number, mat: THREE.Material) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const me = new THREE.Mesh(uvScale(new THREE.BoxGeometry(Math.max(0.05, L), h, 0.2), L / 2, 1), mat);
  me.position.set((a[0] + b[0]) / 2, y + h / 2, (a[1] + b[1]) / 2);
  me.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
  me.castShadow = me.receiveShadow = true;
  return me;
}

/** Which side of a rect a door sits on: outward normal (towards the corridor) and the wall direction. */
function doorSide(r: Rect, door: XY) {
  const [x1, y1, , y2] = r,
    [dx, dy] = door;
  if (Math.abs(dy - y1) < 1) return { n: [0, -1], along: [1, 0] };
  if (Math.abs(dy - y2) < 1) return { n: [0, 1], along: [1, 0] };
  if (Math.abs(dx - x1) < 1) return { n: [-1, 0], along: [0, 1] };
  return { n: [1, 0], along: [0, 1] };
}

export function buildReal() {
  const S = G().site,
    grp = new THREE.Group(),
    byId: Record<string, THREE.Mesh[]> = {};
  const tag = <T extends THREE.Object3D>(me: T, id: string | null, floor: string) => {
    me.userData = { id, floor, orig: (me as unknown as THREE.Mesh).material };
    if (id) (byId[id] ??= []).push(me as unknown as THREE.Mesh);
    return me;
  };

  // One sign atlas for every room and lift/stairs door in the site.
  const signed: { key: string; lines: [string, string] }[] = [];
  const signText = (p: {
    id: string;
    num?: boolean;
    code?: string;
    enS?: string;
    hiS?: string;
    en?: string;
    hi?: string;
  }): [string, string] => {
    const en = p.enS || p.en || '',
      hi = p.hiS || p.hi || '';
    const head = p.num ? `${p.id} · ${en}` : en;
    return isHi() ? [p.num ? `${p.id} · ${hi}` : hi, en] : [head, hi];
  };
  S.places.forEach((p) => {
    if (p.rect && !p.gate && !p.block && !p.flat && !p.parts) signed.push({ key: p.id, lines: signText(p) });
  });
  S.cores.forEach((c) => {
    if (c.rect)
      signed.push({
        key: c.id,
        lines: signText({
          id: c.id,
          enS: c.enS || (c.kind === 'lift' ? 'Lift' : 'Stairs'),
          hiS: c.hiS || (c.kind === 'lift' ? 'लिफ्ट' : 'सीढ़ियाँ'),
        }),
      });
  });
  const atlas = signAtlas(signed.map((s) => s.lines));
  const signIdx = new Map(signed.map((s, i) => [s.key, i]));

  const doorFrame = (rect: Rect, door: XY, floor: string, y: number, key: string, id: string | null, leafColor: string) => {
    const { n, along } = doorSide(rect, door),
      [dx, dz] = door.map(m3),
      horiz = along[0] === 1;
    // lintel above the 2 m opening, up to the ceiling
    const lin = box(
      horiz ? 2.0 : 0.2,
      REAL_WALL - DOOR_H,
      horiz ? 0.2 : 2.0,
      rmat(floor, 'wall', { map: paint() }),
      dx,
      y + DOOR_H + (REAL_WALL - DOOR_H) / 2,
      dz,
    );
    // an open door leaf, hinged at one side and swung into the room
    const hx = dx - along[0] * 0.95,
      hz = dz - along[1] * 0.95;
    const leaf = box(
      horiz ? 0.05 : 0.95,
      2.1,
      horiz ? 0.95 : 0.05,
      rmat(floor, 'leaf-' + leafColor, { color: leafColor, roughness: 0.6 }),
      hx - n[0] * 0.48,
      y + 1.05,
      hz - n[1] * 0.48,
    );
    leaf.castShadow = true;
    grp.add(tag(lin, id, floor), tag(leaf, null, floor));
    const si = signIdx.get(key);
    if (si == null || !atlas.uv[si]) return;
    const [u0, v0, u1, v1] = atlas.uv[si];
    const geo = new THREE.PlaneGeometry(1.8, 0.45);
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
    const sign = new THREE.Mesh(geo, rmat(floor, 'sign', { map: atlas.tex, roughness: 0.5, emissive: 0x0a1a30, emissiveIntensity: 0.25 }));
    sign.position.set(dx + n[0] * 0.115, y + DOOR_H + 0.42, dz + n[1] * 0.115);
    sign.rotation.y = Math.atan2(n[0], n[1]);
    grp.add(tag(sign, null, floor));
  };

  const roomWalls = (poly: XY[], gaps: XY[], half: number, floor: string, y: number, h: number, id: string | null) => {
    const mat = rmat(floor, 'wall', { map: paint() });
    polyEdges(poly).forEach((e) =>
      segGaps(e.a, e.b, gaps, half).forEach(([q, w]) => grp.add(tag(wall(q.map(m3), w.map(m3), y, h, mat), id, floor))),
    );
  };
  const floorTile = (r: Rect, floor: string, y: number, cat: string, id: string | null) => {
    const [x1, z1, x2, z2] = r.map(m3),
      w = x2 - x1,
      d = z2 - z1;
    const me = new THREE.Mesh(
      uvScale(new THREE.BoxGeometry(w, 0.06, d), w / 1.2, d / 1.2),
      rmat(floor, 'tile-' + cat, { map: tiles(), color: TINT[cat] || '#eeeeee', roughness: 0.35 }),
    );
    me.position.set((x1 + x2) / 2, y + 0.03, (z1 + z2) / 2);
    me.receiveShadow = true;
    grp.add(tag(me, id, floor));
  };

  S.floors.forEach((f) => {
    const y = elev(f.id),
      gp = S.ground?.[f.id];
    if (gp) {
      const geo = uvScale(new THREE.ShapeGeometry(shape3(gp)), 1 / 4, 1 / 4);
      const me = new THREE.Mesh(geo, rmat(f.id, 'grass', { map: grass(), roughness: 1 }));
      me.rotation.x = -Math.PI / 2;
      me.position.y = y - 0.06;
      me.receiveShadow = true;
      grp.add(tag(me, null, f.id));
    }
    ((S.roads?.[f.id] as { w?: number; pts: XY[] }[]) || []).forEach((rd) => {
      const w = m3(rd.w || 56),
        path = w <= 3.2;
      for (let i = 0; i < rd.pts.length - 1; i++) {
        const [ax, az] = rd.pts[i].map(m3),
          [bx, bz] = rd.pts[i + 1].map(m3),
          len = Math.hypot(bx - ax, bz - az);
        const geo = uvScale(new THREE.BoxGeometry(len + w, 0.05, w), (len + w) / (path ? 2 : 6), w / (path ? 2 : 6));
        const me = new THREE.Mesh(
          geo,
          path ? rmat(f.id, 'pavers', { map: pavers() }) : rmat(f.id, 'asphalt', { map: asphalt(), roughness: 0.95 }),
        );
        me.position.set((ax + bx) / 2, y + (path ? 0.03 : 0.01), (az + bz) / 2);
        me.rotation.y = -Math.atan2(bz - az, bx - ax);
        me.receiveShadow = true;
        grp.add(tag(me, null, f.id));
      }
    });
    const gaps = [
      ...S.places.filter((p) => p.gate && p.floor === f.id).map((p) => p.door),
      ...(S.openings || []).filter((o) => o.floor === f.id).map((o) => o.at),
    ];
    (S.shells[f.id] || []).forEach((r) => {
      const [x1, z1, x2, z2] = r.map(m3),
        w = x2 - x1,
        d = z2 - z1;
      const slab = new THREE.Mesh(
        uvScale(new THREE.BoxGeometry(w, 0.4, d), w / 2, d / 2),
        rmat(f.id, 'vinyl', { map: vinyl(), roughness: 0.4 }),
      );
      slab.position.set((x1 + x2) / 2, y - 0.2, (z1 + z2) / 2);
      slab.receiveShadow = true;
      grp.add(tag(slab, null, f.id));
      roomWalls(rectPoly(r), gaps, 22, f.id, y, REAL_WALL, null);
    });
    (S.shellPoly?.[f.id] || []).forEach((poly) => {
      const slab = new THREE.Mesh(
        uvScale(new THREE.ExtrudeGeometry(shape3(poly), { depth: 0.4, bevelEnabled: false }), 0.5, 0.5),
        rmat(f.id, 'vinyl', { map: vinyl(), roughness: 0.4 }),
      );
      slab.rotation.x = -Math.PI / 2;
      slab.position.y = y - 0.4;
      slab.receiveShadow = true;
      grp.add(tag(slab, null, f.id));
      roomWalls(poly, gaps, 20, f.id, y, REAL_WALL, null);
    });
    S.places
      .filter((p) => p.floor === f.id)
      .forEach((p: Place) => {
        if (p.poly) {
          const fl = new THREE.Mesh(
            uvScale(
              new THREE.ExtrudeGeometry(shape3(p.poly), { depth: Math.max(0.06, m3(p.raise || 0)), bevelEnabled: false }),
              1 / 1.2,
              1 / 1.2,
            ),
            rmat(f.id, 'tile-' + p.cat, { map: tiles(), color: TINT[p.cat] || '#eeeeee', roughness: 0.35 }),
          );
          fl.rotation.x = -Math.PI / 2;
          fl.position.y = y + (p.under ? 0.02 : 0.05);
          fl.receiveShadow = true;
          grp.add(tag(fl, p.id, f.id));
          roomWalls(p.poly, p.door ? [p.door] : [], 8, f.id, y, p.wallH ? Math.max(m3(p.wallH), REAL_WALL) : REAL_WALL, p.id);
          return;
        }
        const parts = p.parts ? p.parts : p.rect ? [{ r: p.rect, h: p.h }] : [];
        parts.forEach((q) => {
          const [x1, z1, x2, z2] = q.r.map(m3),
            w = x2 - x1,
            d = z2 - z1;
          if (p.flat) {
            const me = new THREE.Mesh(
              uvScale(new THREE.BoxGeometry(w, 0.08, d), w / 6, d / 6),
              rmat(f.id, 'asphalt', { map: asphalt(), roughness: 0.95 }),
            );
            me.position.set((x1 + x2) / 2, y + 0.04, (z1 + z2) / 2);
            me.receiveShadow = true;
            grp.add(tag(me, p.id, f.id));
            return;
          }
          if (p.block) {
            const H = m3((q.h as number) || p.h || 56);
            const side = rmat(f.id, 'facade', { map: facade(), roughness: 0.7 }),
              roof = rmat(f.id, 'roof', { color: '#b9bec4', roughness: 0.9 });
            const geo = new THREE.BoxGeometry(w, H, d);
            // facade texture: one window bay per 4 m and one storey per 4 m on every side
            const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
            for (let i = 0; i < uv.count; i++) {
              const face = Math.floor(i / 4),
                span = face < 2 ? d : w;
              uv.setXY(i, (uv.getX(i) * span) / 4, uv.getY(i) * (face === 2 || face === 3 ? d / 4 : H / 4));
            }
            const me = new THREE.Mesh(geo, [side, side, roof, roof, side, side]);
            me.position.set((x1 + x2) / 2, y + H / 2, (z1 + z2) / 2);
            me.castShadow = me.receiveShadow = true;
            grp.add(tag(me, p.id, f.id));
            return;
          }
          floorTile(q.r, f.id, y, p.cat, p.id);
          roomWalls(rectPoly(q.r), p.door ? [p.door] : [], 8, f.id, y, REAL_WALL, p.id);
          if (p.door && !p.gate) doorFrame(q.r, p.door, f.id, y, p.id, p.id, '#9c7350');
        });
      });
    S.cores
      .filter((c) => c.floor === f.id && c.rect)
      .forEach((c) => {
        const [x1, z1, x2, z2] = c.rect.map(m3);
        floorTile(c.rect, f.id, y, 'core', null);
        roomWalls(rectPoly(c.rect), [c.door], 8, f.id, y, REAL_WALL, null);
        doorFrame(c.rect, c.door, f.id, y, c.id, null, c.kind === 'lift' ? '#aeb6bf' : '#8a8f96');
        if (c.kind === 'stairs') {
          // a flight of steps rising away from the door
          const { n } = doorSide(c.rect, c.door),
            steps = 10,
            cx = (x1 + x2) / 2,
            cz = (z1 + z2) / 2;
          const depth = (n[0] ? x2 - x1 : z2 - z1) - 1.2,
            run = depth / steps,
            width = (n[0] ? z2 - z1 : x2 - x1) * 0.45;
          for (let i = 0; i < steps; i++) {
            const off = -depth / 2 + run * (i + 0.5),
              h = 0.17 * (i + 1);
            const sx = n[0] ? run : width,
              sz = n[0] ? width : run;
            const me = box(
              sx,
              h,
              sz,
              rmat(f.id, 'step', { color: '#c4c8cc', roughness: 0.7 }),
              cx - n[0] * off,
              y + h / 2,
              cz - n[1] * off,
            );
            me.castShadow = me.receiveShadow = true;
            grp.add(tag(me, null, f.id));
          }
        } else {
          // brushed-steel lift doors on the back wall
          const { n } = doorSide(c.rect, c.door),
            bx = (x1 + x2) / 2 - n[0] * ((x2 - x1) / 2 - 0.15),
            bz = (z1 + z2) / 2 - n[1] * ((z2 - z1) / 2 - 0.15);
          const me = box(
            n[0] ? 0.08 : 2.2,
            2.3,
            n[0] ? 2.2 : 0.08,
            rmat(f.id, 'steel', { color: '#c9ced4', metalness: 0.7, roughness: 0.3 }),
            bx,
            y + 1.15,
            bz,
          );
          grp.add(tag(me, null, f.id));
        }
      });
    if (!S.outdoor) addFurniture(grp, S.places, f.id, y, true);
    addTrees(grp, S.trees?.[f.id] || [], f.id, y, !!S.outdoor, true);
  });
  return { grp, byId };
}

/** Build the Real 3D group if needed and point the sun's shadow camera at the site. */
export function ensureReal() {
  if (V3.statReal || !V3.scene) return;
  const { grp, byId } = buildReal();
  V3.statReal = grp;
  V3.byIdReal = byId;
  V3.scene.add(grp);
  const box3 = new THREE.Box3().setFromObject(grp),
    c = box3.getCenter(new THREE.Vector3()),
    size = box3.getSize(new THREE.Vector3());
  const sun = V3.sun!,
    half = Math.max(size.x, size.z) / 2 + 10;
  sun.position.set(c.x + half * 0.5, c.y + half * 1.2, c.z + half * 0.6);
  sun.target.position.copy(c);
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: half * 4 });
  sun.shadow.camera.updateProjectionMatrix();
}

export function disposeReal() {
  if (!V3.statReal) return;
  V3.scene?.remove(V3.statReal);
  disposeGroup(V3.statReal, false);
  Object.values(V3.matsReal).forEach((m) => m.dispose());
  V3.matsReal = {};
  V3.statReal = null;
  V3.byIdReal = {};
}

/** Switch the scene between the plain and the Real 3D look (background, fog, shadows, which group shows). */
export function applyStyle(real: boolean) {
  if (!V3.scene) return;
  if (real) ensureReal();
  if (V3.stat) V3.stat.visible = !real;
  if (V3.statReal) V3.statReal.visible = real;
  V3.sun!.castShadow = real && !lowPower();
  V3.scene.background = real ? sky() : (V3.scene.userData.plainBg ?? V3.scene.background);
  V3.scene.fog = real ? new THREE.Fog(0xe6f0f8, 220, 900) : null;
}
