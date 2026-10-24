// Live "how many people are walking this way" counter. A trip counts on every corridor point of its route from
// "Start navigation" until "I have arrived", "End", or an automatic expiry (people often just close the page).
//
// ponytail: in-memory store, correct for one server process (laptop demo, a hospital's own server). On Vercel or
// any multi-instance deploy, swap `store` for Redis (e.g. Upstash: a sorted set per node scored by expiry).

interface Trip {
  site: string;
  nodes: string[];
  expires: number;
}
const MAX_TRIPS = 20_000;
const store = new Map<string, Trip>();

const prune = (now = Date.now()) => {
  for (const [id, t] of store) if (t.expires <= now) store.delete(id);
};

export function startTrip(id: string, site: string, nodes: string[], ttlSec: number, now = Date.now()) {
  prune(now);
  if (store.size >= MAX_TRIPS && !store.has(id)) store.delete(store.keys().next().value!); // drop the oldest
  store.set(id, { site, nodes, expires: now + ttlSec * 1000 });
}

export function endTrip(id: string) {
  store.delete(id);
}

/** corridor point id -> number of people currently walking through it. */
export function counts(site: string, now = Date.now()) {
  prune(now);
  const c: Record<string, number> = {};
  let trips = 0;
  for (const t of store.values()) {
    if (t.site !== site) continue;
    trips++;
    for (const n of t.nodes) c[n] = (c[n] ?? 0) + 1;
  }
  return { counts: c, trips };
}

export const resetQueue = () => store.clear();
