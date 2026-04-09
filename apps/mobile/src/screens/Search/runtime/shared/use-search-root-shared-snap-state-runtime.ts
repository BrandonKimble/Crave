import { useShallow } from 'zustand/react/shallow';

import { useOverlaySheetPositionStore } from '../../../../overlays/useOverlaySheetPositionStore';
import type { SearchRootSharedSnapState } from './use-search-root-session-runtime-contract';

export const useSearchRootSharedSnapStateRuntime = (): SearchRootSharedSnapState => {
  return useOverlaySheetPositionStore(
    useShallow((state) => ({
      hasUserSharedSnap: state.hasUserSharedSnap,
      sharedSnap: state.sharedSnap,
    }))
  );
};
