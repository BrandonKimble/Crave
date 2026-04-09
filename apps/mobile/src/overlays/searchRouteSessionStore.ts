import { create } from 'zustand';

import type { SearchSessionOriginContext } from './searchRouteSessionTypes';

type SearchRouteSessionState = {
  capturedOriginContext: SearchSessionOriginContext | null;
  pendingOriginRestoreContext: SearchSessionOriginContext | null;
  isSearchOriginRestorePending: boolean;
  setCapturedOriginContext: (next: SearchSessionOriginContext | null) => void;
  setPendingOriginRestoreContext: (next: SearchSessionOriginContext | null) => void;
  setIsSearchOriginRestorePending: (next: boolean) => void;
};

export const useSearchRouteSessionStore = create<SearchRouteSessionState>((set) => ({
  capturedOriginContext: null,
  pendingOriginRestoreContext: null,
  isSearchOriginRestorePending: false,
  setCapturedOriginContext: (next) => set({ capturedOriginContext: next }),
  setPendingOriginRestoreContext: (next) => set({ pendingOriginRestoreContext: next }),
  setIsSearchOriginRestorePending: (next) => set({ isSearchOriginRestorePending: next }),
}));
