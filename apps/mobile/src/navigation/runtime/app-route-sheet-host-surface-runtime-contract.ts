import type { SearchRouteSheetChromeTransportSnapshot } from '../../screens/Search/runtime/shared/search-route-sheet-chrome-transport-snapshot-contract';
import type { SearchRouteSheetHostFrameSnapshot } from '../../screens/Search/runtime/shared/search-route-sheet-host-frame-snapshot-contract';
import type { SearchRouteSheetMotionCallbacksSnapshot } from '../../screens/Search/runtime/shared/search-route-sheet-motion-callbacks-snapshot-contract';
import type { SearchRouteSheetMotionStateSnapshot } from '../../screens/Search/runtime/shared/search-route-sheet-motion-state-snapshot-contract';
import type { SearchRouteSheetScrollBodyDefaultsSnapshot } from '../../screens/Search/runtime/shared/search-route-sheet-scroll-body-defaults-snapshot-contract';
import type { SearchRouteSheetScrollSharedRuntimeSnapshot } from '../../screens/Search/runtime/shared/search-route-sheet-scroll-shared-runtime-snapshot-contract';
import type { SnapshotAuthority } from '../../screens/Search/runtime/shared/use-snapshot-authority';
import type { OverlayKey } from '../../overlays/types';
import type { BottomSheetSharedRuntimeConfigAuthority } from '../../overlays/bottomSheetSharedRuntimeContract';
import type { SearchRouteSceneStackChromeVisualState } from '../../overlays/searchRouteSceneStackSheetContract';

export type AppRouteSheetHostSurfaceBodySnapshot = {
  activeSceneKey: OverlayKey | null;
  displayedSceneKey: OverlayKey | null;
  hasRenderableSheetSurface: boolean;
  chromeEntry: SearchRouteSheetChromeTransportSnapshot['chromeEntry'] | null;
  scrollSharedRuntimeEntry:
    | SearchRouteSheetScrollSharedRuntimeSnapshot['sharedRuntimeEntry']
    | null;
  scrollBodyDefaultsEntry: SearchRouteSheetScrollBodyDefaultsSnapshot['bodyDefaultsEntry'] | null;
  motionStateEntry: SearchRouteSheetMotionStateSnapshot['stateEntry'] | null;
  motionCallbacksEntry: SearchRouteSheetMotionCallbacksSnapshot['callbacksEntry'];
  searchSurfacePageBundleProgress: SearchRouteSceneStackChromeVisualState['searchSurfacePageBundleProgress'];
};

export type AppRouteSheetHostSurfaceSnapshot = {
  shouldRenderSceneStackSurface: boolean;
};

export type AppRouteSheetHostSurfaceFrameAuthority =
  SnapshotAuthority<SearchRouteSheetHostFrameSnapshot>;

export type AppRouteSheetHostMotionRuntimeAuthority =
  SnapshotAuthority<SearchRouteSheetMotionStateSnapshot>;

export type AppRouteSheetHostSurfaceBodyAuthority =
  SnapshotAuthority<AppRouteSheetHostSurfaceBodySnapshot>;

export type AppRouteSheetHostSurfaceAuthority = SnapshotAuthority<AppRouteSheetHostSurfaceSnapshot>;

export type AppRouteSheetHostRuntimeConfigAuthority = BottomSheetSharedRuntimeConfigAuthority;

export const EMPTY_APP_ROUTE_SHEET_HOST_FRAME_SNAPSHOT: SearchRouteSheetHostFrameSnapshot = {
  sheetClipStyle: null,
};

const EMPTY_APP_ROUTE_SHEET_MOTION_CALLBACKS_SNAPSHOT: SearchRouteSheetMotionCallbacksSnapshot = {
  callbacksEntry: {
    onSnapStart: undefined,
    onSnapChange: undefined,
    onDragStateChange: undefined,
    onSettleStateChange: undefined,
    onSnapSettleComplete: undefined,
  },
};

export const EMPTY_APP_ROUTE_SHEET_HOST_SURFACE_BODY_SNAPSHOT: AppRouteSheetHostSurfaceBodySnapshot =
  {
    activeSceneKey: null,
    displayedSceneKey: null,
    hasRenderableSheetSurface: false,
    chromeEntry: null,
    scrollSharedRuntimeEntry: null,
    scrollBodyDefaultsEntry: null,
    motionStateEntry: null,
    motionCallbacksEntry: EMPTY_APP_ROUTE_SHEET_MOTION_CALLBACKS_SNAPSHOT.callbacksEntry,
    searchSurfacePageBundleProgress: { value: 0 },
  };

