import React from 'react';
import { PixelRatio } from 'react-native';
import { useDerivedValue, type DerivedValue, type SharedValue } from 'react-native-reanimated';

import { LINE_HEIGHTS } from '../../constants/typography';
import { OVERLAY_CORNER_RADIUS } from '../../overlays/overlaySheetStyles';
import { NAV_BOTTOM_PADDING, NAV_TOP_PADDING } from '../../screens/Search/constants/search';
import type { SearchRouteSheetFrameHostInput } from './search-route-sheet-surface-state-runtime-contract';

export const APP_ROUTE_NAV_SILHOUETTE_EXTRA_TOP = OVERLAY_CORNER_RADIUS + 2;
export const APP_ROUTE_NAV_SILHOUETTE_CUTOUT_HEIGHT = OVERLAY_CORNER_RADIUS * 2 + 2;
export const APP_ROUTE_NAV_SILHOUETTE_BOUNDARY_SHAPE = {
  materialTopInset: APP_ROUTE_NAV_SILHOUETTE_EXTRA_TOP,
  cutoutHeight: APP_ROUTE_NAV_SILHOUETTE_CUTOUT_HEIGHT,
  cutoutRadius: OVERLAY_CORNER_RADIUS,
} as const;
export const APP_ROUTE_NAV_BOTTOM_INSET_MIN = 12;
export const APP_ROUTE_NAV_ICON_HEIGHT = 24;
export const APP_ROUTE_NAV_LABEL_GAP = 2;
export const APP_ROUTE_NAV_HIDE_EXTRA = 12;
export const APP_ROUTE_NAV_HIDE_MIN = 24;

export type AppRouteNavSilhouetteSheetExclusionMode =
  | 'none'
  | 'dockedPersistentPoll'
  | 'staticPersistent'
  | 'animatedSearchTransition';

export const APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE = {
  none: 0,
  dockedPersistentPoll: 1,
  staticPersistent: 2,
  animatedSearchTransition: 3,
} as const;

export type AppRouteNavSilhouetteSheetExclusionModeValue =
  (typeof APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE)[keyof typeof APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE];

export type AppRouteNavSilhouetteBottomNavGeometry = {
  bottomInset: number;
  bottomNavHeight: number;
  paintedNavHeight: number;
  navBarCutoutHeight: number;
  sheetBottomExclusionHeight: number;
  bottomNavHiddenTranslateY: number;
};

export type AppRouteNavSilhouetteClipSample = {
  expectedNavCutout: number;
  expectedSheetBodyExclusionHeight: number;
  expectedSheetMaskHeight: number;
  expectedVisiblePaintedHeight: number;
  hideLead: number;
  navBarExtraTop: number;
  navBarCutoutHidingProgress: number;
  navBarCutoutIsHiding: boolean;
  navBarCutoutProgress: number;
  navBarHiddenTranslateY: number;
  navBarHeight: number;
  navTranslateY: number;
  sheetExclusionMode: AppRouteNavSilhouetteSheetExclusionMode;
};

type AppRouteNavSilhouetteReadableValue<T> = SharedValue<T> | DerivedValue<T>;

export type AppRouteNavSilhouettePolicyInput = Pick<
  SearchRouteSheetFrameHostInput,
  'activeSemanticOverlayKey' | 'overlaySheetPolicy'
>;

export type AppRouteNavSilhouetteProjectionInput = AppRouteNavSilhouettePolicyInput & {
  projectedSheetExclusionMode?: AppRouteNavSilhouetteSheetExclusionMode | null;
};

const roundPx = (value: number): number => PixelRatio.roundToNearestPixel(value);

const roundAppRouteNavSilhouetteTelemetryValue = (value: number): number => {
  'worklet';
  return Math.round(value * 10000) / 10000;
};

export const resolveAppRouteNavBottomInset = (insetsBottom: number): number =>
  Math.max(insetsBottom, APP_ROUTE_NAV_BOTTOM_INSET_MIN);

export const resolveAppRouteBottomNavHeight = (bottomInset: number): number =>
  roundPx(
    NAV_TOP_PADDING +
      APP_ROUTE_NAV_ICON_HEIGHT +
      APP_ROUTE_NAV_LABEL_GAP +
      LINE_HEIGHTS.body +
      bottomInset +
      NAV_BOTTOM_PADDING
  );

