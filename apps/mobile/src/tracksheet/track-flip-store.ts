import React from 'react';

// ─── THE FLIP (rung 5) ─────────────────────────────────────────────────────────
// The TrackSheet host is the DEFAULT sheet system. The old host renders only
// when the flip is off — one deep link is the emergency rollback:
//   crave://tracksheet-host?on=0          → old system back
//   crave://tracksheet-host?on=1          → track system (default)
//   crave://tracksheet-host?debug=1|0     → amber layer-marker + τ HUD
//   crave://tracksheet-host?row=bare|full → THE ROW A/B (see below)
//
// THE ROW A/B (touch-latency attribution, 2026-08-05). passive->paint is 109ms
// on a polls flip and 52ms on home, scales with row count, and contains NO JS —
// it is the native cost of mounting those cells. Whether that cost is the CARD's
// own view tree or the track's per-row machinery is not answerable by reading
// either one: it is answerable by rendering a deliberately trivial row in the
// same list, at the same row count, and measuring the difference.
//
// 'bare' substitutes a fixed-height empty cell for every row's CONTENT while
// leaving the list, the window, the chrome and the row count identical. The
// delta in passive->paint between 'full' and 'bare' IS the cards' native cost;
// what remains is everything else. Dev-only, off by default, and the active
// mode is printed on the [PERF] line so a measurement can never be filed under
// the wrong one.

export type TrackRowProbeMode = 'full' | 'bare';

type TrackFlipState = { on: boolean; debug: boolean; rowProbe: TrackRowProbeMode };

let state: TrackFlipState = { on: true, debug: false, rowProbe: 'full' };
const listeners = new Set<() => void>();

export const setTrackFlipState = (partial: Partial<TrackFlipState>): void => {
  const next = { ...state, ...partial };
  if (next.on === state.on && next.debug === state.debug && next.rowProbe === state.rowProbe) {
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
