import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { FlashListProps } from '@shopify/flash-list';
import { FlashList } from '@shopify/flash-list';
import Animated from 'react-native-reanimated';

import type {
  BottomSheetSceneStackBodyContentEntry,
  BottomSheetSceneStackBodyDefaults,
  BottomSheetSceneStackBodyScrollRuntime,
  BottomSheetSceneStackBodyTransportEntry,
} from './bottomSheetSceneStackHostContract';
import type { ScrollEvent } from './bottomSheetSceneStackBodyLayerContract';
import { bottomSheetSceneStackHostStyles as styles } from './bottomSheetSceneStackHostStyles';
import {
  resolveListContentContainerStyle,
  sanitizeContentContainerStyle,
} from './bottomSheetSurfaceStyleUtils';
import {
  finishSearchNavSwitchRuntimeAttributionSpan,
  markSearchNavSwitchRuntimeAttribution,
  startSearchNavSwitchRuntimeAttributionSpan,
} from '../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import { useSearchNavSwitchCommitAttribution } from '../screens/Search/runtime/shared/use-search-nav-switch-commit-attribution';

const DEFAULT_DRAW_DISTANCE = 140;
const DEFAULT_INITIAL_DRAW_BATCH_SIZE = 8;
const INACTIVE_SECONDARY_DRAW_DISTANCE = 0;
const INACTIVE_SECONDARY_INITIAL_DRAW_BATCH_SIZE = 1;
const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as React.ComponentType<object>
) as typeof FlashList;

type ListBodyContentSpec = Extract<
  BottomSheetSceneStackBodyContentEntry['bodyContentSpec'],
  { surfaceKind: 'list' }
>;

type BottomSheetSceneStackListBodySurfaceProps = {
  sceneKey: string;
  shouldRenderListBody: boolean;
  bodyDefaults: BottomSheetSceneStackBodyDefaults;
  bodyScrollRuntime: BottomSheetSceneStackBodyScrollRuntime;
  sceneBodyContentSpec: ListBodyContentSpec;
  sceneBodyTransportSpec: BottomSheetSceneStackBodyTransportEntry['bodyTransportSpec'];
};

type ActiveBottomSheetSceneStackListBodySurfaceProps = Omit<
  BottomSheetSceneStackListBodySurfaceProps,
  'shouldRenderListBody'
>;

