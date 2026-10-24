export const $ = <T extends Element = HTMLElement>(s: string, el: ParentNode = document) => el.querySelector(s) as T;
export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const isPhone = () => window.matchMedia('(max-width:719px)').matches;

let toastTimer: number | undefined;
export function toast(msg: string) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.hidden = true;
  }, 2600);
}
