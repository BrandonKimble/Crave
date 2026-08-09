// ─── THE POSITION PUBLICATION (residue-kill-plan item 12 — the bridge dies) ───
//
// Post-R8 the track is the ONE owner of sheet position. Before this module the
// app kept a RIVAL pair of SharedValues (sheetTranslateY / sheetScrollOffset,
// allocated at the app root) and TrackSheetPage mirrored its own facts into
// them with two per-frame useAnimatedReactions — a copy that was always one
// hop from the truth and invited second writers (the scrollResultsToTop rogue
// write, killed in c7ecba93c).
//
// THE SHAPE NOW: the track publishes its OWN derived sheetTopY SharedValue —
// the exact object the page animates with, zero copies — plus a point-in-time
// getter for the PRESENTED entry's list scroll (the old global scroll mirror,
// max(0, τ − trackH), was only honest for the presented entry anyway; a getter
// states that honestly — nothing reads scroll per frame).
//
// Per-frame riders receive the published SV through the existing motion-state
// pipe (the sheet-host authority controller's stateEntry.sheetYValue carries
// THIS object). Settle-time riders call the getters here directly.
//
// RN-free ON PURPOSE (same doctrine as track-motion-authority): the SV is held
// structurally as `{ readonly value: number }`, so the pure jest lane can
// falsify publication semantics without react-native. At runtime the object is
// a real reanimated DerivedValue; the ONE widening cast back to
// SharedValue<number> lives at the motion-state pipe boundary.

/** Structural view of the track's sheetTopY SharedValue (a real reanimated
 *  derived value at runtime — readers only ever read `.value`). */
export type TrackSheetTopY = { readonly value: number };

export type TrackSheetPosition = {
  /** The track's OWN sheetTopY derived value — the object the page animates with. */
  sheetTopY: TrackSheetTopY;
  /** The PRESENTED entry's list scroll, NOW (max(0, τ − trackH) at call time). */
  getPresentedListScroll: () => number;
};

// Pre-publication seed: the track host mounts once at the root and publishes in
// a layout effect of the SAME first commit, so this object is never painted —
// it exists so pre-publication readers see "sheet fully offscreen" instead of a
// crash. 10000pt is below any physical screen.
const PRE_PUBLICATION_OFFSCREEN_SHEET_TOP_Y: TrackSheetTopY = { value: 10000 };

export type TrackSheetPositionAuthority = {
  publish: (position: TrackSheetPosition) => void;
  /** Unmount seam only — the track host is mounted once, for the app's life. */
  clear: () => void;
  getPosition: () => TrackSheetPosition | null;
  /** Total: the published SV, or the offscreen seed before the track's first commit. */
  getSheetTopY: () => TrackSheetTopY;
  /** Total: the presented entry's list scroll now; 0 before the track publishes. */
  getPresentedListScroll: () => number;
  subscribe: (listener: () => void) => () => void;
};

const createTrackSheetPositionAuthority = (): TrackSheetPositionAuthority => {
  let position: TrackSheetPosition | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    [...listeners].forEach((listener) => listener());
  };
  return {
    publish: (nextPosition) => {
      if (
        position != null &&
        position.sheetTopY === nextPosition.sheetTopY &&
        position.getPresentedListScroll === nextPosition.getPresentedListScroll
      ) {
        return;
      }
      position = nextPosition;
      notify();
    },
    clear: () => {
      if (position == null) {
        return;
      }
      position = null;
      notify();
    },
    getPosition: () => position,
    getSheetTopY: () => position?.sheetTopY ?? PRE_PUBLICATION_OFFSCREEN_SHEET_TOP_Y,
    getPresentedListScroll: () => position?.getPresentedListScroll() ?? 0,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

const SHARED_TRACK_SHEET_POSITION_AUTHORITY = createTrackSheetPositionAuthority();

export const getTrackSheetPositionAuthority = (): TrackSheetPositionAuthority =>
  SHARED_TRACK_SHEET_POSITION_AUTHORITY;

/** Test seam only — the singleton must not leak between specs. */
export const resetTrackSheetPositionAuthorityForTest = (): void => {
  SHARED_TRACK_SHEET_POSITION_AUTHORITY.clear();
};
