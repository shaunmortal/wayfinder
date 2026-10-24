// Procedural textures for the "Real 3D" style, drawn on canvases (no image files to ship or license).
import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

function canvasTex(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = true) {
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cache.set(key, t);
  return t;
}

/** Deterministic speckle so textures look the same on every load. */
function speckle(c: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number, seed = 1) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    c.fillStyle = rnd() > 0.5 ? `rgba(0,0,0,${alpha * rnd()})` : `rgba(255,255,255,${alpha * rnd()})`;
    c.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

/** 60 cm vitrified floor tiles; one repeat = 1.2 m (2 x 2 tiles). */
export const tiles = () =>
  canvasTex('tiles', 256, 256, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 256, 256);
    speckle(c, 256, 256, 2500, 0.06, 7);
    c.strokeStyle = 'rgba(120,110,95,0.35)';
    c.lineWidth = 2;
    for (const p of [0, 128]) {
      c.beginPath();
      c.moveTo(p, 0);
      c.lineTo(p, 256);
      c.stroke();
      c.beginPath();
      c.moveTo(0, p);
      c.lineTo(256, p);
      c.stroke();
    }
  });

/** Corridor vinyl: light grey with soft streaks; one repeat = 2 m. */
export const vinyl = () =>
  canvasTex('vinyl', 256, 256, (c) => {
    c.fillStyle = '#dde2e6';
    c.fillRect(0, 0, 256, 256);
    speckle(c, 256, 256, 4000, 0.07, 3);
    c.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 6; i++) c.fillRect(0, 20 + i * 40, 256, 6);
  });

/** Painted wall with a dark skirting at the bottom; v runs bottom (0) to top (1) of a 3 m wall. */
export const paint = () =>
  canvasTex(
    'paint',
    64,
    256,
    (c) => {
      c.fillStyle = '#f2efe8';
      c.fillRect(0, 0, 64, 256);
      speckle(c, 64, 256, 500, 0.04, 11);
      c.fillStyle = '#c9d6e0'; // hospital dado band (washable lower wall)
      c.fillRect(0, 150, 64, 92);
      c.fillStyle = '#7d8a96'; // skirting
      c.fillRect(0, 242, 64, 14);
      c.fillStyle = 'rgba(0,0,0,0.08)';
      c.fillRect(0, 148, 64, 2);
    },
    true,
  );

export const grass = () =>
  canvasTex('grass', 256, 256, (c) => {
    c.fillStyle = '#6f9f4f';
    c.fillRect(0, 0, 256, 256);
    let s = 5;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 9000; i++) {
      const g = 110 + rnd() * 70;
      c.fillStyle = `rgba(${(g * 0.55) | 0},${g | 0},${(g * 0.4) | 0},0.5)`;
      c.fillRect(rnd() * 256, rnd() * 256, 1, 2 + rnd() * 3);
    }
  });

export const asphalt = () =>
  canvasTex('asphalt', 256, 256, (c) => {
    c.fillStyle = '#5f646a';
    c.fillRect(0, 0, 256, 256);
    speckle(c, 256, 256, 9000, 0.18, 13);
  });

export const pavers = () =>
  canvasTex('pavers', 128, 128, (c) => {
    c.fillStyle = '#c9b8a0';
    c.fillRect(0, 0, 128, 128);
    c.strokeStyle = 'rgba(90,70,50,0.35)';
    for (let y = 0; y < 128; y += 32) for (let x = (y / 32) % 2 ? -16 : 0; x < 128; x += 32) c.strokeRect(x + 1, y + 1, 30, 30);
    speckle(c, 128, 128, 800, 0.08, 17);
  });

/** Building facade with window rows; one repeat = 4 m wide x one 4 m storey. */
export const facade = () =>
  canvasTex('facade', 128, 128, (c) => {
    c.fillStyle = '#e8e1d3';
    c.fillRect(0, 0, 128, 128);
    const g = c.createLinearGradient(0, 30, 0, 90);
    g.addColorStop(0, '#7fa7c9');
    g.addColorStop(1, '#3f6584');
    c.fillStyle = g;
    c.fillRect(14, 34, 100, 56);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(14, 34, 100, 6);
    c.fillStyle = '#b9ae9a';
    c.fillRect(0, 96, 128, 8);
  });

export const sky = () =>
  canvasTex(
    'sky',
    4,
    256,
    (c) => {
      const g = c.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, '#7fb6e8');
      g.addColorStop(0.55, '#cfe4f6');
      g.addColorStop(1, '#f4f8fb');
      c.fillStyle = g;
      c.fillRect(0, 0, 4, 256);
    },
    false,
  );

/** Room signs packed into one atlas: 8 columns x 32 rows of 256 x 64 px. Returns the texture and a UV lookup. */
export function signAtlas(lines: [string, string][]) {
  const cols = 8,
    rows = 32,
    cw = 256,
    ch = 64;
  const cv = document.createElement('canvas');
  cv.width = cols * cw;
  cv.height = rows * ch;
  const c = cv.getContext('2d')!;
  const uv: [number, number, number, number][] = [];
  lines.slice(0, cols * rows).forEach(([a, b], i) => {
    const x = (i % cols) * cw,
      y = Math.floor(i / cols) * ch;
    c.fillStyle = '#123a6b';
    c.fillRect(x + 2, y + 2, cw - 4, ch - 4);
    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    c.font = '700 24px Hind, "Noto Sans Devanagari", system-ui, sans-serif';
    c.fillText(a, x + cw / 2, y + 28, cw - 16);
    c.font = '600 18px Hind, "Noto Sans Devanagari", system-ui, sans-serif';
    c.fillStyle = '#cfe0f5';
    c.fillText(b, x + cw / 2, y + 52, cw - 16);
    uv.push([x / cv.width, 1 - (y + ch) / cv.height, (x + cw) / cv.width, 1 - y / cv.height]);
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { tex: t, uv };
}

/** Scale a geometry's UVs so a repeating texture keeps its real-world size. */
export function uvScale<G extends THREE.BufferGeometry>(geo: G, su: number, sv: number): G {
  const a = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * su, a.getY(i) * sv);
  a.needsUpdate = true;
  return geo;
}
