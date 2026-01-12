import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

import type { FlashListProps, FlashListRef } from '@shopify/flash-list';
import Reanimated from 'react-native-reanimated';

import type { BottomSheetWithFlashListProps, SnapPoints } from '../BottomSheetWithFlashList';
import { overlaySheetStyles } from '../overlaySheetStyles';
import { RESULTS_BOTTOM_PADDING } from '../../screens/Search/constants/search';
import searchPerfDebug from '../../screens/Search/search-perf-debug';
import searchStyles from '../../screens/Search/styles';
import type { OverlayContentSpec, OverlaySheetSnap } from '../types';

type UseSearchPanelSpecOptions<T> = {
  visible: boolean;
  listScrollEnabled: boolean;
  snapPoints: SnapPoints;
  initialSnapPoint: Exclude<OverlaySheetSnap, 'hidden'>;
  snapTo?: OverlaySheetSnap | null;
  onScrollOffsetChange?: (offsetY: number) => void;
  onScrollBeginDrag: () => void;
  onScrollEndDrag: () => void;
  onMomentumBeginJS?: () => void;
  onMomentumEndJS?: () => void;
  onDragStateChange?: (isDragging: boolean) => void;
  onSettleStateChange?: (isSettling: boolean) => void;
  listKey?: string;
  onEndReached?: FlashListProps<T>['onEndReached'];
  extraData?: FlashListProps<T>['extraData'];
  interactionEnabled?: boolean;
  data: ReadonlyArray<T>;
  renderItem: FlashListProps<T>['renderItem'];
  keyExtractor: NonNullable<FlashListProps<T>['keyExtractor']>;
  estimatedItemSize: number;
  getItemType?: FlashListProps<T>['getItemType'];
  overrideItemLayout?: FlashListProps<T>['overrideItemLayout'];
  ListHeaderComponent?: FlashListProps<T>['ListHeaderComponent'];
  ListFooterComponent?: FlashListProps<T>['ListFooterComponent'];
  ListEmptyComponent?: FlashListProps<T>['ListEmptyComponent'];
  ItemSeparatorComponent?: FlashListProps<T>['ItemSeparatorComponent'];
  flashListProps?: BottomSheetWithFlashListProps<T>['flashListProps'];
  headerComponent?: React.ReactNode;
  backgroundComponent?: React.ReactNode;
  overlayComponent?: React.ReactNode;
  contentContainerStyle?: FlashListProps<T>['contentContainerStyle'];
  resultsContainerAnimatedStyle: StyleProp<ViewStyle>;
  listRef?: React.RefObject<FlashListRef<T>>;
  onHidden: () => void;
  onSnapChange: (snap: OverlaySheetSnap) => void;
  style?: StyleProp<ViewStyle>;
  surfaceStyle?: StyleProp<ViewStyle>;
};

