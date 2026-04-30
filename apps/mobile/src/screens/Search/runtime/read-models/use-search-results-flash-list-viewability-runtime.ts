import React from 'react';
import type { FlashListProps } from '@shopify/flash-list';

import type { ResultsListItem } from './list-read-model-builder';

const VIEWABILITY_LOG_INTERVAL_MS = 250;

type SearchResultsFlashListViewabilityRuntimeArgs = {
  shouldLogResultsViewability: boolean;
  activeSafeResultsCount: number;
  searchInteractionRef: React.MutableRefObject<{ isResultsListScrolling: boolean }>;
};

export const useSearchResultsFlashListViewabilityRuntime = ({
  shouldLogResultsViewability,
  activeSafeResultsCount,
  searchInteractionRef,
}: SearchResultsFlashListViewabilityRuntimeArgs) => {
  const lastResultsViewabilityLogRef = React.useRef(0);
  const resultsViewabilityConfig = React.useMemo(
    () => ({ itemVisiblePercentThreshold: 1, minimumViewTime: 16 }),
    []
  );
  const onViewableItemsChanged = React.useCallback<
    NonNullable<FlashListProps<ResultsListItem>['onViewableItemsChanged']>
  >(
    (info) => {
      if (!shouldLogResultsViewability || activeSafeResultsCount === 0) {
        return;
      }
      const viewableCount = info.viewableItems.filter((token) => token.isViewable).length;
      if (viewableCount > 0 || !searchInteractionRef.current.isResultsListScrolling) {
        return;
      }
      const now = Date.now();
      if (now - lastResultsViewabilityLogRef.current < VIEWABILITY_LOG_INTERVAL_MS) {
        return;
      }
      lastResultsViewabilityLogRef.current = now;
    },
    [activeSafeResultsCount, searchInteractionRef, shouldLogResultsViewability]
  );

  return React.useMemo(
    () =>
      shouldLogResultsViewability
        ? {
            onViewableItemsChanged,
            viewabilityConfig: resultsViewabilityConfig,
          }
        : null,
    [onViewableItemsChanged, resultsViewabilityConfig, shouldLogResultsViewability]
  );
};
