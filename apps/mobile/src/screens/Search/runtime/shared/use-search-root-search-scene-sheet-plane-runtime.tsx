import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import styles from '../../styles';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootSearchSceneVisualRuntime } from './search-root-visual-runtime-contract';
import type {
  SearchRootResultsPresentationStateControlLane,
  SearchRootResultsSheetControlLane,
} from './use-search-root-control-plane-runtime-contract';

type UseSearchRootSearchSceneSheetPlaneRuntimeArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  resultsSheetControlLane: SearchRootResultsSheetControlLane;
  resultsPresentationStateControlLane: SearchRootResultsPresentationStateControlLane;
  searchSheetContentLaneKind: string;
  sceneVisualRuntime: SearchRootSearchSceneVisualRuntime;
};

export const useSearchRootSearchSceneSheetPlaneRuntime = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  resultsSheetControlLane,
  resultsPresentationStateControlLane,
  searchSheetContentLaneKind,
  sceneVisualRuntime,
}: UseSearchRootSearchSceneSheetPlaneRuntimeArgs) => {
  const { searchState } = stateFoundationLane.rootPrimitivesRuntime;
  const appRouteSharedSheetRuntimeOwner =
    rootOverlayFoundationRuntime.appRouteSharedSheetRuntimeOwner;
  const {
    snapPoints,
    sheetState,
    sharedSheetRuntimeModel,
  } = appRouteSharedSheetRuntimeOwner;
  const {
    handleResultsListScrollBegin,
    handleResultsListScrollEnd,
    handleResultsListMomentumBegin,
    handleResultsListMomentumEnd,
    handleResultsSheetDragStateChange,
    handleResultsSheetSettlingChange,
    handleResultsEndReached,
  } = resultsSheetControlLane.resultsSheetInteractionModel;
  const isResultsClosing = searchSheetContentLaneKind === 'results_closing';
  const shouldDisableResultsSheetInteractionForRender =
    resultsPresentationStateControlLane.presentationState
      .shouldDisableResultsSheetInteraction || isResultsClosing;
  const resultsSheetContainerStyle = React.useMemo(
    () => [
      styles.resultsSheetContainer,
      sceneVisualRuntime.resultsSheetVisibilityAnimatedStyle,
    ],
    [sceneVisualRuntime.resultsSheetVisibilityAnimatedStyle]
  );
  const resultsSheetContainerAnimatedStyle = React.useMemo(
    () => [
      appRouteSharedSheetRuntimeOwner.sharedSheetContainerAnimatedStyle,
      sceneVisualRuntime.resultsSheetVisibilityAnimatedStyle,
    ],
    [
      appRouteSharedSheetRuntimeOwner.sharedSheetContainerAnimatedStyle,
      sceneVisualRuntime.resultsSheetVisibilityAnimatedStyle,
    ]
  );

  React.useEffect(() => {
    searchState.setShouldDisableSearchShortcuts(false);
  }, [searchState]);

  return React.useMemo(
    () => ({
      handleResultsEndReached,
      handleResultsListMomentumBegin,
      handleResultsListMomentumEnd,
      handleResultsListScrollBegin,
      handleResultsListScrollEnd,
      handleResultsSheetDragStateChange,
      handleResultsSheetSettlingChange,
      interactionEnabled: !shouldDisableResultsSheetInteractionForRender,
      listRef: searchState.resultsScrollRef,
      sharedSheetContainerAnimatedStyle:
        resultsSheetContainerAnimatedStyle as StyleProp<ViewStyle>,
      runtimeModel: sharedSheetRuntimeModel,
      sheetState,
      snapPoints,
      style: resultsSheetContainerStyle as StyleProp<ViewStyle>,
    }),
    [
      handleResultsEndReached,
      handleResultsListMomentumBegin,
      handleResultsListMomentumEnd,
      handleResultsListScrollBegin,
      handleResultsListScrollEnd,
      handleResultsSheetDragStateChange,
      handleResultsSheetSettlingChange,
      resultsSheetContainerAnimatedStyle,
      resultsSheetContainerStyle,
      sharedSheetRuntimeModel,
      searchState.resultsScrollRef,
      sheetState,
      shouldDisableResultsSheetInteractionForRender,
      snapPoints,
    ]
  );
};
