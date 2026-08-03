// Imperative store for the app's ONE score-info sheet (the result cards' ⓘ),
// exactly the option-selector-store pattern: any surface calls showScoreInfo();
// the root ScoreInfoHost renders the sheet viewport-anchored. A panel-local
// OverlayModalSheet mount is WRONG by construction — absoluteFill anchors to the
// scrollable body's content box, so the sheet lands at content-bottom, offscreen
// (leg-11 sim RED on ListDetail).
//
// The search results scene keeps its own scene-scoped instance (its openScoreInfo
// rides the scene read-model); non-search surfaces use this store.

import { createSingletonSurfaceStore } from './singleton-surface-store';

export type ScoreInfoStorePayload = {
  type: 'dish' | 'restaurant';
  title: string;
  score: number | null | undefined;
  rising: number | null | undefined;
  votes: number | null | undefined;
  polls: number | null | undefined;
};

const store = createSingletonSurfaceStore<ScoreInfoStorePayload>();

export const scoreInfoStore = store;

export const showScoreInfo = (payload: ScoreInfoStorePayload): void => store.show(payload);

/** F880: gains the identity-scoped close for free — pass the payload being
 *  closed and a deferred dismissal can no longer kill a NEWER score sheet. */
export const closeScoreInfo = (payload?: ScoreInfoStorePayload): void => store.close(payload);

export const getScoreInfoPayload = (): ScoreInfoStorePayload | null => store.getSnapshot();

export const subscribeScoreInfo = (listener: () => void): (() => void) => store.subscribe(listener);
