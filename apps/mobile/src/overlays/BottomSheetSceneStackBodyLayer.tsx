import React from 'react';
import { View } from 'react-native';

import type {
  SceneStackBodyContentLayerProps,
  SceneStackBodyFrameProps,
} from './bottomSheetSceneStackBodyLayerContract';
import {
  BottomSheetSceneStackBodyDataActivityContext,
  BottomSheetSceneStackBodyRenderActivityContext,
} from './BottomSheetSceneStackBodyActivityContext';
import { bottomSheetSceneStackHostStyles as styles } from './bottomSheetSceneStackHostStyles';
import { useSearchOverlayProfilerRender } from './SearchOverlayProfilerContext';
import { useBottomSheetSceneStackBodyContentRuntime } from './useBottomSheetSceneStackBodyContentRuntime';

const shouldSkipSceneStackBodyFrameUpdate = (
  previousProps: SceneStackBodyFrameProps,
  nextProps: SceneStackBodyFrameProps
): boolean =>
  previousProps.sceneKey === nextProps.sceneKey &&
  previousProps.visibilityStyle === nextProps.visibilityStyle &&
  previousProps.children === nextProps.children;

const shouldPublishSceneBodyDataActivity = (sceneKey: string): boolean =>
  sceneKey === 'polls' || sceneKey === 'pollCreation' || sceneKey === 'saveList';

const shouldSkipSceneStackBodyContentLayerUpdate = (
  previousProps: SceneStackBodyContentLayerProps,
  nextProps: SceneStackBodyContentLayerProps
): boolean => {
  if (previousProps.contentEntry !== nextProps.contentEntry) {
    return false;
  }

  if (previousProps.transportEntry !== nextProps.transportEntry) {
    return false;
  }

  const previousActivity = previousProps.contentActivity;
  const nextActivity = nextProps.contentActivity;
  if (nextProps.contentEntry.sceneKey === 'search') {
    if (
      previousActivity.shouldRenderListBody !== nextActivity.shouldRenderListBody ||
      previousActivity.shouldSubscribeDataLane !== nextActivity.shouldSubscribeDataLane
    ) {
      return false;
    }
  } else {
    const shouldCompareDataLane = shouldPublishSceneBodyDataActivity(
      nextProps.contentEntry.sceneKey
    );
    if (
      previousActivity.shouldRenderListBody !== nextActivity.shouldRenderListBody ||
      previousActivity.shouldAttachMountedContent !== nextActivity.shouldAttachMountedContent ||
      (shouldCompareDataLane &&
        previousActivity.shouldRunDataLane !== nextActivity.shouldRunDataLane) ||
      previousActivity.shouldSubscribeDataLane !== nextActivity.shouldSubscribeDataLane ||
      previousActivity.shouldRenderExpandedContent !== nextActivity.shouldRenderExpandedContent ||
      previousActivity.hasActivatedExpandedContent !== nextActivity.hasActivatedExpandedContent
    ) {
      return false;
    }
  }

  return (
    previousProps.bodyDefaults === nextProps.bodyDefaults &&
    previousProps.bodyScrollRuntime === nextProps.bodyScrollRuntime
  );
};

type SceneStackBodyContentHostProps = Pick<
  SceneStackBodyContentLayerProps,
  'contentEntry' | 'transportEntry' | 'bodyDefaults' | 'bodyScrollRuntime'
> & {
  shouldRenderListBody: boolean;
  shouldAttachMountedContent: boolean;
};

const shouldSkipSceneStackBodyContentUpdate = (
  previousProps: SceneStackBodyContentHostProps,
  nextProps: SceneStackBodyContentHostProps
): boolean =>
  previousProps.contentEntry === nextProps.contentEntry &&
  previousProps.transportEntry === nextProps.transportEntry &&
  previousProps.bodyDefaults === nextProps.bodyDefaults &&
  previousProps.bodyScrollRuntime === nextProps.bodyScrollRuntime &&
  previousProps.shouldRenderListBody === nextProps.shouldRenderListBody &&
  previousProps.shouldAttachMountedContent === nextProps.shouldAttachMountedContent;

const SceneStackBodyContentHost = React.memo(
  ({
    contentEntry,
    transportEntry,
    bodyDefaults,
    bodyScrollRuntime,
    shouldRenderListBody,
    shouldAttachMountedContent,
  }: SceneStackBodyContentHostProps) =>
    useBottomSheetSceneStackBodyContentRuntime({
      sceneKey: contentEntry.sceneKey,
      shouldRenderListBody,
      shouldAttachMountedContent,
      bodyDefaults,
      bodyScrollRuntime,
      sceneBodyContentEntry: contentEntry,
      sceneBodyTransportEntry: transportEntry,
    }),
  shouldSkipSceneStackBodyContentUpdate
);

export const SceneStackBodyFrame = React.memo(
  ({ sceneKey, visibilityStyle, children }: SceneStackBodyFrameProps) => {
    const onProfilerRender = useSearchOverlayProfilerRender();
    const bodyFrame = (
      <View
        key={`scene-${sceneKey}`}
        style={[styles.sceneStackBodyLayer, visibilityStyle]}
      >
        {children}
      </View>
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
  }: SceneStackBodyContentLayerProps) => {
    const onProfilerRender = useSearchOverlayProfilerRender();
    const bodySurfaceKind = contentEntry.bodyContentSpec.surfaceKind;
    const shouldRenderListBody =
      bodySurfaceKind === 'list' ? contentActivity.shouldRenderListBody : false;
    const shouldAttachMountedContent =
      bodySurfaceKind === 'mounted' && contentActivity.shouldAttachMountedContent;
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
        shouldRenderListBody={shouldRenderListBody}
        shouldAttachMountedContent={shouldAttachMountedContent}
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
        <BottomSheetSceneStackBodyDataActivityContext.Provider value={bodyDataActivity}>
          {bodyContent}
        </BottomSheetSceneStackBodyDataActivityContext.Provider>
      </BottomSheetSceneStackBodyRenderActivityContext.Provider>
    ) : shouldPublishRenderActivity ? (
      <BottomSheetSceneStackBodyRenderActivityContext.Provider value={bodyRenderActivity}>
        {bodyContent}
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
