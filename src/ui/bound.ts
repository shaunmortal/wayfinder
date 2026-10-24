// i18n + text helpers bound to the current app state, so UI code stays short.
import type { Core, Place, Step } from '../data/types';
import { t } from '../i18n';
import * as T from '../engine/text';
import { G, okRoute, state } from '../state';

export const tr = (key: string, ...a: unknown[]) => t(state.lang, key, ...a);
export const isHi = () => state.lang === 'hi';
export const L = (o?: { en?: string; hi?: string }) => (o ? ((isHi() ? o.hi || o.en : o.en) ?? '') : '');
export const pName = (p: Place) => T.pName(p, state.lang);
export const pShort = (p: Place) => T.pShort(p, state.lang);
export const placeLabel = (p: Place) => T.placeLabel(p, state.lang);
export const floorName = (id: string) => T.floorName(G(), id, state.lang);
export const coreName = (c: Core) => T.coreName(G(), c, state.lang);
export const spotLabel = (id: string) => T.spotLabel(G(), id, state.lang);
export const fmtM = T.fmtM;
export const fmtS = (s: number) => T.fmtS(s, state.lang);
export const stepText = (st: Step) => T.stepText(G(), okRoute()!, st, state.lang);
export const stepMeta = (st: Step) => T.stepMeta(st, state.lang);
export const stepIcon = T.stepIcon;
