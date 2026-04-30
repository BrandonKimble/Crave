import React from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { SceneStackBodyContentLayer, SceneStackBodyFrame } from './BottomSheetSceneStackBodyLayer';
import { SceneStackDecorLayer, SceneStackHeaderLayer } from './BottomSheetSceneStackDecorLayers';
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
import { APP_ROUTE_SCENE_INPUT_KEYS } from '../navigation/runtime/app-route-scene-input-registry';
import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';
import { useSearchOverlayProfilerRender } from './SearchOverlayProfilerContext';
import {
  finishSearchNavSwitchRuntimeAttributionSpan,
  markSearchNavSwitchRuntimeAttribution,
  startSearchNavSwitchRuntimeAttributionSpan,
} from '../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import { useSearchNavSwitchCommitAttribution } from '../screens/Search/runtime/shared/use-search-nav-switch-commit-attribution';

const PERSISTENT_ROUTE_SCENE_STACK_KEYS: readonly OverlayKey[] = APP_ROUTE_SCENE_INPUT_KEYS;

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
): boolean => {
  const sceneKey = snapshot.contentEntry?.sceneKey;
  return sceneKey === 'polls' || sceneKey === 'pollCreation' || sceneKey === 'saveList';
};

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
};

const getMountedBodyKey = (snapshot: AppRouteSceneStackBodySurfaceSnapshot): string | null => {
  const spec = snapshot.contentEntry?.bodyContentSpec;
  return spec?.surfaceKind === 'mounted' || spec?.surfaceKind === 'mountedList'
    ? spec.mountedBodyKey
    : null;
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

  if (sceneKey === 'search' || sceneKey === 'polls') {
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
): boolean =>
  left.bodyDefaults === right.bodyDefaults && left.bodyScrollRuntime === right.bodyScrollRuntime;

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
  fixedHeaderComponent,
  scrollHeaderComponent,
  onHeaderLayout,
  onScrollHeaderLayout,
  scrollHeaderSyncStyle,
  bodyRuntimeAuthority,
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
      fixedHeaderComponent={fixedHeaderComponent}
      scrollHeaderComponent={scrollHeaderComponent}
      onHeaderLayout={onHeaderLayout}
      onScrollHeaderLayout={onScrollHeaderLayout}
      scrollHeaderSyncStyle={scrollHeaderSyncStyle}
      bodyRuntimeAuthority={bodyRuntimeAuthority}
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
  'sceneStackSurfaceAuthority' | 'routeSceneDisplayTargetRegistry' | 'bodyRuntimeAuthority'
> & {
  sceneKey: OverlayKey;
};

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

  return previousProps.bodyRuntimeAuthority === nextProps.bodyRuntimeAuthority;
};

