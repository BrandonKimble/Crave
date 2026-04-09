import React from 'react';

import type { CreateProfileActionRuntimeArgs } from './profile-action-runtime-port-contract';
import type { ProfileSearchContext } from './profile-owner-runtime-contract';
import { useSearchRuntimeBusSelector } from '../shared/use-search-runtime-bus-selector';

type UseProfileOwnerQueryActionContextRuntimeArgs = {
  searchContext: ProfileSearchContext;
};

export const useProfileOwnerQueryActionContextRuntime = ({
  searchContext,
}: UseProfileOwnerQueryActionContextRuntimeArgs): CreateProfileActionRuntimeArgs['queryState'] => {
  const { searchRuntimeBus } = searchContext;
  const results = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => state.results,
    Object.is,
    ['results'] as const
  );
  const submittedQuery = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => state.submittedQuery,
    Object.is,
    ['submittedQuery'] as const
  );
  const currentQueryKey = React.useMemo(
    () => (submittedQuery || searchContext.trimmedQuery).trim(),
    [submittedQuery, searchContext.trimmedQuery]
  );
  const currentQueryLabel = React.useMemo(
    () => (submittedQuery || searchContext.trimmedQuery || 'Search').trim(),
    [submittedQuery, searchContext.trimmedQuery]
  );

  return React.useMemo(
    () => ({
      currentQueryLabel,
      currentQueryKey,
      restaurantOnlyId: searchContext.restaurantOnlyId,
      results,
      isProfileAutoOpenSuppressed: searchContext.isProfileAutoOpenSuppressed,
    }),
    [
      currentQueryKey,
      currentQueryLabel,
      results,
      searchContext.isProfileAutoOpenSuppressed,
      searchContext.restaurantOnlyId,
    ]
  );
};
