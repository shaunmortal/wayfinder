// Browser side of the AI endpoints. The API key never reaches the page; every failure maps to a short code
// so the UI can fall back to the offline search.
export type AiError =
  'cancelled' | 'no_key' | 'rate_limited' | 'too_large' | 'timeout' | 'refused' | 'bad_request' | 'upstream' | 'offline';

export class AiFail extends Error {
  constructor(public code: AiError) {
    super(code);
  }
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (e) {
    throw new AiFail((e as Error).name === 'AbortError' ? 'cancelled' : 'offline');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new AiFail((data?.error as AiError) || 'upstream');
  return data as T;
}

/** Whether the server has a Claude key. False when offline or on a static host without api/. */
export async function aiStatus(): Promise<boolean> {
  try {
    const r = await fetch('/api/status');
    return r.ok && !!(await r.json()).ai;
  } catch {
    return false;
  }
}

export interface AskResult {
  destination_id: string | null;
  start_id: string | null;
  reply_en: string;
  reply_hi: string;
}
export const ask = (siteId: string, query: string, startId: string, lang: string, signal?: AbortSignal) =>
  post<AskResult>('/api/ask', { siteId, query, startId, lang }, signal);

export interface LocateResult {
  node_id: string | null;
  text_read: string;
}
export async function locate(siteId: string, file: File, signal?: AbortSignal) {
  return post<LocateResult>('/api/locate', { siteId, image: await shrink(file) }, signal);
}

export interface SlipResult {
  destination_id: string | null;
  reply_en: string;
  reply_hi: string;
  text_read: string;
}
/** Photo of an OPD slip / prescription → the department or room it points to. */
export async function readSlip(siteId: string, file: File, signal?: AbortSignal) {
  return post<SlipResult>('/api/slip', { siteId, image: await shrink(file, 1600) }, signal);
}

/** Resize a phone photo to ≤1280 px JPEG so uploads stay small and under the server body limit. */
async function shrink(file: File, max = 1280): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL('image/jpeg', 0.82);
}

/** Visitor feedback: a 1-5 rating, an optional comment and the place they went to. */
export const sendFeedback = (b: { siteId: string; rating: number; text: string; dest: string | null; lang: string }) =>
  post<{ ok: true }>('/api/feedback', b);
