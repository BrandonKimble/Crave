import React from 'react';
import { StyleSheet, View } from 'react-native';

import {
  type SceneStackBodyContentProps,
  type StaticContentSurfaceProps,
} from './bottomSheetSceneStackBodyLayerContract';
import { bottomSheetSceneStackHostStyles as styles } from './bottomSheetSceneStackHostStyles';
import { resolveListContentContainerStyle } from './bottomSheetSurfaceStyleUtils';
import { BottomSheetSceneStackMountedBody } from './BottomSheetSceneStackMountedBodyRegistry';
import { BottomSheetSceneStackListBodySurface } from './BottomSheetSceneStackListBodySurface';
import { useMountedSceneScrollRestore } from './useMountedSceneScrollRestore';
import {
  createSceneEntryMountUnitKey,
  type SceneEntryMountUnit,
} from '../navigation/runtime/app-route-scene-entry-mounts';
import { getOverlayScrollOffset, setOverlayScrollOffset } from './overlayScrollOffsetRuntime';
import { notePremountChildBodyFirstCommit } from '../navigation/runtime/premount-violation-probe';
import { registerOverlaySceneScrollHandle } from './overlaySceneScrollHandleRegistry';
import { isSceneBodyDataActivityKey } from '../navigation/runtime/app-route-scene-input-registry';
import { useBottomSheetSceneStackBodyRenderActivity } from './BottomSheetSceneStackBodyActivityContext';

// ─── W1 slice 1 — entry-keyed child mount boundary ──────────────────────────────────────────
// One boundary per key#entryId unit: keeps EVERY in-stack (depth≤K) entry of a child scene
// mounted (React state isolation by construction) and shows only the ACTIVE unit.
const sceneEntryMountHiddenStyle = { display: 'none' as const };
// Active unit: flexGrow so a STATIC-mode body (dmSession) can fill the frame
// through the boundary. Inert for scroll-mode scenes — inside a content-sized
// scroll container there is no extra space to grow into.
const sceneEntryMountActiveStyle = { flexGrow: 1 };

// W1 slice 3 — the [PREMOUNT] first-commit sentinel: rendered INSIDE the boundary's subtree
// (after the body), so its run-once layout effect fires in the same Fabric commit as the
// unit's first build. The probe module tests that instant against the transition's
// visibility flip (the C4 pre-mount law) — dev console + Release os_log when violated.
const PremountFirstCommitSentinel = ({
  sceneKey,
  entryId,
  unitKey,
}: {
  sceneKey: string;
  entryId: string;
  unitKey: string;
}) => {
  const hasCommittedRef = React.useRef(false);
  React.useLayoutEffect(() => {
    if (hasCommittedRef.current) {
      return;
    }
    hasCommittedRef.current = true;
    notePremountChildBodyFirstCommit({ sceneKey, entryId, unitKey });
  });
  return null;
};

const SceneEntryMountBoundary = React.memo(
  ({
    unitKey,
    sceneKey,
    entryId,
    isActiveUnit,
    children,
  }: {
    unitKey: string;
    sceneKey: string;
    entryId: string;
    isActiveUnit: boolean;
    children: React.ReactNode;
  }) => {
    return (
      <View style={isActiveUnit ? sceneEntryMountActiveStyle : sceneEntryMountHiddenStyle}>
        {children}
        <PremountFirstCommitSentinel sceneKey={sceneKey} entryId={entryId} unitKey={unitKey} />
      </View>
    );
  }
);
SceneEntryMountBoundary.displayName = 'SceneEntryMountBoundary';

