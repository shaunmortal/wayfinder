// Static 3D scene from site data: ground, roads, slabs, walls, rooms, plan texture, shafts, labels.
import * as THREE from 'three';
import type { XY } from '../data/types';
import { bboxOf, polyCenter, polyEdges, segGaps } from '../map2d/draw';
import { G } from '../state';
import { $, esc } from '../ui/dom';
import { floorName, isHi, pShort, tr } from '../ui/bound';
import { V3, catVar, cssCol, disposeGroup, elev, fmat, m3, type Label3 } from './scene';
import { addFurniture, addTrees } from './furniture';

const WALLH = 2.4,
  WT = 0.2;

function edges(me: THREE.Mesh, floor: string) {
  const l = new THREE.LineSegments(new THREE.EdgesGeometry(me.geometry), fmat(floor, 'edge', '--m-rim', 0.9, true));
  l.position.copy(me.position);
  l.rotation.copy(me.rotation);
  l.userData = { floor };
  return l;
}
function box3(x1: number, z1: number, x2: number, z2: number, y0: number, h: number, material: THREE.Material | THREE.Material[]) {
  const me = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.05, x2 - x1), Math.max(0.02, h), Math.max(0.05, z2 - z1)), material);
  me.position.set((x1 + x2) / 2, y0 + h / 2, (z1 + z2) / 2);
  return me;
}
function wall3(a: number[], b: number[], y0: number, h: number, mat: THREE.Material) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const me = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.05, L), h, 0.2), mat);
  me.position.set((a[0] + b[0]) / 2, y0 + h / 2, (a[1] + b[1]) / 2);
  me.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
  return me;
}
const shape3 = (poly: XY[]) => new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(m3(x), -m3(z))));
const r3 = (r: number[]) => r.map(m3) as [number, number, number, number];
const rectPoly = (r: number[]): XY[] => [
  [r[0], r[1]],
  [r[2], r[1]],
  [r[2], r[3]],
  [r[0], r[3]],
];

/** Walls along a rect's four edges (plan units), leaving gaps at doors / openings. */
function rectWalls(
  grp: THREE.Group,
  r: number[],
  gaps: XY[],
  half: number,
  y: number,
  h: number,
  mat: THREE.Material,
  id: string | null,
  floor: string,
  tag: (o: THREE.Mesh, id: string | null, f: string) => THREE.Mesh,
) {
  const poly = rectPoly(r);
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % 4];
    segGaps(a, b, gaps, half).forEach(([q, w]) => {
      const me = wall3(q.map(m3), w.map(m3), y, h, mat);
      grp.add(tag(me, id, floor), edges(me, floor));
    });
  });
}

