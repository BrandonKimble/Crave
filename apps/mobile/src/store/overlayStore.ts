import { create } from 'zustand';

import type { OverlayKey } from '../overlays/types';
export type { OverlayKey } from '../overlays/types';

export type OverlayRouteParamsMap = {
  search?: undefined;
  bookmarks?: undefined;
  polls?: { coverageKey?: string | null; pollId?: string | null };
  profile?: undefined;
  restaurant?: {
    restaurantId: string | null;
    source?: 'search' | 'global';
    sessionToken?: number | null;
  };
  saveList?: undefined;
  price?: undefined;
  scoreInfo?: undefined;
  pollCreation?: { coverageKey: string | null; coverageName?: string | null };
};

export type OverlayRouteEntry<K extends OverlayKey = OverlayKey> = {
  key: K;
  params: OverlayRouteParamsMap[K];
};

type DismissHandler = () => void;

interface OverlayState {
  activeOverlayRoute: OverlayRouteEntry;
  previousOverlayRoute: OverlayRouteEntry | null;
  overlayRouteStack: OverlayRouteEntry[];
  overlayScrollOffsets: Partial<Record<OverlayKey, number>>;
  transientDismissors: DismissHandler[];
  setOverlay: <K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) => void;
  setOverlayParams: <K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) => void;
  pushOverlay: <K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) => void;
  popOverlay: () => void;
  popToRootOverlay: () => void;
  setOverlayScrollOffset: (overlay: OverlayKey, offset: number) => void;
  registerTransientDismissor: (handler: DismissHandler) => () => void;
  dismissTransientOverlays: () => void;
}

const SEARCH_ROUTE: OverlayRouteEntry<'search'> = {
  key: 'search',
  params: undefined,
};

const createRouteEntry = <K extends OverlayKey>(
  key: K,
  params?: OverlayRouteParamsMap[K]
): OverlayRouteEntry<K> => ({
  key,
  params,
});

const projectOverlayRouteState = (
  activeOverlayRoute: OverlayRouteEntry,
  previousOverlayRoute: OverlayRouteEntry | null,
  overlayRouteStack: OverlayRouteEntry[]
) => ({
  activeOverlayRoute,
  previousOverlayRoute,
  overlayRouteStack,
});

export const useOverlayStore = create<OverlayState>((set, get) => ({
  ...projectOverlayRouteState(SEARCH_ROUTE, null, [SEARCH_ROUTE]),
  overlayScrollOffsets: {},
  transientDismissors: [],
  setOverlay: (overlay, params) =>
    set((state) => {
      const nextRoute = createRouteEntry(overlay, params);
      const nextPrevious =
        state.activeOverlayRoute.key === overlay
          ? state.previousOverlayRoute
          : state.activeOverlayRoute;
      return {
        ...projectOverlayRouteState(nextRoute, nextPrevious, [nextRoute]),
      };
    }),
  setOverlayParams: (overlay, params) =>
    set((state) => {
      let didUpdate = false;
      const overlayRouteStack = state.overlayRouteStack.map((route) => {
        if (route.key !== overlay) {
          return route;
        }
        didUpdate = true;
        return createRouteEntry(overlay, params);
      });
      if (!didUpdate) {
        return state;
      }
      const activeOverlayRoute =
        overlayRouteStack[overlayRouteStack.length - 1] ?? state.activeOverlayRoute;
      const previousOverlayRoute =
        overlayRouteStack.length > 1
          ? overlayRouteStack[overlayRouteStack.length - 2] ?? state.previousOverlayRoute
          : state.previousOverlayRoute;
      return {
        ...projectOverlayRouteState(activeOverlayRoute, previousOverlayRoute, overlayRouteStack),
        overlayScrollOffsets: state.overlayScrollOffsets,
        transientDismissors: state.transientDismissors,
      };
    }),
  pushOverlay: (overlay, params) =>
    set((state) => {
      const nextRoute = createRouteEntry(overlay, params);
      const currentTop = state.overlayRouteStack[state.overlayRouteStack.length - 1];
      const overlayRouteStack =
        currentTop?.key === overlay
          ? [...state.overlayRouteStack.slice(0, -1), nextRoute]
          : [...state.overlayRouteStack, nextRoute];
      const nextPrevious =
        state.activeOverlayRoute.key === overlay
          ? state.previousOverlayRoute
          : state.activeOverlayRoute;
      return {
        ...projectOverlayRouteState(nextRoute, nextPrevious, overlayRouteStack),
      };
    }),
  popOverlay: () =>
    set((state) => {
      if (state.overlayRouteStack.length <= 1) {
        return state;
      }
      const overlayRouteStack = state.overlayRouteStack.slice(0, -1);
      const activeOverlayRoute = overlayRouteStack[overlayRouteStack.length - 1] ?? SEARCH_ROUTE;
      const previousOverlayRoute =
        overlayRouteStack.length > 1
          ? overlayRouteStack[overlayRouteStack.length - 2] ?? null
          : null;
      return {
        ...projectOverlayRouteState(activeOverlayRoute, previousOverlayRoute, overlayRouteStack),
      };
    }),
  popToRootOverlay: () =>
    set((state) => {
      const rootOverlayRoute = state.overlayRouteStack[0] ?? SEARCH_ROUTE;
      if (
        state.overlayRouteStack.length <= 1 &&
        state.activeOverlayRoute.key === rootOverlayRoute.key
      ) {
        return state;
      }
      return {
        ...projectOverlayRouteState(rootOverlayRoute, state.previousOverlayRoute, [
          rootOverlayRoute,
        ]),
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
