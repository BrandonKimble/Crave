import type {
  LayoutChangeEvent,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import type { FlashListProps } from '@shopify/flash-list';

import type { BottomSheetWithFlashListBaseProps } from './bottomSheetWithFlashListContract';
import type {
  SearchRouteSceneStackBodyContentEntry as SearchRouteSceneBodyContentEntry,
  SearchRouteSceneStackBodyTransportEntry as SearchRouteSceneBodyTransportEntry,
  SearchRouteSceneStackChromeEntry as SearchRouteSceneChromeEntry,
} from './searchRouteSceneStackSheetContract';
import type { SharedValue } from 'react-native-reanimated';
import type { AppRouteSceneStackSurfaceAuthority } from '../navigation/runtime/app-route-scene-stack-surface-contract';
import type { OverlayKey } from './types';
import type { SceneBodyContentInsets } from './bottomSheetSurfaceStyleUtils';

export type BottomSheetSceneStackBodyDefaults = {
  scrollHeaderComponent: React.ReactNode;
  scrollHeaderHeight: number;
  effectiveShowsVerticalScrollIndicator: boolean;
  resolvedKeyboardShouldPersistTaps: ScrollViewProps['keyboardShouldPersistTaps'];
  resolvedKeyboardDismissMode: ScrollViewProps['keyboardDismissMode'];
  resolvedScrollIndicatorInsets: ScrollViewProps['scrollIndicatorInsets'];
  resolvedTestID?: string;
  resolvedContentContainerStyle?: SceneBodyContentInsets;
  activeFlashListProps?: BottomSheetWithFlashListBaseProps<unknown>['flashListProps'];
};

export type BottomSheetSceneStackBodyScrollRuntime = {
  // Stable-identity UI-thread mirror: sinks drive the FlashList/ScrollView scrollEnabled
  // off this via useAnimatedProps so a transient activation toggle doesn't re-render the
  // heavy list body (frame-drop fix, 2026-07-02). The JS boolean it used to mirror is gone
  // (F4504) — it had no sinks, and its identity churn is what the fix was absorbing.
  shouldEnableScrollShared: SharedValue<boolean>;
  ScrollComponent: React.ComponentType<ScrollViewProps & React.RefAttributes<ScrollView>>;
  primaryScrollViewOnScroll: ScrollViewProps['onScroll'];
  primaryListOnScroll: FlashListProps<unknown>['onScroll'];
  secondaryListOnScroll: FlashListProps<unknown>['onScroll'];
  scrollOffset: SharedValue<number>;
  /** Boundary-physics law §1: runtime-owned overscroll (<0 top / >0 bottom / 0 inside). */
  contentOverscroll: SharedValue<number>;
};

export type BottomSheetSceneStackBodyRuntimeSnapshot = {
  bodyDefaults: BottomSheetSceneStackBodyDefaults;
  bodyScrollRuntime: BottomSheetSceneStackBodyScrollRuntime;
};

export type BottomSheetSceneStackSceneBodyRuntimeAuthority = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => BottomSheetSceneStackBodyRuntimeSnapshot;
};

export type BottomSheetSceneStackBodyRuntimeAuthority = {
  // OverlayKey, not string: the implementation memoises one authority per scene key in a
  // Map with no removal path, and this type is what BOUNDS that Map (F970).
  getSceneBodyRuntimeAuthority: (
    sceneKey: OverlayKey
  ) => BottomSheetSceneStackSceneBodyRuntimeAuthority;
};

export type BottomSheetSceneStackBodyContentEntry = SearchRouteSceneBodyContentEntry;
export type BottomSheetSceneStackBodyTransportEntry = SearchRouteSceneBodyTransportEntry;
export type BottomSheetSceneStackChromeEntry = SearchRouteSceneChromeEntry;

export type BottomSheetSceneStackHostProps = {
  sceneStackSurfaceAuthority: AppRouteSceneStackSurfaceAuthority;
  // F974(b): `routeSceneDisplayTargetRegistry` used to be declared here, threaded through
  // FIVE component layers of BottomSheetSceneStackHost, destructured twice and COMPARED in
  // five memo comparators — while NO property of it was ever read in that file. Those
  // comparators were pure cost: an identity change could only ever force an extra re-render
  // of every leg, never prevent one. The registry's real consumer (NavSilhouetteHost, which
  // reads `activeTabIndexValue`) is fed directly by AppOverlayRouteHost and is untouched.
  shadowShellStyle: StyleProp<ViewStyle>;
  surfaceStyle: StyleProp<ViewStyle>;
  scrollHeaderComponent: React.ReactNode;
  onHeaderLayout: (event: LayoutChangeEvent) => void;
  onScrollHeaderLayout: (event: LayoutChangeEvent) => void;
  scrollHeaderSyncStyle: StyleProp<ViewStyle>;
  displayedSceneKey: OverlayKey | null;
  // Overlap crossfade descriptor (incoming = the new scene, outgoing = the held
  // source scene; contentTransitionToken keys the ramp). Threaded from the
  // surface-body snapshot down to ActiveSceneStackSurfaceHost.
  outgoingSceneKey: OverlayKey | null;
  incomingSceneKey: OverlayKey | null;
  contentTransitionToken: number | null;
  // Render-side co-completer for the overlap 'content' settle plane. The crossfade ramp keyed on
  // contentTransitionToken calls this (via runOnJS) with that same token at ramp-end, so the
  // 'content' plane settles when the incoming page reveals rather than at the controller's
  // SCENE_READINESS_LIVENESS_MS watchdog (Phase 2: the readiness collector is the other
  // co-completer). Token-guarded downstream, so a stale/duplicate call is a safe no-op.
  onContentSettleComplete: (token: number) => void;
  bodyRuntimeAuthority: BottomSheetSceneStackBodyRuntimeAuthority;
};
