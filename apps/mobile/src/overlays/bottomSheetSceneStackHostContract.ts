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
import type { AppRouteSceneDisplayTargetRegistry } from '../navigation/runtime/app-route-scene-display-target-registry';
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
  shouldEnableScroll: boolean;
  // Stable-identity UI-thread mirror of shouldEnableScroll. Sinks drive the FlashList/ScrollView
  // scrollEnabled off this via useAnimatedProps so a transient activation toggle doesn't re-render
  // the heavy list body (frame-drop fix, 2026-07-02).
  shouldEnableScrollShared: SharedValue<boolean>;
  ScrollComponent: React.ComponentType<ScrollViewProps & React.RefAttributes<ScrollView>>;
  // Scroll container for the secondary co-mounted list (distinct GestureDetector/gesture). Stable
  // type so a dual-list surface can keep BOTH lists' scroll subtrees mounted across a tab toggle.
  SecondaryScrollComponent: React.ComponentType<ScrollViewProps & React.RefAttributes<ScrollView>>;
  primaryScrollViewOnScroll: ScrollViewProps['onScroll'];
  primaryListOnScroll: FlashListProps<unknown>['onScroll'];
  secondaryListOnScroll: FlashListProps<unknown>['onScroll'];
  scrollOffset: SharedValue<number>;
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
  getSceneBodyRuntimeAuthority: (
    sceneKey: string
  ) => BottomSheetSceneStackSceneBodyRuntimeAuthority;
};

export type BottomSheetSceneStackBodyContentEntry = SearchRouteSceneBodyContentEntry;
export type BottomSheetSceneStackBodyTransportEntry = SearchRouteSceneBodyTransportEntry;
export type BottomSheetSceneStackChromeEntry = SearchRouteSceneChromeEntry;

export type BottomSheetSceneStackHostProps = {
  sceneStackSurfaceAuthority: AppRouteSceneStackSurfaceAuthority;
  routeSceneDisplayTargetRegistry: AppRouteSceneDisplayTargetRegistry;
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
