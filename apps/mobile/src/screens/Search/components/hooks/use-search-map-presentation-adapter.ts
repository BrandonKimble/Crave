import { type SearchMapRenderInteractionMode } from '../../runtime/map/search-map-render-controller';
import type { PresentationLaneState } from '../../runtime/controller/presentation-transition-controller';
import {
  type SearchRuntimeBus,
  type SearchRuntimeMapPresentationPhase,
} from '../../runtime/shared/search-runtime-bus';
import { useSearchRuntimeBusSelector } from '../../runtime/shared/use-search-runtime-bus-selector';

export type SearchMapNativePresentationBatchPhase = SearchRuntimeMapPresentationPhase;

export type SearchMapNativePresentationState = {
  lane: PresentationLaneState;
  loadingMode: string;
  selectedRestaurantId: string | null;
  allowEmptyReveal: boolean;
  batchPhase: SearchMapNativePresentationBatchPhase;
};

export const useSearchMapPresentationAdapter = ({
  searchRuntimeBus,
  selectedRestaurantId,
  disableMarkers,
}: {
  searchRuntimeBus: SearchRuntimeBus;
  selectedRestaurantId: string | null;
  disableMarkers: boolean;
}): {
  nativePresentationState: SearchMapNativePresentationState;
  nativeInteractionMode: SearchMapRenderInteractionMode;
  labelResetRequestKey: string | null;
} => {
  const {
    presentationLane,
    presentationTransitionLoadingMode,
    mapPresentationPhase,
    allowEmptyReveal,
  } = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      presentationLane: state.presentationLane,
      presentationTransitionLoadingMode: state.presentationTransitionLoadingMode,
      mapPresentationPhase: state.mapPresentationPhase,
      allowEmptyReveal:
        (state.results?.restaurants?.length ?? 0) + (state.results?.dishes?.length ?? 0) === 0 &&
        state.precomputedMarkerPrimaryCount === 0 &&
        (state.precomputedMarkerCatalog?.length ?? 0) === 0,
    }),
    (left, right) =>
      left.presentationLane === right.presentationLane &&
      left.presentationTransitionLoadingMode === right.presentationTransitionLoadingMode &&
      left.mapPresentationPhase === right.mapPresentationPhase &&
      left.allowEmptyReveal === right.allowEmptyReveal,
    [
      'presentationLane',
      'presentationTransitionLoadingMode',
      'mapPresentationPhase',
      'results',
      'precomputedMarkerPrimaryCount',
      'precomputedMarkerCatalog',
    ] as const
  );

  const batchPhase: SearchMapNativePresentationBatchPhase = mapPresentationPhase;

  return {
    nativePresentationState: {
      lane: presentationLane,
      loadingMode: presentationTransitionLoadingMode,
      selectedRestaurantId,
      allowEmptyReveal,
      batchPhase,
    },
    // Dismiss is presentation-only. It should fade the current live baseline without
    // mutating interaction source families through the separate interaction-mode path.
    nativeInteractionMode: disableMarkers ? 'suppressed' : 'enabled',
    labelResetRequestKey: presentationLane?.kind === 'reveal' ? presentationLane.requestKey : null,
  };
};
