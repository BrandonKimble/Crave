import type {
  SearchRootMapRenderHandlersPublicationArgsRuntime,
  UseSearchRootMapRenderHandlersPublicationArgsRuntimeArgs,
} from './search-root-map-render-publication-runtime-contract';

export const useSearchRootMapRenderHandlersPublicationArgsRuntime = ({
  rootSessionRuntime,
  rootScaffoldRuntime,
  requestLaneRuntime,
  mapRuntime,
  pendingMarkerOpenAnimationFrameRef,
}: UseSearchRootMapRenderHandlersPublicationArgsRuntimeArgs): SearchRootMapRenderHandlersPublicationArgsRuntime => {
  const {
    runtimeOwner: { mapQueryBudget },
    primitives: { getPerfNow },
  } = rootSessionRuntime;
  const {
    resultsSheetRuntimeLane: { mapGestureActiveRef, mapMotionPressureController },
    instrumentationRuntime: {
      emitRuntimeMechanismEvent,
      shouldLogSearchComputes,
      logSearchCompute,
      handleProfilerRender,
    },
  } = rootScaffoldRuntime;
  const {
    requestPresentationFlowRuntime: {
      requestPresentationRuntime: { resultsPresentationOwner },
    },
  } = requestLaneRuntime;

  return {
    rootRenderArgs: {
      mapArgs: {
        mapGestureActiveRef,
        mapMotionPressureController,
        shouldLogSearchComputes,
        getPerfNow,
        logSearchCompute,
        mapQueryBudget,
        pendingMarkerOpenAnimationFrameRef,
        onRuntimeMechanismEvent: emitRuntimeMechanismEvent,
        onPress: mapRuntime.onMapPress,
        onTouchStart: mapRuntime.handleMapTouchStart,
        onTouchEnd: mapRuntime.handleMapTouchEnd,
        onNativeViewportChanged: mapRuntime.onNativeViewportChanged,
        onMapIdle: mapRuntime.onMapIdle,
        onCameraAnimationComplete: mapRuntime.onCameraAnimationComplete,
        onMapLoaded: mapRuntime.onMapLoaded,
        onExecutionBatchMountedHidden: resultsPresentationOwner.handleExecutionBatchMountedHidden,
        onMarkerEnterStarted: resultsPresentationOwner.handleMarkerEnterStarted,
        onMarkerEnterSettled: resultsPresentationOwner.handleMarkerEnterSettled,
        onMarkerExitStarted: resultsPresentationOwner.handleMarkerExitStarted,
        onMarkerExitSettled: resultsPresentationOwner.handleMarkerExitSettled,
        onProfilerRender: handleProfilerRender,
      },
    },
  };
};
