import { create } from 'zustand';

import type { OverlayKey, OverlaySheetSnap } from './types';

type SharedSnap = Exclude<OverlaySheetSnap, 'hidden'>;

type OverlaySheetPositionState = {
  hasUserSharedSnap: boolean;
  sharedSnap: SharedSnap;
  recordUserSnap: (options: {
    rootOverlay: OverlayKey;
    activeOverlayKey: OverlayKey;
    snap: OverlaySheetSnap;
  }) => void;
};

const DEFAULT_SHARED_SNAP: SharedSnap = 'expanded';

const isSharedOverlayKey = (overlayKey: OverlayKey) =>
  overlayKey === 'polls' || overlayKey === 'bookmarks' || overlayKey === 'profile';

export const useOverlaySheetPositionStore = create<OverlaySheetPositionState>((set) => ({
  hasUserSharedSnap: false,
  sharedSnap: DEFAULT_SHARED_SNAP,
  recordUserSnap: ({ rootOverlay, activeOverlayKey, snap }) => {
    if (!isSharedOverlayKey(activeOverlayKey)) {
      return;
    }

    if (snap === 'hidden') {
      return;
    }

    if (rootOverlay === 'search' && activeOverlayKey === 'polls' && snap === 'collapsed') {
      return;
    }

    set((state) => {
      if (state.hasUserSharedSnap && state.sharedSnap === snap) {
        return state;
      }
      return {
        hasUserSharedSnap: true,
        sharedSnap: snap,
      };
    });
  },
}));
