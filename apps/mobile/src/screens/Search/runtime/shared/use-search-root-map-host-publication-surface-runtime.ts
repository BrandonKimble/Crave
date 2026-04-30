import { useSearchRootMapSurfacePublicationRuntime } from './use-search-root-map-surface-publication-runtime';
import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootMapViewportIntentRuntime } from './search-root-map-viewport-intent-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type {
  SearchRootMapProfileControlLane,
  SearchRootResultsPresentationControlLane,
} from './use-search-root-control-plane-runtime-contract';
import type { useSearchRootMapHostPublicationInteractionRuntime } from './use-search-root-map-host-publication-interaction-runtime';

export const useSearchRootMapHostPublicationSurfaceRuntime = ({
  appEntryPlaneRuntime,
  sessionCoreLane,
  stateFoundationLane,
  mapViewportIntentRuntime,
  rootOverlayFoundationRuntime,
  mapProfileControlLane,
  resultsPresentationControlLane,
  mapInteractionBridgeRuntime,
}: {
  appEntryPlaneRuntime: ReturnType<typeof useSearchScreenAppEntryPlaneRuntime>;
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  mapViewportIntentRuntime: SearchRootMapViewportIntentRuntime;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  mapProfileControlLane: SearchRootMapProfileControlLane;
  resultsPresentationControlLane: SearchRootResultsPresentationControlLane;
  mapInteractionBridgeRuntime: ReturnType<
    typeof useSearchRootMapHostPublicationInteractionRuntime
  >;
}) =>
  useSearchRootMapSurfacePublicationRuntime({
    appEntryPlaneRuntime,
    sessionCoreLane,
    stateFoundationLane,
    mapViewportIntentRuntime,
    rootOverlayFoundationRuntime,
    mapProfileControlLane,
    resultsPresentationControlLane,
    mapInteractionBridgeRuntime,
  });
