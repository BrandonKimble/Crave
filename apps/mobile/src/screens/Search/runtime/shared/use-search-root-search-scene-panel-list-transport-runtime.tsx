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
      removeClippedSubviews:
        resolvedInputFlashListRuntimeProps?.removeClippedSubviews ?? false,
      overrideProps: {
        ...(resolvedInputFlashListRuntimeProps?.overrideProps ?? {}),
      },
    }),
    [
      getResultItemType,
      overrideItemLayout,
      resolvedInputFlashListRuntimeProps,
    ]
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