export const resolveAppRouteBottomNavHiddenTranslateY = (
  bottomNavHeight: number,
  _bottomInset: number
): number =>
  roundPx(
    Math.max(APP_ROUTE_NAV_HIDE_MIN, bottomNavHeight + APP_ROUTE_NAV_SILHOUETTE_CUTOUT_HEIGHT)
  );

export const resolveAppRouteBottomNavTop = ({
  windowHeight,
  bottomNavHeight,
}: {
  windowHeight: number;
  bottomNavHeight: number;
}): number => roundPx(windowHeight - bottomNavHeight);

export const resolveAppRouteNavSilhouetteSnapTop = ({
  windowHeight,
  sheetBottomExclusionHeight,
}: {
  windowHeight: number;
  sheetBottomExclusionHeight: number;
}): number => roundPx(windowHeight - sheetBottomExclusionHeight);

export const resolveAppRouteNavSilhouetteBottomNavGeometry = (
  insetsBottom: number
): AppRouteNavSilhouetteBottomNavGeometry => {
  const bottomInset = resolveAppRouteNavBottomInset(insetsBottom);
  const bottomNavHeight = resolveAppRouteBottomNavHeight(bottomInset);
  const paintedNavHeight = bottomNavHeight + APP_ROUTE_NAV_SILHOUETTE_EXTRA_TOP;
  const sheetBottomExclusionHeight = bottomNavHeight;
  return {
    bottomInset,
    bottomNavHeight,
    paintedNavHeight,
    navBarCutoutHeight: paintedNavHeight,
    sheetBottomExclusionHeight,
    bottomNavHiddenTranslateY: resolveAppRouteBottomNavHiddenTranslateY(
      bottomNavHeight,
      bottomInset
    ),
  };
};

const resolveAppRouteNavSilhouetteMode = ({
  activeSemanticOverlayKey,
  overlaySheetPolicy,
}: AppRouteNavSilhouettePolicyInput): AppRouteNavSilhouetteSheetExclusionMode => {
  'worklet';
  if (!overlaySheetPolicy?.overlaySheetApplyNavBarCutout) {
    return 'none';
  }
  if (activeSemanticOverlayKey === 'search' || activeSemanticOverlayKey === 'polls') {
    return 'dockedPersistentPoll';
  }
  return 'staticPersistent';
};

export const resolveAppRouteNavSilhouetteSheetExclusionMode = ({
  projectedSheetExclusionMode,
  ...policyInput
}: AppRouteNavSilhouetteProjectionInput): AppRouteNavSilhouetteSheetExclusionMode => {
  'worklet';
  if (projectedSheetExclusionMode != null) {
    return projectedSheetExclusionMode;
  }
  return resolveAppRouteNavSilhouetteMode(policyInput);
};

const resolveAppRouteNavSilhouetteModeValue = (
  mode: AppRouteNavSilhouetteSheetExclusionMode
): AppRouteNavSilhouetteSheetExclusionModeValue => {
  'worklet';
  switch (mode) {
    case 'animatedSearchTransition':
      return APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE.animatedSearchTransition;
    case 'dockedPersistentPoll':
      return APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE.dockedPersistentPoll;
    case 'staticPersistent':
      return APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE.staticPersistent;
    case 'none':
    default:
      return APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE.none;
  }
};

export const resolveAppRouteNavSilhouetteSheetExclusionModeValue = (
  mode: AppRouteNavSilhouetteSheetExclusionMode
): AppRouteNavSilhouetteSheetExclusionModeValue => {
  'worklet';
  return resolveAppRouteNavSilhouetteModeValue(mode);
};

export const resolveAppRouteNavSilhouetteModeValueFromPolicy = (
  frameHostInput: AppRouteNavSilhouettePolicyInput
): AppRouteNavSilhouetteSheetExclusionModeValue => {
  'worklet';
  return resolveAppRouteNavSilhouetteModeValue(resolveAppRouteNavSilhouetteMode(frameHostInput));
};

