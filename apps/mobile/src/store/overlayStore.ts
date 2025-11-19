import { create } from 'zustand';

export type OverlayKey = 'search' | 'bookmarks' | 'polls';

type OverlayParamsMap = {
  search?: undefined;
  bookmarks?: undefined;
  polls?: { city?: string | null; pollId?: string | null };
};

interface OverlayState {
  activeOverlay: OverlayKey;
  overlayParams: OverlayParamsMap;
  setOverlay: <K extends OverlayKey>(overlay: K, params?: OverlayParamsMap[K]) => void;
}

export const useOverlayStore = create<OverlayState>((set) => ({
  activeOverlay: 'search',
  overlayParams: {},
  setOverlay: (overlay, params) =>
    set((state) => ({
      activeOverlay: overlay,
      overlayParams: {
        ...state.overlayParams,
        [overlay]: params,
      },
    })),
}));
