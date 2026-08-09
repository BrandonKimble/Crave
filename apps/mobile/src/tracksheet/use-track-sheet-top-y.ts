import React from 'react';

import {
  getTrackSheetPositionAuthority,
  type TrackSheetTopY,
} from './track-sheet-position-authority';

/**
 * The track's published sheetTopY, with a re-render when the publication
 * changes identity (once, at the track's first commit). Riders that need a
 * live per-frame Y even when no motion-state entry exists (the chrome motion
 * chain, the dismiss/visual stage) fall back to THIS — the same object the
 * motion-state pipe carries, so a fallback can never be a frozen mirror.
 */
export const useTrackSheetTopY = (): TrackSheetTopY => {
  const authority = getTrackSheetPositionAuthority();
  return React.useSyncExternalStore(
    authority.subscribe,
    authority.getSheetTopY,
    authority.getSheetTopY
  );
};
