import type { OverlayKey } from '../../../../store/overlayStore';
import { useOverlayStore } from '../../../../store/overlayStore';

type SearchRestoreOptions = {
  snap?: 'expanded' | 'middle' | 'collapsed';
  clearTabSnapRequest?: boolean;
};

type RestoreDockedPolls = (options?: SearchRestoreOptions) => void;

const SEARCH_ROOT_ENTRY_RESTORE_OPTIONS: SearchRestoreOptions = {
  snap: 'collapsed',
  clearTabSnapRequest: true,
};

export type OverlayRuntimeController = {
  setRootOverlay: (overlay: OverlayKey) => void;
  setOverlayData: (overlay: OverlayKey, params?: unknown) => void;
  closeActiveOverlay: () => void;
  popToRootOverlay: () => void;
  switchToSearchRootWithDockedPolls: (
    restoreDockedPolls: RestoreDockedPolls,
    options?: SearchRestoreOptions
  ) => void;
  ensureSearchOverlay: (restoreDockedPolls: RestoreDockedPolls) => void;
};

export const createOverlayRuntimeController = (): OverlayRuntimeController => ({
  setRootOverlay: (overlay) => {
    useOverlayStore.getState().setOverlay(overlay);
  },
  setOverlayData: (overlay, params) => {
    useOverlayStore.getState().setOverlayParams(overlay, params as never);
  },
  closeActiveOverlay: () => {
    useOverlayStore.getState().popOverlay();
  },
  popToRootOverlay: () => {
    useOverlayStore.getState().popToRootOverlay();
  },
  switchToSearchRootWithDockedPolls: (restoreDockedPolls, options = {}) => {
    restoreDockedPolls({
      ...SEARCH_ROOT_ENTRY_RESTORE_OPTIONS,
      ...options,
    });
    useOverlayStore.getState().setOverlay('search');
  },
  ensureSearchOverlay: (restoreDockedPolls) => {
    const overlayState = useOverlayStore.getState();
    const rootOverlay = overlayState.overlayStack[0] ?? overlayState.activeOverlay;
    if (rootOverlay !== 'search') {
      restoreDockedPolls(SEARCH_ROOT_ENTRY_RESTORE_OPTIONS);
      overlayState.setOverlay('search');
      return;
    }
    if (overlayState.activeOverlay !== 'search') {
      overlayState.popToRootOverlay();
    }
  },
});
