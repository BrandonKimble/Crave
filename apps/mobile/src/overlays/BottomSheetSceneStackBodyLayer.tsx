import React from 'react';
import Animated from 'react-native-reanimated';

import type {
  SceneStackBodyContentActivity,
  SceneStackBodyContentLayerProps,
  SceneStackBodyFrameProps,
} from './bottomSheetSceneStackBodyLayerContract';
import {
  BottomSheetSceneStackBodyDataActivityContext,
  BottomSheetSceneStackBodyRenderActivityContext,
  BottomSheetSceneStackBodyIsActiveContext,
} from './BottomSheetSceneStackBodyActivityContext';
import { isSceneBodyDataActivityKey } from '../navigation/runtime/app-route-scene-input-registry';
import { areSceneEntryMountUnitArraysEqual } from '../navigation/runtime/app-route-scene-entry-mounts';
import { bottomSheetSceneStackHostStyles as styles } from './bottomSheetSceneStackHostStyles';
import { useSearchOverlayProfilerRender } from './SearchOverlayProfilerContext';
import { useBottomSheetSceneStackBodyContentRuntime } from './useBottomSheetSceneStackBodyContentRuntime';
import { createShapeEquality, sameFieldRef, type FieldComparators } from './shape-equality';
import { logPageSwitchDebug } from '../navigation/runtime/pageswitch-debug-flag';

// F980: every skip fn below is DERIVED from its props shape (shape-equality.ts). Forget a
// new prop and tsc names it, instead of the leg silently never re-rendering again.
// A field this scope deliberately does NOT compare says so, here, out loud — an
// intentional omission and a forgotten one must not look the same.
const ignoreField = (): boolean => true;

const shouldSkipSceneStackBodyFrameUpdate = createShapeEquality<SceneStackBodyFrameProps>({
  sceneKey: sameFieldRef,
  visibilityStyle: sameFieldRef,
  pointerEventsAnimatedProps: sameFieldRef,
  children: sameFieldRef,
});

const shouldPublishSceneBodyDataActivity = (sceneKey: string): boolean =>
  isSceneBodyDataActivityKey(sceneKey);

// The activity lanes a scene RENDERS from. 'search' reads fewer of them (its body is the
// never-null results bundle), so it gets its own map — but BOTH maps must name every field
// of SceneStackBodyContentActivity, so a new activity lane cannot be missed by either.
const SEARCH_SCENE_ACTIVITY_COMPARATORS = {
  isActive: ignoreField, // the leg's own visibility lane owns this; not render-read here
  shouldRenderListBody: sameFieldRef,
  shouldSubscribeDataLane: sameFieldRef,
  shouldAttachMountedContent: ignoreField, // search has no mounted body
  shouldRunDataLane: ignoreField, // search's data lane is the bundle's, not this leg's
  shouldRenderExpandedContent: ignoreField, // search has no expanded-content lane
  hasActivatedExpandedContent: ignoreField,
} satisfies FieldComparators<SceneStackBodyContentActivity>;

const DEFAULT_SCENE_ACTIVITY_COMPARATORS = {
  isActive: ignoreField, // the leg's own visibility lane owns this; not render-read here
  shouldRenderListBody: sameFieldRef,
  shouldAttachMountedContent: sameFieldRef,
  // CONDITIONAL by scene (shouldPublishSceneBodyDataActivity) — compared explicitly below,
  // because the predicate needs the runtime sceneKey a static map cannot see.
  shouldRunDataLane: ignoreField,
  shouldSubscribeDataLane: sameFieldRef,
  shouldRenderExpandedContent: sameFieldRef,
  hasActivatedExpandedContent: sameFieldRef,
} satisfies FieldComparators<SceneStackBodyContentActivity>;

const areSearchSceneActivitiesEqual = createShapeEquality<SceneStackBodyContentActivity>(
  SEARCH_SCENE_ACTIVITY_COMPARATORS
);
const areDefaultSceneActivitiesEqual = createShapeEquality<SceneStackBodyContentActivity>(
  DEFAULT_SCENE_ACTIVITY_COMPARATORS
);

// The non-activity half of the layer props — one entry per prop, compile-checked.
const areSceneStackBodyContentLayerNonActivityPropsEqual =
  createShapeEquality<SceneStackBodyContentLayerProps>({
    contentEntry: sameFieldRef,
    transportEntry: sameFieldRef,
    // Compared by the per-scene activity maps above (the comparison depends on the scene).
    contentActivity: ignoreField,
    bodyDefaults: sameFieldRef,
    bodyScrollRuntime: sameFieldRef,
    // W1 slice 1 — entry-keyed child mounts are render-read here.
    mountedEntryUnits: areSceneEntryMountUnitArraysEqual,
    activeEntryId: sameFieldRef,
  });

