import React from 'react';

export type BottomSheetSceneStackBodyDataActivity = {
  sceneKey: string;
  shouldAttachMountedContent: boolean;
  shouldRunDataLane: boolean;
  shouldSubscribeDataLane: boolean;
  shouldRenderExpandedContent: boolean;
  hasActivatedExpandedContent: boolean;
};

// L4 CONTEXT-VOLATILITY SPLIT ([COMMITDBG]-attributed, 2026-07-23): isActive flips on
// EVERY transition for both participants — bundling it here gave every consumer a new
// context object per transition, re-rendering whole resident bodies (the ~75ms grid
// tax, including transitions that never involved the scene). The render-activity
// object is now TRANSITION-STABLE (data-lane facts only); isActive lives in its own
// primitive-valued context below for the consumers that truly need the activation
// edge (segment/scroll restore).
export type BottomSheetSceneStackBodyRenderActivity = Omit<
  BottomSheetSceneStackBodyDataActivity,
  'shouldRunDataLane'
>;

const EMPTY_BODY_DATA_ACTIVITY: BottomSheetSceneStackBodyDataActivity = {
  sceneKey: '',
  shouldAttachMountedContent: false,
  shouldRunDataLane: false,
  shouldSubscribeDataLane: false,
  shouldRenderExpandedContent: false,
  hasActivatedExpandedContent: false,
};

const EMPTY_BODY_RENDER_ACTIVITY: BottomSheetSceneStackBodyRenderActivity = {
  sceneKey: '',
  shouldAttachMountedContent: false,
  shouldSubscribeDataLane: false,
  shouldRenderExpandedContent: false,
  hasActivatedExpandedContent: false,
};

export const BottomSheetSceneStackBodyDataActivityContext =
  React.createContext<BottomSheetSceneStackBodyDataActivity>(EMPTY_BODY_DATA_ACTIVITY);

export const BottomSheetSceneStackBodyRenderActivityContext =
  React.createContext<BottomSheetSceneStackBodyRenderActivity>(EMPTY_BODY_RENDER_ACTIVITY);

export const useBottomSheetSceneStackBodyDataActivity = (): BottomSheetSceneStackBodyDataActivity =>
  React.useContext(BottomSheetSceneStackBodyDataActivityContext);

export const useBottomSheetSceneStackBodyRenderActivity =
  (): BottomSheetSceneStackBodyRenderActivity =>
    React.useContext(BottomSheetSceneStackBodyRenderActivityContext);

// Return-to-origin foundation — the live ACTIVE flag for this scene
// (activeSceneKey===sceneKey). Mirrors the scroll-restore gate
// (useMountedSceneScrollRestore: contentReady === isActive && hasActivatedExpandedContent)
// so a segmented scene's segment restore consumes on the SAME false→true re-activation
// edge as scroll. A PRIMITIVE context value: subscribers re-render only on real flips.
export const BottomSheetSceneStackBodyIsActiveContext = React.createContext<boolean>(false);

export const useBottomSheetSceneStackBodyIsActive = (): boolean =>
  React.useContext(BottomSheetSceneStackBodyIsActiveContext);
