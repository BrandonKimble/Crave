import React from 'react';

// ─── TRACK DEV LEVERS (was: THE FLIP, rung 5) ─────────────────────────────────
// R8 (2026-08-08): the `on` field is DELETED with the old sheet system — the
// track host is the only sheet system and there is nothing to flip back to.
// What survives are the two DEV instruments this store carries, both live
// attribution levers (not scaffolding):
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

type TrackFlipState = { debug: boolean; rowProbe: TrackRowProbeMode };

let state: TrackFlipState = { debug: false, rowProbe: 'full' };
const listeners = new Set<() => void>();

export const setTrackFlipState = (partial: Partial<TrackFlipState>): void => {
  const next = { ...state, ...partial };
  if (next.debug === state.debug && next.rowProbe === state.rowProbe) {
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
