import { okRoute, state } from '../state';
import { $ } from './dom';
import { renderDir } from './directory';
import { renderFeedback } from './feedback';
import { renderFloors } from './floors';
import { renderHead } from './head';
import { renderHelp } from './help';
import { renderHome } from './home';
import { renderNav } from './nav';
import { renderChrome } from './shell';
import { renderWhere } from './where';
import { renderMap } from '../map2d/route2d';
import { hooks } from '../map2d/viewport';
import { sceneFor } from './scene';

export function renderBody() {
  const el = $('#body');
  if (state.nav && okRoute()) {
    el.innerHTML = renderNav();
    const cv = $<HTMLCanvasElement>('#nvView'),
      st = okRoute()!.steps[state.stepIdx];
    // If the 3D view can't draw this step, fall back to the drawn stand-in.
    if (cv && !hooks.stepView(cv, st)) cv.parentElement!.outerHTML = `<figure class="nv-scene">${sceneFor(st)}</figure>`;
    return;
  }
  const v = state.view;
  el.innerHTML =
    v === 'dir'
      ? renderDir()
      : v === 'floors'
        ? renderFloors()
        : v === 'where'
          ? renderWhere()
          : v === 'help'
            ? renderHelp()
            : v === 'fb'
              ? renderFeedback()
              : renderHome();
  const pm = $('#photoMsg');
  if (pm) pm.textContent = state.photo.text || '';
}

/** Re-render everything. `is3D` only matters for the toggle button label (3D arrives in milestone 3). */
export function renderAll(is3D = false) {
  renderChrome(is3D);
  renderHead();
  renderBody();
  renderMap();
}
