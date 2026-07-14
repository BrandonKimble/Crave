// Imperative store for the app's ONE score-info sheet (the result cards' ⓘ),
// exactly the option-selector-store pattern: any surface calls showScoreInfo();
// the root ScoreInfoHost renders the sheet viewport-anchored. A panel-local
// OverlayModalSheet mount is WRONG by construction — absoluteFill anchors to the
// scrollable body's content box, so the sheet lands at content-bottom, offscreen
// (leg-11 sim RED on ListDetail).
//
// The search results scene keeps its own scene-scoped instance (its openScoreInfo
// rides the scene read-model); non-search surfaces use this store.

export type ScoreInfoStorePayload = {
  type: 'dish' | 'restaurant';
  title: string;
  score: number | null | undefined;
  rising: number | null | undefined;
  votes: number | null | undefined;
  polls: number | null | undefined;
};

type Listener = () => void;

let currentPayload: ScoreInfoStorePayload | null = null;
const listeners = new Set<Listener>();

const emit = (): void => {
  listeners.forEach((listener) => listener());
};

export const showScoreInfo = (payload: ScoreInfoStorePayload): void => {
  currentPayload = payload;
  emit();
};

export const closeScoreInfo = (): void => {
  if (currentPayload == null) {
    return;
  }
  currentPayload = null;
  emit();
};

export const getScoreInfoPayload = (): ScoreInfoStorePayload | null => currentPayload;

export const subscribeScoreInfo = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