const shouldSkipSceneStackBodyContentLayerUpdate = (
  previousProps: SceneStackBodyContentLayerProps,
  nextProps: SceneStackBodyContentLayerProps
): boolean => {
  if (!areSceneStackBodyContentLayerNonActivityPropsEqual(previousProps, nextProps)) {
    return false;
  }

  const previousActivity = previousProps.contentActivity;
  const nextActivity = nextProps.contentActivity;
  if (nextProps.contentEntry.sceneKey === 'search') {
    return areSearchSceneActivitiesEqual(previousActivity, nextActivity);
  }
  if (!areDefaultSceneActivitiesEqual(previousActivity, nextActivity)) {
    return false;
  }
  return (
    !shouldPublishSceneBodyDataActivity(nextProps.contentEntry.sceneKey) ||
    previousActivity.shouldRunDataLane === nextActivity.shouldRunDataLane
  );
};

type SceneStackBodyContentHostProps = Pick<
  SceneStackBodyContentLayerProps,
  | 'contentEntry'
  | 'transportEntry'
  | 'bodyDefaults'
  | 'bodyScrollRuntime'
  | 'mountedEntryUnits'
  | 'activeEntryId'
> & {
  isActive: boolean;
  shouldRenderListBody: boolean;
  shouldAttachMountedContent: boolean;
};

const shouldSkipSceneStackBodyContentUpdate = createShapeEquality<SceneStackBodyContentHostProps>({
  contentEntry: sameFieldRef,
  transportEntry: sameFieldRef,
  bodyDefaults: sameFieldRef,
  bodyScrollRuntime: sameFieldRef,
  isActive: sameFieldRef,
  shouldRenderListBody: sameFieldRef,
  shouldAttachMountedContent: sameFieldRef,
  mountedEntryUnits: areSceneEntryMountUnitArraysEqual,
  activeEntryId: sameFieldRef,
});

const SceneStackBodyContentHost = React.memo(
  ({
    contentEntry,
    transportEntry,
    bodyDefaults,
    bodyScrollRuntime,
    isActive,
    shouldRenderListBody,
    shouldAttachMountedContent,
    mountedEntryUnits,
    activeEntryId,
  }: SceneStackBodyContentHostProps) =>
    useBottomSheetSceneStackBodyContentRuntime({
      sceneKey: contentEntry.sceneKey,
      isActive,
      shouldRenderListBody,
      shouldAttachMountedContent,
      bodyDefaults,
      bodyScrollRuntime,
      sceneBodyContentEntry: contentEntry,
      sceneBodyTransportEntry: transportEntry,
      mountedEntryUnits,
      activeEntryId,
    }),
  shouldSkipSceneStackBodyContentUpdate
);

export const SceneStackBodyFrame = React.memo(
  ({
    sceneKey,
    visibilityStyle,
    pointerEventsAnimatedProps,
    children,
  }: SceneStackBodyFrameProps) => {
    const onProfilerRender = useSearchOverlayProfilerRender();
    const bodyFrame = (
      <Animated.View
        key={`scene-${sceneKey}`}
        animatedProps={pointerEventsAnimatedProps}
        style={[styles.sceneStackBodyLayer, visibilityStyle]}
      >
        {children}
      </Animated.View>
    );

    if (!onProfilerRender) {
      return bodyFrame;
    }

    return (
      <React.Profiler id={`SceneStackBodyFrame:${sceneKey}`} onRender={onProfilerRender}>
        {bodyFrame}
      </React.Profiler>
    );
  },
  shouldSkipSceneStackBodyFrameUpdate
);