export const useSearchPanelSpec = <T,>({
  visible,
  listScrollEnabled,
  snapPoints,
  initialSnapPoint,
  snapTo,
  onScrollOffsetChange,
  onScrollBeginDrag,
  onScrollEndDrag,
  onMomentumBeginJS,
  onMomentumEndJS,
  onDragStateChange,
  onSettleStateChange,
  listKey,
  onEndReached,
  extraData,
  interactionEnabled = true,
  data,
  renderItem,
  keyExtractor,
  estimatedItemSize,
  getItemType,
  overrideItemLayout,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  ItemSeparatorComponent,
  flashListProps,
  headerComponent,
  backgroundComponent,
  overlayComponent,
  contentContainerStyle,
  resultsContainerAnimatedStyle,
  listRef,
  onHidden,
  onSnapChange,
  style,
  surfaceStyle,
}: UseSearchPanelSpecOptions<T>): OverlayContentSpec<T> => {
  const shouldLogPropChanges = searchPerfDebug.enabled && searchPerfDebug.logCommitInfo;
  const prevPropsRef = React.useRef<{
    visible: boolean;
    listScrollEnabled: boolean;
    snapPointsKey: string;
    snapTo: OverlaySheetSnap | null | undefined;
    listKey?: string;
    interactionEnabled?: boolean;
    estimatedItemSize: number;
    dataRef: ReadonlyArray<T>;
    renderItem: UseSearchPanelSpecOptions<T>['renderItem'];
    keyExtractor: UseSearchPanelSpecOptions<T>['keyExtractor'];
    getItemType?: UseSearchPanelSpecOptions<T>['getItemType'];
    overrideItemLayout?: UseSearchPanelSpecOptions<T>['overrideItemLayout'];
    ListHeaderComponent?: UseSearchPanelSpecOptions<T>['ListHeaderComponent'];
    ListFooterComponent?: UseSearchPanelSpecOptions<T>['ListFooterComponent'];
    ListEmptyComponent?: UseSearchPanelSpecOptions<T>['ListEmptyComponent'];
    ItemSeparatorComponent?: UseSearchPanelSpecOptions<T>['ItemSeparatorComponent'];
    headerComponent?: React.ReactNode;
    backgroundComponent?: React.ReactNode;
    overlayComponent?: React.ReactNode;
    contentContainerStyle?: UseSearchPanelSpecOptions<T>['contentContainerStyle'];
    resultsContainerAnimatedStyle: StyleProp<ViewStyle>;
    onEndReached?: FlashListProps<T>['onEndReached'];
  } | null>(null);

  React.useEffect(() => {
    if (!shouldLogPropChanges) {
      return;
    }
    const snapPointsKey = `${snapPoints.expanded}:${snapPoints.middle}:${snapPoints.collapsed}:${snapPoints.hidden}`;
    const prev = prevPropsRef.current;
    const changes: string[] = [];
    if (!prev) {
      changes.push('init');
    } else {
      if (prev.visible !== visible) changes.push('visible');
      if (prev.listScrollEnabled !== listScrollEnabled) changes.push('listScrollEnabled');
      if (prev.snapPointsKey !== snapPointsKey) changes.push('snapPoints');
      if (prev.snapTo !== snapTo) changes.push('snapTo');
      if (prev.listKey !== listKey) changes.push('listKey');
      if (prev.interactionEnabled !== interactionEnabled) changes.push('interactionEnabled');
      if (prev.estimatedItemSize !== estimatedItemSize) changes.push('estimatedItemSize');
      if (prev.dataRef !== data) {
        changes.push(`data:${prev.dataRef.length}->${data.length}`);
      }
      if (prev.renderItem !== renderItem) changes.push('renderItem');
      if (prev.keyExtractor !== keyExtractor) changes.push('keyExtractor');
      if (prev.getItemType !== getItemType) changes.push('getItemType');
      if (prev.overrideItemLayout !== overrideItemLayout) changes.push('overrideItemLayout');
      if (prev.ListHeaderComponent !== ListHeaderComponent) changes.push('ListHeaderComponent');
      if (prev.ListFooterComponent !== ListFooterComponent) changes.push('ListFooterComponent');
      if (prev.ListEmptyComponent !== ListEmptyComponent) changes.push('ListEmptyComponent');
      if (prev.ItemSeparatorComponent !== ItemSeparatorComponent)
        changes.push('ItemSeparatorComponent');
      if (prev.headerComponent !== headerComponent) changes.push('headerComponent');
      if (prev.backgroundComponent !== backgroundComponent) changes.push('backgroundComponent');
      if (prev.overlayComponent !== overlayComponent) changes.push('overlayComponent');
      if (prev.contentContainerStyle !== contentContainerStyle)
        changes.push('contentContainerStyle');
      if (prev.resultsContainerAnimatedStyle !== resultsContainerAnimatedStyle) {
        changes.push('resultsContainerAnimatedStyle');
      }
      if (prev.onEndReached !== onEndReached) changes.push('onEndReached');
    }
    if (changes.length) {
      // eslint-disable-next-line no-console
      console.log(`[SearchPerf] SearchResultsSheet prop changes: ${changes.join(', ')}`);
    }
    prevPropsRef.current = {
      visible,
      listScrollEnabled,
      snapPointsKey,
      snapTo,
      listKey,
      interactionEnabled,
      estimatedItemSize,
      dataRef: data,
      renderItem,
      keyExtractor,
      getItemType,
      overrideItemLayout,
      ListHeaderComponent,
      ListFooterComponent,
      ListEmptyComponent,
      ItemSeparatorComponent,
      headerComponent,
      backgroundComponent,
      overlayComponent,
      contentContainerStyle,
      resultsContainerAnimatedStyle,
      onEndReached,
    };
  }, [
    backgroundComponent,
    contentContainerStyle,
    data,
    estimatedItemSize,
    getItemType,
    headerComponent,
    interactionEnabled,
    ItemSeparatorComponent,
    keyExtractor,
    listKey,
    listScrollEnabled,
    ListEmptyComponent,
    ListFooterComponent,
    ListHeaderComponent,
    onEndReached,
    overlayComponent,
    overrideItemLayout,
    renderItem,
    resultsContainerAnimatedStyle,
    shouldLogPropChanges,
    snapPoints.collapsed,
    snapPoints.expanded,
    snapPoints.hidden,
    snapPoints.middle,
    snapTo,
    visible,
  ]);

  const resolvedFlashListProps = React.useMemo(
    () => ({
      ...flashListProps,
      getItemType,
      overrideItemLayout,
      removeClippedSubviews: flashListProps?.removeClippedSubviews ?? false,
      overrideProps: {
        ...(flashListProps?.overrideProps ?? {}),
      },
    }),
    [flashListProps, getItemType, overrideItemLayout]
  );

  return {
    overlayKey: 'search',
    snapPoints,
    listScrollEnabled,
    initialSnapPoint,
    snapTo,
    preventSwipeDismiss: true,
    onScrollOffsetChange,
    onScrollBeginDrag,
    onScrollEndDrag,
    onMomentumBeginJS,
    onMomentumEndJS,
    onDragStateChange,
    onSettleStateChange,
    listKey,
    onEndReached,
    onEndReachedThreshold: 0.2,
    showsVerticalScrollIndicator: false,
    keyboardShouldPersistTaps: 'handled',
    keyboardDismissMode: 'on-drag',
    bounces: false,
    alwaysBounceVertical: false,
    overScrollMode: 'never',
    testID: 'search-results-flatlist',
    extraData,
    data,
    renderItem,
    keyExtractor,
    estimatedItemSize,
    ListHeaderComponent,
    ListFooterComponent,
    ListEmptyComponent,
    ItemSeparatorComponent,
    contentContainerStyle: contentContainerStyle ?? { paddingBottom: RESULTS_BOTTOM_PADDING },
    headerComponent,
    backgroundComponent,
    overlayComponent,
    listRef,
    style: [overlaySheetStyles.container, style],
    surfaceStyle: surfaceStyle ?? [overlaySheetStyles.surface, searchStyles.resultsSheetSurface],
    onHidden,
    onSnapChange,
    interactionEnabled,
    flashListProps: resolvedFlashListProps,
    underlayComponent: (
      <Reanimated.View
        pointerEvents="none"
        style={[searchStyles.resultsShadow, resultsContainerAnimatedStyle]}
      />
    ),
  };
};
