import type { SearchMapRenderHostAuthority } from './search-root-host-authority-contract';
import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';
import type {
  SearchRootAutocompleteControlLane,
  SearchRootMapProfileControlLane,
  SearchRootProfilePresentationControlLane,
  SearchRootResultsPresentationControlLane,
  SearchRootResultsPresentationStateControlLane,
  SearchRootSuggestionInteractionControlLane,
} from './use-search-root-control-plane-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootMapViewportIntentRuntime } from './search-root-map-viewport-intent-runtime-contract';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';
import { useSearchRootMapHostPublicationAuthorityRuntime } from './use-search-root-map-host-publication-authority-runtime';
import { useSearchRootMapHostPublicationInteractionRuntime } from './use-search-root-map-host-publication-interaction-runtime';
import { useSearchRootMapHostPublicationSurfaceRuntime } from './use-search-root-map-host-publication-surface-runtime';

type UseSearchRootMapHostPublicationRuntimeArgs = {
  appEntryPlaneRuntime: ReturnType<typeof useSearchScreenAppEntryPlaneRuntime>;
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  mapViewportIntentRuntime: SearchRootMapViewportIntentRuntime;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  autocompleteControlLane: SearchRootAutocompleteControlLane;
  suggestionInteractionControlLane: SearchRootSuggestionInteractionControlLane;
  profilePresentationControlLane: SearchRootProfilePresentationControlLane;
  mapProfileControlLane: SearchRootMapProfileControlLane;
  resultsPresentationStateControlLane: SearchRootResultsPresentationStateControlLane;
  resultsPresentationControlLane: SearchRootResultsPresentationControlLane;
};

export const useSearchRootMapHostPublicationRuntime = ({
  appEntryPlaneRuntime,
  sessionCoreLane,
  stateFoundationLane,
  mapViewportIntentRuntime,
  rootOverlayFoundationRuntime,
  autocompleteControlLane,
  suggestionInteractionControlLane,
  profilePresentationControlLane,
  mapProfileControlLane,
  resultsPresentationStateControlLane,
  resultsPresentationControlLane,
}: UseSearchRootMapHostPublicationRuntimeArgs): SearchMapRenderHostAuthority => {
  const mapInteractionBridgeRuntime =
    useSearchRootMapHostPublicationInteractionRuntime({
      sessionCoreLane,
      stateFoundationLane,
      rootOverlayFoundationRuntime,
      autocompleteControlLane,
      suggestionInteractionControlLane,
      profilePresentationControlLane,
      resultsPresentationStateControlLane,
    });

  const hostLayerRuntime = useSearchRootMapHostPublicationSurfaceRuntime({
    appEntryPlaneRuntime,
    sessionCoreLane,
    stateFoundationLane,
    mapViewportIntentRuntime,
    rootOverlayFoundationRuntime,
    mapProfileControlLane,
    resultsPresentationControlLane,
    mapInteractionBridgeRuntime,
  });

  return useSearchRootMapHostPublicationAuthorityRuntime({
    hostLayerRuntime,
  });
};
