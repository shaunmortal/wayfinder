// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { act } from '../src/actions';
import { initViewport } from '../src/map2d/viewport';
import { buildFloors } from '../src/map2d/draw';
import { enterSite, graphs, recompute, state } from '../src/state';
import { renderAll } from '../src/ui/render';
import { loadGraph } from './helpers';

beforeAll(() => {
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script'));
  ['hospital'].forEach((id) => graphs.push(loadGraph(id)));
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {} })) as never;
  Element.prototype.scrollIntoView ??= () => {};
  initViewport();
});

const $ = (s: string) => document.querySelector(s)!;

describe.each(['hospital'])('%s renders', (id) => {
  it('home, route, nav and every view in both languages', () => {
    for (const lang of ['en', 'hi'] as const) {
      state.lang = lang;
      enterSite(id);
      buildFloors($('#floors'));
      recompute();
      renderAll();
      expect($('#floors').querySelectorAll('.room').length).toBeGreaterThan(0);
      expect($('#body').innerHTML).toContain('data-act="navstart"');
      act({ dataset: { act: 'navstart' } });
      const steps = state.route && state.route.status === 'ok' ? state.route.steps.length : 0;
      for (let i = 0; i < steps; i++) act({ dataset: { act: 'next' } });
      expect(state.nav).toBe(false);
      // Feedback is asked only after the first arrival on this phone, never on later trips.
      expect(state.view).toBe(lang === 'en' ? 'fb' : 'home');
      for (const v of ['dir', 'floors', 'where', 'help', 'fb']) {
        act({ dataset: { act: 'view', v } });
        expect($('#body').innerHTML.length).toBeGreaterThan(50);
      }
      expect(document.body.innerHTML).not.toMatch(/undefined|\[object/);
    }
  });
});