export const resolveAppRouteNavSilhouetteModeFromValue = (
  modeValue: AppRouteNavSilhouetteSheetExclusionModeValue
): AppRouteNavSilhouetteSheetExclusionMode => {
  'worklet';
  switch (modeValue) {
    case APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE.animatedSearchTransition:
      return 'animatedSearchTransition';
    case APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE.dockedPersistentPoll:
      return 'dockedPersistentPoll';
    case APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE.staticPersistent:
      return 'staticPersistent';
    case APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE.none:
    default:
      return 'none';
  }
};

export const resolveAppRouteNavTranslateY = ({
  progress,
  hiddenTranslateY,
}: {
  progress: number;
  hiddenTranslateY: number;
}): number => {
  'worklet';
  const clampedProgress = Math.max(0, Math.min(1, progress));
  return Math.max(0, (1 - clampedProgress) * Math.max(0, hiddenTranslateY));
};

const isPersistentAppRouteNavSilhouetteMode = (
  mode: AppRouteNavSilhouetteSheetExclusionMode
): boolean => {
  'worklet';
  return mode === 'dockedPersistentPoll' || mode === 'staticPersistent';
};

const resolveAppRouteNavSilhouetteEffectiveNavTranslateY = ({
  mode,
  navTranslateY,
}: {
  mode: AppRouteNavSilhouetteSheetExclusionMode;
  navTranslateY: number;
}): number => {
  'worklet';
  return isPersistentAppRouteNavSilhouetteMode(mode) ? 0 : Math.max(0, navTranslateY);
};

const resolveAppRouteNavSilhouetteVisiblePaintedHeight = ({
  navBarHeight,
  navTranslateY,
}: {
  navBarHeight: number;
  navTranslateY: number;
}): number => {
  'worklet';
  const paintedHeight = Math.max(0, navBarHeight + APP_ROUTE_NAV_SILHOUETTE_EXTRA_TOP);
  return Math.max(0, paintedHeight - Math.max(0, navTranslateY));
};

const resolveAppRouteNavSilhouetteSheetBodyExclusionHeight = ({
  mode,
  navBarHeight,
  navTranslateY,
}: {
  mode: AppRouteNavSilhouetteSheetExclusionMode;
  navBarHeight: number;
  navTranslateY: number;
}): number => {
  'worklet';
  if (mode === 'none') {
    return 0;
  }
  return Math.max(0, Math.min(navBarHeight, navBarHeight - Math.max(0, navTranslateY)));
};

export const resolveAppRouteNavSilhouetteClipSample = ({
  mode,
  navBarHeight,
  bottomNavHiddenTranslateY,
  navTranslateY: navTranslateYOverride,
  navBarCutoutProgress,
  navBarCutoutHidingProgress,
  navBarCutoutIsHiding,
}: {
  mode: AppRouteNavSilhouetteSheetExclusionMode;
  navBarHeight: number;
  bottomNavHiddenTranslateY: number;
  navTranslateY?: number;
  navBarCutoutProgress: number;
  navBarCutoutHidingProgress: number;
  navBarCutoutIsHiding: boolean;
}): AppRouteNavSilhouetteClipSample => {
  'worklet';
  const resolvedNavBarHeight = Math.max(0, navBarHeight);
  const progress = Math.max(0, Math.min(1, navBarCutoutProgress));
  const hidingProgress = Math.max(0, Math.min(1, navBarCutoutHidingProgress));
  const resolvedHiddenTranslateY = Math.max(0, bottomNavHiddenTranslateY);
  const rawNavTranslateY =
    navTranslateYOverride == null
      ? resolveAppRouteNavTranslateY({
          progress,
          hiddenTranslateY: resolvedHiddenTranslateY,
        })
      : Math.max(0, navTranslateYOverride);
  const resolvedNavTranslateY = resolveAppRouteNavSilhouetteEffectiveNavTranslateY({
    mode,
    navTranslateY: rawNavTranslateY,
  });
  if (mode === 'none') {
    return {
      expectedNavCutout: 0,
      expectedSheetBodyExclusionHeight: 0,
      expectedSheetMaskHeight: 0,
      expectedVisiblePaintedHeight: 0,
      hideLead: 1,
      navBarExtraTop: APP_ROUTE_NAV_SILHOUETTE_EXTRA_TOP,
      navBarCutoutHidingProgress: hidingProgress,
      navBarCutoutIsHiding,
      navBarCutoutProgress: progress,
      navBarHiddenTranslateY: resolvedHiddenTranslateY,
      navBarHeight: resolvedNavBarHeight,
      navTranslateY: resolvedNavTranslateY,
      sheetExclusionMode: mode,
    };
  }

  const hideLead = 1;
  const visiblePaintedHeight = resolveAppRouteNavSilhouetteVisiblePaintedHeight({
    navBarHeight: resolvedNavBarHeight,
    navTranslateY: resolvedNavTranslateY * hideLead,
  });
  const cutout = Math.max(0, Math.min(resolvedNavBarHeight, visiblePaintedHeight));
  return {
    expectedNavCutout: cutout,
    expectedSheetBodyExclusionHeight: resolveAppRouteNavSilhouetteSheetBodyExclusionHeight({
      mode,
      navBarHeight: resolvedNavBarHeight,
      navTranslateY: resolvedNavTranslateY,
    }),
    expectedSheetMaskHeight: visiblePaintedHeight,
    expectedVisiblePaintedHeight: visiblePaintedHeight,
    hideLead,
    navBarExtraTop: APP_ROUTE_NAV_SILHOUETTE_EXTRA_TOP,
    navBarCutoutHidingProgress: hidingProgress,
    navBarCutoutIsHiding,
    navBarCutoutProgress: progress,
    navBarHiddenTranslateY: resolvedHiddenTranslateY,
    navBarHeight: resolvedNavBarHeight,
    navTranslateY: resolvedNavTranslateY,
    sheetExclusionMode: mode,
  };
};

