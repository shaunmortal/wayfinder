// GET  /api/queue?siteId=hospital                 → {counts: {pointId: n}, trips, demo}
// POST /api/queue {siteId, action:'start', trip, path, secs} | {siteId, action:'end', trip}
//      {siteId, action:'demo', path}  (only when RAASTA_DEMO=1: adds 10 pretend walkers for 5 minutes)
// No personal data: a random trip id and the corridor points of the route, nothing else.
import { fail, graphs, json, rateLimited, readJson } from './_lib';
import { counts, endTrip, startTrip } from './_queue';

const TRIP = /^[a-z0-9-]{8,64}$/i;
const demoOn = () => process.env.RAASTA_DEMO === '1';

export function GET(req: Request): Response {
  const site = new URL(req.url).searchParams.get('siteId') || '';
  if (!graphs[site]) return fail('bad_request');
  return json({ ...counts(site), demo: demoOn() });
}

export async function POST(req: Request): Promise<Response> {
  if (rateLimited(req, 30, 60_000, 'queue')) return fail('rate_limited');
  const b = await readJson(req);
  const g = b && typeof b.siteId === 'string' ? graphs[b.siteId] : undefined;
  if (!g || !b) return fail('bad_request');
  // Only real corridor points of this building are counted (rooms, lifts and made-up ids are ignored).
  const corridor = (p: unknown) =>
    Array.isArray(p)
      ? [...new Set(p.slice(0, 600).filter((id): id is string => typeof id === 'string' && g.nodes[id]?.kind === 'corr'))]
      : [];

  if (b.action === 'start' || b.action === 'end') {
    if (typeof b.trip !== 'string' || !TRIP.test(b.trip)) return fail('bad_request');
    if (b.action === 'end') endTrip(b.trip);
    else {
      const secs = typeof b.secs === 'number' && Number.isFinite(b.secs) ? b.secs : 300;
      // Expire after twice the walking time plus 2 minutes (max 30 min), in case "I have arrived" is never pressed.
      startTrip(b.trip, g.site.id, corridor(b.path), Math.min(1800, Math.max(60, secs * 2 + 120)));
    }
    return json({ ok: true });
  }
  if (b.action === 'demo' && demoOn()) {
    const nodes = corridor(b.path);
    for (let i = 0; i < 10; i++) startTrip(`demo-${Date.now()}-${i}`, g.site.id, nodes, 300);
    return json({ ok: true, added: 10 });
  }
  return fail('bad_request');
}
