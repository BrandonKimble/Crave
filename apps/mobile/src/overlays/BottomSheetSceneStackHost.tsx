import React from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

import {
  type TransitionLanePlayer,
  resolveContentLaneOpacities,
  resolveHeaderSwap,
  useTransitionLanePlayer,
} from '../navigation/runtime/transition-engine/transition-lane-player';
import type { ContentMode } from '../navigation/runtime/transition-engine/transition-descriptor-contract';
import { deriveHostTokenDescriptor } from '../navigation/runtime/transition-engine/host-token-transition-adapter';

import { SceneStackBodyContentLayer, SceneStackBodyFrame } from './BottomSheetSceneStackBodyLayer';
import { SceneStackDecorLayer, SceneStackHeaderLayer } from './BottomSheetSceneStackDecorLayers';
import { BottomSheetSceneStackPageFrame } from './BottomSheetSceneStackPageFrame';
import { FrostedGlassBackground } from '../components/FrostedGlassBackground';
import type {
  BottomSheetSceneStackBodyRuntimeSnapshot,
  BottomSheetSceneStackChromeEntry,
  BottomSheetSceneStackHostProps,
} from './bottomSheetSceneStackHostContract';
import type { SceneStackBodyContentActivity } from './bottomSheetSceneStackBodyLayerContract';
import { bottomSheetSceneStackHostStyles as styles } from './bottomSheetSceneStackHostStyles';
import {
  areSearchRouteSceneStackBodyContentEntriesEqual,
  areSearchRouteSceneStackBodyTransportEntriesEqual,
} from './searchRouteSceneStackSheetContract';
import type { OverlayKey } from './types';
import type {
  AppRouteSceneStackBodySurfaceSnapshot,
  AppRouteSceneStackScenePresentationSnapshot,
} from '../navigation/runtime/app-route-scene-stack-surface-contract';
import {
  APP_ROUTE_SCENE_INPUT_KEYS,
  isSceneBodyDataActivityKey,
} from '../navigation/runtime/app-route-scene-input-registry';
import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';
import { useSearchOverlayProfilerRender } from './SearchOverlayProfilerContext';
import { SearchResultsPageBundleHost } from './SearchMountedScenePageBundleAuthority';
import {
  finishSearchNavSwitchRuntimeAttributionSpan,
  markSearchNavSwitchRuntimeAttribution,
  startSearchNavSwitchRuntimeAttributionSpan,
} from '../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import { useSearchNavSwitchCommitAttribution } from '../screens/Search/runtime/shared/use-search-nav-switch-commit-attribution';
import { logPerfScenarioStackAttribution } from '../perf/perf-scenario-attribution';
import { useSearchSurfaceRuntimeSelector } from '../screens/Search/runtime/surface/search-surface-runtime';

const PERSISTENT_ROUTE_SCENE_STACK_KEYS: readonly OverlayKey[] = APP_ROUTE_SCENE_INPUT_KEYS;

// ── Four-lane player split (Phase 2 live cutover) ──────────────────────────────
// REPLACES the legacy whole-leg crossfade ramp (the single `animatedLegOpacityStyle` that faded
// header + plate + body together over the 250ms `transitionProgress` clock). The host now owns a
// four-lane player (useTransitionLanePlayer): ONE press-up-started `progress` + ONE `paintAck` gate.
// The leg opacity is SPLIT across the per-leg sub-layers (sheet-frost-architecture, owner hard req):
//   • HEADER region (toggle strip + close button + THEIR CUTOUTS) → resolveHeaderSwap(paintAck):
//     INSTANT swap, NEVER fades → the cutouts always reveal the constant frosted-map.
//   • WHITE PLATE (background, with cutouts) → resolveHeaderSwap too: HARD swap, stays opaque (no
//     map leak in the solid areas).
//   • BODY region → resolveContentLaneOpacities(progress, paintAck, mode): the ONLY thing that
//     cross-dissolves, over the constant frost, per ContentMode (hard = paint-ack-gated immediate
//     swap; held-dissolve = hold outgoing opaque then dissolve).
// Every scene is still a co-mounted absolute-fill sibling toggled by role; the player's outputs are a
// {outgoing, incoming} opacity PAIR, and each leg picks its component by its role (below).
// SHEET-Y is NOT in the player this phase — translateY stays with the kept spring runtime (no
// double-driver); the player's `progress` is a pure clock for the body dissolve + header swap timing.
type SceneStackLegRole = 'incoming' | 'outgoing' | 'idle';

type SceneStackTransitionDisplayValue = {
  player: TransitionLanePlayer;
  // The content mode of the in-flight transition (derived from the incoming scene). Drives the
  // BODY-region dissolve; the header/plate always instant-swap regardless of mode.
  contentMode: ContentMode;
  effectiveOutgoing: OverlayKey | null;
  effectiveIncoming: OverlayKey | null;
  // Whether a real transition is in flight (outgoing differs from incoming). When false, the lone
  // displayed leg shows at full opacity and the player gate is irrelevant.
  isTransitioning: boolean;
  // Paint-ack producer sink: the incoming body's first onLayout reports here. The host honors it
  // ONLY for the incoming scene of the live transition (markPaintAck), so an idle/outgoing leg's
  // re-layout can never flip the gate (#1 correctness: gate flips on the RIGHT scene's paint).
  reportScenePaint: (sceneKey: OverlayKey) => void;
};

const SceneStackTransitionDisplayContext =
  React.createContext<SceneStackTransitionDisplayValue | null>(null);

// Pure worklet: pick the per-leg opacity from the player's {outgoing, incoming} pair by this leg's
// role. idle ⇒ 0. Used for BOTH the header-swap pair and the content-dissolve pair.
const pickLegOpacity = (
  pair: { outgoing: number; incoming: number },
  legRole: SceneStackLegRole
): number => {
  'worklet';
  if (legRole === 'incoming') {
    return pair.incoming;
  }
  if (legRole === 'outgoing') {
    return pair.outgoing;
  }
  return 0;
};

const resolveSceneStackLegRole = (
  sceneKey: OverlayKey,
  ctx: SceneStackTransitionDisplayValue | null
): SceneStackLegRole => {
  if (ctx == null) {
    return 'idle';
  }
  // A same-scene re-entry (outgoing === incoming) resolves to 'incoming' at full
  // opacity — no out-and-back self-flicker (regression hole #1, render side).
  if (sceneKey === ctx.effectiveIncoming) {
    return 'incoming';
  }
  if (sceneKey === ctx.effectiveOutgoing) {
    return 'outgoing';
  }
  return 'idle';
};