export const resolveRoundedAppRouteNavSilhouetteClipSample = (
  sample: AppRouteNavSilhouetteClipSample
): AppRouteNavSilhouetteClipSample => {
  'worklet';
  return {
    ...sample,
    expectedNavCutout: roundAppRouteNavSilhouetteTelemetryValue(sample.expectedNavCutout),
    expectedSheetBodyExclusionHeight: roundAppRouteNavSilhouetteTelemetryValue(
      sample.expectedSheetBodyExclusionHeight
    ),
    expectedSheetMaskHeight: roundAppRouteNavSilhouetteTelemetryValue(
      sample.expectedSheetMaskHeight
    ),
    expectedVisiblePaintedHeight: roundAppRouteNavSilhouetteTelemetryValue(
      sample.expectedVisiblePaintedHeight
    ),
    navBarExtraTop: roundAppRouteNavSilhouetteTelemetryValue(sample.navBarExtraTop),
    navBarCutoutHidingProgress: roundAppRouteNavSilhouetteTelemetryValue(
      sample.navBarCutoutHidingProgress
    ),
    navBarCutoutProgress: roundAppRouteNavSilhouetteTelemetryValue(sample.navBarCutoutProgress),
    navBarHiddenTranslateY: roundAppRouteNavSilhouetteTelemetryValue(sample.navBarHiddenTranslateY),
    navBarHeight: roundAppRouteNavSilhouetteTelemetryValue(sample.navBarHeight),
    navTranslateY: roundAppRouteNavSilhouetteTelemetryValue(sample.navTranslateY),
  };
};

export const useAppRouteNavSilhouetteSheetMaskHeightValue = ({
  sheetExclusionModeValue,
  resolvedNavBarHeightValue,
  bottomNavHiddenTranslateYValue,
  navTranslateYValue,
  navBarCutoutProgressValue,
  navBarCutoutHidingProgressValue,
  navBarCutoutIsHidingValue,
}: {
  sheetExclusionModeValue: AppRouteNavSilhouetteReadableValue<AppRouteNavSilhouetteSheetExclusionModeValue>;
  resolvedNavBarHeightValue: AppRouteNavSilhouetteReadableValue<number>;
  bottomNavHiddenTranslateYValue: AppRouteNavSilhouetteReadableValue<number>;
  navTranslateYValue: AppRouteNavSilhouetteReadableValue<number>;
  navBarCutoutProgressValue: AppRouteNavSilhouetteReadableValue<number>;
  navBarCutoutHidingProgressValue: AppRouteNavSilhouetteReadableValue<number>;
  navBarCutoutIsHidingValue: AppRouteNavSilhouetteReadableValue<boolean>;
}) =>
  useDerivedValue(() => {
    const sample = resolveAppRouteNavSilhouetteClipSample({
      mode: resolveAppRouteNavSilhouetteModeFromValue(sheetExclusionModeValue.value),
      navBarHeight: resolvedNavBarHeightValue.value,
      bottomNavHiddenTranslateY: bottomNavHiddenTranslateYValue.value,
      navTranslateY: navTranslateYValue.value,
      navBarCutoutProgress: navBarCutoutProgressValue.value,
      navBarCutoutHidingProgress: navBarCutoutHidingProgressValue.value,
      navBarCutoutIsHiding: navBarCutoutIsHidingValue.value,
    });
    return sample.expectedSheetMaskHeight;
  }, []);

