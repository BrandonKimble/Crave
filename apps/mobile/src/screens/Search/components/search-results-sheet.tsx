import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

import type { FlashListProps, FlashListRef } from '@shopify/flash-list';
import Reanimated, { type SharedValue } from 'react-native-reanimated';

import BottomSheetWithFlashList, {
  type SnapPoints,
} from '../../../overlays/BottomSheetWithFlashList';
import { overlaySheetStyles } from '../../../overlays/overlaySheetStyles';
import { RESULTS_BOTTOM_PADDING } from '../constants/search';
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
  if (!visible) {
    return null;
  }

  const gestureSnapPoints = React.useMemo(
    () => ({
      expanded: snapPoints.expanded,
      middle: snapPoints.middle,
      collapsed: snapPoints.collapsed,
    }),
    [snapPoints.collapsed, snapPoints.expanded, snapPoints.middle]
  );

  return (
    <>
      <Reanimated.View
        pointerEvents="none"
        style={[styles.resultsShadow, resultsContainerAnimatedStyle]}
      />
      <BottomSheetWithFlashList
        visible={visible}
        listScrollEnabled={listScrollEnabled}
        snapPoints={gestureSnapPoints}
        initialSnapPoint={initialSnapPoint}
        sheetYValue={sheetYValue}
        scrollOffsetValue={scrollOffsetValue}
        momentumFlag={momentumFlag}
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
        flashListProps={{
          getItemType,
          overrideItemLayout,
          removeClippedSubviews: true,
        }}
      />
    </>
  );
};

export default SearchResultsSheet;