export const SceneStackBodyContentLayer = React.memo(
  ({
    contentEntry,
    transportEntry,
    contentActivity,
    bodyDefaults,
    bodyScrollRuntime,
    mountedEntryUnits,
    activeEntryId,
  }: SceneStackBodyContentLayerProps) => {
    const onProfilerRender = useSearchOverlayProfilerRender();
    const bodySurfaceKind = contentEntry.bodyContentSpec.surfaceKind;
    const shouldRenderListBody =
      bodySurfaceKind === 'list' ? contentActivity.shouldRenderListBody : false;
    const shouldAttachMountedContent =
      bodySurfaceKind === 'mounted' && contentActivity.shouldAttachMountedContent;
    // [pageswitch] CONSUMER-side activity probe (P4 blank-body attribution): what the leg's body
    // layer actually received this commit — correlate with the producer-side `activity` lines.
    React.useEffect(() => {
      logPageSwitchDebug('bodyActivity', {
        scene: contentEntry.sceneKey,
        kind: bodySurfaceKind,
        attach: shouldAttachMountedContent,
        expand: contentActivity.shouldRenderExpandedContent,
        activated: contentActivity.hasActivatedExpandedContent,
        runData: contentActivity.shouldRunDataLane,
        active: contentActivity.isActive,
      });
    }, [
      contentEntry.sceneKey,
      bodySurfaceKind,
      shouldAttachMountedContent,
      contentActivity.shouldRenderExpandedContent,
      contentActivity.hasActivatedExpandedContent,
      contentActivity.shouldRunDataLane,
      contentActivity.isActive,
    ]);
    const bodyDataActivity = React.useMemo(
      () => ({
        sceneKey: contentEntry.sceneKey,
        shouldAttachMountedContent,
        shouldRunDataLane: contentActivity.shouldRunDataLane,
        shouldSubscribeDataLane: contentActivity.shouldSubscribeDataLane,
        shouldRenderExpandedContent: contentActivity.shouldRenderExpandedContent,
        hasActivatedExpandedContent: contentActivity.hasActivatedExpandedContent,
      }),
      [
        contentEntry.sceneKey,
        contentActivity.hasActivatedExpandedContent,
        contentActivity.shouldRenderExpandedContent,
        contentActivity.shouldRunDataLane,
        contentActivity.shouldSubscribeDataLane,
        shouldAttachMountedContent,
      ]
    );
    // L4 context-volatility split: TRANSITION-STABLE object (no isActive — that
    // churner has its own primitive context so this identity survives transitions).
    const bodyRenderActivity = React.useMemo(
      () => ({
        sceneKey: contentEntry.sceneKey,
        shouldAttachMountedContent,
        shouldSubscribeDataLane: contentActivity.shouldSubscribeDataLane,
        shouldRenderExpandedContent: contentActivity.shouldRenderExpandedContent,
        hasActivatedExpandedContent: contentActivity.hasActivatedExpandedContent,
      }),
      [
        contentEntry.sceneKey,
        contentActivity.hasActivatedExpandedContent,
        contentActivity.shouldRenderExpandedContent,
        contentActivity.shouldSubscribeDataLane,
        shouldAttachMountedContent,
      ]
    );
    const rawBodyContent = (
      <SceneStackBodyContentHost
        contentEntry={contentEntry}
        transportEntry={transportEntry}
        bodyDefaults={bodyDefaults}
        bodyScrollRuntime={bodyScrollRuntime}
        isActive={contentActivity.isActive}
        shouldRenderListBody={shouldRenderListBody}
        shouldAttachMountedContent={shouldAttachMountedContent}
        mountedEntryUnits={mountedEntryUnits}
        activeEntryId={activeEntryId}
      />
    );
    const bodyContent = onProfilerRender ? (
      <React.Profiler
        id={`SceneStackBodyContent:${contentEntry.sceneKey}`}
        onRender={onProfilerRender}
      >
        {rawBodyContent}
      </React.Profiler>
    ) : (
      rawBodyContent
    );
    const shouldPublishRenderActivity = bodySurfaceKind === 'mounted';
    const shouldPublishDataActivity =
      shouldPublishRenderActivity && shouldPublishSceneBodyDataActivity(contentEntry.sceneKey);
    const bodyContentLayer = shouldPublishDataActivity ? (
      <BottomSheetSceneStackBodyRenderActivityContext.Provider value={bodyRenderActivity}>
        <BottomSheetSceneStackBodyIsActiveContext.Provider value={contentActivity.isActive}>
          <BottomSheetSceneStackBodyDataActivityContext.Provider value={bodyDataActivity}>
            {bodyContent}
          </BottomSheetSceneStackBodyDataActivityContext.Provider>
        </BottomSheetSceneStackBodyIsActiveContext.Provider>
      </BottomSheetSceneStackBodyRenderActivityContext.Provider>
    ) : shouldPublishRenderActivity ? (
      <BottomSheetSceneStackBodyRenderActivityContext.Provider value={bodyRenderActivity}>
        <BottomSheetSceneStackBodyIsActiveContext.Provider value={contentActivity.isActive}>
          {bodyContent}
        </BottomSheetSceneStackBodyIsActiveContext.Provider>
      </BottomSheetSceneStackBodyRenderActivityContext.Provider>
    ) : (
      bodyContent
    );

    if (!onProfilerRender) {
      return bodyContentLayer;
    }

    return (
      <React.Profiler
        id={`SceneStackBodyContentLayer:${contentEntry.sceneKey}`}
        onRender={onProfilerRender}
      >
        {bodyContentLayer}
      </React.Profiler>
    );
  },
  shouldSkipSceneStackBodyContentLayerUpdate
);
