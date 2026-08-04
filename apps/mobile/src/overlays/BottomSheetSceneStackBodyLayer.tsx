import React from 'react';
import Animated from 'react-native-reanimated';

import type {
  SceneStackBodyContentLayerProps,
  SceneStackBodyFrameProps,
} from './bottomSheetSceneStackBodyLayerContract';
import {
  BottomSheetSceneStackBodyDataActivityContext,
  BottomSheetSceneStackBodyRenderActivityContext,
  BottomSheetSceneStackBodyIsActiveContext,
} from './BottomSheetSceneStackBodyActivityContext';
import { areSceneEntryMountUnitArraysEqual } from '../navigation/runtime/app-route-scene-entry-mounts';
import { bottomSheetSceneStackHostStyles as styles } from './bottomSheetSceneStackHostStyles';
import { useSearchOverlayProfilerRender } from './SearchOverlayProfilerContext';
import { useBottomSheetSceneStackBodyContentRuntime } from './useBottomSheetSceneStackBodyContentRuntime';
import { createShapeEquality, sameFieldRef } from './shape-equality';
import {
  shouldPublishSceneBodyDataActivity,
  shouldSkipSceneStackBodyContentLayerUpdate,
} from './bottomSheetSceneStackBodyLayerSkip';
import { logPageSwitchDebug } from '../navigation/runtime/pageswitch-debug-flag';

// F980: every skip fn below is DERIVED from its props shape (shape-equality.ts). Forget a
// new prop and tsc names it, instead of the leg silently never re-rendering again.
// A field this scope deliberately does NOT compare says so, here, out loud — an
// intentional omission and a forgotten one must not look the same.
// (The CONTENT layer's skip fn and its per-scene activity comparators live in
// ./bottomSheetSceneStackBodyLayerSkip — pure, and specced there. F1453.)

const shouldSkipSceneStackBodyFrameUpdate = createShapeEquality<SceneStackBodyFrameProps>({
  sceneKey: sameFieldRef,
  visibilityStyle: sameFieldRef,
  pointerEventsAnimatedProps: sameFieldRef,
  children: sameFieldRef,
});

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
