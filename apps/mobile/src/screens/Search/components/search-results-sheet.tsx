import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

import type { FlashList, FlashListProps } from '@shopify/flash-list';
import Reanimated, { type SharedValue } from 'react-native-reanimated';

import { FrostedGlassBackground } from '../../../components/FrostedGlassBackground';
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
  onDragStateChange?: (isDragging: boolean) => void;
  onEndReached?: FlashListProps<T>['onEndReached'];
  extraData?: FlashListProps<T>['extraData'];
  data: ReadonlyArray<T>;
  renderItem: FlashListProps<T>['renderItem'];
  keyExtractor: NonNullable<FlashListProps<T>['keyExtractor']>;
  estimatedItemSize: number;
  getItemType?: FlashListProps<T>['getItemType'];
  overrideItemLayout?: FlashListProps<T>['overrideItemLayout'];
  ListHeaderComponent?: FlashListProps<T>['ListHeaderComponent'];
  ListFooterComponent?: FlashListProps<T>['ListFooterComponent'];
  ListEmptyComponent?: FlashListProps<T>['ListEmptyComponent'];
  headerComponent?: React.ReactNode;
  contentContainerStyle?: FlashListProps<T>['contentContainerStyle'];
  resultsContainerAnimatedStyle: unknown;
  listRef?: React.RefObject<FlashList<T>>;
  onHidden: () => void;
  onSnapChange: (snap: SheetSnapState) => void;
  style?: StyleProp<ViewStyle>;
  blurIntensity?: number;
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
  onDragStateChange,
  onEndReached,
  extraData,
  data,
  renderItem,
  keyExtractor,
  estimatedItemSize,
  getItemType,
  overrideItemLayout,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  headerComponent,
  contentContainerStyle,
  resultsContainerAnimatedStyle,
  listRef,
  onHidden,
  onSnapChange,
  style,
  blurIntensity,
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
        style={[styles.resultsShadow, resultsContainerAnimatedStyle as never]}
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
        onDragStateChange={onDragStateChange}
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
        contentContainerStyle={contentContainerStyle ?? { paddingBottom: RESULTS_BOTTOM_PADDING }}
        backgroundComponent={<FrostedGlassBackground intensity={blurIntensity} />}
        headerComponent={headerComponent}
        listRef={listRef}
        style={style ?? overlaySheetStyles.container}
        onHidden={onHidden}
        onSnapChange={onSnapChange}
        flashListProps={{
          getItemType,
          overrideItemLayout,
          removeClippedSubviews: true,
          drawDistance: 200,
        }}
      />
    </>
  );
};

export default SearchResultsSheet;
