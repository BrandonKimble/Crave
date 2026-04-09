import React from 'react';
import { View } from 'react-native';
import type { FlashListProps } from '@shopify/flash-list';

import type { ResultsListItem } from '../read-models/read-model-selectors';
import type { SearchResultsPanelChromeRuntime } from './use-search-results-panel-chrome-runtime';
import type { SearchResultsPanelDataRuntime } from './search-results-panel-data-runtime-contract';
import type { SearchResultsPanelListSelectorsRuntime } from './use-search-results-panel-list-selectors-runtime';
import styles from '../../styles';

type UseSearchResultsPanelListLayoutRuntimeArgs = Pick<SearchResultsPanelDataRuntime, 'activeTab'> &
  Pick<SearchResultsPanelChromeRuntime, 'shouldUsePlaceholderRows'> &
  SearchResultsPanelListSelectorsRuntime;

export type SearchResultsPanelListLayoutRuntime = {
  resultsRenderItem: NonNullable<FlashListProps<ResultsListItem>['renderItem']>;
  resultsKeyExtractor: (item: ResultsListItem, index: number) => string;
  estimatedItemSize: number;
  getResultItemType: (item: ResultsListItem) => string;
  overrideItemLayout: (layout: { size?: number; span?: number }, item: ResultsListItem) => void;
};

export const useSearchResultsPanelListLayoutRuntime = ({
  activeTab,
  shouldUsePlaceholderRows,
  resultsReadModelSelectors,
}: UseSearchResultsPanelListLayoutRuntimeArgs): SearchResultsPanelListLayoutRuntime => {
  const resultsKeyExtractor = React.useCallback((item: ResultsListItem, index: number) => {
    if (item && typeof item === 'object' && 'kind' in item) {
      return item.key || `row-${index}`;
    }
    if (item && 'foodId' in item) {
      if (item.connectionId) {
        return item.connectionId;
      }
      if (item.foodId && item.restaurantId) {
        return `${item.foodId}-${item.restaurantId}`;
      }
      return `dish-${index}`;
    }
    if (item && 'restaurantId' in item) {
      return item.restaurantId || `restaurant-${index}`;
    }
    return `result-${index}`;
  }, []);

  const estimatedItemSize = activeTab === 'dishes' ? 240 : 270;
  const placeholderItemStyle = React.useMemo(
    () => ({ minHeight: estimatedItemSize }),
    [estimatedItemSize]
  );
  const renderPlaceholderItem = React.useCallback(
    (index: number) => (
      <View
        style={[styles.resultItem, index === 0 && styles.firstResultItem, placeholderItemStyle]}
      />
    ),
    [placeholderItemStyle]
  );
  const getResultItemType = React.useCallback((item: ResultsListItem) => {
    if (item && typeof item === 'object' && 'kind' in item) {
      return item.kind;
    }
    return 'foodId' in item ? 'dish' : 'restaurant';
  }, []);
  const overrideItemLayout = React.useCallback(
    (layout: { size?: number; span?: number }, item: ResultsListItem) => {
      if (item && typeof item === 'object' && 'kind' in item) {
        layout.size = item.kind === 'section' ? 44 : 88;
        return;
      }
      layout.size = 'foodId' in item ? 240 : 270;
    },
    []
  );
  const renderPlaceholderFlashListItem = React.useCallback<
    NonNullable<FlashListProps<ResultsListItem>['renderItem']>
  >(({ index }) => renderPlaceholderItem(index), [renderPlaceholderItem]);
  const resultsRenderItem = shouldUsePlaceholderRows
    ? renderPlaceholderFlashListItem
    : resultsReadModelSelectors.renderListItem;

  return React.useMemo(
    () => ({
      resultsRenderItem,
      resultsKeyExtractor,
      estimatedItemSize,
      getResultItemType,
      overrideItemLayout,
    }),
    [
      estimatedItemSize,
      getResultItemType,
      overrideItemLayout,
      resultsKeyExtractor,
      resultsRenderItem,
    ]
  );
};
