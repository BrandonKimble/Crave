import type React from 'react';
import type { SearchPriceSheetProps } from '../../components/SearchPriceSheet';
import type { SearchRankAndScoreSheetsProps } from '../../components/SearchRankAndScoreSheets';
import type {
  RestaurantRouteLayerPresentationModel,
} from '../../../../overlays/restaurantRouteHostContract';

type SearchAppShellRestaurantSheetLayerModel = {
  surfaceKind: 'restaurant';
  presentationModel: RestaurantRouteLayerPresentationModel;
  wrapRenderedSheet: (children: React.ReactNode) => React.ReactNode;
  onProfilerRender: React.ProfilerOnRenderCallback;
};

const NOOP_PROFILER_RENDER: React.ProfilerOnRenderCallback = () => undefined;

const createSearchAppShellRestaurantSheetLayerModel = (
  presentationModel: RestaurantRouteLayerPresentationModel | null,
  onProfilerRender: React.ProfilerOnRenderCallback = NOOP_PROFILER_RENDER
): SearchAppShellRestaurantSheetLayerModel | null => {
  if (!presentationModel) {
    return null;
  }

  return {
    surfaceKind: 'restaurant',
    presentationModel,
    wrapRenderedSheet:
      presentationModel.spec &&
      typeof presentationModel.spec.renderWrapper === 'function'
        ? presentationModel.spec.renderWrapper
        : (children) => children,
    onProfilerRender,
  };
};

export type SearchAppShellSheetLayerModel = SearchAppShellRestaurantSheetLayerModel;

export type SearchAppShellRankAndScoreModalLayerModel = {
  rankAndScoreSheetsProps: SearchRankAndScoreSheetsProps | null;
  onProfilerRender: React.ProfilerOnRenderCallback;
};

export type SearchAppShellPriceModalLayerModel = {
  priceSheetProps: SearchPriceSheetProps | null;
  onProfilerRender: React.ProfilerOnRenderCallback;
};

export type SearchAppOverlaySheetRenderLayerModel = {
  layerKey: 'global-restaurant-sheet' | 'local-restaurant-sheet';
  kind: 'sheet';
  sheetLayer: SearchAppShellSheetLayerModel;
};

export const createSearchAppOverlaySheetRenderLayerModel = ({
  layerKey,
  sheetLayer,
}: {
  layerKey: 'global-restaurant-sheet' | 'local-restaurant-sheet';
  sheetLayer: SearchAppShellSheetLayerModel | null;
}): SearchAppOverlaySheetRenderLayerModel | null => {
  if (!sheetLayer) {
    return null;
  }

  return {
    layerKey,
    kind: 'sheet',
    sheetLayer,
  };
};

export const createSearchAppOverlayRestaurantRenderLayerModel = ({
  presentationModel,
  layerKey,
  onProfilerRender = NOOP_PROFILER_RENDER,
}: {
  presentationModel: RestaurantRouteLayerPresentationModel | null;
  layerKey: 'global-restaurant-sheet' | 'local-restaurant-sheet';
  onProfilerRender?: React.ProfilerOnRenderCallback;
}): SearchAppOverlaySheetRenderLayerModel | null =>
  createSearchAppOverlaySheetRenderLayerModel({
    layerKey,
    sheetLayer: createSearchAppShellRestaurantSheetLayerModel(
      presentationModel,
      onProfilerRender
    ),
  });
