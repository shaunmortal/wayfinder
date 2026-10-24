import type { Graph, Place } from '../data/types';

const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9ऀ-ॿ]+/g, ' ')
    .trim();

/**
 * Offline keyword search over place ids, names and `kw` keywords (Hindi, Hinglish, English).
 * Exact names win, whole words beat parts of words, and among equally good matches the visitor's floor comes first.
 */
export function localMatch(g: Graph, q: string, startFloor: string): Place[] {
  const s = String(q || '')
    .toLowerCase()
    .trim();
  if (!s) return [];
  const S = g.site;
  const phrase = clean(s);
  const words = phrase.split(' ').filter(Boolean); // single letters / digits count too ("Ward B", "Entry 2")
  const blood = /blood|khoon|khun|खून|ब्लड|रक्त|rakt/.test(s);
  const test = /test|jaanch|janch|jaach|jach|जाँच|जांच|sample|सैंपल|टेस्ट/.test(s);
  const toilet = /toilet|bathroom|washroom|shauch|शौच|latrine|टॉयलेट/.test(s);
  const sid = s.replace(/[\s-]/g, '');
  const blk = S.blood as { bank: string; test: string } | undefined;
  const res: { p: Place; sc: number }[] = [];
  for (const p of S.places) {
    const hay = [p.id, p.en, p.hi, p.enS, p.hiS, p.kw].join(' ').toLowerCase();
    const names = [p.en, p.enS, p.hi, p.hiS].map((n) => clean(n || ''));
    let sc = 0;
    const hayWords = new Set(hay.split(/[^a-z0-9ऀ-ॿ]+/));
    for (const w of words) {
      if (hayWords.has(w))
        sc += 3; // whole word ("ot" = OT)
      else if (w.length >= 3 && hay.includes(w)) sc += w.length >= 4 ? 2 : 1; // part of a word; never for short words ("ot" in "physiotherapy")
    }
    if (names.includes(phrase))
      sc += 20; // the exact name ("Canteen", "ICU", "Male Ward B")
    else if (phrase.length >= 3 && names.some((n) => n.startsWith(phrase + ' ') || n.endsWith(' ' + phrase))) sc += 4;
    if (sid === p.id.toLowerCase().replace(/-/g, '')) sc += 20;
    if (blk) {
      if (blood && !test && p.id === blk.bank) sc += 8;
      if (blood && test && p.id === blk.test) sc += 8;
    }
    if (toilet && p.code === 'WC') sc += p.floor === startFloor ? 8 : 3;
    if (sc > 0) res.push({ p, sc });
  }
  // Same name on several floors (e.g. "Doctors Duty Room"): the one on the visitor's floor first.
  res.sort((a, b) => b.sc - a.sc || Number(b.p.floor === startFloor) - Number(a.p.floor === startFloor) || a.p.id.localeCompare(b.p.id));
  return res.map((r) => r.p);
}

const DEV_DIGITS = '०१२३४५६७८९';
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[०-९]/g, (d) => String(DEV_DIGITS.indexOf(d)))
    .trim();
// "where I want to go" words win over "where I am" words (a sentence like "main 202 jana chahta hoon" has both).
const GO =
  /\b(jana|jaana|jaun|jau|go|goto|take me|le chalo|le chaliye|chahiye|chahie|milna|dikhao|batao|reach)\b|जाना|जाऊँ|जाऊं|चाहिए|मिलना|ले चलो|दिखाओ|बताओ/;
const HERE = /\b(hoon|hun|hu|hoo|i am|i'm|im|abhi|yahan|yaha|khada|khadi|baitha|baithi|at)\b|हूँ|हूं|हु|अभी|यहाँ|यहां|खड़ा|खड़ी|बैठा|बैठी/;

// Filler words of a spoken sentence; dropped before the keyword search so "jana" doesn't match "yojana" etc.
const STOP = new Set(
  (
    'mujhe mujhko main mai mein me hoon hun hu hoo hai hain jana jaana jaun ke ka ki ko paas pass bahar andar se tak aur abhi ' +
    'yahan yaha kahan kaha chahiye chahie karna karni lena leni milna mere meri mera ek baitha baithi khada khadi hua hui ' +
    'i am im at the to go need want near outside inside in of my is are please where want wanna take me get ' +
    'मुझे मैं में हूँ हूं है हैं जाना के का की को पास बाहर अंदर से तक और अभी यहाँ यहां कहाँ कहां चाहिए मेरे मेरी मेरा एक बैठा बैठी खड़ा खड़ी'
  ).split(' '),
);

/** A place named in a bit of text: an exact room / spot id first (e.g. "203", "g 07"), then the keyword search. */
function findSpot(g: Graph, text: string, startFloor: string): string | null {
  const flat = norm(text).replace(/[\s-]/g, '');
  const tokens = norm(text)
    .split(/[^a-z0-9ऀ-ॿ]+/)
    .filter(Boolean);
  const ids = g.startable.filter((id) => g.nodes[id].kind !== 'corr');
  for (let i = 0; i < tokens.length; i++)
    for (const span of [tokens[i], tokens[i] + (tokens[i + 1] ?? '')]) {
      const hit = ids.find((id) => id.toLowerCase().replace(/-/g, '') === span);
      if (hit) return hit;
    }
  const words = tokens.filter((w) => !STOP.has(w));
  if (!flat || !words.length) return null;
  return localMatch(g, words.join(' '), startFloor)[0]?.id ?? null;
}

/**
 * Offline understanding of "where I am" and "where I want to go" in one sentence (Hindi, Hinglish or English):
 * "main 301 mein hoon aur mujhe 202 jana hai", "301 se 202", "from 301 to 202", "मैं 203 में हूँ".
 */
export function parseTrip(g: Graph, q: string, startFloor: string): { start?: string; dest?: string } {
  const s = norm(q);
  const fromTo = /^(?:from\s+)?(.+?)\s+(?:se|से|to|tak|तक)\s+(.+?)(?:\s+(?:tak|तक|jana|jaana|जाना)\b.*)?$/.exec(s);
  if (fromTo && !GO.test(fromTo[1]) && !HERE.test(fromTo[1])) {
    const a = findSpot(g, fromTo[1], startFloor),
      b = findSpot(g, fromTo[2], startFloor);
    if (a && b && a !== b) return { start: a, dest: b };
  }
  const out: { start?: string; dest?: string } = {};
  const clauses = s.split(/\s*(?:,|\.|;|\||\baur\b|\band\b|और|\blekin\b|\bbut\b|\bpar\b)\s*/).filter(Boolean);
  for (const c of clauses) {
    const id = findSpot(g, c, startFloor);
    if (!id) continue;
    if (GO.test(c) && !out.dest) out.dest = id;
    else if (HERE.test(c) && !out.start) out.start = id;
    else if (!out.dest && clauses.length === 1) out.dest = id;
  }
  if (out.dest && !g.places[out.dest]) delete out.dest; // a lift or stairs can be a start, not a destination
  return out;
}