const areChromeSurfaceEntriesEqual = (
  left: BottomSheetSceneStackChromeEntry | null,
  right: BottomSheetSceneStackChromeEntry | null
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.sceneKey === right.sceneKey &&
    left.surfaceKind === right.surfaceKind &&
    left.mountedChromeKey === right.mountedChromeKey &&
    left.excludedSurfaces === right.excludedSurfaces &&
    left.underlayComponent === right.underlayComponent &&
    left.backgroundComponent === right.backgroundComponent &&
    left.headerComponent === right.headerComponent &&
    left.overlayComponent === right.overlayComponent);

const areSceneContentActivitySelectionsEqual = (
  left: SceneStackBodyContentActivity,
  right: SceneStackBodyContentActivity,
  shouldCompareDataLane: boolean
): boolean =>
  left.isActive === right.isActive &&
  left.shouldRenderListBody === right.shouldRenderListBody &&
  left.shouldAttachMountedContent === right.shouldAttachMountedContent &&
  (!shouldCompareDataLane || left.shouldRunDataLane === right.shouldRunDataLane) &&
  left.shouldSubscribeDataLane === right.shouldSubscribeDataLane &&
  left.shouldRenderExpandedContent === right.shouldRenderExpandedContent &&
  left.hasActivatedExpandedContent === right.hasActivatedExpandedContent;

const shouldCompareSceneBodyDataActivity = (
  snapshot: AppRouteSceneStackBodySurfaceSnapshot
): boolean => isSceneBodyDataActivityKey(snapshot.contentEntry?.sceneKey);

const markSceneBodySurfaceSelectionDiff = (
  sceneKey: string | null | undefined,
  field: string,
  left: unknown,
  right: unknown
): void => {
  if (Object.is(left, right)) {
    return;
  }
  markSearchNavSwitchRuntimeAttribution(
    'SceneStackBodySurfaceSelectionDiff',
    `field:${sceneKey ?? 'unknown'}:${field}`
  );
  logPerfScenarioStackAttribution({
    owner: 'scene_stack_body_surface_selection_diff',
    path: `field:${sceneKey ?? 'unknown'}:${field}`,
  });
};

const getMountedBodyKey = (snapshot: AppRouteSceneStackBodySurfaceSnapshot): string | null => {
  const spec = snapshot.contentEntry?.bodyContentSpec;
  return spec?.surfaceKind === 'mounted' ? spec.mountedBodyKey : null;
};

const areSceneBodySurfaceSelectionsEqual = (
  left: AppRouteSceneStackBodySurfaceSnapshot,
  right: AppRouteSceneStackBodySurfaceSnapshot
): boolean => {
  const sceneKey = right.contentEntry?.sceneKey ?? left.contentEntry?.sceneKey ?? null;

  if (!areSearchRouteSceneStackBodyContentEntriesEqual(left.contentEntry, right.contentEntry)) {
    markSceneBodySurfaceSelectionDiff(
      sceneKey,
      'contentEntryRef',
      left.contentEntry,
      right.contentEntry
    );
    markSceneBodySurfaceSelectionDiff(
      sceneKey,
      'contentEntry.sceneKey',
      left.contentEntry?.sceneKey ?? null,
      right.contentEntry?.sceneKey ?? null
    );
    markSceneBodySurfaceSelectionDiff(
      sceneKey,
      'contentEntry.surfaceKind',
      left.contentEntry?.bodyContentSpec.surfaceKind ?? null,
      right.contentEntry?.bodyContentSpec.surfaceKind ?? null
    );
    markSceneBodySurfaceSelectionDiff(
      sceneKey,
      'contentEntry.mountedBodyKey',
      getMountedBodyKey(left),
      getMountedBodyKey(right)
    );
    return false;
  }

  if (
    !areSearchRouteSceneStackBodyTransportEntriesEqual(left.transportEntry, right.transportEntry)
  ) {
    markSceneBodySurfaceSelectionDiff(
      sceneKey,
      'transportEntryRef',
      left.transportEntry,
      right.transportEntry
    );
    return false;
  }

  if (sceneKey === 'search') {
    return true;
  }

  const shouldCompareDataLane =
    shouldCompareSceneBodyDataActivity(left) || shouldCompareSceneBodyDataActivity(right);
  const isEqual = areSceneContentActivitySelectionsEqual(
    left.contentActivity,
    right.contentActivity,
    shouldCompareDataLane
  );
  if (!isEqual) {
    markSceneBodySurfaceSelectionDiff(
      sceneKey,
      'contentActivity.shouldRenderListBody',
      left.contentActivity.shouldRenderListBody,
      right.contentActivity.shouldRenderListBody
    );
    markSceneBodySurfaceSelectionDiff(
      sceneKey,
      'contentActivity.shouldAttachMountedContent',
      left.contentActivity.shouldAttachMountedContent,
      right.contentActivity.shouldAttachMountedContent
    );
    if (shouldCompareDataLane) {
      markSceneBodySurfaceSelectionDiff(
        sceneKey,
        'contentActivity.shouldRunDataLane',
        left.contentActivity.shouldRunDataLane,
        right.contentActivity.shouldRunDataLane
      );
    }
    markSceneBodySurfaceSelectionDiff(
      sceneKey,
      'contentActivity.shouldSubscribeDataLane',
      left.contentActivity.shouldSubscribeDataLane,
      right.contentActivity.shouldSubscribeDataLane
    );
    markSceneBodySurfaceSelectionDiff(
      sceneKey,
      'contentActivity.shouldRenderExpandedContent',
      left.contentActivity.shouldRenderExpandedContent,
      right.contentActivity.shouldRenderExpandedContent
    );
    markSceneBodySurfaceSelectionDiff(
      sceneKey,
      'contentActivity.hasActivatedExpandedContent',
      left.contentActivity.hasActivatedExpandedContent,
      right.contentActivity.hasActivatedExpandedContent
    );
  }
  return isEqual;
};

const areSceneBodyRuntimeSelectionsEqual = (
  left: BottomSheetSceneStackBodyRuntimeSnapshot,
  right: BottomSheetSceneStackBodyRuntimeSnapshot
): boolean => {
  if (
    left.bodyDefaults === right.bodyDefaults &&
    left.bodyScrollRuntime === right.bodyScrollRuntime
  ) {
    return true;
  }
  if (left.bodyDefaults !== right.bodyDefaults) {
    logPerfScenarioStackAttribution({
      owner: 'scene_stack_body_runtime_selection_diff',
      path: 'field:bodyDefaults',
    });
  }
  if (left.bodyScrollRuntime !== right.bodyScrollRuntime) {
    logPerfScenarioStackAttribution({
      owner: 'scene_stack_body_runtime_selection_diff',
      path: 'field:bodyScrollRuntime',
    });
  }
  return false;
};

