import { create } from 'zustand';

import type { OverlayKey } from '../overlays/types';
export type { OverlayKey } from '../overlays/types';

type OverlayParamsMap = {
  search?: undefined;
  bookmarks?: undefined;
  polls?: { coverageKey?: string | null; pollId?: string | null };
  profile?: undefined;
  restaurant?: undefined;
  saveList?: undefined;
  price?: undefined;
  scoreInfo?: undefined;
  pollCreation?: { coverageKey: string | null; coverageName?: string | null };
};

type DismissHandler = () => void;

interface OverlayState {
  activeOverlay: OverlayKey;
  previousOverlay: OverlayKey | null;
  overlayStack: OverlayKey[];
  overlayParams: OverlayParamsMap;
  overlayScrollOffsets: Partial<Record<OverlayKey, number>>;
  transientDismissors: DismissHandler[];
  setOverlay: <K extends OverlayKey>(overlay: K, params?: OverlayParamsMap[K]) => void;
  setOverlayParams: <K extends OverlayKey>(overlay: K, params?: OverlayParamsMap[K]) => void;
  pushOverlay: <K extends OverlayKey>(overlay: K, params?: OverlayParamsMap[K]) => void;
  popOverlay: () => void;
  popToRootOverlay: () => void;
  setOverlayScrollOffset: (overlay: OverlayKey, offset: number) => void;
  registerTransientDismissor: (handler: DismissHandler) => () => void;
  dismissTransientOverlays: () => void;
}

export const useOverlayStore = create<OverlayState>((set, get) => ({
  activeOverlay: 'search',
  previousOverlay: null,
  overlayStack: ['search'],
  overlayParams: {},
  overlayScrollOffsets: {},
  transientDismissors: [],
  setOverlay: (overlay, params) =>
    set((state) => ({
      previousOverlay:
        state.activeOverlay === overlay ? state.previousOverlay : state.activeOverlay,
      activeOverlay: overlay,
      overlayStack: [overlay],
      overlayParams: {
        ...state.overlayParams,
        [overlay]: params,
      },
    })),
  setOverlayParams: (overlay, params) =>
    set((state) => ({
      overlayParams: {
        ...state.overlayParams,
        [overlay]: params,
      },
    })),
  pushOverlay: (overlay, params) =>
    set((state) => {
      const currentTop = state.overlayStack[state.overlayStack.length - 1];
      const nextStack =
        currentTop === overlay ? state.overlayStack : [...state.overlayStack, overlay];
      const nextPrevious =
        state.activeOverlay === overlay ? state.previousOverlay : state.activeOverlay;
      return {
        previousOverlay: nextPrevious,
        activeOverlay: overlay,
        overlayStack: nextStack,
        overlayParams: {
          ...state.overlayParams,
          [overlay]: params,
        },
      };
    }),
  popOverlay: () =>
    set((state) => {
      if (state.overlayStack.length <= 1) {
        return state;
      }
      const nextStack = state.overlayStack.slice(0, -1);
      const nextActive = nextStack[nextStack.length - 1] ?? 'search';
      return {
        previousOverlay:
          state.activeOverlay === nextActive ? state.previousOverlay : state.activeOverlay,
        activeOverlay: nextActive,
        overlayStack: nextStack,
      };
    }),
  popToRootOverlay: () =>
    set((state) => {
      const root = state.overlayStack[0] ?? 'search';
      if (state.overlayStack.length <= 1 && state.activeOverlay === root) {
        return state;
      }
      return {
        previousOverlay: state.activeOverlay === root ? state.previousOverlay : state.activeOverlay,
        activeOverlay: root,
        overlayStack: [root],
      };
    }),
  setOverlayScrollOffset: (overlay, offset) =>
    set((state) => {
      const next = Math.max(0, offset);
      const existing = state.overlayScrollOffsets[overlay];
      if (existing != null && Math.abs(existing - next) < 1) {
        return state;
      }
      return {
        overlayScrollOffsets: {
          ...state.overlayScrollOffsets,
          [overlay]: next,
        },
      };
    }),
  registerTransientDismissor: (handler) => {
    set((state) => ({
      transientDismissors: [...state.transientDismissors, handler],
    }));
    return () => {
      set((state) => ({
        transientDismissors: state.transientDismissors.filter((fn) => fn !== handler),
      }));
    };
  },
  dismissTransientOverlays: () => {
    const dismissors = get().transientDismissors;
    dismissors.forEach((handler) => {
      try {
        handler();
      } catch (error) {
        console.warn('transient overlay dismissal error', error);
      }
    });
  },
}));
