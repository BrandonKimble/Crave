import { create } from 'zustand';

export type OverlayKey = 'search' | 'bookmarks' | 'polls';

type OverlayParamsMap = {
  search?: undefined;
  bookmarks?: undefined;
  polls?: { coverageKey?: string | null; pollId?: string | null };
};

type DismissHandler = () => void;

interface OverlayState {
  activeOverlay: OverlayKey;
  overlayParams: OverlayParamsMap;
  transientDismissors: DismissHandler[];
  setOverlay: <K extends OverlayKey>(overlay: K, params?: OverlayParamsMap[K]) => void;
  registerTransientDismissor: (handler: DismissHandler) => () => void;
  dismissTransientOverlays: () => void;
}

export const useOverlayStore = create<OverlayState>((set, get) => ({
  activeOverlay: 'search',
  overlayParams: {},
  transientDismissors: [],
  setOverlay: (overlay, params) =>
    set((state) => ({
      activeOverlay: overlay,
      overlayParams: {
        ...state.overlayParams,
        [overlay]: params,
      },
    })),
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