type SceneStackChromePresentationSelection = {
  sceneChromeEntry: BottomSheetSceneStackChromeEntry | null;
};

const areSceneChromePresentationSelectionsEqual = (
  left: SceneStackChromePresentationSelection,
  right: SceneStackChromePresentationSelection
): boolean => areChromeSurfaceEntriesEqual(left.sceneChromeEntry, right.sceneChromeEntry);

export const BottomSheetSceneStackHost = ({
  sceneStackSurfaceAuthority,
  routeSceneDisplayTargetRegistry,
  shadowShellStyle,
  surfaceStyle,
  scrollHeaderComponent,
  onHeaderLayout,
  onScrollHeaderLayout,
  scrollHeaderSyncStyle,
  displayedSceneKey,
  outgoingSceneKey,
  incomingSceneKey,
  contentTransitionToken,
  onContentSettleComplete,
  bodyRuntimeAuthority,
  sheetYValue,
}: BottomSheetSceneStackHostProps) => {
  useSearchNavSwitchCommitAttribution('BottomSheetSceneStackHost');
  const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
  const onProfilerRender = useSearchOverlayProfilerRender();
  const sceneStackHost = (
    <ActiveSceneStackHostLayers
      sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
      routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
      shadowShellStyle={shadowShellStyle}
      surfaceStyle={surfaceStyle}
      scrollHeaderComponent={scrollHeaderComponent}
      onHeaderLayout={onHeaderLayout}
      onScrollHeaderLayout={onScrollHeaderLayout}
      scrollHeaderSyncStyle={scrollHeaderSyncStyle}
      displayedSceneKey={displayedSceneKey}
      outgoingSceneKey={outgoingSceneKey}
      incomingSceneKey={incomingSceneKey}
      contentTransitionToken={contentTransitionToken}
      onContentSettleComplete={onContentSettleComplete}
      bodyRuntimeAuthority={bodyRuntimeAuthority}
      sheetYValue={sheetYValue}
    />
  );

  if (!onProfilerRender) {
    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'BottomSheetSceneStackHost',
      operation: 'render',
      startedAtMs: renderStartedAtMs,
    });
    return sceneStackHost;
  }

  const profiledSceneStackHost = (
    <React.Profiler id="BottomSheetSceneStackHost" onRender={onProfilerRender}>
      {sceneStackHost}
    </React.Profiler>
  );

  finishSearchNavSwitchRuntimeAttributionSpan({
    owner: 'BottomSheetSceneStackHost',
    operation: 'render',
    startedAtMs: renderStartedAtMs,
  });

  return profiledSceneStackHost;
};

type SceneStackBodyLayerHostProps = Pick<
  BottomSheetSceneStackHostProps,
  | 'sceneStackSurfaceAuthority'
  | 'routeSceneDisplayTargetRegistry'
  | 'bodyRuntimeAuthority'
  | 'onHeaderLayout'
  | 'displayedSceneKey'
  | 'sheetYValue'
> & {
  sceneKey: OverlayKey;
};

type SceneStackBodyContentLayerHostProps = Pick<
  SceneStackBodyLayerHostProps,
  'sceneStackSurfaceAuthority' | 'bodyRuntimeAuthority' | 'sceneKey'
>;

const areSceneStackBodyLayerHostPropsEqual = (
  previousProps: SceneStackBodyLayerHostProps,
  nextProps: SceneStackBodyLayerHostProps
): boolean => {
  if (
    previousProps.sceneKey !== nextProps.sceneKey ||
    previousProps.sceneStackSurfaceAuthority !== nextProps.sceneStackSurfaceAuthority ||
    previousProps.routeSceneDisplayTargetRegistry !== nextProps.routeSceneDisplayTargetRegistry
  ) {
    return false;
  }

  return (
    previousProps.bodyRuntimeAuthority === nextProps.bodyRuntimeAuthority &&
    previousProps.onHeaderLayout === nextProps.onHeaderLayout &&
    previousProps.sheetYValue === nextProps.sheetYValue &&
    previousProps.displayedSceneKey === nextProps.displayedSceneKey
  );
};

const areSceneStackBodyContentLayerHostPropsEqual = (
  previousProps: SceneStackBodyContentLayerHostProps,
  nextProps: SceneStackBodyContentLayerHostProps
): boolean =>
  previousProps.sceneKey === nextProps.sceneKey &&
  previousProps.sceneStackSurfaceAuthority === nextProps.sceneStackSurfaceAuthority &&
  previousProps.bodyRuntimeAuthority === nextProps.bodyRuntimeAuthority;

