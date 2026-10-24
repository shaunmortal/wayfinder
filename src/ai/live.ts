// Live walker counter client. Online (mobile data or the hospital's Wi-Fi) it reads and updates /api/queue;
// on any failure or a 2.5 s timeout it quietly returns null and the app uses its offline crowd estimate.
const T = 2500;

export interface Live {
  site: string;
  counts: Record<string, number>;
  trips: number;
  demo: boolean;
  at: number;
}

export async function fetchLive(site: string): Promise<Live | null> {
  try {
    const r = await fetch(`/api/queue?siteId=${encodeURIComponent(site)}`, { signal: AbortSignal.timeout(T) });
    if (!r.ok) return null;
    const d = await r.json();
    return { site, counts: d.counts ?? {}, trips: d.trips ?? 0, demo: !!d.demo, at: Date.now() };
  } catch {
    return null;
  }
}

const post = (body: unknown) =>
  fetch('/api/queue', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(T),
    keepalive: true,
  })
    .then((r) => r.ok)
    .catch(() => false);

let current: { site: string; trip: string } | null = null;

/** "Start navigation": count this phone on every corridor point of its route. */
export function startTrip(site: string, path: string[], secs: number) {
  endTrip();
  const trip = crypto.randomUUID();
  current = { site, trip };
  return post({ siteId: site, action: 'start', trip, path, secs });
}

/** "I have arrived" / "End" / leaving the page: stop counting this phone. */
export function endTrip() {
  if (!current) return;
  const { site, trip } = current;
  current = null;
  return post({ siteId: site, action: 'end', trip });
}

/** Demo helper (server must run with RAASTA_DEMO=1): pretend 10 people are walking this route right now. */
export const demoCrowd = (site: string, path: string[]) => post({ siteId: site, action: 'demo', path });
