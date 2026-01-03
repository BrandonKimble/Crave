import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

import type { FlashListProps, FlashListRef } from '@shopify/flash-list';
import Reanimated, { type SharedValue } from 'react-native-reanimated';

import BottomSheetWithFlashList, {
  type BottomSheetWithFlashListProps,
  type SnapPoints,
} from '../../../overlays/BottomSheetWithFlashList';
import { overlaySheetStyles } from '../../../overlays/overlaySheetStyles';
import { RESULTS_BOTTOM_PADDING } from '../constants/search';
import searchPerfDebug from '../search-perf-debug';
import styles from '../styles';

type SheetSnapState = 'expanded' | 'middle' | 'collapsed' | 'hidden';

type SearchResultsSheetProps<T> = {
  visible: boolean;
  listScrollEnabled: boolean;
  snapPoints: SnapPoints;
  initialSnapPoint: 'expanded' | 'middle' | 'collapsed';
  sheetYValue: SharedValue<number>;
  scrollOffsetValue: SharedValue<number>;
  momentumFlag: SharedValue<boolean>;
  snapTo?: SheetSnapState | null;
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
  onSnapChange: (snap: SheetSnapState) => void;
  style?: StyleProp<ViewStyle>;
};

const SearchResultsSheet = <T,>({
  visible,
  listScrollEnabled,
  snapPoints,
  initialSnapPoint,
  sheetYValue,
  scrollOffsetValue,
  momentumFlag,
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
}: SearchResultsSheetProps<T>): React.ReactElement | null => {
  const shouldLogPropChanges = searchPerfDebug.enabled && searchPerfDebug.logCommitInfo;
  const shouldLogProfiler = searchPerfDebug.enabled && searchPerfDebug.logCommitInfo;
  const profilerMinMs = searchPerfDebug.logCommitMinMs;
  const prevPropsRef = React.useRef<{
    listScrollEnabled: boolean;
    snapPointsKey: string;
    snapTo: SheetSnapState | null | undefined;
    listKey?: string;
    interactionEnabled?: boolean;
    estimatedItemSize: number;
    dataRef: ReadonlyArray<T>;
    renderItem: SearchResultsSheetProps<T>['renderItem'];
    keyExtractor: SearchResultsSheetProps<T>['keyExtractor'];
    getItemType?: SearchResultsSheetProps<T>['getItemType'];
    overrideItemLayout?: SearchResultsSheetProps<T>['overrideItemLayout'];
    ListHeaderComponent?: SearchResultsSheetProps<T>['ListHeaderComponent'];
    ListFooterComponent?: SearchResultsSheetProps<T>['ListFooterComponent'];
    ListEmptyComponent?: SearchResultsSheetProps<T>['ListEmptyComponent'];
    ItemSeparatorComponent?: SearchResultsSheetProps<T>['ItemSeparatorComponent'];
    headerComponent?: React.ReactNode;
    backgroundComponent?: React.ReactNode;
    overlayComponent?: React.ReactNode;
    contentContainerStyle?: SearchResultsSheetProps<T>['contentContainerStyle'];
    resultsContainerAnimatedStyle: StyleProp<ViewStyle>;
    onEndReached?: FlashListProps<T>['onEndReached'];
  } | null>(null);
  const handleProfilerRender = React.useCallback(
    (
      id: string,
      phase: 'mount' | 'update',
      actualDuration: number,
      baseDuration: number
    ) => {
      if (!shouldLogProfiler || actualDuration < profilerMinMs) {
        return;
      }
      // eslint-disable-next-line no-console
      console.log(
        `[SearchPerf] Profiler ${id} ${phase} actual=${actualDuration.toFixed(
          1
        )}ms base=${baseDuration.toFixed(1)}ms`
      );
    },
    [profilerMinMs, shouldLogProfiler]
  );

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
      console.log(`[SearchPerf] SearchResultsSheet prop changes: ${changes.join(', ')}`);
    }
    prevPropsRef.current = {
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
    snapPoints.collapsed,
    snapPoints.expanded,
    snapPoints.hidden,
    snapPoints.middle,
    snapTo,
    shouldLogPropChanges,
  ]);

  const gestureSnapPoints = React.useMemo(
    () => ({
      expanded: snapPoints.expanded,
      middle: snapPoints.middle,
      collapsed: snapPoints.collapsed,
      hidden: snapPoints.hidden,
    }),
    [snapPoints.collapsed, snapPoints.expanded, snapPoints.hidden, snapPoints.middle]
  );
  const resolvedFlashListProps = React.useMemo(
    () => ({
      ...flashListProps,
      getItemType,
      overrideItemLayout,
      removeClippedSubviews: true,
      overrideProps: {
        ...(flashListProps?.overrideProps ?? {}),
      },
    }),
    [flashListProps, getItemType, overrideItemLayout]
  );

  return (
    <>
      <Reanimated.View
        pointerEvents="none"
        style={[styles.resultsShadow, resultsContainerAnimatedStyle]}
      />
      <React.Profiler id="SearchResultsSheetCore" onRender={handleProfilerRender}>
        <BottomSheetWithFlashList
          visible={visible}
          listScrollEnabled={listScrollEnabled}
          snapPoints={gestureSnapPoints}
          initialSnapPoint={initialSnapPoint}
          sheetYValue={sheetYValue}
          scrollOffsetValue={scrollOffsetValue}
          momentumFlag={momentumFlag}
          snapTo={snapTo}
          preventSwipeDismiss
          onScrollOffsetChange={onScrollOffsetChange}
          onScrollBeginDrag={onScrollBeginDrag}
          onScrollEndDrag={onScrollEndDrag}
          onMomentumBeginJS={onMomentumBeginJS}
          onMomentumEndJS={onMomentumEndJS}
          onDragStateChange={onDragStateChange}
          onSettleStateChange={onSettleStateChange}
          listKey={listKey}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.2}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          bounces={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
          testID="search-results-flatlist"
          extraData={extraData}
          data={data}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          estimatedItemSize={estimatedItemSize}
          ListHeaderComponent={ListHeaderComponent}
          ListFooterComponent={ListFooterComponent}
          ListEmptyComponent={ListEmptyComponent}
          ItemSeparatorComponent={ItemSeparatorComponent}
          contentContainerStyle={contentContainerStyle ?? { paddingBottom: RESULTS_BOTTOM_PADDING }}
          headerComponent={headerComponent}
          backgroundComponent={backgroundComponent}
          overlayComponent={overlayComponent}
          listRef={listRef}
          style={[overlaySheetStyles.container, style]}
          surfaceStyle={[overlaySheetStyles.surface, styles.resultsSheetSurface]}
          onHidden={onHidden}
          onSnapChange={onSnapChange}
          interactionEnabled={interactionEnabled}
          flashListProps={resolvedFlashListProps}
        />
      </React.Profiler>
    </>
  );
};

const MemoizedSearchResultsSheet = React.memo(SearchResultsSheet) as typeof SearchResultsSheet;

export default MemoizedSearchResultsSheet;