const SceneStackBodyFrameHost = React.memo(
  ({
    routeSceneDisplayTargetRegistry,
    sceneStackSurfaceAuthority,
    sceneKey,
    displayedSceneKey,
    onHeaderLayout,
    headerDividerScrollOffset,
    children,
  }: Pick<
    SceneStackBodyLayerHostProps,
    | 'routeSceneDisplayTargetRegistry'
    | 'sceneStackSurfaceAuthority'
    | 'sceneKey'
    | 'displayedSceneKey'
  > &
    Pick<BottomSheetSceneStackHostProps, 'onHeaderLayout'> & {
      headerDividerScrollOffset?: SharedValue<number>;
      children: React.ReactNode;
    }) => {
    useSearchNavSwitchCommitAttribution(`SceneStackBodyFrameHost:${sceneKey}`);
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    const transitionDisplay = React.useContext(SceneStackTransitionDisplayContext);
    const legRole = resolveSceneStackLegRole(sceneKey, transitionDisplay);
    const player = transitionDisplay?.player ?? null;
    const contentMode = transitionDisplay?.contentMode ?? null;
    const isTransitioning = transitionDisplay?.isTransitioning ?? false;
    const isSearchLeg = sceneKey === 'search';
    // ── The four-lane split (Phase 2). The player owns ONE progress + ONE paintAck. Per leg, we
    // pick our component of the {outgoing, incoming} opacity pair by this leg's role (pickLegOpacity).
    //   • BODY dissolve = resolveContentLaneOpacities(progress, paintAck, mode) — the body cross-
    //     dissolves (held) or hard-swaps (hard, paint-ack-gated) over the constant frost.
    //   • CHROME swap   = resolveHeaderSwap(paintAck) — header + plate + underlay + overlay INSTANT-
    //     swap on the paint-ack (never fade) → cutouts always show the frosted-map; plate stays opaque.
    // No transition in flight (or no player): the lone non-idle leg shows fully; idle hides.
    const bodyDissolveStyle = useAnimatedStyle(() => {
      'worklet';
      if (player == null || contentMode == null || legRole === 'idle') {
        return { opacity: legRole === 'idle' ? 0 : 1 };
      }
      const pair = resolveContentLaneOpacities(
        player.settleRamp.value,
        player.paintAck.value,
        contentMode
      );
      return { opacity: pickLegOpacity(pair, legRole) };
    }, [player, contentMode, legRole]);
    const chromeSwapStyle = useAnimatedStyle(() => {
      'worklet';
      if (player == null || legRole === 'idle') {
        return { opacity: legRole === 'idle' ? 0 : 1 };
      }
      const pair = resolveHeaderSwap(player.paintAck.value);
      return { opacity: pickLegOpacity(pair, legRole) };
    }, [player, legRole]);
    // The leg WRAPPER no longer fades (the legacy animatedLegOpacityStyle did). For a SPLIT (non-
    // search) leg the wrapper is a flat role-visibility (1 when in-flight, 0 when idle) and the
    // per-region opacities (chrome/body) live on the page-frame's z-layers. For the SEARCH leg (no
    // page frame — it renders `children` directly, the non-seedable results surface) the wrapper
    // itself carries the BODY dissolve, since there is no inner split to apply it to.
    const sceneVisibilityStyle = React.useMemo(
      () => [
        legRole === 'idle'
          ? styles.sceneStackBodyLayerHidden
          : styles.sceneStackBodyLayerVisible,
        isSearchLeg ? bodyDissolveStyle : null,
      ],
      [legRole, isSearchLeg, bodyDissolveStyle]
    );
    // The body's onLayout = the PAINT-ACK PRODUCER. Report only when this leg is the INCOMING of a
    // live transition (the host's reportScenePaint additionally gates on scene identity), so an
    // idle/outgoing re-layout never flips the gate. A stable per-scene callback (deps: identity).
    const reportScenePaint = transitionDisplay?.reportScenePaint;
    const handleBodyFirstPaint = React.useCallback(
      (_event: LayoutChangeEvent) => {
        if (legRole === 'incoming') {
          reportScenePaint?.(sceneKey);
        }
      },
      [legRole, reportScenePaint, sceneKey]
    );
    // Touch arbitration: ONLY the 'incoming' leg (the destination / settled displayed scene)
    // receives touches. Both crossfade legs render at the same zIndex:2 absolute-fill, so a
    // fully-transparent 'outgoing' leg whose DOM index is HIGHER than the incoming (e.g. a
    // high-index pollDetail/profile fading out over a low-index restaurant/search) would paint
    // ON TOP and swallow taps for the whole ramp. Gate pointerEvents off JS legRole (it cannot
    // be animated in a worklet) so the leaving/hidden legs never intercept.
    const legPointerEvents: 'auto' | 'none' = legRole === 'incoming' ? 'auto' : 'none';
    // Only mount the split opacities for a real in-flight transition; idle/lone legs pass undefined
    // so the page-frame layers render at their static opacity (no animated style churn at rest).
    const splitChromeOpacityStyle = isTransitioning ? chromeSwapStyle : undefined;
    const splitBodyOpacityStyle = isTransitioning ? bodyDissolveStyle : undefined;
    const pageBody = isSearchLeg ? (
      // The SEARCH leg renders its results surface directly (no page frame). It is the non-seedable
      // HELD-DISSOLVE incoming, so it STILL needs a paint-ack producer or the dissolve stays at
      // incoming:0 forever (blank body). Wrap in an absolute-fill onLayout View (layout-neutral —
      // sceneStackBodyLayer is the same absoluteFill the leg already uses) to emit the first paint.
      <View
        pointerEvents="box-none"
        style={styles.sceneStackBodyLayer}
        onLayout={handleBodyFirstPaint}
      >
        {children}
      </View>
    ) : (
        <BottomSheetSceneStackPageFrame
          underlayComponent={
            <SceneStackChromeLayerHost
              displayedSceneKey={displayedSceneKey}
              routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
              sceneKey={sceneKey}
              sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
              surface="underlay"
            />
          }
          backgroundComponent={
            <SceneStackChromeLayerHost
              displayedSceneKey={displayedSceneKey}
              routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
              sceneKey={sceneKey}
              sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
              surface="background"
            />
          }
          bodyComponent={children}
          headerComponent={
            <SceneStackChromeLayerHost
              displayedSceneKey={displayedSceneKey}
              routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
              sceneKey={sceneKey}
              sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
              surface="header"
            />
          }
          overlayComponent={
            <SceneStackChromeLayerHost
              displayedSceneKey={displayedSceneKey}
              routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
              sceneKey={sceneKey}
              sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
              surface="overlay"
            />
          }
          onHeaderLayout={onHeaderLayout}
          headerDividerScrollOffset={headerDividerScrollOffset}
          chromeOpacityStyle={splitChromeOpacityStyle}
          bodyOpacityStyle={splitBodyOpacityStyle}
          onBodyFirstPaint={handleBodyFirstPaint}
        />
      );

    const frameHost = (
      <SceneStackBodyFrame
        sceneKey={sceneKey}
        visibilityStyle={sceneVisibilityStyle}
        pointerEvents={legPointerEvents}
      >
        {pageBody}
      </SceneStackBodyFrame>
    );
    const profiledFrameHost = onProfilerRender ? (
      <React.Profiler id={`SceneStackBodyFrameHost:${sceneKey}`} onRender={onProfilerRender}>
        {frameHost}
      </React.Profiler>
    ) : (
      frameHost
    );

    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'SceneStackBodyFrameHost',
      operation: `render:${sceneKey}`,
      startedAtMs: renderStartedAtMs,
    });

    return profiledFrameHost;
  },
  (previousProps, nextProps) =>
    previousProps.routeSceneDisplayTargetRegistry === nextProps.routeSceneDisplayTargetRegistry &&
    previousProps.sceneStackSurfaceAuthority === nextProps.sceneStackSurfaceAuthority &&
    previousProps.sceneKey === nextProps.sceneKey &&
    previousProps.displayedSceneKey === nextProps.displayedSceneKey &&
    previousProps.onHeaderLayout === nextProps.onHeaderLayout &&
    previousProps.headerDividerScrollOffset === nextProps.headerDividerScrollOffset &&
    previousProps.children === nextProps.children
);

