import { afterEach, describe, expect, it } from 'vitest';
import { GET, POST } from '../api/queue';
import { counts, resetQueue, startTrip } from '../api/_queue';
import { planRoutes, type Plan } from '../src/engine/crowd';
import { computeRoute } from '../src/engine/route';
import { loadGraph } from './helpers';

const g = loadGraph('hospital');
let ip = 0;
const post = (body: unknown) =>
  POST(new Request('http://x/api/queue', { method: 'POST', body: JSON.stringify(body), headers: { 'x-forwarded-for': `9.9.9.${++ip}` } }));
const route = computeRoute(g, 'GF-GATE3', '101');
const path = route.status === 'ok' ? route.path : [];

afterEach(() => {
  resetQueue();
  delete process.env.RAASTA_DEMO;
});

describe('/api/queue live walker counter', () => {
  it('start adds one person on every corridor point of the route; end removes them', async () => {
    expect((await post({ siteId: 'hospital', action: 'start', trip: 'trip-aaaa-1', path, secs: 180 })).status).toBe(200);
    const c = (await (await GET(new Request('http://x/api/queue?siteId=hospital'))).json()).counts;
    const corr = path.filter((id) => g.nodes[id].kind === 'corr');
    expect(corr.length).toBeGreaterThan(3);
    expect(corr.every((id) => c[id] === 1)).toBe(true);
    expect(c['101']).toBeUndefined(); // rooms are not counted
    await post({ siteId: 'hospital', action: 'end', trip: 'trip-aaaa-1' });
    expect(counts('hospital').trips).toBe(0);
  });
  it('a trip expires on its own if "I have arrived" is never pressed', () => {
    const t0 = Date.now();
    startTrip('trip-bbbb-1', 'hospital', ['GF-S720'], 60, t0);
    expect(counts('hospital', t0 + 59_000).trips).toBe(1);
    expect(counts('hospital', t0 + 61_000).trips).toBe(0);
  });
  it('ignores made-up node ids and rejects bad input', async () => {
    await post({ siteId: 'hospital', action: 'start', trip: 'trip-cccc-1', path: ['NOPE', 'GF-S720'], secs: 60 });
    expect(Object.keys(counts('hospital').counts)).toEqual(['GF-S720']);
    expect((await post({ siteId: 'hospital', action: 'start', trip: '<script>' })).status).toBe(400);
    expect((await post({ siteId: 'nowhere', action: 'start', trip: 'trip-dddd-1' })).status).toBe(400);
  });
  it('the demo helper only works when the server allows it', async () => {
    expect((await post({ siteId: 'hospital', action: 'demo', path })).status).toBe(400);
    process.env.RAASTA_DEMO = '1';
    await post({ siteId: 'hospital', action: 'demo', path });
    expect(counts('hospital').trips).toBe(10);
  });
});

describe('the "10 people" rule', () => {
  it('with 10 people already on route 1, a new visitor is sent along route 2', () => {
    const quiet = planRoutes(g, 'GF-GATE3', '101', {}, 21, true, 0.3) as Plan;
    expect(quiet.pick).toBe(0);
    const live: Record<string, number> = {};
    quiet.routes[0].path.forEach((id) => (live[id] = 10));
    const busy = planRoutes(g, 'GF-GATE3', '101', {}, 21, true, 0.3, live) as Plan;
    expect(busy.pick).toBe(1);
    expect(busy.liveMax![0]).toBe(10);
  });
});
