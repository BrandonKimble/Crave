import React from 'react';
import { PixelRatio } from 'react-native';
import { useDerivedValue, type DerivedValue, type SharedValue } from 'react-native-reanimated';

import { LINE_HEIGHTS } from '../../constants/typography';
import { OVERLAY_CORNER_RADIUS } from '../../overlays/overlaySheetStyles';
import { NAV_BOTTOM_PADDING, NAV_TOP_PADDING } from '../../screens/Search/constants/search';
import type { SearchRouteSheetFrameHostInput } from './search-route-sheet-surface-state-runtime-contract';

// ─── F950: THE NAV SILHOUETTE'S NUMBERS, ANSWERED OR DECLARED LOST ───────────────────
//
// The counter-example this file is measured against is
// app-route-scene-entry-mounts.ts's SCENE_ENTRY_MOUNT_DEPTH_LIMIT, which says what it is
// derived from and what KIND of knob it is. Each constant here now does the same, including
// the ones whose honest answer is "nobody recorded it".
//
// ANTI-ALIAS BLEED (+2 / *2+2): the silhouette's material must overshoot the sheet's rounded
// corner by a hair, or the corner's anti-aliased edge leaves a visible seam between the nav
// material and the sheet. `+ 2` is the bleed in POINTS, and it is a magic number: no
// measurement or device survey is recorded for it, only that 2 works and 0 does not. Treat it
// as an unattributed visual fudge — if the corner radius or the material ever changes, this
// must be re-eyeballed, not re-derived.
const NAV_SILHOUETTE_ANTIALIAS_BLEED_PX = 2;

export const APP_ROUTE_NAV_SILHOUETTE_EXTRA_TOP =
  OVERLAY_CORNER_RADIUS + NAV_SILHOUETTE_ANTIALIAS_BLEED_PX;
// The cutout spans the full corner diameter, plus the same bleed.
export const APP_ROUTE_NAV_SILHOUETTE_CUTOUT_HEIGHT =
  OVERLAY_CORNER_RADIUS * 2 + NAV_SILHOUETTE_ANTIALIAS_BLEED_PX;
export const APP_ROUTE_NAV_SILHOUETTE_BOUNDARY_SHAPE = {
  materialTopInset: APP_ROUTE_NAV_SILHOUETTE_EXTRA_TOP,
  cutoutHeight: APP_ROUTE_NAV_SILHOUETTE_CUTOUT_HEIGHT,
  cutoutRadius: OVERLAY_CORNER_RADIUS,
} as const;
/** Floor for the device's bottom safe-area inset, so a no-home-indicator device still gets
 *  breathing room under the labels. An OWNER CHOICE (visual comfort), not a derivation. */
export const APP_ROUTE_NAV_BOTTOM_INSET_MIN = 12;

/** The nav glyph's box. A FACT about the icon set: every bottom-nav glyph is authored at
 *  24pt, so the row's height arithmetic can rely on it. Changing the glyphs changes this. */
export const APP_ROUTE_NAV_ICON_HEIGHT = 24;

/** Vertical gap between glyph and label. OWNER CHOICE (typographic rhythm). */
export const APP_ROUTE_NAV_LABEL_GAP = 2;

/** Floor on how far the nav translates when hiding. The real hide distance is
 *  `navHeight + cutoutHeight`; this floor only matters if that sum were somehow tiny, i.e.
 *  it is a guard against a degenerate measurement, not a tuned value. UNATTRIBUTED — the
 *  choice of 24 specifically has no recorded derivation. */
export const APP_ROUTE_NAV_HIDE_MIN = 24;

export type AppRouteNavSilhouetteSheetExclusionMode =
  | 'none'
  | 'dockedScene'
  | 'staticPersistent'
  | 'animatedSearchTransition';

export const APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE = {
  none: 0,
  dockedScene: 1,
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
  // F1398(b): a second "expected visible painted height" field was deleted here — it was
  // assigned the SAME local (visiblePaintedHeight) as expectedSheetMaskHeight on every
  // path, so the two names read as an independent mask-vs-paint cross-check that could
  // never disagree (the exact `hideLead = 1` always-green class F951(c) removed nearby;
  // see the delete-gate entry for the deleted field's name). Only expectedSheetMaskHeight
  // has a real functional reader; the other was telemetry-only.
  expectedSheetMaskHeight: number;
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

// F956(e): `AppRouteNavSilhouetteProjectionInput` (policy input + a
// `projectedSheetExclusionMode` override) lived here, and its ONLY reader was the equally
// dead `resolveAppRouteNavSilhouetteSheetExclusionMode`. Both deleted, along with
// `APP_ROUTE_NAV_HIDE_EXTRA` and `resolveAppRouteNavSilhouetteModeValueFromPolicy` — all
// four verified caller-free by symbol AND bare-string grep over apps/mobile/src. What
// COLLATERAL: `resolveAppRouteNavSilhouetteMode` (policy -> mode) went with them. It looked
// like a live derivation, but the two dead functions were its ONLY callers — the live lane
// (use-search-foreground-bottom-nav-visual-runtime) enters at
// `resolveAppRouteNavSilhouetteSheetExclusionModeValue`, i.e. it already holds a mode. That is
// what survives here, together with `resolveAppRouteNavSilhouetteModeFromValue`.

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

// F956(e): took a second `_bottomInset` argument it never read (the bottom inset is
// already baked into `bottomNavHeight` by resolveAppRouteBottomNavHeight, so passing it
// again invited a caller to believe it mattered). Dropped at the declaration and at both
// call sites.
export const resolveAppRouteBottomNavHiddenTranslateY = (bottomNavHeight: number): number =>
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
    bottomNavHiddenTranslateY: resolveAppRouteBottomNavHiddenTranslateY(bottomNavHeight),
  };
};

const resolveAppRouteNavSilhouetteModeValue = (
  mode: AppRouteNavSilhouetteSheetExclusionMode
): AppRouteNavSilhouetteSheetExclusionModeValue => {
  'worklet';
  switch (mode) {
    case 'animatedSearchTransition':
      return APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE.animatedSearchTransition;
    case 'dockedScene':
      return APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE.dockedScene;
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

export const resolveAppRouteNavSilhouetteModeFromValue = (
  modeValue: AppRouteNavSilhouetteSheetExclusionModeValue
): AppRouteNavSilhouetteSheetExclusionMode => {
  'worklet';
  switch (modeValue) {
    case APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE.animatedSearchTransition:
      return 'animatedSearchTransition';
    case APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE.dockedScene:
      return 'dockedScene';
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
  return mode === 'dockedScene' || mode === 'staticPersistent';
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

  // F951(c): a `const hideLead = 1` used to sit here, multiplied into navTranslateY (a
  // no-op) AND published as a telemetry field that could only ever read 1 — the
  // always-green class this codebase paid months to learn about. An instrument that
  // cannot show RED is not an instrument. Deleted at the source, at the multiplication,
  // in the sample type, in the EMPTY sample and at its one reader. If a real lead factor
  // is ever wanted it arrives as a value that can differ from 1 and a spec that proves it.
  const visiblePaintedHeight = resolveAppRouteNavSilhouetteVisiblePaintedHeight({
    navBarHeight: resolvedNavBarHeight,
    navTranslateY: resolvedNavTranslateY,
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
