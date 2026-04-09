import { useProfileOwner } from '../profile/profile-owner-runtime';
import {
  type SearchSessionProfileOwnerRuntime,
  type UseSearchSessionActionRuntimeArgs,
} from './search-session-action-runtime-contract';
import { useSearchSuggestionInteractionRuntime } from './use-search-suggestion-interaction-runtime';

type UseSearchSessionProfileOwnerRuntimeArgs = Pick<
  UseSearchSessionActionRuntimeArgs,
  | 'suggestionInteractionArgs'
  | 'profileOwnerArgs'
  | 'profilePresentationActiveRef'
  | 'closeRestaurantProfileRef'
  | 'resetRestaurantProfileFocusSessionRef'
>;

export const useSearchSessionProfileOwnerRuntime = ({
  suggestionInteractionArgs,
  profileOwnerArgs,
  profilePresentationActiveRef,
  closeRestaurantProfileRef,
  resetRestaurantProfileFocusSessionRef,
}: UseSearchSessionProfileOwnerRuntimeArgs): SearchSessionProfileOwnerRuntime => {
  const suggestionInteractionRuntime =
    useSearchSuggestionInteractionRuntime(suggestionInteractionArgs);
  const profileOwner = useProfileOwner({
    ...profileOwnerArgs,
    appExecutionArgs: {
      ...profileOwnerArgs.appExecutionArgs,
      foregroundExecutionArgs: {
        ...profileOwnerArgs.appExecutionArgs.foregroundExecutionArgs,
        dismissSearchInteractionUi: suggestionInteractionRuntime.dismissSearchInteractionUi,
      },
    },
  });
  const { profileViewState, profileActions } = profileOwner;
  const {
    openRestaurantProfileFromResults,
    resetRestaurantProfileFocusSession,
    closeRestaurantProfile,
  } = profileActions;

  profilePresentationActiveRef.current = profileViewState.presentation.isPresentationActive;
  closeRestaurantProfileRef.current = closeRestaurantProfile;
  resetRestaurantProfileFocusSessionRef.current = resetRestaurantProfileFocusSession;

  return {
    suggestionInteractionRuntime,
    profileOwner,
    stableOpenRestaurantProfileFromResults: openRestaurantProfileFromResults,
  };
};