// Static-mode surface FILLS the body frame (flex:1 down the chain) so a
// static body that owns its layout (dmSession: thread flex:1 + bottom-pinned
// composer) can anchor to the frame's bottom edge.
const staticContentFillStyle = { flex: 1 };
const StaticContentSurface = React.memo(
  ({ content, containerStyle, surfaceStyle }: StaticContentSurfaceProps) => (
    <View style={[staticContentFillStyle, surfaceStyle]}>
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
  mountedEntryUnits,
  activeEntryId,
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
  // S-B origin-on-entry: hasActivatedExpandedContent only ever flips for RETAINED static tabs
  // with data lanes — a child mounted scene (no data lane) renders its content SYNCHRONOUSLY,
  // so its content is ready whenever it is active. Without this arm the pop-restore gate never
  // opens for child scenes (proven RED on the rig: staged lane consumed by nothing).
  const isSynchronousMountedContent = !isSceneBodyDataActivityKey(sceneKey);
  const mountedScrollRestoreRef = useMountedSceneScrollRestore({
    sceneKey,
    contentReady: isActive && (hasActivatedExpandedContent || isSynchronousMountedContent),
  });
  // Mounted-scroll scenes: publish a narrow imperative scroll handle (scrollTo + the
  // live offset SharedValue) under the scene's lane, so in-scene features that must
  // drive the shared scroll container (edit-mode drag-reorder edge auto-scroll,
  // page-registry §8.14) have a seam without threading refs through transports.
  const isMountedScrollScene =
    sceneBodyContentEntry.bodyContentSpec.surfaceKind === 'mounted' &&
    (sceneBodyContentEntry.bodyContentSpec.contentScrollMode ?? 'scroll') === 'scroll';
  React.useEffect(() => {
    if (!isMountedScrollScene) {
      return undefined;
    }
    return registerOverlaySceneScrollHandle(sceneKey, {
      scrollTo: (y, animated = false) => {
        mountedScrollRestoreRef.current?.scrollTo({ y, animated });
      },
      scrollOffset: bodyScrollRuntime.scrollOffset,
    });
  }, [bodyScrollRuntime.scrollOffset, isMountedScrollScene, mountedScrollRestoreRef, sceneKey]);

  React.useLayoutEffect(() => {
    if (mountedEntryUnits == null) {
      return; // singleton (root) path — byte-identical behavior
    }
    const previousEntryId = previousActiveEntryIdRef.current;
    if (previousEntryId === activeEntryId) {
      return;
    }
    previousActiveEntryIdRef.current = activeEntryId;
    // Save the departing unit's offset under ITS lane (the container still holds it).
    if (previousEntryId != null) {
      setOverlayScrollOffset(
        createSceneEntryMountUnitKey(sceneKey as never, previousEntryId),
        bodyScrollRuntime.scrollOffset.value
      );
    }
    // Restore the arriving unit's lane (0 for a fresh entry — new push starts at top).
    if (activeEntryId != null) {
      const storedOffset = getOverlayScrollOffset(
        createSceneEntryMountUnitKey(sceneKey as never, activeEntryId)
      );
      mountedScrollRestoreRef.current?.scrollTo({ y: storedOffset, animated: false });
    }
  }, [
    activeEntryId,
    bodyScrollRuntime.scrollOffset,
    mountedEntryUnits,
    mountedScrollRestoreRef,
    sceneKey,
  ]);
  // ─── W1 slice 2 — per-entry SCROLL lane (key#entryId) for entry-keyed child scenes ───────
  // The leg shares ONE scroll container across its mounted units, so per-entry scroll
  // isolation = save the departing unit's offset under its `key#entryId` lane and restore the
  // arriving unit's lane (0 for a fresh entry). Root scenes (units null) are untouched; the
  // one-shot origin-restore lane (useMountedSceneScrollRestore, keyed by sceneKey) is
  // orthogonal and unchanged.
  const previousActiveEntryIdRef = React.useRef<string | null>(activeEntryId);
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
        ? (sceneBodyContentSpec.contentScrollMode ?? 'scroll')
        : 'scroll';
  const sceneContentComponent =
    sceneBodyContentSpec.surfaceKind === 'content' ? (
      sceneBodyContentSpec.contentComponent
    ) : sceneBodyContentSpec.surfaceKind === 'mounted' ? (
      shouldAttachMountedContent ? (
        mountedEntryUnits != null ? (
          // W1 slice 1 (C1/C2): child-role scenes mount ONE body per key#entryId unit — the
          // entry flows in AS PROPS (never a topmost-per-key read); only the active unit is
          // visible, the rest stay mounted (state isolation) but hidden and out of layout.
          <>
            {mountedEntryUnits.map((unit: SceneEntryMountUnit) => (
              <SceneEntryMountBoundary
                key={unit.unitKey}
                unitKey={unit.unitKey}
                sceneKey={unit.sceneKey}
                entryId={unit.entryId}
                isActiveUnit={unit.entryId === activeEntryId}
              >
                <BottomSheetSceneStackMountedBody
                  mountedBodyKey={sceneBodyContentSpec.mountedBodyKey}
                  entry={unit.entry}
                />
              </SceneEntryMountBoundary>
            ))}
          </>
        ) : (
          <BottomSheetSceneStackMountedBody mountedBodyKey={sceneBodyContentSpec.mountedBodyKey} />
        )
      ) : null
    ) : null;
  const sceneContentContainerStyle =
    sceneBodyTransportSpec.contentContainerStyle ?? bodyDefaults.resolvedContentContainerStyle;
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
        // The fill is applied HERE, not via the transport's contentContainerStyle:
        // the transport carries typed SceneBodyContentInsets (padding/backgroundColor
        // only — a flex there is now a COMPILE error, not the silent strip that caused
        // the W4 dmSession regression). Static mode = the body owns a frame-filling
        // layout by definition, so the fill is unconditional.
        containerStyle={[sceneListContentContainerStyle, staticContentFillStyle]}
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
