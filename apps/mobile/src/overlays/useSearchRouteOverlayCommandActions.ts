import { useShallow } from 'zustand/react/shallow';

import { useSearchRouteOverlayCommandStore } from './searchRouteOverlayCommandStore';
import type { SearchRouteOverlayCommandActions } from './searchRouteOverlayCommandRuntimeContract';

export const useSearchRouteOverlayCommandActions = (): SearchRouteOverlayCommandActions =>
  useSearchRouteOverlayCommandStore(
    useShallow((state) => ({
      setPollsDockedSnapRequest: state.setPollsDockedSnapRequest,
      setTabOverlaySnapRequest: state.setTabOverlaySnapRequest,
      requestSearchHeaderActionFollowCollapse: state.requestSearchHeaderActionFollowCollapse,
      setPollsHeaderActionAnimationToken: state.setPollsHeaderActionAnimationToken,
      setPollsSheetSnap: state.setPollsSheetSnap,
      setIsDockedPollsDismissed: state.setIsDockedPollsDismissed,
      setDockedPollsRestoreInFlight: state.setDockedPollsRestoreInFlight,
      setIgnoreDockedPollsHiddenUntilMs: state.setIgnoreDockedPollsHiddenUntilMs,
      setBookmarksSheetSnap: state.setBookmarksSheetSnap,
      setProfileSheetSnap: state.setProfileSheetSnap,
      setSaveSheetState: state.setSaveSheetState,
      setSaveSheetSnap: state.setSaveSheetSnap,
      setPollCreationSnapRequest: state.setPollCreationSnapRequest,
      setPollsPanelParams: state.setPollsPanelParams,
    }))
  );
