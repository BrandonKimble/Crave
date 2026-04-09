import { useShallow } from 'zustand/react/shallow';

import { useSearchRouteOverlayCommandStore } from './searchRouteOverlayCommandStore';
import type { SearchRouteOverlayCommandState } from './searchRouteOverlayCommandRuntimeContract';

export const useSearchRouteOverlayCommandState = (): SearchRouteOverlayCommandState =>
  useSearchRouteOverlayCommandStore(
    useShallow((state) => ({
      searchHeaderActionResetToken: state.searchHeaderActionResetToken,
      pollsHeaderActionAnimationToken: state.pollsHeaderActionAnimationToken,
      pollsDockedSnapRequest: state.pollsDockedSnapRequest,
      tabOverlaySnapRequest: state.tabOverlaySnapRequest,
      pollsSheetSnap: state.pollsSheetSnap,
      isDockedPollsDismissed: state.isDockedPollsDismissed,
      isNavRestorePending: state.isNavRestorePending,
      overlaySwitchInFlight: state.overlaySwitchInFlight,
      dockedPollsRestoreInFlight: state.dockedPollsRestoreInFlight,
      ignoreDockedPollsHiddenUntilMs: state.ignoreDockedPollsHiddenUntilMs,
      bookmarksSheetSnap: state.bookmarksSheetSnap,
      profileSheetSnap: state.profileSheetSnap,
      saveSheetState: state.saveSheetState,
      saveSheetSnap: state.saveSheetSnap,
      pollCreationSnapRequest: state.pollCreationSnapRequest,
    }))
  );
