import React from 'react';

export type BottomSheetSceneStackBodyDataActivity = {
  sceneKey: string;
  shouldAttachMountedContent: boolean;
  shouldRunDataLane: boolean;
  shouldSubscribeDataLane: boolean;
  shouldRenderExpandedContent: boolean;
  hasActivatedExpandedContent: boolean;
};

export type BottomSheetSceneStackBodyRenderActivity = Omit<
  BottomSheetSceneStackBodyDataActivity,
  'shouldRunDataLane'
> & {
  // Return-to-origin foundation — the live ACTIVE flag for this scene (activeSceneKey===sceneKey).
  // Mirrors the scroll-restore gate (useMountedSceneScrollRestore: contentReady === isActive &&
  // hasActivatedExpandedContent) so a segmented scene's segment restore consumes on the SAME
  // false→true re-activation edge as scroll, rather than the sticky hasActivatedExpandedContent
  // (which never re-fires on a warm dismiss-return).
  isActive: boolean;
};

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
  isActive: false,
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