const ActiveBottomSheetSceneStackListBodySurface = React.memo(
  ({
    sceneKey,
    bodyDefaults,
    bodyScrollRuntime,
    sceneBodyContentSpec,
    sceneBodyTransportSpec,
  }: ActiveBottomSheetSceneStackListBodySurfaceProps) => {
    useSearchNavSwitchCommitAttribution(`ActiveBottomSheetSceneStackListBodySurface:${sceneKey}`);
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const sceneKeyboardShouldPersistTaps =
      sceneBodyTransportSpec.keyboardShouldPersistTaps ??
      bodyDefaults.resolvedKeyboardShouldPersistTaps;
    const sceneKeyboardDismissMode =
      sceneBodyTransportSpec.keyboardDismissMode ?? bodyDefaults.resolvedKeyboardDismissMode;
    const sceneBounces = sceneBodyTransportSpec.bounces ?? bodyDefaults.resolvedBounces;
    const sceneAlwaysBounceVertical =
      sceneBodyTransportSpec.alwaysBounceVertical ?? bodyDefaults.resolvedAlwaysBounceVertical;
    const sceneOverScrollMode =
      sceneBodyTransportSpec.overScrollMode ?? bodyDefaults.resolvedOverScrollMode;
    const sceneScrollIndicatorInsets =
      sceneBodyTransportSpec.scrollIndicatorInsets ?? bodyDefaults.resolvedScrollIndicatorInsets;
    const sceneFlashListProps =
      sceneBodyTransportSpec.flashListProps ?? bodyDefaults.activeFlashListProps;
    const sceneContentContainerStyle = React.useMemo(
      () =>
        sanitizeContentContainerStyle(
          sceneBodyTransportSpec.contentContainerStyle ?? bodyDefaults.resolvedContentContainerStyle
        ),
      [bodyDefaults.resolvedContentContainerStyle, sceneBodyTransportSpec.contentContainerStyle]
    );
    const sceneListContentContainerStyle = React.useMemo(
      () =>
        resolveListContentContainerStyle({
          baseStyle: sceneContentContainerStyle,
          hasScrollHeaderOverlay: bodyDefaults.scrollHeaderComponent != null,
          scrollHeaderHeight: bodyDefaults.scrollHeaderHeight,
        }),
      [
        bodyDefaults.scrollHeaderComponent,
        bodyDefaults.scrollHeaderHeight,
        sceneContentContainerStyle,
      ]
    );
    const renderSceneScrollComponent = React.useCallback<
      NonNullable<FlashListProps<unknown>['renderScrollComponent']>
    >(
      (props) => <bodyScrollRuntime.ScrollComponent {...props} />,
      [bodyScrollRuntime.ScrollComponent]
    );
    const handlePrimaryScrollBeginDrag = React.useCallback(
      (event: ScrollEvent) => {
        sceneBodyTransportSpec.onScrollBeginDrag?.();
        sceneFlashListProps?.onScrollBeginDrag?.(event);
      },
      [sceneBodyTransportSpec, sceneFlashListProps]
    );
    const handlePrimaryScrollEndDrag = React.useCallback(
      (event: ScrollEvent) => {
        sceneBodyTransportSpec.onScrollEndDrag?.();
        sceneBodyTransportSpec.onScrollOffsetChange?.(bodyScrollRuntime.scrollOffset.value);
        sceneFlashListProps?.onScrollEndDrag?.(event);
      },
      [bodyScrollRuntime.scrollOffset, sceneBodyTransportSpec, sceneFlashListProps]
    );

    const sceneSecondaryList = sceneBodyContentSpec.secondaryList;
    const sceneSecondaryListTransport = sceneBodyTransportSpec.secondaryList;
    const sceneShouldRenderDualLists = sceneSecondaryList != null;
    const sceneResolvedActiveList = sceneShouldRenderDualLists
      ? sceneBodyTransportSpec.activeList ?? 'primary'
      : 'primary';
    const primaryOwnsScroll = !sceneShouldRenderDualLists || sceneResolvedActiveList === 'primary';
    const secondaryOwnsScroll =
      sceneShouldRenderDualLists && sceneResolvedActiveList === 'secondary';
    const [deferredSecondaryListContent, setDeferredSecondaryListContent] = React.useState<
      typeof sceneSecondaryList | null
    >(null);
    React.useEffect(() => {
      if (!sceneShouldRenderDualLists || sceneSecondaryList == null) {
        setDeferredSecondaryListContent(null);
        return;
      }

      if (secondaryOwnsScroll) {
        setDeferredSecondaryListContent(sceneSecondaryList);
        return;
      }

      const frameHandle = requestAnimationFrame(() => {
        setDeferredSecondaryListContent(sceneSecondaryList);
      });
      return () => {
        cancelAnimationFrame(frameHandle);
      };
    }, [sceneSecondaryList, sceneShouldRenderDualLists, secondaryOwnsScroll]);
    const shouldRenderSecondaryList =
      sceneShouldRenderDualLists &&
      sceneSecondaryList != null &&
      (secondaryOwnsScroll || deferredSecondaryListContent === sceneSecondaryList);
    const sceneResolvedFlashListProps = {
      drawDistance: DEFAULT_DRAW_DISTANCE,
      removeClippedSubviews: false,
      estimatedItemSize: sceneBodyContentSpec.estimatedItemSize,
      ...sceneFlashListProps,
      overrideProps: {
        initialDrawBatchSize: DEFAULT_INITIAL_DRAW_BATCH_SIZE,
        ...(sceneFlashListProps?.overrideProps ?? {}),
      },
    };
    const sceneSecondaryInputFlashListProps = {
      ...sceneFlashListProps,
      ...(sceneSecondaryListTransport?.flashListProps ?? {}),
    };
    const sceneSecondaryFlashListProps = {
      removeClippedSubviews: false,
      estimatedItemSize:
        sceneSecondaryList?.estimatedItemSize ?? sceneBodyContentSpec.estimatedItemSize,
      ...sceneSecondaryInputFlashListProps,
      drawDistance: secondaryOwnsScroll
        ? sceneSecondaryInputFlashListProps.drawDistance ?? DEFAULT_DRAW_DISTANCE
        : INACTIVE_SECONDARY_DRAW_DISTANCE,
      overrideProps: {
        initialDrawBatchSize: secondaryOwnsScroll
          ? DEFAULT_INITIAL_DRAW_BATCH_SIZE
          : INACTIVE_SECONDARY_INITIAL_DRAW_BATCH_SIZE,
        ...(sceneSecondaryInputFlashListProps.overrideProps ?? {}),
        ...(!secondaryOwnsScroll
          ? {
              initialDrawBatchSize: INACTIVE_SECONDARY_INITIAL_DRAW_BATCH_SIZE,
            }
          : null),
      },
    };
    const sceneFlashListSurfaceStyle =
      StyleSheet.flatten([
        sceneFlashListProps?.style,
        bodyDefaults.scrollHeaderComponent ? styles.transparentFlashListSurface : null,
      ]) ?? undefined;
    const sceneSecondaryFlashListSurfaceStyle =
      StyleSheet.flatten([
        sceneSecondaryListTransport?.flashListProps?.style ?? sceneFlashListProps?.style,
        bodyDefaults.scrollHeaderComponent ? styles.transparentFlashListSurface : null,
      ]) ?? undefined;
    const sceneSecondaryContentContainerStyle = resolveListContentContainerStyle({
      baseStyle: sanitizeContentContainerStyle(
        sceneSecondaryListTransport?.contentContainerStyle ??
          sceneBodyTransportSpec.contentContainerStyle ??
          bodyDefaults.resolvedContentContainerStyle
      ),
      hasScrollHeaderOverlay: bodyDefaults.scrollHeaderComponent != null,
      scrollHeaderHeight: bodyDefaults.scrollHeaderHeight,
    });

    React.useLayoutEffect(() => {
      finishSearchNavSwitchRuntimeAttributionSpan({
        owner: `ActiveBottomSheetSceneStackListBodySurface:${sceneKey}`,
        operation: 'renderToLayoutEffect',
        startedAtMs: renderStartedAtMs,
      });
      return () => {
        markSearchNavSwitchRuntimeAttribution(
          `ActiveBottomSheetSceneStackListBodySurface:${sceneKey}`,
          'layoutEffectCleanup'
        );
      };
    });

    React.useEffect(() => {
      markSearchNavSwitchRuntimeAttribution(
        `ActiveBottomSheetSceneStackListBodySurface:${sceneKey}`,
        'passiveEffectMount'
      );
      return () => {
        markSearchNavSwitchRuntimeAttribution(
          `ActiveBottomSheetSceneStackListBodySurface:${sceneKey}`,
          'passiveEffectCleanup'
        );
      };
    }, [sceneKey]);

    return (
      <>
        <View
          pointerEvents={
            !sceneShouldRenderDualLists || sceneResolvedActiveList === 'primary' ? 'auto' : 'none'
          }
          style={[
            sceneShouldRenderDualLists ? styles.dualListLayer : styles.singleListLayer,
            !sceneShouldRenderDualLists || sceneResolvedActiveList === 'primary'
              ? styles.visibleLayer
              : styles.hiddenLayer,
          ]}
        >
          <AnimatedFlashList
            key={`${sceneKey}:${sceneBodyContentSpec.listKey ?? 'primary-list'}`}
            ref={sceneBodyTransportSpec.listRef}
            {...({
              ...sceneResolvedFlashListProps,
              style: sceneFlashListSurfaceStyle,
              data: sceneBodyContentSpec.data,
              renderItem: sceneBodyContentSpec.renderItem,
              keyExtractor: sceneBodyContentSpec.keyExtractor,
              contentContainerStyle: sceneListContentContainerStyle,
            } as FlashListProps<unknown>)}
            ListHeaderComponent={
              primaryOwnsScroll ? sceneBodyContentSpec.ListHeaderComponent : null
            }
            ListFooterComponent={
              primaryOwnsScroll ? sceneBodyContentSpec.ListFooterComponent : null
            }
            ListEmptyComponent={primaryOwnsScroll ? sceneBodyContentSpec.ListEmptyComponent : null}
            ItemSeparatorComponent={sceneBodyContentSpec.ItemSeparatorComponent}
            keyboardShouldPersistTaps={sceneKeyboardShouldPersistTaps}
            scrollEnabled={bodyScrollRuntime.shouldEnableScroll && primaryOwnsScroll}
            renderScrollComponent={primaryOwnsScroll ? renderSceneScrollComponent : undefined}
            onScroll={primaryOwnsScroll ? bodyScrollRuntime.primaryListOnScroll : undefined}
            scrollEventThrottle={primaryOwnsScroll ? 16 : undefined}
            onScrollBeginDrag={primaryOwnsScroll ? handlePrimaryScrollBeginDrag : undefined}
            onScrollEndDrag={primaryOwnsScroll ? handlePrimaryScrollEndDrag : undefined}
            onEndReached={sceneBodyContentSpec.onEndReached}
            onEndReachedThreshold={sceneBodyContentSpec.onEndReachedThreshold}
            showsVerticalScrollIndicator={
              bodyDefaults.effectiveShowsVerticalScrollIndicator && primaryOwnsScroll
            }
            keyboardDismissMode={sceneKeyboardDismissMode}
            bounces={sceneBounces}
            alwaysBounceVertical={sceneAlwaysBounceVertical}
            overScrollMode={sceneOverScrollMode}
            testID={sceneBodyTransportSpec.testID ?? bodyDefaults.resolvedTestID}
            extraData={sceneBodyContentSpec.extraData}
            scrollIndicatorInsets={sceneScrollIndicatorInsets}
          />
        </View>
        {sceneSecondaryList != null && shouldRenderSecondaryList ? (
          <View
            pointerEvents={sceneResolvedActiveList === 'secondary' ? 'auto' : 'none'}
            style={[
              styles.dualListLayer,
              sceneResolvedActiveList === 'secondary' ? styles.visibleLayer : styles.hiddenLayer,
            ]}
          >
            <AnimatedFlashList
              key={`${sceneKey}:${sceneSecondaryList.listKey ?? 'secondary-list'}`}
              ref={sceneSecondaryListTransport?.listRef}
              {...({
                ...sceneSecondaryFlashListProps,
                style: sceneSecondaryFlashListSurfaceStyle,
                data: sceneSecondaryList.data,
                renderItem: sceneSecondaryList.renderItem ?? sceneBodyContentSpec.renderItem,
                keyExtractor: sceneSecondaryList.keyExtractor ?? sceneBodyContentSpec.keyExtractor,
                contentContainerStyle: sceneSecondaryContentContainerStyle,
              } as FlashListProps<unknown>)}
              ListHeaderComponent={
                secondaryOwnsScroll
                  ? sceneSecondaryList.ListHeaderComponent ??
                    sceneBodyContentSpec.ListHeaderComponent
                  : null
              }
              ListFooterComponent={
                secondaryOwnsScroll
                  ? sceneSecondaryList.ListFooterComponent ??
                    sceneBodyContentSpec.ListFooterComponent
                  : null
              }
              ListEmptyComponent={
                secondaryOwnsScroll
                  ? sceneSecondaryList.ListEmptyComponent ?? sceneBodyContentSpec.ListEmptyComponent
                  : null
              }
              ItemSeparatorComponent={
                sceneSecondaryList.ItemSeparatorComponent ??
                sceneBodyContentSpec.ItemSeparatorComponent
              }
              keyboardShouldPersistTaps={sceneKeyboardShouldPersistTaps}
              scrollEnabled={bodyScrollRuntime.shouldEnableScroll && secondaryOwnsScroll}
              renderScrollComponent={secondaryOwnsScroll ? renderSceneScrollComponent : undefined}
              onScroll={secondaryOwnsScroll ? bodyScrollRuntime.secondaryListOnScroll : undefined}
              scrollEventThrottle={secondaryOwnsScroll ? 16 : undefined}
              onScrollBeginDrag={
                secondaryOwnsScroll
                  ? (event: ScrollEvent) => {
                      sceneBodyTransportSpec.onScrollBeginDrag?.();
                      (
                        sceneSecondaryListTransport?.flashListProps ?? sceneFlashListProps
                      )?.onScrollBeginDrag?.(event);
                    }
                  : undefined
              }
              onScrollEndDrag={
                secondaryOwnsScroll
                  ? (event: ScrollEvent) => {
                      sceneBodyTransportSpec.onScrollEndDrag?.();
                      sceneBodyTransportSpec.onScrollOffsetChange?.(
                        bodyScrollRuntime.scrollOffset.value
                      );
                      (
                        sceneSecondaryListTransport?.flashListProps ?? sceneFlashListProps
                      )?.onScrollEndDrag?.(event);
                    }
                  : undefined
              }
              onEndReached={sceneSecondaryList.onEndReached ?? sceneBodyContentSpec.onEndReached}
              onEndReachedThreshold={sceneBodyContentSpec.onEndReachedThreshold}
              showsVerticalScrollIndicator={
                bodyDefaults.effectiveShowsVerticalScrollIndicator && secondaryOwnsScroll
              }
              keyboardDismissMode={sceneKeyboardDismissMode}
              bounces={sceneBounces}
              alwaysBounceVertical={sceneAlwaysBounceVertical}
              overScrollMode={sceneOverScrollMode}
              testID={
                sceneSecondaryListTransport?.testID ??
                sceneBodyTransportSpec.testID ??
                bodyDefaults.resolvedTestID
              }
              extraData={sceneSecondaryList.extraData ?? sceneBodyContentSpec.extraData}
              scrollIndicatorInsets={
                sceneSecondaryListTransport?.scrollIndicatorInsets ?? sceneScrollIndicatorInsets
              }
            />
          </View>
        ) : null}
      </>
    );
  }
);

ActiveBottomSheetSceneStackListBodySurface.displayName =
  'ActiveBottomSheetSceneStackListBodySurface';

export const BottomSheetSceneStackListBodySurface = React.memo(
  ({ shouldRenderListBody, ...activeListProps }: BottomSheetSceneStackListBodySurfaceProps) => {
    useSearchNavSwitchCommitAttribution(
      `BottomSheetSceneStackListBodySurface:${activeListProps.sceneKey}`
    );
    React.useLayoutEffect(() => {
      markSearchNavSwitchRuntimeAttribution(
        `BottomSheetSceneStackListBodySurface:${activeListProps.sceneKey}`,
        `layoutEffect:render:${shouldRenderListBody ? 'active' : 'empty'}`
      );
    });

    return shouldRenderListBody ? (
      <ActiveBottomSheetSceneStackListBodySurface {...activeListProps} />
    ) : null;
  }
);

BottomSheetSceneStackListBodySurface.displayName = 'BottomSheetSceneStackListBodySurface';
