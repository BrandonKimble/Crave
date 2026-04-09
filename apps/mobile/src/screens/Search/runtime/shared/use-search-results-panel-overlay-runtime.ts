import React from 'react';

import { useOverlayStore } from '../../../../store/overlayStore';

export type SearchResultsPanelOverlayRuntime = {
  activeOverlayKey: string | null;
};

export const useSearchResultsPanelOverlayRuntime = (): SearchResultsPanelOverlayRuntime => {
  const activeOverlayKey = useOverlayStore((state) => state.activeOverlayRoute.key);

  return React.useMemo(
    () => ({
      activeOverlayKey,
    }),
    [activeOverlayKey]
  );
};