export const useAppRouteNavSilhouetteSheetBodyExclusionHeightValue = ({
  sheetExclusionModeValue,
  resolvedNavBarHeightValue,
  bottomNavHiddenTranslateYValue,
  navTranslateYValue,
  navBarCutoutProgressValue,
  navBarCutoutHidingProgressValue,
  navBarCutoutIsHidingValue,
}: {
  sheetExclusionModeValue: AppRouteNavSilhouetteReadableValue<AppRouteNavSilhouetteSheetExclusionModeValue>;
  resolvedNavBarHeightValue: AppRouteNavSilhouetteReadableValue<number>;
  bottomNavHiddenTranslateYValue: AppRouteNavSilhouetteReadableValue<number>;
  navTranslateYValue: AppRouteNavSilhouetteReadableValue<number>;
  navBarCutoutProgressValue: AppRouteNavSilhouetteReadableValue<number>;
  navBarCutoutHidingProgressValue: AppRouteNavSilhouetteReadableValue<number>;
  navBarCutoutIsHidingValue: AppRouteNavSilhouetteReadableValue<boolean>;
}) =>
  useDerivedValue(() => {
    const sample = resolveAppRouteNavSilhouetteClipSample({
      mode: resolveAppRouteNavSilhouetteModeFromValue(sheetExclusionModeValue.value),
      navBarHeight: resolvedNavBarHeightValue.value,
      bottomNavHiddenTranslateY: bottomNavHiddenTranslateYValue.value,
      navTranslateY: navTranslateYValue.value,
      navBarCutoutProgress: navBarCutoutProgressValue.value,
      navBarCutoutHidingProgress: navBarCutoutHidingProgressValue.value,
      navBarCutoutIsHiding: navBarCutoutIsHidingValue.value,
    });
    return sample.expectedSheetBodyExclusionHeight;
  }, []);

export const useAppRouteNavSilhouetteMotionRuntime = ({
  bottomNavHideProgress,
  navBarCutoutIsHidingValue,
  bottomNavHiddenTranslateY,
}: {
  bottomNavHideProgress: SharedValue<number> | DerivedValue<number>;
  navBarCutoutIsHidingValue: AppRouteNavSilhouetteReadableValue<boolean>;
  bottomNavHiddenTranslateY: number;
}): {
  navBarCutoutProgress: DerivedValue<number>;
  navBarCutoutHidingProgress: DerivedValue<number>;
  navTranslateY: DerivedValue<number>;
} => {
  const navBarCutoutProgress = useDerivedValue(() => {
    return bottomNavHideProgress.value;
  }, [bottomNavHideProgress]);
  const navBarCutoutHidingProgress = useDerivedValue(() => {
    if (!navBarCutoutIsHidingValue.value) {
      return 0;
    }
    return 1 - navBarCutoutProgress.value;
  }, [navBarCutoutIsHidingValue, navBarCutoutProgress]);
  const navTranslateY = useDerivedValue(
    () =>
      resolveAppRouteNavTranslateY({
        progress: navBarCutoutProgress.value,
        hiddenTranslateY: bottomNavHiddenTranslateY,
      }),
    [bottomNavHiddenTranslateY, navBarCutoutProgress]
  );
  return React.useMemo(
    () => ({
      navBarCutoutProgress,
      navBarCutoutHidingProgress,
      navTranslateY,
    }),
    [navBarCutoutHidingProgress, navBarCutoutProgress, navTranslateY]
  );
};
