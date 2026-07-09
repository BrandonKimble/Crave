import React from 'react';
import { Pressable, View } from 'react-native';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';
import type { FlashListProps } from '@shopify/flash-list';

import { Text } from '../../../../components';
import { colors as themeColors } from '../../../../constants/theme';
import type { FoodResult, RestaurantResult } from '../../../../types';
import { logger } from '../../../../utils';
import styles from '../../styles';
import type { ResultsListItem, ResultsMountedRestaurantCardRow } from './list-read-model-builder';
import type { RestaurantResultCardDescriptor } from '../../components/restaurant-result-card-descriptor';
import { resultsRowsVisibleValue } from '../../runtime/shared/search-results-rows-visibility';

// Every results ROW rides the rows-visibility level (owner directive: loading covers are
// TRUE CUTOUTS — rows hide under the cover so its holes reach the hoisted frost). Opacity
// only: rows keep mounting/measuring, and the list HEADER (the toggle strip) is not a row,
// so it stays live through an interaction reload.
const ResultsRowLoadingVisibility: React.FC<React.PropsWithChildren> = ({ children }) => {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: resultsRowsVisibleValue.value,
  }));
  return <Reanimated.View style={animatedStyle}>{children}</Reanimated.View>;
};

type SearchResultsListRenderItemRuntimeArgs = {
  renderDishCard: (item: FoodResult, index: number) => React.ReactElement | null;
  renderRestaurantCard: (
    item: RestaurantResult,
    index: number,
    preparedDescriptor?: RestaurantResultCardDescriptor | null
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
      const wrapRow = (row: React.ReactElement | null): React.ReactElement | null =>
        row == null ? row : <ResultsRowLoadingVisibility>{row}</ResultsRowLoadingVisibility>;

      if (item && typeof item === 'object' && 'kind' in item) {
        if (item.kind === 'mounted_restaurant_card') {
          const mountedRestaurantRow = item as ResultsMountedRestaurantCardRow;
          return wrapRow(
            renderRestaurantCard(
              mountedRestaurantRow.restaurant,
              index,
              mountedRestaurantRow.preparedDescriptor
            )
          );
        }

        if (item.kind === 'section') {
          return wrapRow(
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
          return wrapRow(
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

      return wrapRow(
        'foodId' in item
          ? renderDishCard(item as FoodResult, index)
          : renderRestaurantCard(item as RestaurantResult, index)
      );
    },
    [
      handleShowMoreExactDishes,
      handleShowMoreExactRestaurants,
      renderDishCard,
      renderRestaurantCard,
    ]
  );
