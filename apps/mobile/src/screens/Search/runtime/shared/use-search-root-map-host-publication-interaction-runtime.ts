import { useSearchRootMapInteractionRuntime } from './use-search-root-map-interaction-runtime';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type {
  SearchRootAutocompleteControlLane,
  SearchRootProfilePresentationControlLane,
  SearchRootResultsPresentationStateControlLane,
  SearchRootSuggestionInteractionControlLane,
} from './use-search-root-control-plane-runtime-contract';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';

export const useSearchRootMapHostPublicationInteractionRuntime = ({
  sessionCoreLane,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  autocompleteControlLane,
  suggestionInteractionControlLane,
  profilePresentationControlLane,
  resultsPresentationStateControlLane,
}: {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  autocompleteControlLane: SearchRootAutocompleteControlLane;
  suggestionInteractionControlLane: SearchRootSuggestionInteractionControlLane;
  profilePresentationControlLane: SearchRootProfilePresentationControlLane;
  resultsPresentationStateControlLane: SearchRootResultsPresentationStateControlLane;
}) =>
  useSearchRootMapInteractionRuntime({
    sessionCoreLane,
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    autocompleteControlLane,
    suggestionInteractionControlLane,
    profilePresentationControlLane,
    resultsPresentationStateControlLane,
    handleMapLoaded: sessionCoreLane.mapBootstrapRuntime.handleMapLoaded,
  });
