import React from 'react';
import { Pressable, View } from 'react-native';
import type { FlashListProps } from '@shopify/flash-list';

import { Text } from '../../../../components';
import { colors as themeColors } from '../../../../constants/theme';
import type { FoodResult, RestaurantResult } from '../../../../types';
import { logger } from '../../../../utils';
import styles from '../../styles';
import type { ResultsListItem } from './list-read-model-builder';

type SearchResultsListRenderItemRuntimeArgs = {
  renderDishCard: (item: FoodResult, index: number) => React.ReactElement | null;
  renderRestaurantCard: (
    item: RestaurantResult,
    index: number
  ) => React.ReactElement | null;
  handleShowMoreExactDishes: () => void;
  handleShowMoreExactRestaurants: () => void;
};

export const useSearchResultsListRenderItemRuntime = ({
  renderDishCard,
  renderRestaurantCard,
  handleShowMoreExactDishes,
  handleShowMoreExactRestaurants,
}: SearchResultsListRenderItemRuntimeArgs) =>
  React.useCallback<NonNullable<FlashListProps<ResultsListItem>['renderItem']>>(
    ({ item, index }) => {
      if (item === undefined || item === null) {
        logger.error('FlashList renderItem received nullish item', { index });
        return null;
      }

      if (item && typeof item === 'object' && 'kind' in item) {
        if (item.kind === 'section') {
          return (
            <View style={[styles.resultItem, index === 0 && styles.firstResultItem]}>
              <Text style={[styles.resultMetaText, { color: themeColors.textMuted }]}>
                {item.label}
              </Text>
            </View>
          );
        }

        if (item.kind === 'show_more_exact') {
          const onPress =
            item.tab === 'dishes' ? handleShowMoreExactDishes : handleShowMoreExactRestaurants;
          const label =
            item.hiddenCount === 1
              ? 'Show 1 more exact match'
              : `Show ${item.hiddenCount} more exact matches`;
          return (
            <Pressable
              onPress={onPress}
              style={[styles.resultItem, index === 0 && styles.firstResultItem]}
            >
              <Text style={[styles.resultMetaText, { color: themeColors.secondaryAccent }]}>
                {label}
              </Text>
            </Pressable>
          );
        }
      }

      return 'foodId' in item
        ? renderDishCard(item as FoodResult, index)
        : renderRestaurantCard(item as RestaurantResult, index);
    },
    [
      handleShowMoreExactDishes,
      handleShowMoreExactRestaurants,
      renderDishCard,
      renderRestaurantCard,
    ]
  );
