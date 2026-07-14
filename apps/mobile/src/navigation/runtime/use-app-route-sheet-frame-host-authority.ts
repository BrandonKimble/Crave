import React from 'react';
import { useAnimatedReaction, useSharedValue, type SharedValue } from 'react-native-reanimated';

import type { SearchRouteSceneStackChromeVisualState } from '../../overlays/searchRouteSceneStackSheetContract';
import type { SearchRouteSheetHostFrameSnapshot } from '../../screens/Search/runtime/shared/search-route-sheet-host-frame-snapshot-contract';
import { EMPTY_SEARCH_ROUTE_SHEET_RESOLVED_VISUAL_SELECTION_SNAPSHOT } from '../../screens/Search/runtime/shared/search-route-sheet-resolved-visual-selection-snapshot-contract';
import type { AppRouteNavSilhouetteSheetExclusionModeValue } from './app-route-nav-silhouette-authority';
import type {
  AppRouteSheetHostNativeAdapterAuthority,
  AppRouteSheetHostNativeAdapterSnapshot,
} from './app-route-sheet-host-authority-controller';
import type { AppRouteSheetFrameHostNativeSharedValues } from './app-route-sheet-frame-host-native-targets';
import type { AppRouteSheetHostSurfaceFrameAuthority } from './app-route-sheet-host-surface-runtime-contract';

type UseAppRouteSheetFrameHostAuthorityArgs = {
  nativeAdapterAuthority: AppRouteSheetHostNativeAdapterAuthority;
};

const DEFAULT_CHROME_VISUAL_STATE =
  EMPTY_SEARCH_ROUTE_SHEET_RESOLVED_VISUAL_SELECTION_SNAPSHOT.resolvedChromeVisualState;

const resolveChromeVisualState = (
  chromeVisualState: SearchRouteSceneStackChromeVisualState | null
): SearchRouteSceneStackChromeVisualState => chromeVisualState ?? DEFAULT_CHROME_VISUAL_STATE;

export const useAppRouteSheetFrameHostAuthority = ({
  nativeAdapterAuthority,
}: UseAppRouteSheetFrameHostAuthorityArgs): AppRouteSheetHostSurfaceFrameAuthority => {
  const initialNativeAdapterSnapshotRef =
    React.useRef<AppRouteSheetHostNativeAdapterSnapshot | null>(null);
  if (initialNativeAdapterSnapshotRef.current == null) {
    initialNativeAdapterSnapshotRef.current = nativeAdapterAuthority.getSnapshot();
  }
  const initialChromeVisualState = resolveChromeVisualState(
    initialNativeAdapterSnapshotRef.current.chromeVisualState
  );
  const [chromeVisualStateSource, setChromeVisualStateSource] =
    React.useState(initialChromeVisualState);

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
  const navBarCutoutIsHidingValue = useSharedValue(initialChromeVisualState.navBarCutoutIsHiding);
  const navBarCutoutProgressValue = useSharedValue(
    initialChromeVisualState.navBarCutoutProgress.value
  );
  const navBarCutoutHidingProgressValue = useSharedValue(
    initialChromeVisualState.navBarCutoutHidingProgress.value
  );
  const nativeSharedValueTargets = React.useMemo<AppRouteSheetFrameHostNativeSharedValues>(
    () => ({
      sheetExclusionModeValue,
      resolvedNavBarHeightValue,
      bottomNavHiddenTranslateYValue,
      navTranslateYValue,
      navBarCutoutProgressValue,
      navBarCutoutHidingProgressValue,
      navBarCutoutIsHidingValue,
    }),
    [
      bottomNavHiddenTranslateYValue,
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
    const unsubscribeNativeAdapter = nativeAdapterAuthority.subscribe(syncChromeVisualStateSource);
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
    [chromeVisualStateSource.navBarCutoutHidingProgress, navBarCutoutHidingProgressValue]
  );
  // Leg 6 (§4 HeaderNavAction): the old mode→progress header-action driver (follow-collapse /
  // fixed-close, overlayHeaderActionProgress) is DELETED — the ONE host-owned HeaderNavAction on
  // PersistentSheetHeaderHost drives its own progress off the PF chrome clock.

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
