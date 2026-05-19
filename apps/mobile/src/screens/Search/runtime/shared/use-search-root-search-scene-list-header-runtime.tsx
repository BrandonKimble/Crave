import React from 'react';
import { View } from 'react-native';

import SearchFilters from '../../components/SearchFilters';
import styles from '../../styles';
import type { useSearchRootSearchSceneChromeFreezeRuntime } from './use-search-root-search-scene-chrome-freeze-runtime';
import type { useSearchRootSearchSceneHeaderLayoutRuntime } from './use-search-root-search-scene-header-layout-runtime';

export const useSearchRootSearchSceneListHeaderRuntime = ({
  filtersHeaderRuntimeForReadModel,
  handleFiltersHeaderLayout,
}: {
  filtersHeaderRuntimeForReadModel: ReturnType<
    typeof useSearchRootSearchSceneChromeFreezeRuntime
  >['filtersHeaderRuntimeForReadModel'];
  handleFiltersHeaderLayout: ReturnType<
    typeof useSearchRootSearchSceneHeaderLayoutRuntime
  >['handleFiltersHeaderLayout'];
}) =>
  React.useMemo(
    () => (
      <View
        style={styles.resultsListHeader}
        onLayout={handleFiltersHeaderLayout}
      >
        <SearchFilters
          {...filtersHeaderRuntimeForReadModel}
          telemetryHostLayer="SearchMountedSceneBody"
          telemetryInSheetBody={true}
        />
        <View style={styles.resultsListHeaderBottomStrip} />
      </View>
    ),
    [filtersHeaderRuntimeForReadModel, handleFiltersHeaderLayout]
  );
