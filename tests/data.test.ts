import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSite } from '../src/data/loadSites';
import { validateSite } from '../src/data/validate';
import { SITES_DIR } from './helpers';

describe.each(['hospital'])('%s data', (id) => {
  const raw = JSON.parse(readFileSync(join(SITES_DIR, id, 'site.json'), 'utf8'));
  const site = parseSite(raw);
  it('validates', () => expect(validateSite(site)).toEqual([]));
  it('every photo and plan file exists', () => {
    const files = [...Object.values(site.photos ?? {}), ...Object.values(site.planImg ?? {}).map((p) => p.src)];
    expect(files.filter((f) => !existsSync(join(SITES_DIR, id, f)))).toEqual([]);
  });
});

describe('validation catches broken data', () => {
  const base = JSON.parse(readFileSync(join(SITES_DIR, 'hospital', 'site.json'), 'utf8'));
  it('unknown via', () => {
    const bad = structuredClone(base);
    bad.places[0].via = 'NOPE';
    expect(() => parseSite(bad)).toThrow(/via NOPE/);
  });
  it('duplicate id', () => {
    const bad = structuredClone(base);
    bad.points.push({ ...bad.points[0] });
    expect(() => parseSite(bad)).toThrow(/duplicate id/);
  });
  it('unreachable place', () => {
    const bad = structuredClone(base);
    bad.points.push({ id: 'ISLAND', floor: '1F', x: 0, y: 0 });
    bad.places[0].via = 'ISLAND';
    expect(() => parseSite(bad)).toThrow(/not reachable/);
  });
});

describe('QR deep links', () => {
  it('spot ids and site ids are unique across all sites, so #<id> opens the right building', () => {
    const ids = ['hospital'].flatMap((id) => {
      const s = parseSite(JSON.parse(readFileSync(join(SITES_DIR, id, 'site.json'), 'utf8')));
      return [s.id, ...s.places.map((p) => p.id), ...s.cores.map((c) => c.id)];
    });
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });
});
