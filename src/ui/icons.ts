export const IC: Record<string, string> = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
  dir: '<path d="M4 21V6a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15"/><path d="M14 10h5a1 1 0 0 1 1 1v10"/><path d="M2.5 21h19"/><path d="M7.5 9h3M7.5 13h3M7.5 17h3"/>',
  floors: '<path d="M12 3 3 7.5 12 12l9-4.5z"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2M14 18v2h2M18 18h2v2h-2"/>',
  emg: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.7"/><path d="M12 17h.01"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  straight: '<path d="M12 20V5"/><path d="m6 11 6-6 6 6"/>',
  right: '<path d="M6 20v-6a5 5 0 0 1 5-5h8"/><path d="m15 5 4 4-4 4"/>',
  left: '<path d="M18 20v-6a5 5 0 0 0-5-5H5"/><path d="m9 5-4 4 4 4"/>',
  lift: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="m9 9.5 3-3 3 3M9 14.5l3 3 3-3"/>',
  stairs: '<path d="M3 20h5v-5h5v-5h5V5h3"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  here: '<circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="8"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="m10 21 2-6 3 3v3M8.5 11l2-3.5 3.5 1 2 3.5h2.5M12.5 8.5 11 14"/>',
  wheel:
    '<circle cx="10" cy="4.5" r="1.8"/><path d="M10 8v5h5l2.5 5.5H20"/><path d="M10 10.5h4.5"/><path d="M7.5 11.5a5.5 5.5 0 1 0 7.2 7.3"/>',
  speaker: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18.5 6a8 8 0 0 1 0 12"/>',
  chevL: '<path d="m15 6-6 6 6 6"/>',
  chevR: '<path d="m9 6 6 6-6 6"/>',
  spark:
    '<path d="M12 3.5c.6 3.9 2.2 5.6 6 6.3-3.8.7-5.4 2.4-6 6.2-.6-3.8-2.2-5.5-6-6.2 3.8-.7 5.4-2.4 6-6.3z"/><path d="M19 15.5c.2 1.3.8 1.9 2 2.1-1.2.2-1.8.8-2 2.1-.2-1.3-.8-1.9-2-2.1 1.2-.2 1.8-.8 2-2.1z"/>',
  camera: '<path d="M4 8h3l1.8-2.5h6.4L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  navi: '<path d="M12 3 19.5 20 12 16l-7.5 4z"/>',
  lang: '<path d="M4 5h9M8.5 3v2M6 5c.5 3.2 2.6 5.7 6 7M11 5c-.6 3.5-3 6.5-6.5 8"/><path d="m13 21 4-9 4 9M14.5 17.5h5"/>',
  slip: '<path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 11h6M9 14.5h6M9 18h4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
  fb: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5h.01"/>',
};

export function icon(n: string, s = 20): string {
  return `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] ?? ''}</svg>`;
}
