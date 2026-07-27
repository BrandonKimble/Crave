import React from 'react';

// ─── THE FLIP (rung 5) ─────────────────────────────────────────────────────────
// The TrackSheet host is the DEFAULT sheet system. The old host renders only
// when the flip is off — one deep link is the emergency rollback:
//   crave://tracksheet-host?on=0          → old system back
//   crave://tracksheet-host?on=1          → track system (default)
//   crave://tracksheet-host?debug=1|0     → amber layer-marker + τ HUD

type TrackFlipState = { on: boolean; debug: boolean };

let state: TrackFlipState = { on: true, debug: false };
const listeners = new Set<() => void>();

export const setTrackFlipState = (partial: Partial<TrackFlipState>): void => {
  const next = { ...state, ...partial };
  if (next.on === state.on && next.debug === state.debug) {
    return;
  }
  state = next;
  listeners.forEach((listener) => listener());
};

export const getTrackFlipState = (): TrackFlipState => state;

export const useTrackFlipState = (): TrackFlipState =>
  React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => state
  );
