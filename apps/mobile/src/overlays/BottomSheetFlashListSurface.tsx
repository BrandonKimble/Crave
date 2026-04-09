import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { FlashList, type FlashListProps, type FlashListRef } from '@shopify/flash-list';
import Animated from 'react-native-reanimated';

import type {
  BottomSheetWithFlashListListProps,
  DualListSelection,
} from './bottomSheetWithFlashListContract';
import { OverlaySheetScrollView } from './BottomSheetContentSurface';

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as typeof FlashList;

type BottomSheetFlashListSurfaceProps<T> = {
  listProps: BottomSheetWithFlashListListProps<T>;
  flashListRef: React.RefObject<FlashListRef<T> | null>;
  secondaryFlashListRef: React.RefObject<FlashListRef<T> | null>;
  shouldEnableScroll: boolean;
  shouldRenderDualLists: boolean;
  resolvedActiveList: DualListSelection;
  flashListSurfaceStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardShouldPersistTaps?: FlashListProps<T>['keyboardShouldPersistTaps'];
  primaryAnimatedScrollHandler: unknown;
  secondaryAnimatedScrollHandler: unknown;
  onScrollBeginDrag?: FlashListProps<T>['onScrollBeginDrag'];
  onScrollEndDrag?: FlashListProps<T>['onScrollEndDrag'];
  onEndReached?: BottomSheetWithFlashListListProps<T>['onEndReached'];
  onEndReachedThreshold?: number;
  effectiveShowsVerticalScrollIndicator: boolean;
  keyboardDismissMode?: FlashListProps<T>['keyboardDismissMode'];
  bounces?: FlashListProps<T>['bounces'];
  alwaysBounceVertical?: FlashListProps<T>['alwaysBounceVertical'];
  overScrollMode?: FlashListProps<T>['overScrollMode'];
  testID?: string;
  scrollIndicatorInsets?: FlashListProps<T>['scrollIndicatorInsets'];
  flashListProps?: Record<string, unknown> | null;
  extraData?: unknown;
};

