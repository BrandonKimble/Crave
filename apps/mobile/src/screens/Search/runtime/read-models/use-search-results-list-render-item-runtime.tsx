import React from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import type { FlashListProps } from '@shopify/flash-list';

import { Text } from '../../../../components';
import { SceneLoadingSurface } from '../../../../components/skeletons';
import { colors as themeColors } from '../../../../constants/theme';
import type { FoodResult, RestaurantResult } from '../../../../types';
import { markRevealCommitRowRender } from '../../../../perf/reveal-commit-attribution';
import { SEARCH_RESULTS_BANDS } from '../shared/search-results-page-bands';
import { logger } from '../../../../utils';
import styles from '../../styles';
import type { ResultsListItem, ResultsMountedRestaurantCardRow } from './list-read-model-builder';
import type { RestaurantResultCardDescriptor } from '../../components/restaurant-result-card-descriptor';

// THE PENDING BLOCK CELL (skeleton-sheet law §1 + §4, pending-block arc 2026-07-18):
// while a redraw episode is live the list's ONLY item is this full-viewport cutout
// block, so the sheet drags and the list scrolls normally over the pending face and
// the reveal is a plain data swap. Height = one window (THE LENGTH LAW: fills the
// sheet at the highest snap, bounded scroll, no repeat). The old pinned overlay
// cover + the rows-visibility level died with this — there are no stale rows in the
// tree to hide. TRUE CUTOUTS (frost pass 2026-07-23): nothing opaque paints behind the
// pending face (probe-proven — the sheet's white layers are episode-gated off), so the
// block's plate is THE white and its holes are real windows onto the blurred live map.
const ResultsPendingBlockCell = React.memo(({ rowType }: { rowType: 'restaurant' | 'dish' }) => {
  const { height: windowHeight } = useWindowDimensions();
  const band = rowType === 'dish' ? SEARCH_RESULTS_BANDS.dishes : SEARCH_RESULTS_BANDS.restaurants;
  return (
    <View pointerEvents="none" style={{ height: windowHeight, overflow: 'hidden' }}>
      <SceneLoadingSurface rowType={rowType} count={band.placeholder.count} />
    </View>
  );
});
ResultsPendingBlockCell.displayName = 'ResultsPendingBlockCell';

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
      // [RevealCommit] timeline: inert unless the reveal-commit span is open.
      markRevealCommitRowRender(String(index));
      if (item && typeof item === 'object' && 'kind' in item) {
        if (item.kind === 'results_pending_block') {
          return <ResultsPendingBlockCell rowType={item.rowType} />;
        }

        if (item.kind === 'mounted_restaurant_card') {
          const mountedRestaurantRow = item as ResultsMountedRestaurantCardRow;
          return renderRestaurantCard(
            mountedRestaurantRow.restaurant,
            index,
            mountedRestaurantRow.preparedDescriptor
          );
        }

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
