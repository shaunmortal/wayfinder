import { en } from './en';
import { hi } from './hi';

export type Lang = 'en' | 'hi';
// Values are plain strings or template functions; args are loosely typed like the prototype's T.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Dict = Record<string, string | ((...a: any[]) => string)>;

const dicts: Record<Lang, Dict> = { en, hi };

/** Look up a UI string; falls back to English, then to the key itself. */
export function t(lang: Lang, key: string, ...args: unknown[]): string {
  const v = dicts[lang][key] ?? en[key];
  return typeof v === 'function' ? v(...args) : (v ?? key);
}
