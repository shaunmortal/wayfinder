import { describe, expect, it } from 'vitest';
import { parseTrip } from '../src/ai/localMatch';
import { loadGraph } from './helpers';

const g = loadGraph('hospital');
const p = (q: string) => parseTrip(g, q, 'GF');

describe('offline: where I am + where I want to go, in one sentence', () => {
  it.each([
    ['main 301 mein hoon aur mujhe 202 jana hai', { start: '301', dest: '202' }],
    ['मैं 301 में हूँ, मुझे 202 जाना है', { start: '301', dest: '202' }],
    ['मैं ३०१ में हूँ और मुझे २०२ जाना है', { start: '301', dest: '202' }],
    ['mujhe 202 jana hai, main 301 mein hoon', { start: '301', dest: '202' }],
    ['301 se 202', { start: '301', dest: '202' }],
    ['from 301 to 202', { start: '301', dest: '202' }],
    ['I am at registration and I need to go to the blood bank', { start: 'GF-REG', dest: '101' }],
  ])('%s', (q, want) => expect(p(q)).toEqual(want));
  it('only "where I am"', () => expect(p('main 203 mein hoon')).toEqual({ start: '203' }));
  it('only "where I want to go"', () => expect(p('x-ray')).toEqual({ dest: 'G-08' }));
});

describe('filler words do not confuse the offline search', () => {
  it.each([
    ['mujhe x-ray jana hai, main registration ke paas hoon', { start: 'GF-REG', dest: 'G-08' }],
    ['main OT ke bahar hoon', { start: 'G-28' }], // from the ground floor the nearest OT is the Minor OT
    ['मुझे दवाई लेनी है', { dest: 'GF-PHARM' }],
  ])('%s', (q, want) => expect(p(q)).toEqual(want));
});

it('the same words pick the place on your own floor', () => {
  expect(parseTrip(g, 'main OT ke bahar hoon', '3F')).toEqual({ start: '301' });
});