const SceneStackBodyContentLayerHost = React.memo(
  ({
    sceneStackSurfaceAuthority,
    sceneKey,
    bodyRuntimeAuthority,
  }: SceneStackBodyContentLayerHostProps) => {
    useSearchNavSwitchCommitAttribution(`SceneStackBodyContentLayerHost:${sceneKey}`);
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    const sceneBodySurfaceAuthority =
      sceneStackSurfaceAuthority.getSceneBodySurfaceAuthority(sceneKey);
    const sceneBodySurfaceSelection = useRouteAuthoritySelector({
      subscribe: React.useCallback(
        (listener: () => void) => sceneBodySurfaceAuthority.subscribe(listener),
        [sceneBodySurfaceAuthority]
      ),
      getSnapshot: sceneBodySurfaceAuthority.getSnapshot,
      selector: React.useCallback(
        (snapshot: AppRouteSceneStackBodySurfaceSnapshot) => snapshot,
        []
      ),
      isEqual: areSceneBodySurfaceSelectionsEqual,
      attributionOwner: 'SceneStackBodyContentLayerHost',
      attributionOperation: `bodySurfaceSelector:${sceneKey}`,
    });
    const sceneBodyRuntimeAuthority = bodyRuntimeAuthority.getSceneBodyRuntimeAuthority(sceneKey);
    const sceneBodyRuntimeSelection = useRouteAuthoritySelector({
      subscribe: React.useCallback(
        (listener: () => void) => sceneBodyRuntimeAuthority.subscribe(listener),
        [sceneBodyRuntimeAuthority]
      ),
      getSnapshot: sceneBodyRuntimeAuthority.getSnapshot,
      selector: React.useCallback(
        (snapshot: BottomSheetSceneStackBodyRuntimeSnapshot) => snapshot,
        []
      ),
      isEqual: areSceneBodyRuntimeSelectionsEqual,
      attributionOwner: 'SceneStackBodyContentLayerHost',
      attributionOperation: `bodyRuntimeSelector:${sceneKey}`,
    });

    if (
      sceneBodySurfaceSelection.contentEntry == null ||
      sceneBodySurfaceSelection.transportEntry == null
    ) {
      finishSearchNavSwitchRuntimeAttributionSpan({
        owner: 'SceneStackBodyContentLayerHost',
        operation: `renderEmpty:${sceneKey}`,
        startedAtMs: renderStartedAtMs,
      });
      return null;
    }

    const contentLayerHost = (
      <SceneStackBodyContentLayer
        contentEntry={sceneBodySurfaceSelection.contentEntry}
        transportEntry={sceneBodySurfaceSelection.transportEntry}
        contentActivity={sceneBodySurfaceSelection.contentActivity}
        bodyDefaults={sceneBodyRuntimeSelection.bodyDefaults}
        bodyScrollRuntime={sceneBodyRuntimeSelection.bodyScrollRuntime}
      />
    );

    const profiledContentLayerHost = onProfilerRender ? (
      <React.Profiler id={`SceneStackBodyContentLayerHost:${sceneKey}`} onRender={onProfilerRender}>
        {contentLayerHost}
      </React.Profiler>
    ) : (
      contentLayerHost
    );

    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'SceneStackBodyContentLayerHost',
      operation: `render:${sceneKey}`,
      startedAtMs: renderStartedAtMs,
    });

    return profiledContentLayerHost;
  },
  areSceneStackBodyContentLayerHostPropsEqual
);

const SearchSceneStackBodyDisplayTarget = React.memo(
  ({
    routeSceneDisplayTargetRegistry,
    sceneStackSurfaceAuthority,
    displayedSceneKey,
    bodyRuntimeAuthority,
    onHeaderLayout,
    sheetYValue,
  }: Pick<
    SceneStackBodyLayerHostProps,
    | 'routeSceneDisplayTargetRegistry'
    | 'sceneStackSurfaceAuthority'
    | 'displayedSceneKey'
    | 'bodyRuntimeAuthority'
    | 'onHeaderLayout'
    | 'sheetYValue'
  >) => {
    useSearchNavSwitchCommitAttribution('SearchSceneStackBodyDisplayTarget:search');
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    const sceneBodyRuntimeAuthority = bodyRuntimeAuthority.getSceneBodyRuntimeAuthority('search');
    const sceneBodyRuntimeSelection = useRouteAuthoritySelector({
      subscribe: React.useCallback(
        (listener: () => void) => sceneBodyRuntimeAuthority.subscribe(listener),
        [sceneBodyRuntimeAuthority]
      ),
      getSnapshot: sceneBodyRuntimeAuthority.getSnapshot,
      selector: React.useCallback(
        (snapshot: BottomSheetSceneStackBodyRuntimeSnapshot) => snapshot,
        []
      ),
      isEqual: areSceneBodyRuntimeSelectionsEqual,
      attributionOwner: 'SearchSceneStackBodyDisplayTarget',
      attributionOperation: 'bodyRuntimeSelector:search',
    });

    const searchResultsPageBundle = (
      <SearchResultsPageBundleHost
        bodyDefaults={sceneBodyRuntimeSelection.bodyDefaults}
        bodyScrollRuntime={sceneBodyRuntimeSelection.bodyScrollRuntime}
        onHeaderLayout={onHeaderLayout}
        sheetYValue={sheetYValue}
      />
    );
    const searchDisplayLayer = (
      <SceneStackBodyFrameHost
        sceneKey="search"
        routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
        sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
        displayedSceneKey={displayedSceneKey}
        onHeaderLayout={onHeaderLayout}
      >
        {searchResultsPageBundle}
      </SceneStackBodyFrameHost>
    );

    const profiledSearchBody = onProfilerRender ? (
      <React.Profiler id="SearchSceneStackBodyDisplayTarget:search" onRender={onProfilerRender}>
        {searchDisplayLayer}
      </React.Profiler>
    ) : (
      searchDisplayLayer
    );

    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'SearchSceneStackBodyDisplayTarget',
      operation: 'render:search',
      startedAtMs: renderStartedAtMs,
    });

    return profiledSearchBody;
  },
  (previousProps, nextProps) =>
    previousProps.bodyRuntimeAuthority === nextProps.bodyRuntimeAuthority &&
    previousProps.onHeaderLayout === nextProps.onHeaderLayout &&
    previousProps.sheetYValue === nextProps.sheetYValue &&
    previousProps.displayedSceneKey === nextProps.displayedSceneKey &&
    previousProps.sceneStackSurfaceAuthority === nextProps.sceneStackSurfaceAuthority &&
    previousProps.routeSceneDisplayTargetRegistry === nextProps.routeSceneDisplayTargetRegistry
);

