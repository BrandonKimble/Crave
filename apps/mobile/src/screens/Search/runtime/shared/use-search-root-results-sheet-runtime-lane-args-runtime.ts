import { SCREEN_HEIGHT } from '../../constants/search';
import type {
  SearchRootResultsSheetRuntimeLaneArgsRuntime,
  UseSearchRootScaffoldLaneRuntimeArgs,
} from './use-search-root-scaffold-lane-runtime-contract';

type UseSearchRootResultsSheetRuntimeLaneArgsRuntimeArgs = Pick<
  UseSearchRootScaffoldLaneRuntimeArgs,
  'insets' | 'startupPollBounds' | 'mapRef' | 'rootSessionRuntime'
>;

export const useSearchRootResultsSheetRuntimeLaneArgsRuntime = ({
  insets,
  startupPollBounds,
  mapRef,
  rootSessionRuntime,
}: UseSearchRootResultsSheetRuntimeLaneArgsRuntimeArgs): SearchRootResultsSheetRuntimeLaneArgsRuntime => {
  const {
    runtimeOwner: { latestBoundsRef, viewportBoundsService },
    sharedSnapState: { hasUserSharedSnap, sharedSnap },
    primitives: {
      searchInteractionRef,
      anySheetDraggingRef,
      lastSearchBoundsCaptureSeqRef,
      lastVisibleSheetStateRef,
    },
    overlayCommandRuntime: {
      commandState: { pollsSheetSnap, isDockedPollsDismissed },
    },
  } = rootSessionRuntime;

  return {
    startupPollBounds,
    latestBoundsRef,
    viewportBoundsService,
    mapRef,
    searchInteractionRef,
    anySheetDraggingRef,
    lastSearchBoundsCaptureSeqRef,
    screenHeight: SCREEN_HEIGHT,
    insetsTop: insets.top,
    initialDockedPollsArgs: {
      pollsSheetSnap,
      isDockedPollsDismissed,
      hasUserSharedSnap,
      sharedSnap,
    },
    lastVisibleSheetStateRef,
  };
};
