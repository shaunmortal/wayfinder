import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSite } from '../src/data/loadSites';
import { buildGraph } from '../src/engine/graph';

export const SITES_DIR = join(__dirname, '..', 'public', 'sites');
export const loadGraph = (id: string) => buildGraph(parseSite(JSON.parse(readFileSync(join(SITES_DIR, id, 'site.json'), 'utf8'))));
