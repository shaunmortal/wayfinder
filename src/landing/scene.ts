// Landing-page 3D backdrop: the real hospital, a live route, and a camera that moves through "shots" as the page scrolls.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { Graph } from '../data/types';
import { buildBuilding, type Building, type Theme } from './building';
import { createRouteFx, type RouteFx } from './routeFx';

export type ShotName = 'overview' | 'gate' | 'ask' | 'follow' | 'reroute' | 'outro';
type Target = 'center' | 'start' | 'dest' | 'mid' | 'head';
interface Shot {
  target: Target;
  /** Shift the picture sideways (fraction of width) so the building sits opposite the text card. */
  side: number;
  radius: number;
  el: number;
  spin: number;
  chase?: boolean;
}
const SHOTS: Record<ShotName, Shot> = {
  overview: { side: 0.17, target: 'center', radius: 330, el: 0.62, spin: 0.06 },
  gate: { side: 0.15, target: 'start', radius: 85, el: 0.7, spin: 0.12 },
  ask: { side: -0.15, target: 'dest', radius: 120, el: 1.05, spin: 0.08 },
  follow: { side: 0.15, target: 'head', radius: 60, el: 0.42, spin: 0, chase: true },
  reroute: { side: -0.15, target: 'mid', radius: 190, el: 0.78, spin: 0.05 },
  outro: { side: 0, target: 'center', radius: 420, el: 0.42, spin: 0.04 },
};
const SKY: Record<Theme, number> = { dark: 0x040915, light: 0xeef3fa };
const MAX_PIXELS_WIDE = 2400; // cap the drawing buffer on big Retina screens
const SLOW_FRAME = 1 / 32; // average frame time that triggers the low-quality fallback
const EASE = 0.035; // camera catch-up per second (smaller = snappier)

export interface Anchor {
  x: number;
  y: number;
  visible: boolean;
}
export interface Stage {
  building: Building;
  route: RouteFx;
  setShot(s: ShotName): void;
  setTheme(t: Theme): void;
  anchors(): { start: Anchor; dest: Anchor };
}

const lowPower = () => matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4;
const angleLerp = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

function makeDust(count: number, height: number) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++)
    pos.set([(Math.random() - 0.5) * 460, Math.random() * (height + 90) - 10, (Math.random() - 0.5) * 340], i * 3);
  const mat = new THREE.PointsMaterial({
    color: 0x7fb2ff,
    size: 0.9,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)), mat);
}

export function createStage(canvas: HTMLCanvasElement, g: Graph): Stage {
  let degraded = lowPower();
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !degraded, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color();
  scene.fog = new THREE.FogExp2(0, 0.0022);
  const camera = new THREE.PerspectiveCamera(36, 1, 1, 3000);
  const hemi = new THREE.HemisphereLight(0x9cc0ff, 0x040915, 1.1);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(80, 200, 120);
  scene.add(hemi, sun);

  const building = buildBuilding(g);
  const route = createRouteFx(g, building);
  const grid = new THREE.GridHelper(900, 90, 0x163a6b, 0x0c2142);
  grid.position.y = -6;
  const gridMat = grid.material as THREE.Material;
  gridMat.transparent = true;
  const dust = makeDust(degraded ? 250 : 700, building.topY);
  scene.add(building.group, route.group, grid, dust);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.55, 0.62));
  composer.addPass(new OutputPass());
  let theme: Theme = 'dark';

  function resize() {
    const w = innerWidth;
    const h = innerHeight;
    const ratio = Math.min(devicePixelRatio, degraded ? 1 : 2, MAX_PIXELS_WIDE / w);
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(ratio);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = w < h ? 54 : 36; // narrow screens need a wider view to keep the building in frame
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  const pointer = new THREE.Vector2();
  addEventListener('pointermove', (e) => pointer.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5), { passive: true });

  let shot = SHOTS.overview;
  const cam = { target: new THREE.Vector3(0, building.topY / 2, 0), radius: shot.radius, el: shot.el, az: 0.7, side: shot.side };
  const center = new THREE.Vector3(0, building.topY / 2, 0);
  const goal = new THREE.Vector3();
  const targetOf = (t: Target, headPos: THREE.Vector3 | null) =>
    t === 'center' ? center : t === 'head' ? (headPos ?? route.mid) : t === 'start' ? route.start : t === 'dest' ? route.dest : route.mid;

  function moveCamera(dt: number, headPos: THREE.Vector3 | null) {
    const k = 1 - Math.pow(EASE, dt);
    goal.copy(targetOf(shot.target, headPos));
    cam.target.lerp(goal, k);
    cam.radius += (shot.radius * (camera.aspect < 1 ? 1.35 : 1) - cam.radius) * k;
    cam.el += (shot.el - pointer.y * 0.15 - cam.el) * k;
    if (shot.chase) {
      const h = route.heading();
      cam.az = angleLerp(cam.az, Math.atan2(-h.z, -h.x), k * 0.6);
    } else if (!still) cam.az += shot.spin * dt;
    const az = cam.az + (shot.chase ? 0 : pointer.x * 0.3);
    const r = cam.radius;
    camera.position.set(
      cam.target.x + Math.cos(az) * Math.cos(cam.el) * r,
      cam.target.y + Math.sin(cam.el) * r,
      cam.target.z + Math.sin(az) * Math.cos(cam.el) * r,
    );
    camera.lookAt(cam.target);
    // Only on wide screens: on phones the card sits below the building instead.
    const wide = camera.aspect > 1.1;
    cam.side += ((wide ? shot.side : 0) - cam.side) * k;
    camera.setViewOffset(innerWidth, innerHeight, -cam.side * innerWidth, 0, innerWidth, innerHeight);
  }

  // Watch real frame times and drop pixel ratio and bloom on slow machines, so the page never freezes the laptop.
  let frames = 0;
  let slowSum = 0;
  function watchSpeed(dt: number) {
    if (degraded || frames > 90) return;
    frames++;
    if (frames > 30) slowSum += dt;
    if (frames === 90 && slowSum / 60 > SLOW_FRAME) {
      degraded = true;
      dust.visible = false;
      resize();
    }
  }

  let last = performance.now();
  function frame(now: number) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    watchSpeed(dt);
    const headPos = route.tick(now, still);
    moveCamera(dt, headPos);
    dust.rotation.y += dt * 0.01;
    if (theme === 'dark' && !degraded) composer.render();
    else renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  function setTheme(t: Theme) {
    theme = t;
    (scene.background as THREE.Color).setHex(SKY[t]);
    (scene.fog as THREE.FogExp2).color.setHex(SKY[t]);
    hemi.intensity = t === 'dark' ? 1.1 : 1.6;
    gridMat.opacity = t === 'dark' ? 0.55 : 0.18;
    dust.visible = t === 'dark' && !degraded;
    building.setTheme(t);
    route.setTheme(t);
  }
  setTheme(theme);

  const v = new THREE.Vector3();
  const project = (p: THREE.Vector3): Anchor => {
    v.copy(p).project(camera);
    return {
      x: (v.x * 0.5 + 0.5) * innerWidth,
      y: (-v.y * 0.5 + 0.5) * innerHeight,
      visible: v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1,
    };
  };
  return {
    building,
    route,
    setShot: (s) => (shot = SHOTS[s]),
    setTheme,
    anchors: () => ({ start: project(route.start), dest: project(route.dest) }),
  };
}
