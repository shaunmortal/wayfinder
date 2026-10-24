// GET /api/status → {ai, live, demo}. Lets the page hide Gemma-only features when no key is configured,
// and tells it the live walker counter is reachable (the page falls back to offline estimates otherwise).
import { hasKey, json } from './_lib';

export function GET(): Response {
  return json({ ai: hasKey(), live: true, demo: process.env.RAASTA_DEMO === '1' });
}
