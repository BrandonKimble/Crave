import React from 'react';

import { useProfileOwner, type ProfileOwner } from '../profile/profile-owner-runtime';
import { useSearchFilterModalRuntime } from './use-search-filter-modal-runtime';
import { useSearchForegroundInteractionRuntime } from './use-search-foreground-interaction-runtime';
import { useSearchSuggestionInteractionRuntime } from './use-search-suggestion-interaction-runtime';
import useSearchSubmitOwner from '../../hooks/use-search-submit-owner';

export type UseSearchSessionActionRuntimeArgs = {
  suggestionInteractionArgs: Parameters<typeof useSearchSuggestionInteractionRuntime>[0];
  profileOwnerArgs: Omit<Parameters<typeof useProfileOwner>[0], 'appExecutionArgs'> & {
    appExecutionArgs: Omit<
      Parameters<typeof useProfileOwner>[0]['appExecutionArgs'],
      'foregroundExecutionArgs'
    > & {
      foregroundExecutionArgs: Omit<
        Parameters<typeof useProfileOwner>[0]['appExecutionArgs']['foregroundExecutionArgs'],
        'dismissSearchInteractionUi'
      >;
    };
  };
  profilePresentationActiveRef: React.MutableRefObject<boolean>;
  closeRestaurantProfileRef: React.MutableRefObject<
    (options?: { dismissBehavior?: 'restore' | 'clear'; clearSearchOnDismiss?: boolean }) => void
  >;
  resetRestaurantProfileFocusSessionRef: React.MutableRefObject<() => void>;
  filterModalArgs: Omit<Parameters<typeof useSearchFilterModalRuntime>[0], 'rerunActiveSearch'>;
  foregroundInteractionArgs: Omit<
    Parameters<typeof useSearchForegroundInteractionRuntime>[0],
    | 'submitRuntime'
    | 'profilePresentationActive'
    | 'openRestaurantProfilePreview'
    | 'closeRestaurantProfile'
    | 'dismissSearchKeyboard'
  >;
};

export type SearchSessionProfileOwnerRuntime = {
  suggestionInteractionRuntime: ReturnType<typeof useSearchSuggestionInteractionRuntime>;
  profileOwner: ProfileOwner;
  stableOpenRestaurantProfileFromResults: ProfileOwner['profileActions']['openRestaurantProfileFromResults'];
};

export type SearchSessionSubmitRuntime = {
  submitRuntimeResult: ReturnType<typeof useSearchSubmitOwner>;
};

export type SearchSessionFilterRuntime = {
  filterModalRuntime: ReturnType<typeof useSearchFilterModalRuntime>;
};

export type SearchSessionSubmitFilterRuntime = SearchSessionSubmitRuntime &
  SearchSessionFilterRuntime;

export type SearchSessionForegroundRuntime = {
  foregroundInteractionRuntime: ReturnType<typeof useSearchForegroundInteractionRuntime>;
};

export type SearchSessionActionRuntime = SearchSessionProfileOwnerRuntime &
  SearchSessionSubmitFilterRuntime &
  SearchSessionForegroundRuntime;