export function build3DStatic() {
  const S = G().site,
    scene = V3.scene!;
  if (V3.stat) {
    scene.remove(V3.stat);
    disposeGroup(V3.stat, false);
  }
  Object.values(V3.mats).forEach((m) => m.dispose());
  V3.mats = {};
  scene.background = scene.userData.plainBg = cssCol('--m-ground');
  const grp = new THREE.Group();
  V3.byId = {};
  V3.hl = [];
  const tag = <T extends THREE.Object3D>(me: T, id: string | null, floor: string) => {
    me.userData = { id, floor, orig: (me as unknown as THREE.Mesh).material };
    if (id) (V3.byId[id] ??= []).push(me as unknown as THREE.Mesh);
    return me;
  };

  S.floors.forEach((f) => {
    const y = elev(f.id),
      gp = S.ground?.[f.id];
    if (gp) {
      const me = new THREE.Mesh(new THREE.ShapeGeometry(shape3(gp)), fmat(f.id, 'lawn', '--m-lawn'));
      me.rotation.x = -Math.PI / 2;
      me.position.y = y - 0.06;
      grp.add(tag(me, null, f.id));
    }
    ((S.roads?.[f.id] as { w?: number; pts: XY[] }[]) || []).forEach((rd) => {
      const w = m3(rd.w || 56);
      for (let i = 0; i < rd.pts.length - 1; i++) {
        const [ax, az] = rd.pts[i].map(m3),
          [bx, bz] = rd.pts[i + 1].map(m3),
          len = Math.hypot(bx - ax, bz - az);
        const me = new THREE.Mesh(new THREE.BoxGeometry(len + w, 0.05, w), fmat(f.id, 'road', '--m-road'));
        me.position.set((ax + bx) / 2, y + 0.01, (az + bz) / 2);
        me.rotation.y = -Math.atan2(bz - az, bx - ax);
        grp.add(tag(me, null, f.id));
      }
    });
    const gates = [
      ...S.places.filter((p) => p.gate && p.floor === f.id).map((p) => p.door),
      ...(S.openings || []).filter((o) => o.floor === f.id).map((o) => o.at),
    ];
    (S.shells[f.id] || []).forEach((r) => {
      const [x1, z1, x2, z2] = r3(r);
      grp.add(tag(box3(x1, z1, x2, z2, y - 0.4, 0.4, fmat(f.id, 'slab', '--m-corr')), null, f.id));
      rectWalls(grp, r, gates, 22, y, WALLH, fmat(f.id, 'wall', '--m-wall-side'), null, f.id, tag);
    });
    (S.shellPoly?.[f.id] || []).forEach((poly) => {
      const slab = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape3(poly), { depth: 0.4, bevelEnabled: false }),
        fmat(f.id, 'slab', '--m-corr'),
      );
      slab.rotation.x = -Math.PI / 2;
      slab.position.y = y - 0.4;
      grp.add(tag(slab, null, f.id));
      const wm = fmat(f.id, 'wall', '--m-wall-side');
      polyEdges(poly).forEach((e) =>
        segGaps(e.a, e.b, gates, 20).forEach(([q, r]) => {
          const me = wall3(q.map(m3), r.map(m3), y, WALLH, wm);
          grp.add(tag(me, null, f.id), edges(me, f.id));
        }),
      );
    });
    const pim = S.planImg?.[f.id];
    if (pim) {
      const pm = new THREE.MeshBasicMaterial({ color: cssCol('--m-rim'), transparent: true, opacity: 0.95, depthWrite: false });
      (pm as unknown as { userData: object }).userData = { floor: f.id, base: 0.95 };
      V3.mats[f.id + '|plan'] = pm as never;
      new THREE.TextureLoader().load(pim.src, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        pm.map = tex;
        pm.needsUpdate = true;
      });
      const me = new THREE.Mesh(new THREE.PlaneGeometry(m3(pim.w), m3(pim.h)), pm);
      me.rotation.x = -Math.PI / 2;
      me.position.set(m3(pim.x + pim.w / 2), y + 0.03, m3(pim.y + pim.h / 2));
      me.renderOrder = 1;
      grp.add(tag(me, null, f.id));
    }
    S.places
      .filter((p) => p.floor === f.id && p.poly)
      .sort((a, b) => (b.under ? 1 : 0) - (a.under ? 1 : 0))
      .forEach((p) => {
        const z0 = m3(p.raise || 0);
        const fl = new THREE.Mesh(
          new THREE.ExtrudeGeometry(shape3(p.poly!), { depth: Math.max(0.06, z0), bevelEnabled: false }),
          fmat(f.id, 'cat-' + p.cat, catVar(p.cat)),
        );
        fl.rotation.x = -Math.PI / 2;
        fl.position.y = y + (p.under ? 0.02 : 0.05);
        grp.add(tag(fl, p.id, f.id));
        const wm = fmat(f.id, 'rwall', '--m-wall-out'),
          H = p.wallH ? m3(p.wallH) : WALLH * 0.9;
        polyEdges(p.poly!).forEach((e) =>
          segGaps(e.a, e.b, p.door ? [p.door] : [], 8).forEach(([q, r]) => {
            const me = wall3(q.map(m3), r.map(m3), y, H, wm);
            grp.add(tag(me, p.id, f.id), edges(me, f.id));
          }),
        );
      });
    S.places
      .filter((p) => p.floor === f.id && !p.poly)
      .forEach((p) => {
        const parts = p.parts ? p.parts : p.rect ? [{ r: p.rect, h: p.h }] : [];
        parts.forEach((q) => {
          const [x1, z1, x2, z2] = r3(q.r);
          if (p.flat) {
            const me = box3(x1, z1, x2, z2, y, 0.1, fmat(f.id, 'cat-' + p.cat, catVar(p.cat)));
            grp.add(tag(me, p.id, f.id), edges(me, f.id));
            return;
          }
          if (p.block) {
            const H = m3((q.h as number) || p.h || 56),
              side = fmat(f.id, 'bside', '--b-s'),
              top = fmat(f.id, 'cat-' + p.cat, catVar(p.cat));
            const be = fmat(f.id, 'bside-e', '--b-e');
            const me = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, H, z2 - z1), [be, be, top, side, side, side]);
            me.position.set((x1 + x2) / 2, y + H / 2, (z1 + z2) / 2);
            grp.add(tag(me, p.id, f.id), edges(me, f.id));
            return;
          }
          grp.add(tag(box3(x1, z1, x2, z2, y, 0.08, fmat(f.id, 'cat-' + p.cat, catVar(p.cat))), p.id, f.id));
          rectWalls(grp, q.r, p.door ? [p.door] : [], 8, y, WALLH, fmat(f.id, 'rwall', '--m-wall-out'), p.id, f.id, tag);
        });
      });
    if (!S.outdoor) addFurniture(grp, S.places, f.id, y);
    addTrees(grp, S.trees?.[f.id] || [], f.id, y, !!S.outdoor);
    S.cores
      .filter((c) => c.floor === f.id && c.rect)
      .forEach((c) => {
        const [x1, z1, x2, z2] = r3(c.rect);
        grp.add(tag(box3(x1, z1, x2, z2, y, 0.08, fmat(f.id, 'core', '--c-core')), null, f.id));
        rectWalls(grp, c.rect, [c.door], 8, y, WALLH, fmat(f.id, 'rwall', '--m-wall-out'), null, f.id, tag);
      });
  });

  // See-through shafts joining the same lift/stairs group across floors.
  const groups: Record<string, typeof S.cores> = {};
  S.cores.forEach((c) => (groups[c.group] ??= []).push(c));
  Object.values(groups).forEach((cs) => {
    const c0 = cs[0];
    if (!c0.rect) return;
    const ys = cs.map((c) => elev(c.floor)),
      [x1, z1, x2, z2] = r3(c0.rect);
    const m = new THREE.MeshLambertMaterial({
      color: cssCol(c0.kind === 'lift' ? '--route' : '--m-rim'),
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    grp.add(box3(x1 + 0.4, z1 + 0.4, x2 - 0.4, z2 - 0.4, Math.min(...ys), Math.max(...ys) - Math.min(...ys) + WALLH, m));
  });
  V3.stat = grp;
  scene.add(grp);

  const lay = $('#v3labels');
  lay.innerHTML = '';
  V3.labels = [];
  const addL = (text: string, pos: THREE.Vector3, floor: string | null, id: string, cls: string, code = '') => {
    const el = document.createElement('div');
    el.className = 'l3' + (cls ? ' ' + cls : '');
    el.innerHTML = (code ? `<b>${esc(code)}</b>` : '') + `<span>${esc(text)}</span>`;
    lay.appendChild(el);
    const L: Label3 = { el, pos, floor, id, w: 0, h: 0 };
    V3.labels.push(L);
    return L;
  };
  S.places.forEach((p) => {
    let cx: number, cz: number, top: number;
    if (p.poly) {
      const c = p.labelAt || polyCenter(p.poly);
      cx = m3(c[0]);
      cz = m3(c[1]);
      top = (p.wallH ? m3(p.wallH) : WALLH * 0.9) + m3(p.raise || 0);
    } else if (p.rect) {
      cx = m3((p.rect[0] + p.rect[2]) / 2);
      cz = m3((p.rect[1] + p.rect[3]) / 2);
      const part = p.parts ? p.parts.find((q) => q.r.join() === p.rect!.join()) || p.parts[0] : null;
      top = p.block ? m3(((part ? part.h : p.h) as number) || 56) : p.flat ? 0.3 : WALLH;
    } else {
      const at = p.labelAt || p.door;
      cx = m3(at[0]);
      cz = m3(at[1]);
      top = 0.6;
    }
    addL(pShort(p), new THREE.Vector3(cx, elev(p.floor) + top + 0.4, cz), p.floor, p.id, p.rect || p.poly ? '' : 'gate', p.num ? p.id : '');
  });
  S.cores.forEach((c) => {
    if (!c.rect) return;
    const word = c.enS ? (isHi() ? c.hiS || c.enS : c.enS) : tr(c.kind === 'lift' ? 'liftWord' : 'stairsWord');
    addL(
      word,
      new THREE.Vector3(m3((c.rect[0] + c.rect[2]) / 2), elev(c.floor) + WALLH + 0.4, m3((c.rect[1] + c.rect[3]) / 2)),
      c.floor,
      c.id,
      'core',
    );
  });
  S.floors.forEach((f) => {
    const spl = S.shellPoly?.[f.id]?.[0],
      sh = S.shells[f.id]?.[0] || (spl && bboxOf(spl));
    if (!sh || S.outdoor) return;
    addL(floorName(f.id), new THREE.Vector3(m3(sh[0]) + 2, elev(f.id) + 0.3, m3(sh[3]) - 1), f.id, '__fl', 'fl', f.id);
  });
  V3.startLbl = addL(tr('youAreHere'), new THREE.Vector3(), null, '__start', 'start');
  V3.labels.sort((a, b) => Number(b.id === '__start') - Number(a.id === '__start'));
}