const SceneStackBodyLayerHost = React.memo((props: SceneStackBodyLayerHostProps) => {
  useSearchNavSwitchCommitAttribution(`SceneStackBodyLayerHost:${props.sceneKey}`);
  const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
  const onProfilerRender = useSearchOverlayProfilerRender();
  // Parity with the result sheet (SearchResultsPageBundleHost): feed the body's scroll
  // offset to the generic page frame so it renders the same scroll-fade header divider.
  // The offset is a stable SharedValue, so re-selecting it here adds no render churn.
  const sceneBodyRuntimeAuthority = props.bodyRuntimeAuthority.getSceneBodyRuntimeAuthority(
    props.sceneKey
  );
  const headerDividerScrollOffset = useRouteAuthoritySelector({
    subscribe: React.useCallback(
      (listener: () => void) => sceneBodyRuntimeAuthority.subscribe(listener),
      [sceneBodyRuntimeAuthority]
    ),
    getSnapshot: sceneBodyRuntimeAuthority.getSnapshot,
    selector: React.useCallback(
      (snapshot: BottomSheetSceneStackBodyRuntimeSnapshot) =>
        snapshot.bodyScrollRuntime?.scrollOffset ?? null,
      []
    ),
    isEqual: (a: SharedValue<number> | null, b: SharedValue<number> | null) => a === b,
    attributionOwner: 'SceneStackBodyLayerHost',
    attributionOperation: `dividerScrollOffset:${props.sceneKey}`,
  });
  const contentLayer = React.useMemo(
    () => (
      <SceneStackBodyContentLayerHost
        sceneKey={props.sceneKey}
        sceneStackSurfaceAuthority={props.sceneStackSurfaceAuthority}
        bodyRuntimeAuthority={props.bodyRuntimeAuthority}
      />
    ),
    [props.bodyRuntimeAuthority, props.sceneKey, props.sceneStackSurfaceAuthority]
  );

  const bodyLayerHost = (
    <SceneStackBodyFrameHost
      sceneKey={props.sceneKey}
      routeSceneDisplayTargetRegistry={props.routeSceneDisplayTargetRegistry}
      sceneStackSurfaceAuthority={props.sceneStackSurfaceAuthority}
      displayedSceneKey={props.displayedSceneKey}
      onHeaderLayout={props.onHeaderLayout}
      headerDividerScrollOffset={headerDividerScrollOffset ?? undefined}
    >
      {contentLayer}
    </SceneStackBodyFrameHost>
  );

  const profiledBodyLayerHost = onProfilerRender ? (
    <React.Profiler id={`SceneStackBodyLayerHost:${props.sceneKey}`} onRender={onProfilerRender}>
      {bodyLayerHost}
    </React.Profiler>
  ) : (
    bodyLayerHost
  );

  finishSearchNavSwitchRuntimeAttributionSpan({
    owner: 'SceneStackBodyLayerHost',
    operation: `render:${props.sceneKey}`,
    startedAtMs: renderStartedAtMs,
  });

  return profiledBodyLayerHost;
}, areSceneStackBodyLayerHostPropsEqual);

type SceneStackChromeLayerHostProps = Pick<
  BottomSheetSceneStackHostProps,
  'displayedSceneKey' | 'routeSceneDisplayTargetRegistry' | 'sceneStackSurfaceAuthority'
> & {
  sceneKey: OverlayKey;
  surface: 'underlay' | 'background' | 'header' | 'overlay';
};

const SceneStackChromeLayerHost = React.memo(
  ({
    sceneStackSurfaceAuthority,
    sceneKey,
    surface,
  }: SceneStackChromeLayerHostProps) => {
    useSearchNavSwitchCommitAttribution(`SceneStackChromeLayerHost:${surface}:${sceneKey}`);
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    const scenePresentationAuthority =
      sceneStackSurfaceAuthority.getScenePresentationAuthority(sceneKey);
    // Keep the chrome rendered for BOTH crossfade legs (outgoing + incoming) so
    // the scene frame's opacity ramp drives the chrome crossfade too; only fully
    // hide it for idle scenes. (The frame wraps body + chrome — one ramp.)
    const transitionDisplay = React.useContext(SceneStackTransitionDisplayContext);
    const isVisible = resolveSceneStackLegRole(sceneKey, transitionDisplay) !== 'idle';
    const chromePresentation = useRouteAuthoritySelector({
      subscribe: React.useCallback(
        (listener: () => void) => scenePresentationAuthority.subscribe(listener),
        [scenePresentationAuthority]
      ),
      getSnapshot: scenePresentationAuthority.getSnapshot,
      selector: React.useCallback(
        (snapshot: AppRouteSceneStackScenePresentationSnapshot) => ({
          sceneChromeEntry: snapshot.chromeSurfaces[surface],
        }),
        [surface]
      ),
      isEqual: areSceneChromePresentationSelectionsEqual,
      attributionOwner: 'SceneStackChromeLayerHost',
      attributionOperation: `chromeSelector:${surface}:${sceneKey}`,
    });
    const sceneChromeEntry = chromePresentation.sceneChromeEntry;

    if (sceneChromeEntry == null) {
      finishSearchNavSwitchRuntimeAttributionSpan({
        owner: 'SceneStackChromeLayerHost',
        operation: `renderEmpty:${surface}:${sceneKey}`,
        startedAtMs: renderStartedAtMs,
      });
      return null;
    }

    const chromeLayer =
      surface === 'header' ? (
        <SceneStackHeaderLayer entry={sceneChromeEntry} isVisible={isVisible} />
      ) : (
        <SceneStackDecorLayer entry={sceneChromeEntry} kind={surface} isVisible={isVisible} />
      );

    const profiledChromeLayer = onProfilerRender ? (
      <React.Profiler
        id={`SceneStackChromeLayer:${surface}:${sceneKey}`}
        onRender={onProfilerRender}
      >
        {chromeLayer}
      </React.Profiler>
    ) : (
      chromeLayer
    );

    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'SceneStackChromeLayerHost',
      operation: `render:${surface}:${sceneKey}`,
      startedAtMs: renderStartedAtMs,
    });

    return profiledChromeLayer;
  },
  (previousProps, nextProps) =>
    previousProps.displayedSceneKey === nextProps.displayedSceneKey &&
    previousProps.routeSceneDisplayTargetRegistry === nextProps.routeSceneDisplayTargetRegistry &&
    previousProps.sceneStackSurfaceAuthority === nextProps.sceneStackSurfaceAuthority &&
    previousProps.sceneKey === nextProps.sceneKey &&
    previousProps.surface === nextProps.surface
);

