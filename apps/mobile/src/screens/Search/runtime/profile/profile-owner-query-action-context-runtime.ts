import React from 'react';
import { selectSubmittedQuery } from '../shared/search-desired-tuple-selectors';

import type { CreateProfileActionRuntimeArgs } from './profile-action-runtime-port-contract';
import type { ProfileSearchContext } from './profile-owner-runtime-contract';
import { getSearchMountedResultsDataSnapshot } from '../shared/search-mounted-results-data-store';
import { useSearchRuntimeBusSelector } from '../shared/use-search-runtime-bus-selector';

type UseProfileOwnerQueryActionContextRuntimeArgs = {
  searchContext: ProfileSearchContext;
};

export const useProfileOwnerQueryActionContextRuntime = ({
  searchContext,
}: UseProfileOwnerQueryActionContextRuntimeArgs): CreateProfileActionRuntimeArgs['queryState'] => {
  const { searchRuntimeBus } = searchContext;
  const results = getSearchMountedResultsDataSnapshot().results;
  const submittedQuery = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    selectSubmittedQuery,
    Object.is,
    ['desiredTuple'] as const
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
