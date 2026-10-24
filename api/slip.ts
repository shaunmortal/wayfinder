// POST /api/slip {siteId, image: "data:image/jpeg;base64,..."} → {destination_id, reply_en, reply_hi, text_read}
// Reads an OPD slip / prescription photo and finds the department or room it sends the patient to.
// The slip has personal details on it: the prompt tells Gemma not to repeat them, nothing is stored, and only
// a place id from this building is returned.
import { z } from 'zod';
import { fail, failFrom, gemma, graphs, json, rateLimited, readJson } from './_lib';

const Answer = z.object({
  destination_id: z.string().nullable(),
  reply_en: z.string(),
  reply_hi: z.string(),
  text_read: z.string(),
});
const MEDIA = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_B64 = 4_000_000;

export async function POST(req: Request): Promise<Response> {
  if (rateLimited(req, 8)) return fail('rate_limited');
  const b = await readJson(req);
  const g = b && typeof b.siteId === 'string' ? graphs[b.siteId] : undefined;
  const m = b && typeof b.image === 'string' ? /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(b.image) : null;
  if (!g || !m || !MEDIA.includes(m[1] as never)) return fail('bad_request');
  if (m[2].length > MAX_B64) return fail('too_large');

  const list = g.site.places
    .filter((p) => !p.gate)
    .map((p) => `${p.id} | ${p.en} | ${p.hi} | ${g.floors[p.floor].en}`)
    .join('\n');
  const prompt = `This is a photo of a hospital slip from "${g.site.name.en}": an OPD slip ("parchi"), a registration card, a prescription or a test request. It may be in Hindi or English, printed or handwritten.

Find where it sends the patient: the department, OPD, room number, test or counter. Match it to exactly one place in this list (id | English | Hindi | floor):
${list}

Rules:
- If the slip names a department, pick that department's OPD. If it names a room number that is in the list, use it.
- If it lists several places (for example an OPD and then tests), pick the first place the patient should go now.
- If nothing on the slip matches a place, destination_id is null.
- Do NOT copy any personal details (patient name, age, sex, phone, address, ID or registration numbers) into any field.
- text_read: only the department / room / test words you used, nothing personal.
- reply_en: one or two short, warm sentences, the way a kind hospital volunteer would say it out loud: where the
  place is (its floor and block) and that the route is on the screen. Do not describe the way (no lifts, stairs,
  up/down or turns): the app works that out and shows it. Plain words, no "I am taking you".
  Example: "The Blood Bank is on the First Floor. The route is on your screen."
- reply_hi: the same in everyday spoken Hindi, the way people talk in Madhya Pradesh: respectful "aap", simple
  Hindustani (not formal or Sanskrit-heavy), and common hospital words as people say them (लिफ्ट, ओपीडी, ब्लड बैंक,
  एक्स-रे). Devanagari only. Example: "ब्लड बैंक पहली मंज़िल पर है। रास्ता स्क्रीन पर है।"
- If the person sounds worried (blood, an emergency, a sick child), begin with a short reassurance:
  "Don't worry," / "घबराइए नहीं,".`;

  try {
    const o = await gemma(Answer, prompt, { image: m[2], timeout: 90_000, signal: req.signal });
    if (!o) return fail('upstream');
    const dest = o.destination_id && g.places[o.destination_id] && !g.places[o.destination_id].gate ? o.destination_id : null;
    return json({
      destination_id: dest,
      reply_en: o.reply_en.slice(0, 240),
      reply_hi: o.reply_hi.slice(0, 240),
      text_read: o.text_read.slice(0, 120),
    });
  } catch (err) {
    return failFrom(err);
  }
}
