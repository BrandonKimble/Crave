import React from 'react';
import { StyleSheet, View } from 'react-native';

import {
  type SceneStackBodyContentProps,
  type StaticContentSurfaceProps,
} from './bottomSheetSceneStackBodyLayerContract';
import { bottomSheetSceneStackHostStyles as styles } from './bottomSheetSceneStackHostStyles';
import {
  resolveListContentContainerStyle,
  sanitizeContentContainerStyle,
} from './bottomSheetSurfaceStyleUtils';
import { BottomSheetSceneStackMountedBody } from './BottomSheetSceneStackMountedBodyRegistry';
import { BottomSheetSceneStackListBodySurface } from './BottomSheetSceneStackListBodySurface';

const StaticContentSurface = React.memo(
  ({ content, containerStyle, surfaceStyle }: StaticContentSurfaceProps) => (
    <View style={surfaceStyle}>
      <View style={containerStyle}>{content}</View>
    </View>
  )
);

export const useBottomSheetSceneStackBodyContentRuntime = ({
  sceneKey,
  shouldRenderListBody,
  shouldAttachMountedContent,
  bodyDefaults,
  bodyScrollRuntime,
  sceneBodyContentEntry,
  sceneBodyTransportEntry,
}: SceneStackBodyContentProps): React.ReactNode => {
  const sceneBodyContentSpec = sceneBodyContentEntry.bodyContentSpec;
  const sceneBodyTransportSpec = sceneBodyTransportEntry.bodyTransportSpec;
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
  const sceneContentScrollMode =
    sceneBodyContentSpec.surfaceKind === 'content'
      ? sceneBodyContentSpec.contentScrollMode
      : sceneBodyContentSpec.surfaceKind === 'mounted'
      ? sceneBodyContentSpec.contentScrollMode ?? 'scroll'
      : 'scroll';
  const sceneContentComponent =
    sceneBodyContentSpec.surfaceKind === 'content' ? (
      sceneBodyContentSpec.contentComponent
    ) : sceneBodyContentSpec.surfaceKind === 'mounted' ? (
      shouldAttachMountedContent ? (
        <BottomSheetSceneStackMountedBody mountedBodyKey={sceneBodyContentSpec.mountedBodyKey} />
      ) : null
    ) : null;
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
  const sceneSurfaceStyle = React.useMemo(
    () =>
      StyleSheet.flatten([
        styles.sceneStackBodyLayer,
        sceneBodyTransportSpec.contentSurfaceStyle,
      ]) ?? undefined,
    [sceneBodyTransportSpec.contentSurfaceStyle]
  );
  const sceneTransparentSurfaceStyle = React.useMemo(
    () => (bodyDefaults.scrollHeaderComponent ? styles.transparentFlashListSurface : undefined),
    [bodyDefaults.scrollHeaderComponent]
  );
  const sceneStaticContentBody = React.useMemo(() => {
    if (
      sceneBodyContentSpec.surfaceKind === 'list' ||
      sceneContentScrollMode !== 'static' ||
      sceneContentComponent == null
    ) {
      return null;
    }

    return (
      <StaticContentSurface
        content={sceneContentComponent}
        containerStyle={sceneListContentContainerStyle}
        surfaceStyle={sceneTransparentSurfaceStyle}
      />
    );
  }, [
    sceneBodyContentSpec.surfaceKind,
    sceneContentComponent,
    sceneContentScrollMode,
    sceneListContentContainerStyle,
    sceneTransparentSurfaceStyle,
  ]);
  const handleContentScrollBeginDrag = React.useCallback(() => {
    sceneBodyTransportSpec.onScrollBeginDrag?.();
  }, [sceneBodyTransportSpec]);
  const handleContentScrollEndDrag = React.useCallback(() => {
    sceneBodyTransportSpec.onScrollEndDrag?.();
    sceneBodyTransportSpec.onScrollOffsetChange?.(bodyScrollRuntime.scrollOffset.value);
  }, [bodyScrollRuntime.scrollOffset, sceneBodyTransportSpec]);
  const handleContentMomentumBegin = React.useCallback(() => {
    sceneBodyTransportSpec.onMomentumBeginJS?.();
  }, [sceneBodyTransportSpec]);
  const handleContentMomentumEnd = React.useCallback(() => {
    sceneBodyTransportSpec.onMomentumEndJS?.();
    sceneBodyTransportSpec.onScrollOffsetChange?.(bodyScrollRuntime.scrollOffset.value);
  }, [bodyScrollRuntime.scrollOffset, sceneBodyTransportSpec]);

  const sceneBodyInner = React.useMemo(() => {
    if (sceneBodyContentSpec.surfaceKind !== 'list') {
      return sceneContentScrollMode === 'static' ? (
        sceneStaticContentBody
      ) : (
        <bodyScrollRuntime.ScrollComponent
          style={sceneTransparentSurfaceStyle}
          contentContainerStyle={sceneListContentContainerStyle}
          keyboardShouldPersistTaps={sceneKeyboardShouldPersistTaps}
          scrollEnabled={bodyScrollRuntime.shouldEnableScroll}
          onScroll={bodyScrollRuntime.primaryScrollViewOnScroll}
          scrollEventThrottle={16}
          onScrollBeginDrag={handleContentScrollBeginDrag}
          onScrollEndDrag={handleContentScrollEndDrag}
          onMomentumScrollBegin={handleContentMomentumBegin}
          onMomentumScrollEnd={handleContentMomentumEnd}
          showsVerticalScrollIndicator={bodyDefaults.effectiveShowsVerticalScrollIndicator}
          keyboardDismissMode={sceneKeyboardDismissMode}
          bounces={sceneBounces}
          alwaysBounceVertical={sceneAlwaysBounceVertical}
          overScrollMode={sceneOverScrollMode}
          testID={sceneBodyTransportSpec.testID ?? bodyDefaults.resolvedTestID}
          scrollIndicatorInsets={sceneScrollIndicatorInsets}
        >
          {sceneContentComponent}
        </bodyScrollRuntime.ScrollComponent>
      );
    }

    return (
      <BottomSheetSceneStackListBodySurface
        sceneKey={sceneKey}
        shouldRenderListBody={shouldRenderListBody}
        bodyDefaults={bodyDefaults}
        bodyScrollRuntime={bodyScrollRuntime}
        sceneBodyContentSpec={sceneBodyContentSpec}
        sceneBodyTransportSpec={sceneBodyTransportSpec}
      />
    );
  }, [
    bodyDefaults,
    bodyScrollRuntime,
    handleContentMomentumBegin,
    handleContentMomentumEnd,
    handleContentScrollBeginDrag,
    handleContentScrollEndDrag,
    sceneAlwaysBounceVertical,
    sceneBounces,
    sceneBodyContentSpec,
    sceneBodyTransportSpec,
    sceneContentComponent,
    sceneContentScrollMode,
    sceneKeyboardDismissMode,
    sceneKeyboardShouldPersistTaps,
    sceneKey,
    sceneListContentContainerStyle,
    sceneOverScrollMode,
    sceneScrollIndicatorInsets,
    sceneStaticContentBody,
    sceneTransparentSurfaceStyle,
    shouldRenderListBody,
  ]);

  return React.useMemo(
    () => <View style={sceneSurfaceStyle}>{sceneBodyInner}</View>,
    [sceneBodyInner, sceneSurfaceStyle]
  );
};
