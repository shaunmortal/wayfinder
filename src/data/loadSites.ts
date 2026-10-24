import type { Site } from './types';
import { validateSite } from './validate';

/** Fill in defaults the JSON leaves out. Pure: returns a new site, never mutates the input. */
export function normalizeSite(raw: Site): Site {
  const f0 = raw.floors[0].id;
  return {
    ...raw,
    points: raw.points.map((p) => ({ ...p, floor: p.floor ?? f0 })),
    cores: raw.cores.map((c) => ({ ...c, floor: c.floor ?? f0 })),
    places: raw.places.map((p) => ({
      ...p,
      floor: p.floor ?? f0,
      code: p.code ?? p.id,
      num: p.num ?? /^(\d|[A-Z]-\d)/.test(p.id), // room numbers print as "302 Ward", others by name only
    })),
  };
}

export function parseSite(raw: unknown): Site {
  const site = normalizeSite(raw as Site);
  const errs = validateSite(site);
  if (errs.length) throw new Error(`Invalid site "${site.id}":\n- ${errs.join('\n- ')}`);
  return site;
}

export const SITE_IDS = ['hospital'];

/** Fetch every site from `<base>/sites/<id>/site.json`. Photo/plan paths are resolved to full URLs. */
export async function loadSites(base = import.meta.env.BASE_URL, ids = SITE_IDS): Promise<Site[]> {
  return Promise.all(
    ids.map(async (id) => {
      const dir = `${base}sites/${id}/`;
      const res = await fetch(dir + 'site.json');
      if (!res.ok) throw new Error(`Could not load site ${id} (${res.status})`);
      const site = parseSite(await res.json());
      const photos = Object.fromEntries(Object.entries(site.photos ?? {}).map(([k, v]) => [k, dir + v]));
      const planImg = site.planImg && Object.fromEntries(Object.entries(site.planImg).map(([k, v]) => [k, { ...v, src: dir + v.src }]));
      return { ...site, photos, planImg };
    }),
  );
}