const ActiveSceneStackSurfaceHost = React.memo(
  ({
    bodyRuntimeAuthority,
    displayedSceneKey,
    outgoingSceneKey,
    incomingSceneKey,
    contentTransitionToken,
    onContentSettleComplete,
    onHeaderLayout,
    onScrollHeaderLayout,
    routeSceneDisplayTargetRegistry,
    sceneStackSurfaceAuthority,
    scrollHeaderComponent,
    scrollHeaderSyncStyle,
    shadowShellStyle,
    surfaceStyle,
    sheetYValue,
  }: BottomSheetSceneStackHostProps) => {
    useSearchNavSwitchCommitAttribution('ActiveSceneStackSurfaceHost');
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    const searchSurfaceOwnsVisibleSheet = useSearchSurfaceRuntimeSelector(
      React.useCallback((surfaceSnapshot) => {
        const dismissTransaction = surfaceSnapshot.dismissTransaction;
        return (
          surfaceSnapshot.activeBundle.kind === 'results' ||
          surfaceSnapshot.heldBundle != null ||
          surfaceSnapshot.redrawTransaction != null ||
          dismissTransaction != null
        );
      }, []),
      Object.is
    );
    const shouldDisplaySearchSurface =
      searchSurfaceOwnsVisibleSheet &&
      (displayedSceneKey == null ||
        displayedSceneKey === 'search' ||
        displayedSceneKey === 'polls');
    const effectiveDisplayedSceneKey: OverlayKey | null = shouldDisplaySearchSurface
      ? 'search'
      : displayedSceneKey;
    const isTransitioning = outgoingSceneKey != null && outgoingSceneKey !== incomingSceneKey;
    // Per-leg search-surface override: ONLY the outgoing (frozen-results) leg may be
    // relabeled to 'search'; the incoming leg keeps its real key so it crossfades in.
    const effectiveOutgoing: OverlayKey | null =
      outgoingSceneKey == null
        ? null
        : searchSurfaceOwnsVisibleSheet &&
            (outgoingSceneKey === 'search' || outgoingSceneKey === 'polls')
          ? 'search'
          : outgoingSceneKey;
    const effectiveIncoming: OverlayKey | null = isTransitioning
      ? incomingSceneKey
      : effectiveDisplayedSceneKey;
    // ── HOST-OWNED FOUR-LANE PLAYER ─────────────────────────────────────────────────────────────
    // The host owns the player (ONE progress + ONE paintAck). It is TOKEN-triggered:
    // `player.start(descriptor, 0, onSettle)` fires on the content-transition token bump. velocity =
    // 0 (these are programmatic taps, not sheet drags). The descriptor is DERIVED from the (outgoing,
    // incoming) pair the host has — the player drives ONLY the content + header lanes (sheet-Y stays
    // with the kept spring runtime; map/chrome are 'preserve'). The single paint-ack
    // (reportScenePaint, flipped by the incoming body's first onLayout) gates the content
    // visible-commit — it is the content completer.
    const player = useTransitionLanePlayer();
    // Stable, ref-backed bridge so the player's onSettle never re-fires the layout effect (and thus
    // never re-starts / wiggles) when the callback identity moves. The callback IS stable today
    // (bound once in the provider), but the ref keeps that guarantee local.
    const onContentSettleCompleteRef = React.useRef(onContentSettleComplete);
    onContentSettleCompleteRef.current = onContentSettleComplete;
    const runContentSettleComplete = React.useCallback((token: number) => {
      onContentSettleCompleteRef.current(token);
    }, []);
    // The content mode of the in-flight transition (derived from the incoming scene). Drives the
    // BODY dissolve (held-dissolve for the non-seedable results scene; hard for seedable
    // profile/restaurant/pollDetail). Stable across renders for the same incoming scene.
    const inFlightContentMode = React.useMemo<ContentMode>(
      () =>
        effectiveOutgoing != null && effectiveIncoming != null
          ? deriveHostTokenDescriptor(effectiveOutgoing, effectiveIncoming, 'middle').content.swap
          : { mode: 'hard' },
      [effectiveOutgoing, effectiveIncoming]
    );
    // Paint-ack producer SINK. The incoming body's first onLayout calls this; honor it ONLY for the
    // live transition's incoming scene (gate on identity), so an idle/outgoing re-layout — or a
    // stale leg — can never flip the gate. markPaintAck reveals the content (#1 correctness).
    const effectiveIncomingRef = React.useRef(effectiveIncoming);
    effectiveIncomingRef.current = effectiveIncoming;
    const isTransitioningRef = React.useRef(isTransitioning);
    isTransitioningRef.current = isTransitioning;
    const reportScenePaint = React.useCallback(
      (sceneKey: OverlayKey) => {
        if (isTransitioningRef.current && sceneKey === effectiveIncomingRef.current) {
          player.markPaintAck();
        }
        // A paint from an idle/outgoing/stale leg is ignored — only the live transition's
        // incoming scene may flip the paint-ack gate.
      },
      [player]
    );
    React.useLayoutEffect(() => {
      // TOKEN-triggered start, keyed to the content-transition token (the same key the legacy ramp
      // used). Reset-then-start in a layout effect (pre-paint) so the first frame shows the OUTGOING
      // at full opacity (paintAck 0 ⇒ outgoing 1 / incoming 0), never a one-frame snap to the
      // incoming. The player's `start` resets paintAck=0 + settleRamp=0 and springs the settleRamp
      // 0→1 (an invisible timer); the body/header swaps derive from paintAck in worklets (no
      // setState). onSettle (ramp-end) settles the 'content' plane — the content completer.
      if (contentTransitionToken == null) {
        // Token not yet armed. If a transition is PENDING (outgoing differs from incoming — the
        // forward-open PRE-PUBLISH hold), hold paintAck=0 + settleRamp=0 so the OUTGOING leg stays
        // FULL opacity (outgoing=1) and the held body doesn't blink before the start arms. Idle/
        // settled (lone leg): paintAck=1 + settleRamp=1 so the lone leg shows fully (incoming=1).
        player.seize();
        const pending = effectiveOutgoing != null && effectiveOutgoing !== effectiveIncoming;
        player.settleRamp.value = pending ? 0 : 1;
        player.paintAck.value = pending ? 0 : 1;
        return;
      }
      if (effectiveOutgoing == null || effectiveIncoming == null) {
        return;
      }
      const settleToken = contentTransitionToken;
      const descriptor = deriveHostTokenDescriptor(
        effectiveOutgoing,
        effectiveIncoming,
        'middle'
      );
      // velocity 0 — programmatic tap. onSettle runs once on the spring's ramp-end (a superseded
      // start cancels the prior animation → finished=false → no stale settle).
      player.start(descriptor, 0, () => runContentSettleComplete(settleToken));
    }, [
      contentTransitionToken,
      player,
      runContentSettleComplete,
      effectiveOutgoing,
      effectiveIncoming,
    ]);
    const transitionDisplayValue = React.useMemo<SceneStackTransitionDisplayValue>(
      () => ({
        player,
        contentMode: inFlightContentMode,
        effectiveOutgoing,
        effectiveIncoming,
        isTransitioning,
        reportScenePaint,
      }),
      [
        player,
        inFlightContentMode,
        effectiveOutgoing,
        effectiveIncoming,
        isTransitioning,
        reportScenePaint,
      ]
    );
    const surfaceHost = (
      <SceneStackTransitionDisplayContext.Provider value={transitionDisplayValue}>
      <View pointerEvents="box-none" style={shadowShellStyle}>
        <Animated.View pointerEvents="box-none" style={[styles.sceneStackSurface, surfaceStyle]}>
          <View style={styles.contentHost}>
            {/* CONSTANT FROST BACKING (sheet-frost-architecture, layering-corrected): ONE shared
                FrostedGlassBackground — the FROST ALONE, NO opaque-white fill — mounted ONCE here,
                BELOW every content layer, at a CONSTANT opacity 1.0. It carries NO animated style
                and NO engine handle; the engine's only animating opacities are the per-scene content
                body lanes (the player's content-lane opacities) ABOVE this, and a content lane NEVER
                fades this frost.
                The frost blurs the MAP behind the sheet → the frosted-map; frosted-glass is
                opaque-ENOUGH to stop the SHARP-map see-through while still showing the blurred map
                through the toggle-strip + close-button CUTOUTS. Per-scene WHITE PLATES WITH CUTOUTS
                (backgroundComponent, zIndex 1) sit ABOVE this and own the solid-white areas; their
                holes reveal this constant frosted-map. Sized absolute-fill (gorhom surface
                decoupling), clipped to the sheet's rounded corners by the surface overflow:hidden. */}
            <View pointerEvents="none" style={styles.sceneStackSurfaceHoistedBacking}>
              <FrostedGlassBackground />
            </View>
            {scrollHeaderComponent ? (
              <Animated.View
                onLayout={onScrollHeaderLayout}
                style={[styles.scrollHeaderOverlay, scrollHeaderSyncStyle]}
              >
                {scrollHeaderComponent}
              </Animated.View>
            ) : null}
            {PERSISTENT_ROUTE_SCENE_STACK_KEYS.map((sceneKey) =>
              sceneKey === 'search' ? (
                <SearchSceneStackBodyDisplayTarget
                  key="scene-search"
                  routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
                  sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
                  displayedSceneKey={effectiveDisplayedSceneKey}
                  bodyRuntimeAuthority={bodyRuntimeAuthority}
                  onHeaderLayout={onHeaderLayout}
                  sheetYValue={sheetYValue}
                />
              ) : (
                <SceneStackBodyLayerHost
                  key={`scene-${sceneKey}`}
                  sceneKey={sceneKey}
                  displayedSceneKey={effectiveDisplayedSceneKey}
                  sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
                  routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
                  bodyRuntimeAuthority={bodyRuntimeAuthority}
                  onHeaderLayout={onHeaderLayout}
                />
              )
            )}
          </View>
        </Animated.View>
      </View>
      </SceneStackTransitionDisplayContext.Provider>
    );

    const profiledSurfaceHost = onProfilerRender ? (
      <React.Profiler id="ActiveSceneStackSurfaceHost" onRender={onProfilerRender}>
        {surfaceHost}
      </React.Profiler>
    ) : (
      surfaceHost
    );

    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'ActiveSceneStackSurfaceHost',
      operation: 'render',
      startedAtMs: renderStartedAtMs,
    });

    return profiledSurfaceHost;
  },
  (previousProps, nextProps) =>
    previousProps.bodyRuntimeAuthority === nextProps.bodyRuntimeAuthority &&
    previousProps.displayedSceneKey === nextProps.displayedSceneKey &&
    previousProps.outgoingSceneKey === nextProps.outgoingSceneKey &&
    previousProps.incomingSceneKey === nextProps.incomingSceneKey &&
    previousProps.contentTransitionToken === nextProps.contentTransitionToken &&
    previousProps.onContentSettleComplete === nextProps.onContentSettleComplete &&
    previousProps.onHeaderLayout === nextProps.onHeaderLayout &&
    previousProps.onScrollHeaderLayout === nextProps.onScrollHeaderLayout &&
    previousProps.sheetYValue === nextProps.sheetYValue &&
    previousProps.routeSceneDisplayTargetRegistry === nextProps.routeSceneDisplayTargetRegistry &&
    previousProps.sceneStackSurfaceAuthority === nextProps.sceneStackSurfaceAuthority &&
    previousProps.scrollHeaderComponent === nextProps.scrollHeaderComponent &&
    previousProps.scrollHeaderSyncStyle === nextProps.scrollHeaderSyncStyle &&
    previousProps.shadowShellStyle === nextProps.shadowShellStyle &&
    previousProps.surfaceStyle === nextProps.surfaceStyle
);

