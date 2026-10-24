// POST /api/feedback {siteId, rating: 1-5, text?, dest?, lang?} → {ok}
// GET  /api/feedback?key=<FEEDBACK_KEY>  → {count, avg, items} for the team (off when FEEDBACK_KEY is unset)
// No personal data: a rating, an optional comment (the page asks for no names or numbers) and the place id.
import { fail, graphs, json, rateLimited, readJson } from './_lib';

export interface Feedback {
  at: string;
  siteId: string;
  rating: number;
  text: string;
  dest: string | null;
  lang: 'en' | 'hi';
}

// ponytail: in-memory per instance + one log line each; move to Redis/KV before relying on it in production.
export const items: Feedback[] = [];

export async function POST(req: Request): Promise<Response> {
  if (rateLimited(req, 5, 60_000, 'fb')) return fail('rate_limited');
  const b = await readJson(req);
  const g = b && typeof b.siteId === 'string' ? graphs[b.siteId] : undefined;
  const rating = b?.rating;
  if (!g || !b || typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) return fail('bad_request');
  const fb: Feedback = {
    at: new Date().toISOString(),
    siteId: g.site.id,
    rating,
    text: typeof b.text === 'string' ? b.text.trim().slice(0, 500) : '',
    dest: typeof b.dest === 'string' && g.site.places.some((p) => p.id === b.dest) ? b.dest : null,
    lang: b.lang === 'hi' ? 'hi' : 'en',
  };
  items.push(fb);
  if (items.length > 1000) items.shift();
  console.log('[raasta feedback]', JSON.stringify(fb));
  return json({ ok: true });
}

export function GET(req: Request): Response {
  const key = process.env.FEEDBACK_KEY;
  if (!key || new URL(req.url).searchParams.get('key') !== key) return json({ error: 'forbidden' }, 403);
  const avg = items.length ? Math.round((items.reduce((s, f) => s + f.rating, 0) / items.length) * 10) / 10 : null;
  return json({ count: items.length, avg, items: [...items].reverse() });
}
