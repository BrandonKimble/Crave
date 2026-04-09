import React from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useOverlayStore, type OverlayKey } from '../../../../store/overlayStore';
import type { OverlayRuntimeController } from '../controller/overlay-runtime-controller';

type UseSearchOverlayStoreRuntimeArgs = {
  overlayRuntimeController: OverlayRuntimeController;
};

type SearchOverlayStoreRuntime = {
  activeOverlayKey: OverlayKey;
  rootOverlay: OverlayKey;
  isSearchOverlay: boolean;
  showBookmarksOverlay: boolean;
  showPollsOverlay: boolean;
  showProfileOverlay: boolean;
  registerTransientDismissor: (handler: () => void) => () => void;
  dismissTransientOverlays: () => void;
  ensureSearchOverlay: () => void;
};

export const useSearchOverlayStoreRuntime = ({
  overlayRuntimeController,
}: UseSearchOverlayStoreRuntimeArgs): SearchOverlayStoreRuntime => {
  const { activeOverlayKey, rootOverlay, registerTransientDismissor, dismissTransientOverlays } =
    useOverlayStore(
      useShallow((state) => ({
        activeOverlayKey: state.activeOverlayRoute.key,
        rootOverlay: (state.overlayRouteStack[0]?.key ??
          state.activeOverlayRoute.key) as OverlayKey,
        registerTransientDismissor: state.registerTransientDismissor,
        dismissTransientOverlays: state.dismissTransientOverlays,
      }))
    );
  const isSearchOverlay = rootOverlay === 'search';
  const showBookmarksOverlay = rootOverlay === 'bookmarks';
  const showPollsOverlay = rootOverlay === 'polls';
  const showProfileOverlay = rootOverlay === 'profile';

  const previousRootOverlayRef = React.useRef<OverlayKey | null>(null);
  React.useEffect(() => {
    const previous = previousRootOverlayRef.current;
    previousRootOverlayRef.current = rootOverlay;
    if (rootOverlay !== 'search') {
      return;
    }
    if (!previous || previous === 'search') {
      return;
    }
    overlayRuntimeController.restoreSearchRootEntry({
      snap: 'collapsed',
      clearTabSnapRequest: true,
    });
  }, [overlayRuntimeController, rootOverlay]);

  const ensureSearchOverlay = React.useCallback(() => {
    overlayRuntimeController.ensureSearchOverlay();
  }, [overlayRuntimeController]);

  return React.useMemo(
    () => ({
      activeOverlayKey,
      rootOverlay,
      isSearchOverlay,
      showBookmarksOverlay,
      showPollsOverlay,
      showProfileOverlay,
      registerTransientDismissor,
      dismissTransientOverlays,
      ensureSearchOverlay,
    }),
    [
      activeOverlayKey,
      dismissTransientOverlays,
      ensureSearchOverlay,
      isSearchOverlay,
      registerTransientDismissor,
      rootOverlay,
      showBookmarksOverlay,
      showPollsOverlay,
      showProfileOverlay,
    ]
  );
};