const ActiveSceneStackHostLayers = ({
  sceneStackSurfaceAuthority,
  routeSceneDisplayTargetRegistry,
  shadowShellStyle,
  surfaceStyle,
  scrollHeaderComponent,
  onHeaderLayout,
  onScrollHeaderLayout,
  scrollHeaderSyncStyle,
  displayedSceneKey,
  outgoingSceneKey,
  incomingSceneKey,
  contentTransitionToken,
  onContentSettleComplete,
  bodyRuntimeAuthority,
  sheetYValue,
}: BottomSheetSceneStackHostProps) => {
  useSearchNavSwitchCommitAttribution('ActiveSceneStackHostLayers');
  const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
  const onProfilerRender = useSearchOverlayProfilerRender();
  const sceneStackLayers = (
    <ActiveSceneStackSurfaceHost
      bodyRuntimeAuthority={bodyRuntimeAuthority}
      onHeaderLayout={onHeaderLayout}
      onScrollHeaderLayout={onScrollHeaderLayout}
      routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
      sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
      shadowShellStyle={shadowShellStyle}
      surfaceStyle={surfaceStyle}
      scrollHeaderComponent={scrollHeaderComponent}
      scrollHeaderSyncStyle={scrollHeaderSyncStyle}
      displayedSceneKey={displayedSceneKey}
      outgoingSceneKey={outgoingSceneKey}
      incomingSceneKey={incomingSceneKey}
      contentTransitionToken={contentTransitionToken}
      onContentSettleComplete={onContentSettleComplete}
      sheetYValue={sheetYValue}
    />
  );

  if (!onProfilerRender) {
    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'ActiveSceneStackHostLayers',
      operation: 'render',
      startedAtMs: renderStartedAtMs,
    });
    return sceneStackLayers;
  }

  const profiledSceneStackLayers = (
    <React.Profiler id="ActiveSceneStackHostLayers" onRender={onProfilerRender}>
      {sceneStackLayers}
    </React.Profiler>
  );

  finishSearchNavSwitchRuntimeAttributionSpan({
    owner: 'ActiveSceneStackHostLayers',
    operation: 'render',
    startedAtMs: renderStartedAtMs,
  });

  return profiledSceneStackLayers;
};
