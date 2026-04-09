import { appOverlayRouteController } from '../../../../overlays/useAppOverlayRouteController';
import {
  requestSearchRouteDockedRestore,
  useSearchRouteOverlayCommandStore,
} from '../../../../overlays/searchRouteOverlayCommandStore';
import type { OverlayKey } from '../../../../store/overlayStore';
import { useOverlayStore } from '../../../../store/overlayStore';

type SearchRestoreOptions = {
  snap?: 'expanded' | 'middle' | 'collapsed';
  clearTabSnapRequest?: boolean;
};

const SEARCH_ROOT_ENTRY_RESTORE_OPTIONS: SearchRestoreOptions = {
  snap: 'collapsed',
  clearTabSnapRequest: true,
};

const restoreSearchRootEntry = (options: SearchRestoreOptions = {}): void => {
  const resolvedOptions = {
    ...SEARCH_ROOT_ENTRY_RESTORE_OPTIONS,
    ...options,
  };
  const commandState = useSearchRouteOverlayCommandStore.getState();
  if (resolvedOptions.clearTabSnapRequest) {
    commandState.setTabOverlaySnapRequest(null);
  }
  requestSearchRouteDockedRestore({
    snap: resolvedOptions.snap ?? 'collapsed',
  });
};

export type OverlayRuntimeController = {
  setRootOverlay: (overlay: OverlayKey) => void;
  setOverlayData: (overlay: OverlayKey, params?: unknown) => void;
  closeActiveOverlay: () => void;
  popToRootOverlay: () => void;
  restoreSearchRootEntry: (options?: SearchRestoreOptions) => void;
  switchToSearchRootWithDockedPolls: (options?: SearchRestoreOptions) => void;
  ensureSearchOverlay: () => void;
};

export const createOverlayRuntimeController = (): OverlayRuntimeController => ({
  setRootOverlay: (overlay) => {
    appOverlayRouteController.setRootRoute(overlay);
  },
  setOverlayData: (overlay, params) => {
    appOverlayRouteController.updateRoute(overlay, params as never);
  },
  closeActiveOverlay: () => {
    appOverlayRouteController.closeActiveRoute();
  },
  popToRootOverlay: () => {
    appOverlayRouteController.popToRootRoute();
  },
  restoreSearchRootEntry,
  switchToSearchRootWithDockedPolls: (options = {}) => {
    restoreSearchRootEntry({
      ...SEARCH_ROOT_ENTRY_RESTORE_OPTIONS,
      ...options,
    });
    appOverlayRouteController.setRootRoute('search');
  },
  ensureSearchOverlay: () => {
    const overlayState = useOverlayStore.getState();
    const rootOverlay =
      overlayState.overlayRouteStack[0]?.key ?? overlayState.activeOverlayRoute.key;
    if (rootOverlay !== 'search') {
      restoreSearchRootEntry(SEARCH_ROOT_ENTRY_RESTORE_OPTIONS);
      appOverlayRouteController.setRootRoute('search');
      return;
    }
    if (overlayState.activeOverlayRoute.key !== 'search') {
      appOverlayRouteController.popToRootRoute();
    }
  },
});
