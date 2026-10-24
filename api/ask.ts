// POST /api/ask {siteId, query, startId, lang} → {destination_id, start_id, reply_en, reply_hi}
import { z } from 'zod';
import { buildAskPrompt, fail, failFrom, gemma, graphs, json, rateLimited, readJson } from './_lib';

const Answer = z.object({
  destination_id: z.string().nullable(),
  start_id: z.string().nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
  reply_en: z.string(),
  reply_hi: z.string(),
});

export async function POST(req: Request): Promise<Response> {
  if (rateLimited(req)) return fail('rate_limited');
  const b = await readJson(req);
  const g = b && typeof b.siteId === 'string' ? graphs[b.siteId] : undefined;
  const query = b && typeof b.query === 'string' ? b.query.trim() : '';
  const start = b && typeof b.startId === 'string' && g?.startable.includes(b.startId) ? b.startId : g?.site.defaults.start;
  if (!g || !query || !start) return fail('bad_request');

  try {
    const o = await gemma(Answer, buildAskPrompt(g, query, start), { timeout: 60_000, signal: req.signal });
    if (!o) return fail('upstream');
    // Never trust ids from the model: keep only ones that exist in this site.
    return json({
      destination_id: o.destination_id && g.places[o.destination_id] ? o.destination_id : null,
      start_id: o.start_id && g.startable.includes(o.start_id) ? o.start_id : null,
      reply_en: o.reply_en.slice(0, 240),
      reply_hi: o.reply_hi.slice(0, 240),
    });
  } catch (err) {
    return failFrom(err);
  }
}
