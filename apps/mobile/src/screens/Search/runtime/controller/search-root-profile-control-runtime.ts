import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';
import type {
  SearchRootMapProfileControlLane,
  SearchRootProfilePresentationControlLane,
  SearchRootSuggestionInteractionControlLane,
} from '../shared/use-search-root-control-plane-runtime-contract';

export type SearchRootProfileControlRuntimeValue = {
  profileOwner: ProfileOwner;
  suggestionInteractionControlLane: SearchRootSuggestionInteractionControlLane;
  profilePresentationControlLane: SearchRootProfilePresentationControlLane;
  mapProfileControlLane: SearchRootMapProfileControlLane;
};

export const createSearchRootProfileControlRuntimeValue = ({
  profileOwner,
  suggestionInteractionControlLane,
  profilePresentationControlLane,
  mapProfileControlLane,
}: SearchRootProfileControlRuntimeValue): SearchRootProfileControlRuntimeValue => ({
  profileOwner,
  suggestionInteractionControlLane,
  profilePresentationControlLane,
  mapProfileControlLane,
});
