import { create } from 'zustand';

import type { OverlayKey, OverlaySheetSnap } from './types';

type SharedSnap = Exclude<OverlaySheetSnap, 'hidden' | 'collapsed'>;

type OverlaySheetPositionState = {
  hasUserSharedSnap: boolean;
  sharedSnap: SharedSnap;
  persistentSnaps: Record<string, OverlaySheetSnap>;
  recordPersistentSnap: (options: { key: string; snap: OverlaySheetSnap }) => void;
  getPersistentSnap: (key: string) => OverlaySheetSnap | null;
  setSharedSnap: (snap: SharedSnap) => void;
  recordUserSnap: (options: {
    rootOverlay: OverlayKey;
    activeOverlayKey: OverlayKey;
    snap: OverlaySheetSnap;
  }) => void;
};

const DEFAULT_SHARED_SNAP: SharedSnap = 'expanded';

export const TAB_OVERLAY_SNAP_KEY = 'overlay-tabs';

const isSharedOverlayKey = (overlayKey: OverlayKey) =>
  overlayKey === 'polls' ||
  overlayKey === 'pollCreation' ||
  overlayKey === 'bookmarks' ||
  overlayKey === 'profile';

export const useOverlaySheetPositionStore = create<OverlaySheetPositionState>((set, get) => ({
  hasUserSharedSnap: false,
  sharedSnap: DEFAULT_SHARED_SNAP,
  persistentSnaps: {},
  recordPersistentSnap: ({ key, snap }) => {
    if (snap === 'hidden') {
      return;
    }

    if (key === TAB_OVERLAY_SNAP_KEY && snap === 'collapsed') {
      return;
    }

    set((state) => {
      const existing = state.persistentSnaps[key];
      if (existing === snap) {
        return state;
      }
      return {
        persistentSnaps: {
          ...state.persistentSnaps,
          [key]: snap,
        },
      };
    });
  },
  getPersistentSnap: (key) => get().persistentSnaps[key] ?? null,
  setSharedSnap: (snap) => {
    set((state) => {
      const next: Partial<OverlaySheetPositionState> = {};
      if (!state.hasUserSharedSnap || state.sharedSnap !== snap) {
        next.hasUserSharedSnap = true;
        next.sharedSnap = snap;
      }
      if (state.persistentSnaps[TAB_OVERLAY_SNAP_KEY] !== snap) {
        next.persistentSnaps = {
          ...state.persistentSnaps,
          [TAB_OVERLAY_SNAP_KEY]: snap,
        };
      }
      return Object.keys(next).length > 0 ? next : state;
    });
  },
  recordUserSnap: ({ rootOverlay: _rootOverlay, activeOverlayKey, snap }) => {
    if (!isSharedOverlayKey(activeOverlayKey)) {
      return;
    }

    if (snap === 'hidden' || snap === 'collapsed') {
      return;
    }

    set((state) => {
      const next: Partial<OverlaySheetPositionState> = {};
      if (!state.hasUserSharedSnap || state.sharedSnap !== snap) {
        next.hasUserSharedSnap = true;
        next.sharedSnap = snap;
      }
      if (state.persistentSnaps[TAB_OVERLAY_SNAP_KEY] !== snap) {
        next.persistentSnaps = {
          ...state.persistentSnaps,
          [TAB_OVERLAY_SNAP_KEY]: snap,
        };
      }
      return Object.keys(next).length > 0 ? next : state;
    });
  },
}));

export const setSharedOverlaySnap = (snap: SharedSnap) => {
  useOverlaySheetPositionStore.getState().setSharedSnap(snap);
};
