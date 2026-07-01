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
import { useMountedSceneScrollRestore } from './useMountedSceneScrollRestore';
import { useBottomSheetSceneStackBodyRenderActivity } from './BottomSheetSceneStackBodyActivityContext';

const StaticContentSurface = React.memo(
  ({ content, containerStyle, surfaceStyle }: StaticContentSurfaceProps) => (
    <View style={surfaceStyle}>
      <View style={containerStyle}>{content}</View>
    </View>
  )
);

export const useBottomSheetSceneStackBodyContentRuntime = ({
  sceneKey,
  isActive,
  shouldRenderListBody,
  shouldAttachMountedContent,
  bodyDefaults,
  bodyScrollRuntime,
  sceneBodyContentEntry,
  sceneBodyTransportEntry,
}: SceneStackBodyContentProps): React.ReactNode => {
  // P3 return-to-origin scroll RESTORE for the mounted-scroll path (bookmarks). Gate on
  // isActive && hasActivatedExpandedContent:
  //   • isActive — the static tab bodies are RETAINED (never unmounted once bootstrapped), so a
  //     dismiss-return is NOT a cold re-mount; the only signal that flips on the return is the
  //     scene becoming ACTIVE again. (Gating on a mount/skeleton transition would fire once,
  //     ever, on first bootstrap — dead for every subsequent return.)
  //   • hasActivatedExpandedContent — the first NON-SKELETON commit; the real content's full
  //     extent must exist or a deep scrollTo clamps to 0 (the jump-to-top failure).
  // On that combined signal, apply any one-shot pending scroll restore staged by the dismiss
  // path, as the sole writer that frame. For the list path / static / non-mounted scenes the
  // render-activity provider is absent → hasActivatedExpandedContent defaults false → inert.
  const { hasActivatedExpandedContent } = useBottomSheetSceneStackBodyRenderActivity();
  const mountedScrollRestoreRef = useMountedSceneScrollRestore({
    sceneKey,
    contentReady: isActive && hasActivatedExpandedContent,
  });
  const sceneBodyContentSpec = sceneBodyContentEntry.bodyContentSpec;
  const sceneBodyTransportSpec = sceneBodyTransportEntry.bodyTransportSpec;
  const sceneKeyboardShouldPersistTaps =
    sceneBodyTransportSpec.keyboardShouldPersistTaps ??
    bodyDefaults.resolvedKeyboardShouldPersistTaps;
  const sceneKeyboardDismissMode =
    sceneBodyTransportSpec.keyboardDismissMode ?? bodyDefaults.resolvedKeyboardDismissMode;
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
          ref={mountedScrollRestoreRef}
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
    mountedScrollRestoreRef,
    sceneBodyContentSpec,
    sceneBodyTransportSpec,
    sceneContentComponent,
    sceneContentScrollMode,
    sceneKeyboardDismissMode,
    sceneKeyboardShouldPersistTaps,
    sceneKey,
    sceneListContentContainerStyle,
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
