import { describe, expect, it } from 'vitest';
import { GET, POST, items } from '../api/feedback';

let ipN = 0;
const post = (body: unknown) =>
  POST(
    new Request('http://x/api/feedback', { method: 'POST', body: JSON.stringify(body), headers: { 'x-forwarded-for': `10.9.0.${++ipN}` } }),
  );

describe('feedback api', () => {
  it('stores a valid rating, trims the comment and drops unknown place ids', async () => {
    expect((await post({ siteId: 'hospital', rating: 4, text: '  lift sign hard to see  ', dest: 'NOPE', lang: 'hi' })).status).toBe(200);
    expect(items.at(-1)).toMatchObject({ rating: 4, text: 'lift sign hard to see', dest: null, lang: 'hi' });
    expect((await post({ siteId: 'hospital', rating: 5, dest: '101' })).status).toBe(200);
    expect(items.at(-1)?.dest).toBe('101');
  });
  it('rejects bad ratings and unknown sites', async () => {
    for (const b of [
      { siteId: 'hospital', rating: 0 },
      { siteId: 'hospital', rating: 2.5 },
      { siteId: 'hospital', rating: '5' },
      { siteId: 'x', rating: 3 },
    ])
      expect((await post(b)).status).toBe(400);
  });
  it('lists feedback only with the team key', async () => {
    delete process.env.FEEDBACK_KEY;
    expect(GET(new Request('http://x/api/feedback?key=')).status).toBe(403);
    process.env.FEEDBACK_KEY = 'secret';
    expect(GET(new Request('http://x/api/feedback?key=wrong')).status).toBe(403);
    const r = await GET(new Request('http://x/api/feedback?key=secret')).json();
    expect(r.count).toBe(items.length);
    expect(r.avg).toBe(4.5);
  });
});
