import type { SearchRootMapInteractionArgsRuntime } from './use-search-root-map-display-runtime-contract';
import type { UseSearchRootMapDisplayRuntimeArgs } from './use-search-root-map-display-runtime-contract';

export type SearchRootMapScaffoldInteractionArgsRuntime = {
  interactionArgs: Pick<
    SearchRootMapInteractionArgsRuntime['interactionArgs'],
    | 'shouldLogMapEventRates'
    | 'mapEventLogIntervalMs'
    | 'shouldLogSearchStateChanges'
    | 'mapGestureActiveRef'
    | 'shouldRenderResultsSheetRef'
    | 'mapMotionPressureController'
    | 'cancelPendingMapMovementUpdates'
    | 'markMapMovedIfNeeded'
    | 'scheduleMapIdleEnter'
    | 'sheetState'
    | 'isSearchOverlay'
    | 'animateSheetTo'
    | 'shouldShowPollsSheet'
    | 'schedulePollBoundsUpdate'
  >;
};

export const useSearchRootMapScaffoldInteractionArgsRuntime = ({
  rootScaffoldRuntime,
}: Pick<
  UseSearchRootMapDisplayRuntimeArgs,
  'rootScaffoldRuntime'
>): SearchRootMapScaffoldInteractionArgsRuntime => {
  const {
    overlaySessionRuntime: { isSearchOverlay, shouldShowPollsSheet },
    resultsSheetRuntimeLane: {
      mapGestureActiveRef,
      cancelPendingMapMovementUpdates,
      markMapMovedIfNeeded,
      scheduleMapIdleEnter,
      schedulePollBoundsUpdate,
      mapMotionPressureController,
    },
    resultsSheetRuntimeOwner,
    instrumentationRuntime: {
      shouldLogMapEventRates,
      mapEventLogIntervalMs,
      shouldLogSearchStateChanges,
    },
  } = rootScaffoldRuntime;

  return {
    interactionArgs: {
      shouldLogMapEventRates,
      mapEventLogIntervalMs,
      shouldLogSearchStateChanges,
      mapGestureActiveRef,
      shouldRenderResultsSheetRef: resultsSheetRuntimeOwner.shouldRenderResultsSheetRef,
      mapMotionPressureController,
      cancelPendingMapMovementUpdates,
      markMapMovedIfNeeded,
      scheduleMapIdleEnter,
      sheetState: resultsSheetRuntimeOwner.sheetState,
      isSearchOverlay,
      animateSheetTo: resultsSheetRuntimeOwner.animateSheetTo,
      shouldShowPollsSheet,
      schedulePollBoundsUpdate,
    },
  };
};
