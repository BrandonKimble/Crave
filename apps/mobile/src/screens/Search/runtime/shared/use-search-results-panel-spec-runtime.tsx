import React from 'react';
import { View } from 'react-native';

import { RESULTS_BOTTOM_PADDING } from '../../constants/search';
import { useSearchPanelSpec } from '../../../../overlays/panels/SearchPanel';
import type { UseSearchResultsRoutePublicationArgs } from './search-results-panel-runtime-contract';
import type { SearchResultsPanelCoveredRenderRuntime } from './use-search-results-panel-covered-render-runtime';
import type { SearchResultsPanelReadModelRuntime } from './use-search-results-panel-read-model-runtime';
import type { SearchResultsPanelSurfaceBackgroundRuntime } from './use-search-results-panel-surface-background-runtime';
import type { SearchResultsPanelSurfaceOverlayRuntime } from './use-search-results-panel-surface-overlay-runtime';
import type { SearchResultsPanelSurfaceStateRuntime } from './use-search-results-panel-surface-state-runtime';
import styles from '../../styles';

type UseSearchResultsPanelSpecRuntimeArgs = Pick<
  UseSearchResultsRoutePublicationArgs,
  'resultsSheetRuntime' | 'resultsSheetInteractionModel' | 'resultsPanelVisualRuntimeModel'
> & {
  readModelRuntime: SearchResultsPanelReadModelRuntime;
  coveredRenderRuntime: SearchResultsPanelCoveredRenderRuntime;
  surfaceStateRuntime: SearchResultsPanelSurfaceStateRuntime;
  surfaceBackgroundRuntime: SearchResultsPanelSurfaceBackgroundRuntime;
  surfaceOverlayRuntime: SearchResultsPanelSurfaceOverlayRuntime;
};

export const useSearchResultsPanelSpecRuntime = ({
  resultsSheetRuntime,
  resultsSheetInteractionModel,
  resultsPanelVisualRuntimeModel,
  readModelRuntime,
  coveredRenderRuntime,
  surfaceStateRuntime,
  surfaceBackgroundRuntime,
  surfaceOverlayRuntime,
}: UseSearchResultsPanelSpecRuntimeArgs) => {
  const { snapPoints, sheetState, resultsSheetRuntimeModel, resetResultsSheetToHidden } =
    resultsSheetRuntime;
  const { resultsScrollRef } = resultsPanelVisualRuntimeModel;
  const {
    handleResultsSheetSnapStart,
    handleResultsListScrollBegin,
    handleResultsListScrollEnd,
    handleResultsListMomentumBegin,
    handleResultsListMomentumEnd,
    handleResultsSheetDragStateChange,
    handleResultsSheetSettlingChange,
    handleResultsEndReached,
    handleResultsSheetSnapChange,
  } = resultsSheetInteractionModel;
  const {
    resultsReadModelSelectors,
    resultsRenderItem,
    resultsKeyExtractor,
    estimatedItemSize,
    getResultItemType,
    overrideItemLayout,
  } = readModelRuntime;
  const {
    activeList,
    primaryRowsForRender,
    secondaryRowsForRender,
    effectiveFiltersHeaderHeightForRender,
    scrollHeaderForRender,
    resultsContentContainerStyle,
  } = coveredRenderRuntime;
  const {
    shouldRenderResultsSheet,
    shouldDisableResultsSheetInteractionForRender,
    shouldShowInteractionLoadingState,
    resultsSheetContainerStyle,
    resultsSheetContainerAnimatedStyle,
  } = surfaceStateRuntime;
  const { resultsListBackground } = surfaceBackgroundRuntime;
  const { resultsOverlayComponent } = surfaceOverlayRuntime;

  const searchPanelSpec = useSearchPanelSpec({
    visible: shouldRenderResultsSheet,
    listScrollEnabled:
      !shouldShowInteractionLoadingState && !shouldDisableResultsSheetInteractionForRender,
    snapPoints,
    initialSnapPoint: sheetState === 'hidden' ? 'middle' : sheetState,
    runtimeModel: resultsSheetRuntimeModel,
    onSnapStart: handleResultsSheetSnapStart,
    onScrollBeginDrag: handleResultsListScrollBegin,
    onScrollEndDrag: handleResultsListScrollEnd,
    onMomentumBeginJS: handleResultsListMomentumBegin,
    onMomentumEndJS: handleResultsListMomentumEnd,
    onDragStateChange: handleResultsSheetDragStateChange,
    onSettleStateChange: handleResultsSheetSettlingChange,
    interactionEnabled: !shouldDisableResultsSheetInteractionForRender,
    onEndReached: handleResultsEndReached,
    scrollIndicatorInsets: {
      top: effectiveFiltersHeaderHeightForRender,
      bottom: RESULTS_BOTTOM_PADDING,
    },
    data: primaryRowsForRender,
    secondaryList: {
      data: secondaryRowsForRender,
      listKey: 'results-dishes',
      testID: 'search-results-flatlist-secondary',
    },
    activeList,
    renderItem: resultsRenderItem,
    keyExtractor: resultsKeyExtractor,
    estimatedItemSize,
    getItemType: getResultItemType,
    overrideItemLayout,
    listKey: 'results-restaurants',
    contentContainerStyle: resultsContentContainerStyle,
    ListHeaderComponent: scrollHeaderForRender as React.ReactElement | null,
    ListFooterComponent: resultsReadModelSelectors.listFooterComponent as React.ReactElement | null,
    ListEmptyComponent: null,
    ItemSeparatorComponent: () => <View style={styles.resultItemSeparator} />,
    headerComponent: resultsReadModelSelectors.listHeaderComponent,
    backgroundComponent: resultsListBackground,
    overlayComponent: resultsOverlayComponent,
    surfaceStyle: undefined,
    listRef: resultsScrollRef,
    resultsContainerAnimatedStyle: resultsSheetContainerAnimatedStyle,
    flashListProps: resultsReadModelSelectors.flashListRuntimeProps,
    onHidden: resetResultsSheetToHidden,
    onSnapChange: handleResultsSheetSnapChange,
    style: resultsSheetContainerStyle,
  });

  return React.useMemo(
    () => ({
      searchPanelSpec,
    }),
    [searchPanelSpec]
  );
};
