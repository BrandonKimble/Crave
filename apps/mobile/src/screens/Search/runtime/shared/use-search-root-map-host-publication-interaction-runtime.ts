import { useSearchRootMapInteractionRuntime } from './use-search-root-map-interaction-runtime';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './search-root-foundation-runtime';
import type {
  SearchRootAutocompleteControlLane,
  SearchRootProfilePresentationControlLane,
  SearchRootSuggestionInteractionControlLane,
} from './search-root-control-plane-runtime-contract';
import type { SearchRootSessionCoreLane } from './search-root-session-runtime-contract';

export const useSearchRootMapHostPublicationInteractionRuntime = ({
  sessionCoreLane,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  autocompleteControlLane,
  suggestionInteractionControlLane,
  profilePresentationControlLane,
}: {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  autocompleteControlLane: SearchRootAutocompleteControlLane;
  suggestionInteractionControlLane: SearchRootSuggestionInteractionControlLane;
  profilePresentationControlLane: SearchRootProfilePresentationControlLane;
}) =>
  useSearchRootMapInteractionRuntime({
    sessionCoreLane,
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    autocompleteControlLane,
    suggestionInteractionControlLane,
    profilePresentationControlLane,
    handleMapLoaded: sessionCoreLane.mapBootstrapRuntime.handleMapLoaded,
  });
