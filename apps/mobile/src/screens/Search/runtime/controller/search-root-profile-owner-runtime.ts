import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';
import type {
  SearchRootRestaurantSelectionModel,
  SuggestionInteractionRuntime,
} from '../shared/use-search-root-control-plane-runtime-contract';

export type SearchRootProfileOwnerRuntimeValue = {
  profileOwner: ProfileOwner;
  restaurantSelectionModel: Pick<
    SearchRootRestaurantSelectionModel,
    | 'resolveRestaurantMapLocations'
    | 'resolveRestaurantLocationSelectionAnchor'
    | 'pickPreferredRestaurantMapLocation'
  >;
  pendingMarkerOpenAnimationFrameRef: React.MutableRefObject<number | null>;
  suggestionInteractionRuntime: SuggestionInteractionRuntime;
};

export const createSearchRootProfileOwnerRuntimeValue = ({
  profileOwner,
  restaurantSelectionModel,
  pendingMarkerOpenAnimationFrameRef,
  suggestionInteractionRuntime,
}: SearchRootProfileOwnerRuntimeValue): SearchRootProfileOwnerRuntimeValue => ({
  profileOwner,
  restaurantSelectionModel,
  pendingMarkerOpenAnimationFrameRef,
  suggestionInteractionRuntime,
});
