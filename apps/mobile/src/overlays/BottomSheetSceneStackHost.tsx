import React from 'react';
import { View } from 'react-native';
import Animated, {
  type SharedValue,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { SceneStackBodyContentLayer, SceneStackBodyFrame } from './BottomSheetSceneStackBodyLayer';
import { SceneStackDecorLayer, SceneStackHeaderLayer } from './BottomSheetSceneStackDecorLayers';
import { BottomSheetSceneStackPageFrame } from './BottomSheetSceneStackPageFrame';
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

// ── Overlap crossfade ────────────────────────────────────────────────────────
// Every scene is a co-mounted absolute-fill sibling toggled by opacity (not
// display:none). The overlap engine drives a shared `transitionProgress` (0 =
// outgoing fully shown, 1 = incoming fully shown) and arbitrates each scene
// FRAME's opacity by its role. Because the frame wraps the scene's body AND its
// chrome, animating the frame opacity crossfades the whole page in one ramp.
type SceneStackLegRole = 'incoming' | 'outgoing' | 'idle';

type SceneStackTransitionDisplayValue = {
  transitionProgress: SharedValue<number>;
  effectiveOutgoing: OverlayKey | null;
  effectiveIncoming: OverlayKey | null;
};

const SceneStackTransitionDisplayContext =
  React.createContext<SceneStackTransitionDisplayValue | null>(null);

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
    const transitionProgress = transitionDisplay?.transitionProgress ?? null;
    const animatedLegOpacityStyle = useAnimatedStyle(() => {
      'worklet';
      if (transitionProgress == null) {
        return { opacity: legRole === 'idle' ? 0 : 1 };
      }
      const p = transitionProgress.value;
      return {
        opacity: legRole === 'incoming' ? p : legRole === 'outgoing' ? 1 - p : 0,
      };
    }, [legRole, transitionProgress]);
    const sceneVisibilityStyle = React.useMemo(
      () => [
        legRole === 'idle'
          ? styles.sceneStackBodyLayerHidden
          : styles.sceneStackBodyLayerVisible,
        animatedLegOpacityStyle,
      ],
      [legRole, animatedLegOpacityStyle]
    );
    // Touch arbitration: ONLY the 'incoming' leg (the destination / settled displayed scene)
    // receives touches. Both crossfade legs render at the same zIndex:2 absolute-fill, so a
    // fully-transparent 'outgoing' leg whose DOM index is HIGHER than the incoming (e.g. a
    // high-index pollDetail/profile fading out over a low-index restaurant/search) would paint
    // ON TOP and swallow taps for the whole ramp. Gate pointerEvents off JS legRole (it cannot
    // be animated in a worklet) so the leaving/hidden legs never intercept.
    const legPointerEvents: 'auto' | 'none' = legRole === 'incoming' ? 'auto' : 'none';
    const pageBody =
      sceneKey === 'search' ? (
        children
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
    const transitionProgress = useSharedValue(1);
    // Stable, ref-backed bridge so the ramp's onFinish never re-fires the layout effect
    // (and thus never re-ramps / wiggles) when the callback identity moves. The callback
    // IS stable today (bound once in the provider), but the ref keeps that guarantee local.
    const onContentSettleCompleteRef = React.useRef(onContentSettleComplete);
    onContentSettleCompleteRef.current = onContentSettleComplete;
    const runContentSettleComplete = React.useCallback((token: number) => {
      onContentSettleCompleteRef.current(token);
    }, []);
    React.useLayoutEffect(() => {
      // Clock-only ramp keyed to the content-transition token. Reset-then-ramp in a
      // layout effect (pre-paint) so the first frame shows the outgoing at full
      // opacity, never a one-frame snap to the incoming. On ramp-end (finished), settle the
      // overlap 'content' plane via runOnJS so interactivity is restored when the incoming
      // page reveals — the controller CONTENT_SETTLE_TIMEOUT is now a true fallback guard.
      if (contentTransitionToken == null) {
        // Token not yet armed. If a transition is PENDING (outgoing differs from incoming — e.g.
        // the forward-open PRE-PUBLISH hold, where the target shell hasn't landed and the feed is
        // held as the outgoing), hold at 0 so the OUTGOING leg stays FULL opacity (1-0=1) and the
        // held feed body doesn't blink to 0 before the ramp arms. Otherwise (idle/settled, lone
        // displayed leg) hold at 1.
        transitionProgress.value =
          effectiveOutgoing != null && effectiveOutgoing !== effectiveIncoming ? 0 : 1;
        return;
      }
      const settleToken = contentTransitionToken;
      transitionProgress.value = 0;
      transitionProgress.value = withTiming(1, { duration: 250 }, (finished) => {
        'worklet';
        // Only a ramp that ran to completion settles the plane. A token change mid-ramp
        // resets transitionProgress to 0 (cancelling this animation → finished=false), so the
        // superseded leg is skipped and only the live token's ramp-end completes the plane.
        if (finished) {
          runOnJS(runContentSettleComplete)(settleToken);
        }
      });
    }, [contentTransitionToken, transitionProgress, runContentSettleComplete, effectiveOutgoing, effectiveIncoming]);
    const transitionDisplayValue = React.useMemo<SceneStackTransitionDisplayValue>(
      () => ({ transitionProgress, effectiveOutgoing, effectiveIncoming }),
      [transitionProgress, effectiveOutgoing, effectiveIncoming]
    );
    const surfaceHost = (
      <SceneStackTransitionDisplayContext.Provider value={transitionDisplayValue}>
      <View pointerEvents="box-none" style={shadowShellStyle}>
        <Animated.View pointerEvents="box-none" style={[styles.sceneStackSurface, surfaceStyle]}>
          <View style={styles.contentHost}>
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
