import { G, graphs, okRoute, state } from '../state';
import { $, esc } from './dom';
import { hooks } from '../map2d/viewport';
import { icon } from './icons';
import { L, isHi, tr } from './bound';

export const brandHTML = () =>
  `<span class="logo">${icon('navi', 22)}</span><span class="brand-t"><b>Raasta</b><span>${esc(L(G().site.name))}</span></span>`;

export function siteSwitch() {
  if (graphs.length < 2) return '';
  const cur = G().site.id;
  return `<div class="sitesw" role="group" aria-label="${esc(tr('siteAria'))}">${graphs
    .map(
      (g) =>
        `<button type="button" data-act="site" data-s="${g.site.id}" aria-pressed="${g.site.id === cur}">${esc(L(g.site.tab))}</button>`,
    )
    .join('')}</div>`;
}

export function renderChrome(is3D = false) {
  const S = G().site,
    help = S.help as { emg?: string } | undefined;
  document.documentElement.lang = isHi() ? 'hi' : 'en';
  $('#sideBrand').innerHTML = brandHTML();
  $('#topBrand').innerHTML = brandHTML();
  const items: [string, string][] = [
    ['home', 'home'],
    ['dir', 'dir'],
    ['floors', 'floors'],
    ['where', 'qr'],
  ];
  if (help?.emg) items.push(['emg', 'emg']);
  items.push(['fb', 'fb'], ['help', 'help']);
  const cur = (v: string) => !state.nav && (state.view as string) === v && v !== 'emg';
  $('#sideNav').innerHTML = items
    .map(
      ([v, ic]) =>
        `<li><button type="button" class="navbtn${v === 'emg' ? ' is-emg' : ''}" data-act="view" data-v="${v}"${cur(v) ? ' aria-current="page"' : ''}>${icon(ic)}<span>${esc(tr('v_' + v))}</span></button></li>`,
    )
    .join('');
  $('#tabbar').innerHTML = items
    .filter((i) => i[0] !== 'floors' && i[0] !== 'fb')
    .map(
      ([v, ic]) =>
        `<button type="button" class="tabbtn${v === 'emg' ? ' is-emg' : ''}" data-act="view" data-v="${v}"${cur(v) ? ' aria-current="page"' : ''}>${icon(ic, 22)}<span>${esc(tr('v_' + v))}</span></button>`,
    )
    .join('');
  $('#sideCard').innerHTML = `<b>${esc(tr('sideCardT'))}</b><p>${esc(tr('sideCardD'))}</p>`;
  ['#sideLang', '#topLang'].forEach((s) => {
    const b = $(s);
    b.innerHTML = `${icon('lang', 18)}<span>${esc(tr('langBtn'))}</span>`;
    b.setAttribute('aria-label', tr('langAria'));
  });
  $('#zin').innerHTML = icon('plus');
  $('#zin').setAttribute('aria-label', tr('zoomIn'));
  $('#zout').innerHTML = icon('minus');
  $('#zout').setAttribute('aria-label', tr('zoomOut'));
  $('#zfit').innerHTML = icon('fit');
  $('#zfit').setAttribute('aria-label', tr('fitAll'));
  // Map style: flat 2D, plain 3D, or Real 3D (textures, doors with signs, shadows).
  const mode = hooks.is3D() ? (hooks.isReal() ? 'real' : '3d') : '2d';
  const vs = $('#viewsw');
  vs.setAttribute('aria-label', tr('mAria'));
  vs.innerHTML = (['2d', '3d', 'real'] as const)
    .map(
      (m) =>
        `<button type="button" class="mctl vbtn" data-act="vmode" data-m="${m}" aria-pressed="${mode === m}" title="${esc(tr('mt_' + m))}">${esc(tr('m_' + m))}</button>`,
    )
    .join('');
  $('#v3hint').textContent = tr('hint3d');
  $('#legend').innerHTML = S.cats
    .map((c) => `<span class="cat-${c}"><i class="sw" aria-hidden="true"></i>${esc(tr('cat_' + c))}</span>`)
    .join('');
  $('#app').classList.toggle('is-nav', state.nav && !!okRoute());
}
