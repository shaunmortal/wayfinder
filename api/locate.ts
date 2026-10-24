// POST /api/locate {siteId, image: "data:image/jpeg;base64,..."} → {node_id, text_read}
import { z } from 'zod';
import { buildPhotoPrompt, fail, failFrom, gemma, graphs, json, rateLimited, readJson } from './_lib';

const Answer = z.object({
  node_id: z.string().nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
  text_read: z.string(),
});
const MEDIA = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_B64 = 4_000_000; // stays under the 4.5 MB serverless body limit; the client resizes photos first

export async function POST(req: Request): Promise<Response> {
  if (rateLimited(req, 8)) return fail('rate_limited');
  const b = await readJson(req);
  const g = b && typeof b.siteId === 'string' ? graphs[b.siteId] : undefined;
  const m = b && typeof b.image === 'string' ? /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(b.image) : null;
  if (!g || !m || !MEDIA.includes(m[1] as never)) return fail('bad_request');
  if (m[2].length > MAX_B64) return fail('too_large');

  try {
    const o = await gemma(Answer, buildPhotoPrompt(g), { image: m[2], timeout: 90_000, signal: req.signal });
    if (!o) return fail('upstream');
    return json({
      node_id: o.node_id && g.startable.includes(o.node_id) ? o.node_id : null,
      text_read: o.text_read.slice(0, 120),
    });
  } catch (err) {
    return failFrom(err);
  }
}
