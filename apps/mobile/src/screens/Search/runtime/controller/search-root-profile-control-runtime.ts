import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';
import type {
  SearchRootMapProfileControlLane,
  SearchRootProfilePresentationControlLane,
  SearchRootSuggestionInteractionControlLane,
} from '../shared/search-root-control-plane-runtime-contract';

export type SearchRootProfileControlRuntimeValue = {
  profileOwner: ProfileOwner;
  suggestionInteractionControlLane: SearchRootSuggestionInteractionControlLane;
  profilePresentationControlLane: SearchRootProfilePresentationControlLane;
  mapProfileControlLane: SearchRootMapProfileControlLane;
};
