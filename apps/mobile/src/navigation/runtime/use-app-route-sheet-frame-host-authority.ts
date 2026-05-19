import React from 'react';
import {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { SearchRouteOverlaySheetPolicy } from '../../overlays/searchRouteOverlayRuntimeContract';
import type { SearchRouteSceneStackChromeVisualState } from '../../overlays/searchRouteSceneStackSheetContract';
import { clampValue } from '../../overlays/sheetUtils';
import type { OverlayHeaderActionMode } from '../../overlays/useOverlayHeaderActionController';
import type { SearchRouteSheetHostFrameSnapshot } from '../../screens/Search/runtime/shared/search-route-sheet-host-frame-snapshot-contract';
import { EMPTY_SEARCH_ROUTE_SHEET_RESOLVED_VISUAL_SELECTION_SNAPSHOT } from '../../screens/Search/runtime/shared/search-route-sheet-resolved-visual-selection-snapshot-contract';
import type { AppRouteNavSilhouetteSheetExclusionModeValue } from './app-route-nav-silhouette-authority';
import type {
  AppRouteSheetHostNativeAdapterAuthority,
  AppRouteSheetHostNativeAdapterSnapshot,
} from './app-route-sheet-host-authority-controller';
import type { AppRouteSheetFrameHostNativeSharedValues } from './app-route-sheet-frame-host-native-targets';
import type { AppRouteSheetHostSurfaceFrameAuthority } from './app-route-sheet-host-surface-runtime-contract';
import type { SearchRouteSheetFrameHostInput } from './search-route-sheet-surface-state-runtime-contract';

type UseAppRouteSheetFrameHostAuthorityArgs = {
  fallbackSheetY: SharedValue<number>;
  nativeAdapterAuthority: AppRouteSheetHostNativeAdapterAuthority;
};

type HeaderActionState = {
  visible: number;
  mode: OverlayHeaderActionMode;
  collapse: number;
};

const HIDDEN_OVERLAY_SHEET_POLICY: SearchRouteOverlaySheetPolicy = {
  overlaySheetVisible: false,
  overlaySheetApplyNavBarCutout: false,
  overlayHeaderActionMode: 'follow-collapse',
};

const FALLBACK_CHROME_VISUAL_STATE =
  EMPTY_SEARCH_ROUTE_SHEET_RESOLVED_VISUAL_SELECTION_SNAPSHOT.resolvedChromeVisualState;

const clamp01 = (value: number): number => {
  'worklet';
  return clampValue(value, 0, 1);
};

const resolveTargetProgress = (mode: OverlayHeaderActionMode, collapseProgress: number): number => {
  'worklet';
  switch (mode) {
    case 'fixed-plus':
      return 1;
    case 'follow-collapse':
      return collapseProgress;
    case 'fixed-close':
    default:
      return 0;
  }
};

const resolveFrameHostInput = ({
  nativeAdapterSnapshot,
  fallbackSheetY,
}: {
  nativeAdapterSnapshot: AppRouteSheetHostNativeAdapterSnapshot;
  fallbackSheetY: SharedValue<number>;
}): SearchRouteSheetFrameHostInput => ({
  ...nativeAdapterSnapshot.frameHostInput,
  sheetY: nativeAdapterSnapshot.frameHostInput.sheetY ?? fallbackSheetY,
});

const resolvePolicy = (
  frameHostInput: SearchRouteSheetFrameHostInput
): SearchRouteOverlaySheetPolicy =>
  frameHostInput.overlaySheetPolicy ?? HIDDEN_OVERLAY_SHEET_POLICY;

const resolveChromeVisualState = (
  chromeVisualState: SearchRouteSceneStackChromeVisualState | null
): SearchRouteSceneStackChromeVisualState => chromeVisualState ?? FALLBACK_CHROME_VISUAL_STATE;

export const useAppRouteSheetFrameHostAuthority = ({
  fallbackSheetY,
  nativeAdapterAuthority,
}: UseAppRouteSheetFrameHostAuthorityArgs): AppRouteSheetHostSurfaceFrameAuthority => {
  const initialNativeAdapterSnapshotRef =
    React.useRef<AppRouteSheetHostNativeAdapterSnapshot | null>(null);
  if (initialNativeAdapterSnapshotRef.current == null) {
    initialNativeAdapterSnapshotRef.current = nativeAdapterAuthority.getSnapshot();
  }
  const initialFrameHostInput = resolveFrameHostInput({
    nativeAdapterSnapshot: initialNativeAdapterSnapshotRef.current,
    fallbackSheetY,
  });
  const initialPolicy = resolvePolicy(initialFrameHostInput);
  const initialChromeVisualState = resolveChromeVisualState(
    initialNativeAdapterSnapshotRef.current.chromeVisualState
  );
  const [chromeVisualStateSource, setChromeVisualStateSource] = React.useState(
    initialChromeVisualState
  );

  const sheetExclusionModeValue = useSharedValue<AppRouteNavSilhouetteSheetExclusionModeValue>(
    initialChromeVisualState.navSilhouetteSheetExclusionModeValue.value
  );
  const resolvedNavBarHeightValue = useSharedValue(
    Math.max(initialChromeVisualState.navBarCutoutHeight, 0)
  );
  const bottomNavHiddenTranslateYValue = useSharedValue(
    initialChromeVisualState.bottomNavHiddenTranslateY
  );
  const navTranslateYValue = useSharedValue(initialChromeVisualState.navTranslateY.value);
  const navBarCutoutIsHidingValue = useSharedValue(
    initialChromeVisualState.navBarCutoutIsHiding
  );
  const navBarCutoutProgressValue = useSharedValue(
    initialChromeVisualState.navBarCutoutProgress.value
  );
  const navBarCutoutHidingProgressValue = useSharedValue(
    initialChromeVisualState.navBarCutoutHidingProgress.value
  );
  const headerActionVisibleValue = useSharedValue(initialPolicy.overlaySheetVisible ? 1 : 0);
  const headerActionModeValue = useSharedValue<OverlayHeaderActionMode>(
    initialPolicy.overlayHeaderActionMode
  );
  const middleSnapPointValue = useSharedValue(initialFrameHostInput.middleSnapPoint);
  const collapsedSnapPointValue = useSharedValue(initialFrameHostInput.collapsedSnapPoint);
  const overlayHeaderActionOverrideActiveValue = useSharedValue(false);
  const sheetY = initialFrameHostInput.sheetY ?? fallbackSheetY;
  const overlayHeaderActionProgress = initialChromeVisualState.overlayHeaderActionProgress;
  const nativeSharedValueTargets = React.useMemo<AppRouteSheetFrameHostNativeSharedValues>(
    () => ({
      sheetExclusionModeValue,
      resolvedNavBarHeightValue,
      bottomNavHiddenTranslateYValue,
      navTranslateYValue,
      navBarCutoutProgressValue,
      navBarCutoutHidingProgressValue,
      navBarCutoutIsHidingValue,
      headerActionVisibleValue,
      headerActionModeValue,
      middleSnapPointValue,
      collapsedSnapPointValue,
    }),
    [
      bottomNavHiddenTranslateYValue,
      collapsedSnapPointValue,
      headerActionModeValue,
      headerActionVisibleValue,
      middleSnapPointValue,
      navBarCutoutHidingProgressValue,
      navBarCutoutProgressValue,
      navBarCutoutIsHidingValue,
      navTranslateYValue,
      resolvedNavBarHeightValue,
      sheetExclusionModeValue,
    ]
  );

  React.useLayoutEffect(() => {
    const syncChromeVisualStateSource = () => {
      const nextChromeVisualState = resolveChromeVisualState(
        nativeAdapterAuthority.getSnapshot().chromeVisualState
      );
      setChromeVisualStateSource((currentChromeVisualState) =>
        currentChromeVisualState === nextChromeVisualState
          ? currentChromeVisualState
          : nextChromeVisualState
      );
    };
    const unregisterSharedValues =
      nativeAdapterAuthority.registerSharedValues(nativeSharedValueTargets);
    const unsubscribeNativeAdapter =
      nativeAdapterAuthority.subscribe(syncChromeVisualStateSource);
    syncChromeVisualStateSource();
    return () => {
      unsubscribeNativeAdapter();
      unregisterSharedValues();
    };
  }, [nativeAdapterAuthority, nativeSharedValueTargets]);

  useAnimatedReaction(
    () => chromeVisualStateSource.navSilhouetteSheetExclusionModeValue.value,
    (modeValue) => {
      sheetExclusionModeValue.value = modeValue;
    },
    [chromeVisualStateSource.navSilhouetteSheetExclusionModeValue, sheetExclusionModeValue]
  );
  useAnimatedReaction(
    () => chromeVisualStateSource.navBarCutoutProgress.value,
    (progress) => {
      navBarCutoutProgressValue.value = progress;
    },
    [chromeVisualStateSource.navBarCutoutProgress, navBarCutoutProgressValue]
  );
  useAnimatedReaction(
    () => chromeVisualStateSource.navTranslateY.value,
    (translateY) => {
      navTranslateYValue.value = translateY;
    },
    [chromeVisualStateSource.navTranslateY, navTranslateYValue]
  );
  useAnimatedReaction(
    () => chromeVisualStateSource.navBarCutoutHidingProgress.value,
    (progress) => {
      navBarCutoutHidingProgressValue.value = progress;
    },
    [
      chromeVisualStateSource.navBarCutoutHidingProgress,
      navBarCutoutHidingProgressValue,
    ]
  );
  const collapseProgress = useDerivedValue(() => {
    const range = collapsedSnapPointValue.value - middleSnapPointValue.value;
    const raw = range !== 0 ? (sheetY.value - middleSnapPointValue.value) / range : 0;
    return clamp01(raw);
  }, [collapsedSnapPointValue, middleSnapPointValue, sheetY]);

  useAnimatedReaction(
    (): HeaderActionState => ({
      visible: headerActionVisibleValue.value,
      mode: headerActionModeValue.value,
      collapse: collapseProgress.value,
    }),
    (next, prev) => {
      if (next.visible === 0) {
        overlayHeaderActionOverrideActiveValue.value = false;
        cancelAnimation(overlayHeaderActionProgress);
        return;
      }

      const desired = resolveTargetProgress(next.mode, next.collapse);
      const prevMode = prev?.mode;

      if (prevMode !== undefined && prevMode !== next.mode) {
        const current = overlayHeaderActionProgress.value;
        if (Math.abs(current - desired) < 0.001) {
          overlayHeaderActionOverrideActiveValue.value = false;
          cancelAnimation(overlayHeaderActionProgress);
          overlayHeaderActionProgress.value = desired;
          return;
        }
        overlayHeaderActionOverrideActiveValue.value = true;
        cancelAnimation(overlayHeaderActionProgress);
        overlayHeaderActionProgress.value = withTiming(
          desired,
          { duration: 220, easing: Easing.out(Easing.cubic) },
          (finished) => {
            'worklet';
            if (finished) {
              overlayHeaderActionOverrideActiveValue.value = false;
            }
          }
        );
        return;
      }

      if (!overlayHeaderActionOverrideActiveValue.value) {
        overlayHeaderActionProgress.value = desired;
      }
    },
    [
      collapseProgress,
      headerActionModeValue,
      headerActionVisibleValue,
      overlayHeaderActionOverrideActiveValue,
      overlayHeaderActionProgress,
    ]
  );

  return React.useMemo<AppRouteSheetHostSurfaceFrameAuthority>(
    () => ({
      subscribe: () => () => {},
      getSnapshot: (): SearchRouteSheetHostFrameSnapshot => ({
        sheetClipStyle: null,
      }),
    }),
    []
  );
};