export const EMPTY_APP_ROUTE_SHEET_HOST_SURFACE_SNAPSHOT: AppRouteSheetHostSurfaceSnapshot = {
  shouldRenderSceneStackSurface: true,
};

export const areAppRouteSheetHostSurfaceBodySnapshotsEqual = (
  left: AppRouteSheetHostSurfaceBodySnapshot,
  right: AppRouteSheetHostSurfaceBodySnapshot
): boolean => {
  // `displayedSceneKey` IS load-bearing for the React body surface: it drives the
  // per-scene visibility in BottomSheetSceneStackHost (resolveSceneStackStaticVisibility),
  // so a change here must wake the body to flip which scene's frame is visible. Without
  // it, a poll-lane -> pollDetail switch (where every other field is identical) keeps the
  // stale 'polls' frame visible and the child scene never paints. Other runtime-only
  // fields stay excluded — those propagate through the native display authorities and
  // need not wake the React surface.
  return (
    left.displayedSceneKey === right.displayedSceneKey &&
    left.hasRenderableSheetSurface === right.hasRenderableSheetSurface &&
    left.chromeEntry?.headerComponent === right.chromeEntry?.headerComponent &&
    left.chromeEntry?.backgroundComponent === right.chromeEntry?.backgroundComponent &&
    left.chromeEntry?.overlayComponent === right.chromeEntry?.overlayComponent &&
    left.scrollSharedRuntimeEntry?.onHidden === right.scrollSharedRuntimeEntry?.onHidden &&
    left.scrollSharedRuntimeEntry?.onScrollOffsetChange ===
      right.scrollSharedRuntimeEntry?.onScrollOffsetChange &&
    left.scrollSharedRuntimeEntry?.onMomentumBeginJS ===
      right.scrollSharedRuntimeEntry?.onMomentumBeginJS &&
    left.scrollSharedRuntimeEntry?.onMomentumEndJS ===
      right.scrollSharedRuntimeEntry?.onMomentumEndJS &&
    left.scrollSharedRuntimeEntry?.showsVerticalScrollIndicator ===
      right.scrollSharedRuntimeEntry?.showsVerticalScrollIndicator &&
    left.scrollSharedRuntimeEntry?.testID === right.scrollSharedRuntimeEntry?.testID &&
    left.scrollSharedRuntimeEntry?.animateOnMount ===
      right.scrollSharedRuntimeEntry?.animateOnMount &&
    left.scrollBodyDefaultsEntry?.contentContainerStyle ===
      right.scrollBodyDefaultsEntry?.contentContainerStyle &&
    left.scrollBodyDefaultsEntry?.keyboardShouldPersistTaps ===
      right.scrollBodyDefaultsEntry?.keyboardShouldPersistTaps &&
    left.scrollBodyDefaultsEntry?.scrollIndicatorInsets ===
      right.scrollBodyDefaultsEntry?.scrollIndicatorInsets &&
    left.scrollBodyDefaultsEntry?.keyboardDismissMode ===
      right.scrollBodyDefaultsEntry?.keyboardDismissMode &&
    left.scrollBodyDefaultsEntry?.bounces === right.scrollBodyDefaultsEntry?.bounces &&
    left.scrollBodyDefaultsEntry?.alwaysBounceVertical ===
      right.scrollBodyDefaultsEntry?.alwaysBounceVertical &&
    left.scrollBodyDefaultsEntry?.overScrollMode ===
      right.scrollBodyDefaultsEntry?.overScrollMode &&
    left.scrollBodyDefaultsEntry?.testID === right.scrollBodyDefaultsEntry?.testID &&
    left.scrollBodyDefaultsEntry?.flashListProps ===
      right.scrollBodyDefaultsEntry?.flashListProps &&
    left.motionCallbacksEntry === right.motionCallbacksEntry
  );
};

export const areAppRouteSheetHostSurfaceSnapshotsEqual = (
  left: AppRouteSheetHostSurfaceSnapshot,
  right: AppRouteSheetHostSurfaceSnapshot
): boolean => left.shouldRenderSceneStackSurface === right.shouldRenderSceneStackSurface;
