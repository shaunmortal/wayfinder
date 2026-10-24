import './ui/styles.css';
import { aiStatus } from './ai/client';
import { loadSites } from './data/loadSites';
import { buildGraph } from './engine/graph';
import { act, applyHash, toggle3D, wireEvents } from './actions';
import { hooks, initViewport, fitRoute } from './map2d/viewport';
import { buildFloors } from './map2d/draw';
import { DEFAULT_SITE, enterSite, graphs, recompute, state } from './state';
import { $ } from './ui/dom';
import { renderAll } from './ui/render';

async function boot() {
  try {
    (await loadSites()).forEach((s) => graphs.push(buildGraph(s)));
  } catch (err) {
    $('#body').textContent = 'Could not load the building data. ' + (err as Error).message;
    throw err;
  }
  enterSite(DEFAULT_SITE);
  applyHash(true);
  initViewport();
  wireEvents();
  buildFloors($('#floors'));
  recompute();
  renderAll();
  requestAnimationFrame(fitRoute);
  // Real 3D is the default map style unless the visitor picked another one before.
  let mode = 'real';
  try {
    mode = localStorage.getItem('raasta-view') || mode;
  } catch {
    /* storage blocked */
  }
  if (mode !== '2d') toggle3D(true, mode === 'real');
  // Claude features appear only when the server has a key; routing and search never wait for this.
  aiStatus().then((on) => {
    state.aiAvail = on;
    state.aiOn = on && !state.offlineDemo;
    if (on) renderAll(); // show the Claude-only buttons (Ask Claude, slip photo, sign photo)
  });
  // Production builds keep working offline after the first visit (dev skips this to avoid stale caches).
  if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  Object.assign(window, { raastaAct: act, raastaDebug: { hooks, state } }); // handy from the console while developing
}
boot();
