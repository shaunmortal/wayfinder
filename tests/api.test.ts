import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as askPOST } from '../api/ask';
import { POST as locatePOST } from '../api/locate';
import { MODEL, ai, buildAskPrompt, graphs, type ChatBody } from '../api/_lib';

// A stand-in for Ollama: returns whatever the test queues up (as Gemma's JSON text), or throws it.
let next: unknown;
let lastParams: ChatBody | null = null;
const fake = async (params: ChatBody) => {
  lastParams = params;
  if (next instanceof Error) throw next;
  return typeof next === 'string' ? next : JSON.stringify(next);
};

const req = (body: unknown, ip = '1.1.1.1') =>
  new Request('http://x/api', { method: 'POST', body: JSON.stringify(body), headers: { 'x-forwarded-for': ip } });
const ok = (parsed: unknown) => parsed;
let ipN = 0;
const freshIp = () => `10.0.0.${++ipN}`;

// Tests must not depend on a developer's local .env (vitest loads it through vite.config).
const savedKey = process.env.GEMINI_API_KEY;
beforeEach(() => {
  delete process.env.GEMINI_API_KEY;
  ai.set(fake);
});
afterEach(() => {
  if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey;
  ai.set(null);
});

describe('/api/ask', () => {
  const body = { siteId: 'hospital', query: 'mausa ko blood chahiye', startId: 'GF-GATE3', lang: 'hi' };

  it('returns validated ids and replies', async () => {
    next = ok({ destination_id: 'G-07', start_id: 'NOPE', confidence: 'high', reply_en: 'To G-07', reply_hi: 'G-07 तक' });
    const res = await askPOST(req(body, freshIp()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ destination_id: 'G-07', start_id: null, reply_en: 'To G-07', reply_hi: 'G-07 तक' });
    expect(lastParams?.model).toBe('gemma4:e2b-it-qat');
  });

  it('drops a destination id that is not in the site', async () => {
    next = ok({ destination_id: 'MADE-UP', start_id: null, confidence: 'low', reply_en: '', reply_hi: '' });
    expect((await (await askPOST(req(body, freshIp()))).json()).destination_id).toBeNull();
  });

  it('error codes: Ollama down, bad input, bad JSON, timeout, upstream', async () => {
    next = new TypeError('fetch failed');
    expect((await askPOST(req(body, freshIp()))).status).toBe(503);
    expect((await askPOST(req({ siteId: 'nope', query: 'x' }, freshIp()))).status).toBe(400);
    expect((await askPOST(req({ siteId: 'hospital', query: '   ' }, freshIp()))).status).toBe(400);
    next = 'not json {';
    expect((await askPOST(req(body, freshIp()))).status).toBe(502);
    next = new DOMException('slow', 'TimeoutError');
    expect((await askPOST(req(body, freshIp()))).status).toBe(504);
    next = new Error('boom');
    expect((await askPOST(req(body, freshIp()))).status).toBe(502);
  });

  it('per-IP rate limit kicks in', async () => {
    next = ok({ destination_id: null, start_id: null, confidence: 'low', reply_en: '', reply_hi: '' });
    const ip = freshIp();
    const codes = [];
    for (let i = 0; i < 22; i++) codes.push((await askPOST(req(body, ip))).status);
    expect(codes.slice(0, 20).every((c) => c === 200)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });

  it('prompt lists the places and the site rules', () => {
    const p = buildAskPrompt(graphs.hospital, 'mausa ko blood chahiye', 'GF-GATE3');
    expect(p).toContain('G-07 |');
    expect(p).toContain(graphs.hospital.site.aiRules.slice(0, 40));
    expect(p).toContain('mausa ko blood chahiye');
  });
});

describe('/api/locate', () => {
  const img = 'data:image/jpeg;base64,' + Buffer.from('fake').toString('base64');

  it('validates the node id and uses the vision model', async () => {
    next = ok({ node_id: '302', confidence: 'high', text_read: '302 OT Waiting' });
    const res = await locatePOST(req({ siteId: 'hospital', image: img }, freshIp()));
    expect(await res.json()).toEqual({ node_id: '302', text_read: '302 OT Waiting' });
    expect(lastParams?.model).toBe('gemma4:e2b-it-qat');
    expect(lastParams?.messages[0].images).toEqual([Buffer.from('fake').toString('base64')]);
    next = ok({ node_id: 'X-999', confidence: 'low', text_read: '' });
    expect((await (await locatePOST(req({ siteId: 'hospital', image: img }, freshIp()))).json()).node_id).toBeNull();
  });

  it('rejects non-images', async () => {
    expect((await locatePOST(req({ siteId: 'hospital', image: 'data:text/html;base64,PGI+' }, freshIp()))).status).toBe(400);
  });
});

describe('/api/slip (OPD slip photo)', () => {
  const img = 'data:image/jpeg;base64,' + Buffer.from('fake').toString('base64');
  it('returns a validated place id and never a gate', async () => {
    const { POST: slipPOST } = await import('../api/slip');
    next = ok({ destination_id: '105', reply_en: 'Cardiology OPD, First Floor', reply_hi: 'हृदय रोग ओपीडी', text_read: 'CARDIOLOGY' });
    expect(await (await slipPOST(req({ siteId: 'hospital', image: img }, freshIp()))).json()).toMatchObject({
      destination_id: '105',
      text_read: 'CARDIOLOGY',
    });
    next = ok({ destination_id: 'GF-GATE3', reply_en: '', reply_hi: '', text_read: '' });
    expect((await (await slipPOST(req({ siteId: 'hospital', image: img }, freshIp()))).json()).destination_id).toBeNull();
    expect(JSON.stringify(lastParams?.messages)).toContain('Do NOT copy any personal details');
  });
});

describe('model choice', () => {
  it('uses Gemma 4 on the Gemini API when GEMINI_API_KEY is set, local Gemma otherwise', () => {
    const prev = process.env.GEMINI_API_KEY;
    try {
      process.env.GEMINI_API_KEY = 'test';
      expect(MODEL()).toBe('gemma-4-26b-a4b-it');
      delete process.env.GEMINI_API_KEY;
      expect(MODEL()).toBe('gemma4:e2b-it-qat');
    } finally {
      if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
    }
  });
});