const SceneStackBodyFrameHost = React.memo(
  ({
    routeSceneDisplayTargetRegistry,
    sceneKey,
    children,
  }: Pick<SceneStackBodyLayerHostProps, 'routeSceneDisplayTargetRegistry' | 'sceneKey'> & {
    children: React.ReactNode;
  }) => {
    useSearchNavSwitchCommitAttribution(`SceneStackBodyFrameHost:${sceneKey}`);
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    const sceneVisibilityValue = routeSceneDisplayTargetRegistry.getSceneVisibilityValue(sceneKey);
    const sceneVisibilityStyle = useAnimatedStyle(() => {
      const isVisible = sceneVisibilityValue.value > 0.5;
      return {
        elevation: isVisible ? 2 : 0,
        opacity: sceneVisibilityValue.value,
        zIndex: isVisible ? 2 : 0,
      };
    }, [sceneVisibilityValue]);

    const frameHost = (
      <SceneStackBodyFrame sceneKey={sceneKey} visibilityStyle={sceneVisibilityStyle}>
        {children}
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
    previousProps.sceneKey === nextProps.sceneKey &&
    previousProps.children === nextProps.children
);

const SceneStackBodyContentLayerHost = React.memo(
  ({
    sceneStackSurfaceAuthority,
    sceneKey,
    bodyRuntimeAuthority,
  }: SceneStackBodyLayerHostProps) => {
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
  areSceneStackBodyLayerHostPropsEqual
);

const SceneStackBodyLayerHost = React.memo((props: SceneStackBodyLayerHostProps) => {
  useSearchNavSwitchCommitAttribution(`SceneStackBodyLayerHost:${props.sceneKey}`);
  const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
  const onProfilerRender = useSearchOverlayProfilerRender();
  const contentLayer = React.useMemo(
    () => <SceneStackBodyContentLayerHost {...props} />,
    [
      props.bodyRuntimeAuthority,
      props.routeSceneDisplayTargetRegistry,
      props.sceneKey,
      props.sceneStackSurfaceAuthority,
    ]
  );

  const bodyLayerHost = (
    <SceneStackBodyFrameHost
      sceneKey={props.sceneKey}
      routeSceneDisplayTargetRegistry={props.routeSceneDisplayTargetRegistry}
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
  'routeSceneDisplayTargetRegistry' | 'sceneStackSurfaceAuthority'
> & {
  sceneKey: OverlayKey;
  surface: 'underlay' | 'background' | 'header' | 'overlay';
};

const SceneStackChromeLayerHost = React.memo(
  ({
    routeSceneDisplayTargetRegistry,
    sceneStackSurfaceAuthority,
    sceneKey,
    surface,
  }: SceneStackChromeLayerHostProps) => {
    useSearchNavSwitchCommitAttribution(`SceneStackChromeLayerHost:${surface}:${sceneKey}`);
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    const scenePresentationAuthority =
      sceneStackSurfaceAuthority.getScenePresentationAuthority(sceneKey);
    const sceneVisibilityValue = routeSceneDisplayTargetRegistry.getSceneVisibilityValue(sceneKey);
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
        <SceneStackHeaderLayer entry={sceneChromeEntry} visibilityValue={sceneVisibilityValue} />
      ) : (
        <SceneStackDecorLayer
          entry={sceneChromeEntry}
          kind={surface}
          visibilityValue={sceneVisibilityValue}
        />
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
    previousProps.routeSceneDisplayTargetRegistry === nextProps.routeSceneDisplayTargetRegistry &&
    previousProps.sceneStackSurfaceAuthority === nextProps.sceneStackSurfaceAuthority &&
    previousProps.sceneKey === nextProps.sceneKey &&
    previousProps.surface === nextProps.surface
);

const ActiveSceneStackChromeHost = ({
  routeSceneDisplayTargetRegistry,
  onHeaderLayout,
  sceneStackSurfaceAuthority,
  fixedHeaderComponent,
}: Pick<
  BottomSheetSceneStackHostProps,
  | 'routeSceneDisplayTargetRegistry'
  | 'sceneStackSurfaceAuthority'
  | 'onHeaderLayout'
  | 'fixedHeaderComponent'
>) => {
  useSearchNavSwitchCommitAttribution('ActiveSceneStackChromeHost');
  const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
  const onProfilerRender = useSearchOverlayProfilerRender();
  const chromeHost = (
    <>
      {PERSISTENT_ROUTE_SCENE_STACK_KEYS.map((sceneKey) => (
        <SceneStackChromeLayerHost
          key={`underlay-${sceneKey}`}
          routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
          sceneKey={sceneKey}
          sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
          surface="underlay"
        />
      ))}
      {PERSISTENT_ROUTE_SCENE_STACK_KEYS.map((sceneKey) => (
        <SceneStackChromeLayerHost
          key={`background-${sceneKey}`}
          routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
          sceneKey={sceneKey}
          sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
          surface="background"
        />
      ))}
      <View onLayout={onHeaderLayout} style={styles.fixedHeader}>
        {fixedHeaderComponent}
        {PERSISTENT_ROUTE_SCENE_STACK_KEYS.map((sceneKey) => (
          <SceneStackChromeLayerHost
            key={`header-${sceneKey}`}
            routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
            sceneKey={sceneKey}
            sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
            surface="header"
          />
        ))}
      </View>
      {PERSISTENT_ROUTE_SCENE_STACK_KEYS.map((sceneKey) => (
        <SceneStackChromeLayerHost
          key={`overlay-${sceneKey}`}
          routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
          sceneKey={sceneKey}
          sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
          surface="overlay"
        />
      ))}
    </>
  );

  const profiledChromeHost = onProfilerRender ? (
    <React.Profiler id="ActiveSceneStackChromeHost" onRender={onProfilerRender}>
      {chromeHost}
    </React.Profiler>
  ) : (
    chromeHost
  );

  finishSearchNavSwitchRuntimeAttributionSpan({
    owner: 'ActiveSceneStackChromeHost',
    operation: 'render',
    startedAtMs: renderStartedAtMs,
  });

  return profiledChromeHost;
};

const areActiveSceneStackChromeHostPropsEqual = (
  previousProps: React.ComponentProps<typeof ActiveSceneStackChromeHost>,
  nextProps: React.ComponentProps<typeof ActiveSceneStackChromeHost>
): boolean =>
  previousProps.routeSceneDisplayTargetRegistry === nextProps.routeSceneDisplayTargetRegistry &&
  previousProps.sceneStackSurfaceAuthority === nextProps.sceneStackSurfaceAuthority &&
  previousProps.onHeaderLayout === nextProps.onHeaderLayout &&
  previousProps.fixedHeaderComponent === nextProps.fixedHeaderComponent;

const MemoizedActiveSceneStackChromeHost = React.memo(
  ActiveSceneStackChromeHost,
  areActiveSceneStackChromeHostPropsEqual
);

const ActiveSceneStackBodyHost = React.memo(
  ({
    bodyRuntimeAuthority,
    onScrollHeaderLayout,
    routeSceneDisplayTargetRegistry,
    sceneStackSurfaceAuthority,
    scrollHeaderComponent,
    scrollHeaderSyncStyle,
  }: Pick<
    BottomSheetSceneStackHostProps,
    | 'bodyRuntimeAuthority'
    | 'onScrollHeaderLayout'
    | 'routeSceneDisplayTargetRegistry'
    | 'sceneStackSurfaceAuthority'
    | 'scrollHeaderComponent'
    | 'scrollHeaderSyncStyle'
  >) => {
    useSearchNavSwitchCommitAttribution('ActiveSceneStackBodyHost');
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    const bodyHost = (
      <View style={styles.contentHost}>
        {scrollHeaderComponent ? (
          <Animated.View
            onLayout={onScrollHeaderLayout}
            style={[styles.scrollHeaderOverlay, scrollHeaderSyncStyle]}
          >
            {scrollHeaderComponent}
          </Animated.View>
        ) : null}
        {PERSISTENT_ROUTE_SCENE_STACK_KEYS.map((sceneKey) => (
          <SceneStackBodyLayerHost
            key={`scene-${sceneKey}`}
            sceneKey={sceneKey}
            sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
            routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
            bodyRuntimeAuthority={bodyRuntimeAuthority}
          />
        ))}
      </View>
    );

    const profiledBodyHost = onProfilerRender ? (
      <React.Profiler id="ActiveSceneStackBodyHost" onRender={onProfilerRender}>
        {bodyHost}
      </React.Profiler>
    ) : (
      bodyHost
    );

    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'ActiveSceneStackBodyHost',
      operation: 'render',
      startedAtMs: renderStartedAtMs,
    });

    return profiledBodyHost;
  },
  (previousProps, nextProps) =>
    previousProps.bodyRuntimeAuthority === nextProps.bodyRuntimeAuthority &&
    previousProps.onScrollHeaderLayout === nextProps.onScrollHeaderLayout &&
    previousProps.routeSceneDisplayTargetRegistry === nextProps.routeSceneDisplayTargetRegistry &&
    previousProps.sceneStackSurfaceAuthority === nextProps.sceneStackSurfaceAuthority &&
    previousProps.scrollHeaderComponent === nextProps.scrollHeaderComponent &&
    previousProps.scrollHeaderSyncStyle === nextProps.scrollHeaderSyncStyle
);

const ActiveSceneStackSurfaceHost = React.memo(
  ({
    bodyRuntimeAuthority,
    onHeaderLayout,
    onScrollHeaderLayout,
    routeSceneDisplayTargetRegistry,
    sceneStackSurfaceAuthority,
    scrollHeaderComponent,
    scrollHeaderSyncStyle,
    shadowShellStyle,
    surfaceStyle,
    fixedHeaderComponent,
  }: BottomSheetSceneStackHostProps) => {
    useSearchNavSwitchCommitAttribution('ActiveSceneStackSurfaceHost');
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    const surfaceHost = (
      <View style={shadowShellStyle}>
        <View style={[styles.sceneStackSurface, surfaceStyle]}>
          <MemoizedActiveSceneStackChromeHost
            routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
            sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
            onHeaderLayout={onHeaderLayout}
            fixedHeaderComponent={fixedHeaderComponent}
          />
          <ActiveSceneStackBodyHost
            bodyRuntimeAuthority={bodyRuntimeAuthority}
            onScrollHeaderLayout={onScrollHeaderLayout}
            routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
            sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
            scrollHeaderComponent={scrollHeaderComponent}
            scrollHeaderSyncStyle={scrollHeaderSyncStyle}
          />
        </View>
      </View>
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
    previousProps.onHeaderLayout === nextProps.onHeaderLayout &&
    previousProps.onScrollHeaderLayout === nextProps.onScrollHeaderLayout &&
    previousProps.routeSceneDisplayTargetRegistry === nextProps.routeSceneDisplayTargetRegistry &&
    previousProps.sceneStackSurfaceAuthority === nextProps.sceneStackSurfaceAuthority &&
    previousProps.scrollHeaderComponent === nextProps.scrollHeaderComponent &&
    previousProps.scrollHeaderSyncStyle === nextProps.scrollHeaderSyncStyle &&
    previousProps.shadowShellStyle === nextProps.shadowShellStyle &&
    previousProps.surfaceStyle === nextProps.surfaceStyle &&
    previousProps.fixedHeaderComponent === nextProps.fixedHeaderComponent
);

const ActiveSceneStackHostLayers = ({
  sceneStackSurfaceAuthority,
  routeSceneDisplayTargetRegistry,
  shadowShellStyle,
  surfaceStyle,
  fixedHeaderComponent,
  scrollHeaderComponent,
  onHeaderLayout,
  onScrollHeaderLayout,
  scrollHeaderSyncStyle,
  bodyRuntimeAuthority,
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
      fixedHeaderComponent={fixedHeaderComponent}
      scrollHeaderComponent={scrollHeaderComponent}
      scrollHeaderSyncStyle={scrollHeaderSyncStyle}
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