export const BottomSheetFlashListSurface = <T,>({
  listProps,
  flashListRef,
  secondaryFlashListRef,
  shouldEnableScroll,
  shouldRenderDualLists,
  resolvedActiveList,
  flashListSurfaceStyle,
  contentContainerStyle,
  keyboardShouldPersistTaps,
  primaryAnimatedScrollHandler,
  secondaryAnimatedScrollHandler,
  onScrollBeginDrag,
  onScrollEndDrag,
  onEndReached,
  onEndReachedThreshold,
  effectiveShowsVerticalScrollIndicator,
  keyboardDismissMode,
  bounces,
  alwaysBounceVertical,
  overScrollMode,
  testID,
  scrollIndicatorInsets,
  flashListProps,
  extraData,
}: BottomSheetFlashListSurfaceProps<T>): React.ReactElement => (
  <>
    <View
      pointerEvents={!shouldRenderDualLists || resolvedActiveList === 'primary' ? 'auto' : 'none'}
      style={[
        shouldRenderDualLists ? styles.dualListLayer : styles.singleListLayer,
        !shouldRenderDualLists || resolvedActiveList === 'primary'
          ? styles.visibleLayer
          : styles.hiddenLayer,
      ]}
    >
      <AnimatedFlashList
        key={listProps.listKey}
        ref={flashListRef as React.RefObject<FlashListRef<T>>}
        {...(flashListProps ?? {})}
        style={flashListSurfaceStyle}
        data={listProps.data}
        renderItem={listProps.renderItem}
        keyExtractor={listProps.keyExtractor}
        contentContainerStyle={contentContainerStyle}
        ListHeaderComponent={
          !shouldRenderDualLists || resolvedActiveList === 'primary'
            ? listProps.ListHeaderComponent
            : null
        }
        ListFooterComponent={
          !shouldRenderDualLists || resolvedActiveList === 'primary'
            ? listProps.ListFooterComponent
            : null
        }
        ListEmptyComponent={
          !shouldRenderDualLists || resolvedActiveList === 'primary'
            ? listProps.ListEmptyComponent
            : null
        }
        ItemSeparatorComponent={listProps.ItemSeparatorComponent}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        scrollEnabled={
          shouldEnableScroll && (!shouldRenderDualLists || resolvedActiveList === 'primary')
        }
        renderScrollComponent={
          !shouldRenderDualLists || resolvedActiveList === 'primary'
            ? OverlaySheetScrollView
            : undefined
        }
        onScroll={primaryAnimatedScrollHandler as never}
        scrollEventThrottle={16}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        onEndReached={onEndReached}
        onEndReachedThreshold={onEndReachedThreshold}
        showsVerticalScrollIndicator={
          effectiveShowsVerticalScrollIndicator &&
          (!shouldRenderDualLists || resolvedActiveList === 'primary')
        }
        keyboardDismissMode={keyboardDismissMode}
        bounces={bounces}
        alwaysBounceVertical={alwaysBounceVertical}
        overScrollMode={overScrollMode}
        testID={testID}
        extraData={listProps.extraData ?? extraData}
        scrollIndicatorInsets={scrollIndicatorInsets}
      />
    </View>
    {shouldRenderDualLists && listProps.secondaryList ? (
      <View
        pointerEvents={resolvedActiveList === 'secondary' ? 'auto' : 'none'}
        style={[
          styles.dualListLayer,
          resolvedActiveList === 'secondary' ? styles.visibleLayer : styles.hiddenLayer,
        ]}
      >
        <AnimatedFlashList
          key={listProps.secondaryList.listKey ?? 'secondary-list'}
          ref={secondaryFlashListRef as React.RefObject<FlashListRef<T>>}
          {...(flashListProps ?? {})}
          style={flashListSurfaceStyle}
          data={listProps.secondaryList.data}
          renderItem={listProps.renderItem}
          keyExtractor={listProps.keyExtractor}
          contentContainerStyle={contentContainerStyle}
          ListHeaderComponent={
            resolvedActiveList === 'secondary' ? listProps.ListHeaderComponent : null
          }
          ListFooterComponent={
            resolvedActiveList === 'secondary' ? listProps.ListFooterComponent : null
          }
          ListEmptyComponent={
            resolvedActiveList === 'secondary' ? listProps.ListEmptyComponent : null
          }
          ItemSeparatorComponent={listProps.ItemSeparatorComponent}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          scrollEnabled={shouldEnableScroll && resolvedActiveList === 'secondary'}
          renderScrollComponent={
            resolvedActiveList === 'secondary' ? OverlaySheetScrollView : undefined
          }
          onScroll={secondaryAnimatedScrollHandler as never}
          scrollEventThrottle={16}
          onScrollBeginDrag={onScrollBeginDrag}
          onScrollEndDrag={onScrollEndDrag}
          onEndReached={listProps.secondaryList.onEndReached ?? onEndReached}
          onEndReachedThreshold={onEndReachedThreshold}
          showsVerticalScrollIndicator={
            effectiveShowsVerticalScrollIndicator && resolvedActiveList === 'secondary'
          }
          keyboardDismissMode={keyboardDismissMode}
          bounces={bounces}
          alwaysBounceVertical={alwaysBounceVertical}
          overScrollMode={overScrollMode}
          testID={listProps.secondaryList.testID ?? testID}
          extraData={listProps.secondaryList.extraData ?? listProps.extraData ?? extraData}
          scrollIndicatorInsets={
            listProps.secondaryList.scrollIndicatorInsets ?? scrollIndicatorInsets
          }
        />
      </View>
    ) : null}
  </>
);

const styles = StyleSheet.create({
  singleListLayer: {
    flex: 1,
  },
  dualListLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  visibleLayer: {
    opacity: 1,
  },
  hiddenLayer: {
    opacity: 0,
  },
});
