// Shared server code for the api/ functions (files starting with "_" are not deployed as endpoints).
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { parseSite } from '../src/data/loadSites';
import { buildGraph } from '../src/engine/graph';
import type { Graph } from '../src/data/types';
import hospital from '../public/sites/hospital/site.json';

// Static imports so the serverless bundle carries the site data with it.
export const graphs: Record<string, Graph> = Object.fromEntries(
  [hospital].map((raw) => {
    const g = buildGraph(parseSite(raw));
    return [g.site.id, g];
  }),
);

// With ANTHROPIC_API_KEY set, Claude answers over the API (nothing heavy runs on the laptop).
// Without it, Gemma 4 (QAT build: the default e2b tag does not fit in 8 GB RAM) runs locally through Ollama (https://ollama.com).
const useClaude = () => !!process.env.ANTHROPIC_API_KEY;
export const MODEL = () => (useClaude() ? process.env.CLAUDE_MODEL || 'claude-opus-5-5' : process.env.GEMMA_MODEL || 'gemma4:e2b-it-qat');
const OLLAMA_URL = () => (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
export const hasKey = () => true;

export interface ChatBody {
  model: string;
  stream: false;
  think: false;
  format: unknown;
  options: { temperature: number; num_ctx: number };
  messages: { role: 'user'; content: string; images?: string[] }[];
}
async function ollamaChat(body: ChatBody, signal: AbortSignal): Promise<string> {
  const r = await fetch(`${OLLAMA_URL()}/api/chat`, { method: 'POST', body: JSON.stringify(body), signal });
  if (!r.ok) throw new Error(`ollama ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return ((await r.json()) as { message?: { content?: string } }).message?.content ?? '';
}

const IMAGE_TYPES = { '/9j/': 'image/jpeg', iVBOR: 'image/png', R0lG: 'image/gif', UklG: 'image/webp' } as const;
const imageType = (b64: string) => Object.entries(IMAGE_TYPES).find(([magic]) => b64.startsWith(magic))?.[1] ?? 'image/jpeg';

async function claudeChat(body: ChatBody, signal: AbortSignal): Promise<string> {
  const { content, images = [] } = body.messages[0];
  const r = await new Anthropic().messages.create(
    {
      model: body.model,
      max_tokens: 4096,
      // Short lookups: low effort keeps answers fast and cheap.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: body.format as Record<string, unknown> } },
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((data) => ({
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: imageType(data), data },
            })),
            { type: 'text' as const, text: content },
          ],
        },
      ],
    },
    { signal },
  );
  if (r.stop_reason === 'refusal') throw new Error('claude refused');
  return r.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
}

const defaultChat = (body: ChatBody, signal: AbortSignal) => (useClaude() ? claudeChat(body, signal) : ollamaChat(body, signal));
/** Overridable in tests. */
export const ai = {
  chat: defaultChat,
  set: (fn: typeof ollamaChat | null) => {
    ai.chat = fn ?? defaultChat;
  },
};

/** One prompt (+ optional raw base64 image) → JSON matching `schema`, or null if Gemma's answer does not fit it. */
export async function gemma<T extends z.ZodType>(
  schema: T,
  prompt: string,
  opts: { image?: string; timeout: number; signal: AbortSignal },
): Promise<z.infer<T> | null> {
  const text = await ai.chat(
    {
      model: MODEL(),
      stream: false,
      think: false,
      format: z.toJSONSchema(schema),
      // The place list (~190 rooms) + an image does not fit Ollama's 4k default context.
      options: { temperature: 0, num_ctx: 8192 },
      messages: [{ role: 'user', content: prompt, ...(opts.image ? { images: [opts.image] } : {}) }],
    },
    AbortSignal.any([opts.signal, AbortSignal.timeout(opts.timeout)]),
  );
  try {
    const r = schema.safeParse(JSON.parse(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export type ErrCode = 'bad_request' | 'no_key' | 'rate_limited' | 'too_large' | 'timeout' | 'refused' | 'upstream';
const STATUS: Record<ErrCode, number> = {
  bad_request: 400,
  no_key: 503,
  rate_limited: 429,
  too_large: 413,
  timeout: 504,
  refused: 422,
  upstream: 502,
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
export const fail = (code: ErrCode) => json({ error: code }, STATUS[code]);

/** Map Ollama / network errors to our small set of codes. */
export function failFrom(err: unknown) {
  if (err instanceof Error && err.name === 'TimeoutError') return fail('timeout');
  // Ollama not running: same as "no AI" so the page falls back to the offline search.
  if (err instanceof TypeError && err.message === 'fetch failed') return fail('no_key');
  console.error('[raasta api]', err instanceof Error ? err.message : err);
  return fail('upstream');
}

// ponytail: in-memory per-instance limiter; move to a shared store (e.g. Upstash) if abuse shows up across instances.
const hits = new Map<string, number[]>();
export function rateLimited(req: Request, max = 20, windowMs = 60_000, bucket = 'ai') {
  const ip = bucket + '|' + (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  const now = Date.now(),
    list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > max;
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? b : null;
  } catch {
    return null;
  }
}

// ---------- prompts (ported from the prototype's buildAskPrompt / buildPhotoPrompt) ----------

const spotEn = (g: Graph, id: string) => {
  const n = g.nodes[id],
    r = n.ref as { en?: string } | undefined;
  if (n.kind === 'lift' || n.kind === 'stairs') return r?.en || (n.kind === 'lift' ? 'Lift lobby' : 'Stairs');
  return r?.en ?? id;
};

export function buildAskPrompt(g: Graph, q: string, start: string) {
  const S = g.site,
    FL = g.floors,
    sn = g.nodes[start];
  const list = S.places.map((p) => `${p.id} | ${p.en} | ${p.hi} | ${FL[p.floor].en}`).join('\n');
  const spots = g.startable.map((id) => `${id} | ${spotEn(g, id)} | ${FL[g.nodes[id].floor].en}`).join('\n');
  const wcs = g.wc.length
    ? `\n- For toilets, pick the one closest to the visitor, preferring their current floor: ${g.wc.join(', ')}.`
    : '';
  return `You are the wayfinding assistant on an indoor navigation page for "${S.name.en}".

A visitor typed this request (it may be Hindi, Hinglish or English):
"""${q.slice(0, 300)}"""

They are currently at: ${start} (${spotEn(g, start)}, ${FL[sn.floor].en}).

Places they can be taken to (id | English | Hindi | floor):
${list}

Spots where a visitor can be standing (id | name | floor):
${spots}

Rules:
${S.aiRules || ''}${wcs}
- People talk naturally and in mixed Hindi/English, with spelling mistakes, in Devanagari or Latin letters. They may
  talk about someone else ("papa ICU mein hain, unse milna hai" → the ICU or its waiting area) or give a reason
  ("report leni hai" → report collection). Understand the intent, not just the words.
- If they say where they are now (a room number, a place, "outside / near X", "registration ke paas"), set start_id to
  that spot's id; otherwise start_id is null.
- If they only say where they are and not where to go, destination_id is null and the reply confirms where they are
  and asks where they would like to go.
- If nothing fits, destination_id is null.
- reply_en: one or two short, warm sentences, the way a kind hospital volunteer would say it out loud: where the
  place is (its floor and block) and that the route is on the screen. Do not describe the way (no lifts, stairs,
  up/down or turns): the app works that out and shows it. Plain words, no "I am taking you".
  Example: "The Blood Bank is on the First Floor. The route is on your screen."
- reply_hi: the same in everyday spoken Hindi, the way people talk in Madhya Pradesh: respectful "aap", simple
  Hindustani (not formal or Sanskrit-heavy), and common hospital words as people say them (लिफ्ट, ओपीडी, ब्लड बैंक,
  एक्स-रे). Devanagari only. Example: "ब्लड बैंक पहली मंज़िल पर है। रास्ता स्क्रीन पर है।"
- If the person sounds worried (blood, an emergency, a sick child), begin with a short reassurance:
  "Don't worry," / "घबराइए नहीं,".`;
}

function signText(g: Graph, id: string) {
  const n = g.nodes[id],
    FL = g.floors;
  if (n.kind === 'lift' || n.kind === 'stairs') {
    const c = n.ref as { en?: string; hi?: string };
    return `${c.en || (n.kind === 'lift' ? 'Lift' : 'Stairs')} / ${c.hi || (n.kind === 'lift' ? 'लिफ्ट' : 'सीढ़ियाँ')} · ${FL[n.floor].en} / ${FL[n.floor].hi}`;
  }
  const p = n.ref as { num?: boolean; id: string; en: string; hi: string };
  return `${p.num ? p.id + ' ' : ''}${p.en} / ${p.hi}`;
}

export function buildPhotoPrompt(g: Graph) {
  const spots = g.startable.map((id) => `${id} | ${signText(g, id)} | ${g.floors[g.nodes[id].floor].en}`).join('\n');
  return `This photo was taken by a visitor inside "${g.site.name.en}". It should show a sign, board or door near where they are standing.

Read any room number, room or department name, or floor name on it (Hindi or English). Then match it to exactly one spot in this list (id | sign text | floor):
${spots}

Match on room numbers, names and floor names, not on how the corridor looks. If the photo has no readable sign, or the sign matches nothing in the list, use null for node_id.
text_read: the main text you can read on the sign.`;
}
