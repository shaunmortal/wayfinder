// Spoken directions and replies. Picks the most natural voice the phone has for the current language,
// lets the visitor switch voices, and falls back to English (with a note) when no Hindi voice is installed.
import { state } from '../state';

export interface Bilingual {
  en: string;
  hi: string;
}

const ok = () => 'speechSynthesis' in window;
let voices: SpeechSynthesisVoice[] = [];
const load = () => {
  try {
    voices = speechSynthesis.getVoices();
  } catch {
    voices = [];
  }
};
if (ok()) {
  load();
  speechSynthesis.addEventListener?.('voiceschanged', load); // Chrome loads voices after the page starts
}

// Neural / online voices sound far less robotic than the old offline ones.
// (Microsoft "Natural" voices on Edge/Windows include Swara and Neerja for India; macOS "Enhanced"/"Premium" downloads.)
const NATURAL = /natural|neural|online|enhanced|premium|google|swara|madhur|neerja|prabhat/i;

/** Voices for a language, best first: natural-sounding (neural), then the Indian locale, then the rest. */
export function voicesFor(lang: 'hi' | 'en'): SpeechSynthesisVoice[] {
  if (!voices.length) load();
  const want = lang === 'hi' ? 'hi-in' : 'en-in';
  const score = (v: SpeechSynthesisVoice) => {
    const l = (v.lang || '').toLowerCase().replace('_', '-');
    // A natural (neural) voice matters more than the accent; then prefer the Indian locale.
    return (NATURAL.test(v.name) ? 5 : 0) + (l === want ? 2 : 0) + (l.startsWith('en-gb') ? 1 : 0);
  };
  return voices.filter((v) => (v.lang || '').toLowerCase().startsWith(lang)).sort((a, b) => score(b) - score(a));
}

const key = (lang: string) => 'raasta-voice-' + lang;
function chosen(lang: 'hi' | 'en') {
  const list = voicesFor(lang);
  let name = '';
  try {
    name = localStorage.getItem(key(lang)) || '';
  } catch {
    /* storage blocked */
  }
  return list.find((v) => v.name === name) || list[0] || null;
}

/** Name of the voice that will be used for the current language (for the "change voice" button). */
export const voiceName = () => {
  const v = chosen(state.lang) || (state.lang === 'hi' ? chosen('en') : null);
  return v ? v.name.replace(/^(Microsoft|Google)\s+/, '').replace(/\s*\(.*\)$/, '') : '';
};

/** Switch to the next available voice for the current language; returns its name (or '' if there is only one). */
export function nextVoice(): string {
  const list = voicesFor(state.lang);
  if (list.length < 2) return '';
  const cur = chosen(state.lang),
    i = list.findIndex((v) => v === cur),
    next = list[(i + 1) % list.length];
  try {
    localStorage.setItem(key(state.lang), next.name);
  } catch {
    /* storage blocked */
  }
  return voiceName();
}

/** True when Hindi is selected but the phone has no Hindi voice (we then speak English). */
export const noHindiVoice = () => state.lang === 'hi' && ok() && voices.length > 0 && !voicesFor('hi').length;

/** Speak in the visitor's language; if their phone has no Hindi voice, read the English version instead. */
export function speak(text: Bilingual) {
  try {
    if (!ok()) return;
    speechSynthesis.cancel();
    const hiOk = state.lang === 'hi' && !!chosen('hi');
    const lang: 'hi' | 'en' = hiOk ? 'hi' : 'en';
    const u = new SpeechSynthesisUtterance(lang === 'hi' ? text.hi : text.en);
    const v = chosen(lang);
    if (v) u.voice = v;
    u.lang = v?.lang || (lang === 'hi' ? 'hi-IN' : 'en-IN');
    u.rate = lang === 'hi' ? 0.92 : 0.97; // a touch slower than default sounds calmer
    u.pitch = 1;
    speechSynthesis.speak(u);
  } catch {
    /* speech not available */
  }
}

export const stopSpeaking = () => {
  try {
    speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
};
