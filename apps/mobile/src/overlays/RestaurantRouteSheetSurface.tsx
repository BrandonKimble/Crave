import React from 'react';
import type { RestaurantRouteLayerPresentationModel } from './restaurantRouteHostContract';
import type { OverlayComponentContentSpec, OverlayContentSpec } from './types';
import { useRestaurantRouteBottomSheetRuntime } from './useRestaurantRouteBottomSheetRuntime';
import { useRestaurantRouteSheetChromeRuntime } from './useRestaurantRouteSheetChromeRuntime';
import { useRestaurantRouteSheetRenderRuntime } from './useRestaurantRouteSheetRenderRuntime';
import { useRestaurantRouteSheetSnapCallbacksRuntime } from './useRestaurantRouteSheetSnapCallbacksRuntime';
import { useRestaurantRouteSheetStateRuntime } from './useRestaurantRouteSheetStateRuntime';

type RestaurantRouteSheetSurfaceProps = {
  presentationModel: RestaurantRouteLayerPresentationModel;
};

type RestaurantRouteSheetSpec = NonNullable<RestaurantRouteLayerPresentationModel['spec']>;
type RestaurantRouteSnapPoints = RestaurantRouteSheetSpec['snapPoints'];

const isOverlayComponentContentSpec = (
  spec: OverlayContentSpec<unknown> | null
): spec is OverlayComponentContentSpec => spec?.surfaceKind === 'content';

const areSnapPointsEqual = (
  left: RestaurantRouteSnapPoints | undefined,
  right: RestaurantRouteSnapPoints | undefined
): boolean =>
  left?.expanded === right?.expanded &&
  left?.middle === right?.middle &&
  left?.collapsed === right?.collapsed &&
  left?.hidden === right?.hidden;

const arePresentationModelsEqual = (
  left: RestaurantRouteSheetSurfaceProps,
  right: RestaurantRouteSheetSurfaceProps
): boolean => {
  const leftModel = left.presentationModel;
  const rightModel = right.presentationModel;
  const leftSpec = leftModel.spec;
  const rightSpec = rightModel.spec;
  const leftContentSpec = isOverlayComponentContentSpec(leftSpec)
    ? leftSpec
    : null;
  const rightContentSpec = isOverlayComponentContentSpec(rightSpec)
    ? rightSpec
    : null;

  return (
    leftModel.restaurantRouteSource === rightModel.restaurantRouteSource &&
    leftModel.visible === rightModel.visible &&
    leftModel.activeOverlayRouteKey === rightModel.activeOverlayRouteKey &&
    leftModel.rootOverlayKey === rightModel.rootOverlayKey &&
    leftModel.overlayRouteStackLength === rightModel.overlayRouteStackLength &&
    leftModel.presentationState === rightModel.presentationState &&
    leftModel.snapController === rightModel.snapController &&
    leftModel.headerActionProgress === rightModel.headerActionProgress &&
    leftModel.headerActionMode === rightModel.headerActionMode &&
    leftModel.navBarHeight === rightModel.navBarHeight &&
    leftModel.applyNavBarCutout === rightModel.applyNavBarCutout &&
    leftModel.navBarCutoutProgress === rightModel.navBarCutoutProgress &&
    leftModel.navBarHiddenTranslateY === rightModel.navBarHiddenTranslateY &&
    leftModel.navBarCutoutIsHiding === rightModel.navBarCutoutIsHiding &&
    leftSpec?.overlayKey === rightSpec?.overlayKey &&
    leftSpec?.semanticOverlayKey === rightSpec?.semanticOverlayKey &&
    leftSpec?.shellIdentityKey === rightSpec?.shellIdentityKey &&
    leftSpec?.sceneIdentityKey === rightSpec?.sceneIdentityKey &&
    leftSpec?.surfaceKind === rightSpec?.surfaceKind &&
    leftSpec?.initialSnapPoint === rightSpec?.initialSnapPoint &&
    leftSpec?.animateOnMount === rightSpec?.animateOnMount &&
    leftContentSpec?.contentComponent === rightContentSpec?.contentComponent &&
    leftSpec?.backgroundComponent === rightSpec?.backgroundComponent &&
    leftSpec?.underlayComponent === rightSpec?.underlayComponent &&
    leftSpec?.overlayComponent === rightSpec?.overlayComponent &&
    leftSpec?.style === rightSpec?.style &&
    leftSpec?.contentContainerStyle === rightSpec?.contentContainerStyle &&
    leftSpec?.onHidden === rightSpec?.onHidden &&
    leftSpec?.dismissThreshold === rightSpec?.dismissThreshold &&
    leftSpec?.preventSwipeDismiss === rightSpec?.preventSwipeDismiss &&
    leftSpec?.interactionEnabled === rightSpec?.interactionEnabled &&
    leftSpec?.renderWrapper === rightSpec?.renderWrapper &&
    areSnapPointsEqual(leftSpec?.snapPoints, rightSpec?.snapPoints)
  );
};

const RestaurantRouteSheetSurface = ({
  presentationModel,
}: RestaurantRouteSheetSurfaceProps) => {
  const stateRuntime = useRestaurantRouteSheetStateRuntime(presentationModel);

  if (!stateRuntime) {
    return null;
  }

  const snapCallbacksRuntime = useRestaurantRouteSheetSnapCallbacksRuntime({
    sheetStateRuntime: stateRuntime,
  });
  const bottomSheetRuntime = useRestaurantRouteBottomSheetRuntime({
    sheetStateRuntime: stateRuntime,
    snapCallbacksRuntime,
  });
  const chromeRuntime = useRestaurantRouteSheetChromeRuntime({
    presentationModel,
    sheetStateRuntime: stateRuntime,
  });
  const renderRuntime = useRestaurantRouteSheetRenderRuntime({
    activeShellSpec: stateRuntime.activeShellSpec,
    sheetClipAnimatedStyle: chromeRuntime.sheetClipAnimatedStyle,
    bottomSheetElement: bottomSheetRuntime.bottomSheetElement,
  });

  return renderRuntime.renderedSheet;
};

export default React.memo(
  RestaurantRouteSheetSurface,
  arePresentationModelsEqual
);
