import React from 'react';

export type BottomSheetSceneStackBodyDataActivity = {
  sceneKey: string;
  shouldRunDataLane: boolean;
  shouldSubscribeDataLane: boolean;
  shouldRenderExpandedContent: boolean;
  hasActivatedExpandedContent: boolean;
};

export type BottomSheetSceneStackBodyRenderActivity = Omit<
  BottomSheetSceneStackBodyDataActivity,
  'shouldRunDataLane'
>;

const EMPTY_BODY_DATA_ACTIVITY: BottomSheetSceneStackBodyDataActivity = {
  sceneKey: '',
  shouldRunDataLane: false,
  shouldSubscribeDataLane: false,
  shouldRenderExpandedContent: false,
  hasActivatedExpandedContent: false,
};

const EMPTY_BODY_RENDER_ACTIVITY: BottomSheetSceneStackBodyRenderActivity = {
  sceneKey: '',
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
