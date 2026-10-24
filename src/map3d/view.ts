// Entry point for the 3D view (loaded lazily, so three.js stays out of the first download).
import { hooks, fitRoute, fitStep } from '../map2d/viewport';
import { renderMap } from '../map2d/route2d';
import { okRoute, state } from '../state';
import { $, toast } from '../ui/dom';
import { tr } from '../ui/bound';
import { dolly3D, fit3D } from './fit';
import { place3DLabels } from './labels';
import { animateFlow, update3D } from './route3d';
import { renderStepView } from './stepview';
import { V3, init3D, size3D, v3el } from './scene';
import * as THREE from 'three';
import { G } from '../state';
import { m3, elev } from './scene';
import { ensureReal } from './real';

function loop() {
  if (!V3.on) return;
  V3.raf = requestAnimationFrame(loop);
  const tw = V3.tween;
  if (tw) {
    const k = Math.min(1, (performance.now() - tw.start) / tw.dur),
      e = k * k * (3 - 2 * k);
    V3.cam!.position.lerpVectors(tw.p0, tw.p1, e);
    V3.ctl!.target.lerpVectors(tw.t0, tw.t1, e);
    if (k >= 1) V3.tween = null;
  }
  V3.ctl!.update();
  V3.R!.render(V3.scene!, V3.cam!);
  place3DLabels();
  animateFlow(performance.now() / 1000);
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  hooks.is3D = () => V3.on;
  Object.assign((window as unknown as { raastaDebug?: object }).raastaDebug ?? {}, { v3: V3 }); // console helper
  hooks.fit3D = fit3D;
  hooks.dolly3D = dolly3D;
  hooks.isReal = () => V3.on && V3.real;
  hooks.stepView = (el, st) => {
    if (!V3.on) return false;
    ensureReal();
    update3D();
    return renderStepView(el, st);
  };
  hooks.afterRender = () => {
    if (V3.on) update3D();
  };
  const onTheme = () => {
    if (V3.on) update3D();
  };
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme);
  new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

function fitCurrent() {
  const r = okRoute();
  if (state.nav && r) fitStep(r.steps[state.stepIdx]);
  else fitRoute();
}

/** Real 3D: tap a room to stand in the corridor in front of its door, at eye level. */
function walkIn(id: string) {
  const p = G().places[id];
  if (!p || !V3.cam || !V3.ctl) return;
  const via = G().nodes[p.via],
    y = elev(p.floor);
  const door = new THREE.Vector3(m3(p.door[0]), y + 1.5, m3(p.door[1]));
  const out = new THREE.Vector3(m3(via.x) - door.x, 0, m3(via.y) - door.z);
  if (out.lengthSq() < 0.01) out.set(0, 0, 1);
  out.normalize();
  const p1 = door
    .clone()
    .addScaledVector(out, 5.5)
    .setY(y + 1.75);
  V3.ctl.minDistance = 0.5;
  V3.tween = { p0: V3.cam.position.clone(), p1, t0: V3.ctl.target.clone(), t1: door, start: performance.now(), dur: 900 };
}

export function set3D(on: boolean, real = V3.real) {
  wire();
  const wrap = $('#mapwrap'),
    el = v3el();
  V3.on = on;
  V3.real = real;
  V3.tween = null;
  if (!on) {
    cancelAnimationFrame(V3.raf);
    el.hidden = true;
    wrap.classList.remove('is-3d');
    renderMap();
    fitCurrent();
    return;
  }
  try {
    init3D(
      (id) => {
        hooks.onRoom(id);
        if (V3.real) walkIn(id);
      },
      () => !state.nav,
    );
  } catch {
    // No WebGL (old phone, blocked GPU): stay on the flat map.
    V3.on = false;
    toast(tr('no3d'));
    return;
  }
  el.hidden = false;
  wrap.classList.add('is-3d');
  size3D();
  V3.key = null;
  update3D();
  fitCurrent();
  loop();
}
