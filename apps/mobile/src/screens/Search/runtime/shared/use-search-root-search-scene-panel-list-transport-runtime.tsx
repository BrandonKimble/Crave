import React from 'react';
import { View } from 'react-native';

import type { useSearchResultsReadModelSelectors } from '../read-models/read-model-selectors';
import styles from '../../styles';
import type { useSearchRootSearchSceneListItemTransportRuntime } from './use-search-root-search-scene-list-item-transport-runtime';

export const useSearchRootSearchScenePanelListTransportRuntime = ({
  flashListRuntimeProps,
  getResultItemType,
  overrideItemLayout,
}: {
  flashListRuntimeProps: ReturnType<
    typeof useSearchResultsReadModelSelectors
  >['flashListRuntimeProps'];
  getResultItemType: ReturnType<
    typeof useSearchRootSearchSceneListItemTransportRuntime
  >['getResultItemType'];
  overrideItemLayout: ReturnType<
    typeof useSearchRootSearchSceneListItemTransportRuntime
  >['overrideItemLayout'];
}) => {
  const resolvedInputFlashListRuntimeProps = flashListRuntimeProps as
    | {
        removeClippedSubviews?: boolean;
        overrideProps?: Record<string, unknown>;
      }
    | undefined;

  const resolvedFlashListProps = React.useMemo(
    () => ({
      ...resolvedInputFlashListRuntimeProps,
      getItemType: getResultItemType,
      overrideItemLayout: overrideItemLayout,
      removeClippedSubviews: resolvedInputFlashListRuntimeProps?.removeClippedSubviews ?? false,
      // The results feed RE-ORDERS across variant reruns (open-now/price/rising flips
      // swap the row set under a preserved sheet). FlashList 2.x ships MVCP ON by
      // default, which anchors a surviving row across the swap — an untoggle then
      // reveals pre-scrolled to wherever that row moved (owner-reproduced: cards 4–6
      // visible after every open-now untoggle). Same disease + fix as the polls feed:
      // a re-sortable feed disables MVCP; appends grow below the viewport and need no
      // anchoring.
      maintainVisibleContentPosition: { disabled: true },
      overrideProps: {
        ...(resolvedInputFlashListRuntimeProps?.overrideProps ?? {}),
      },
    }),
    [getResultItemType, overrideItemLayout, resolvedInputFlashListRuntimeProps]
  );
  const itemSeparatorComponent = React.useCallback(
    () => <View style={styles.resultItemSeparator} />,
    []
  );

  return React.useMemo(
    () => ({
      itemSeparatorComponent,
      resolvedFlashListProps,
    }),
    [itemSeparatorComponent, resolvedFlashListProps]
  );
};

export type SearchRootSearchScenePanelListTransportRuntime = ReturnType<
  typeof useSearchRootSearchScenePanelListTransportRuntime
>;
