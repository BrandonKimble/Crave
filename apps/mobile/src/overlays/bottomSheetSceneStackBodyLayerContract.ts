import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import type { useAnimatedProps } from 'react-native-reanimated';

import type {
  BottomSheetSceneStackBodyContentEntry,
  BottomSheetSceneStackBodyDefaults,
  BottomSheetSceneStackBodyScrollRuntime,
  BottomSheetSceneStackBodyTransportEntry,
} from './bottomSheetSceneStackHostContract';
import type { AppRouteSceneStackSceneActivitySnapshot } from '../navigation/runtime/app-route-scene-stack-surface-contract';
import type { SceneEntryMountUnit } from '../navigation/runtime/app-route-scene-entry-mounts';

export type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

export type StaticContentSurfaceProps = {
  content: React.ReactNode;
  containerStyle?: ScrollViewProps['contentContainerStyle'];
  surfaceStyle?: ScrollViewProps['style'];
};

export type SceneStackBodyContentProps = {
  sceneKey: string;
  isActive: boolean;
  shouldRenderListBody: boolean;
  shouldAttachMountedContent: boolean;
  bodyDefaults: BottomSheetSceneStackBodyDefaults;
  bodyScrollRuntime: BottomSheetSceneStackBodyScrollRuntime;
  sceneBodyContentEntry: BottomSheetSceneStackBodyContentEntry;
  sceneBodyTransportEntry: BottomSheetSceneStackBodyTransportEntry;
  // W1 slice 1 — entry-keyed child mounts: non-null ONLY for child-role scenes; the mounted
  // branch renders one body unit per entry (params by prop), roots keep the singleton path.
  mountedEntryUnits: readonly SceneEntryMountUnit[] | null;
  activeEntryId: string | null;
};

export type SceneStackBodyContentActivity = Pick<
  AppRouteSceneStackSceneActivitySnapshot,
  | 'isActive'
  | 'shouldRenderListBody'
  | 'shouldAttachMountedContent'
  | 'shouldRunDataLane'
  | 'shouldSubscribeDataLane'
  | 'shouldRenderExpandedContent'
  | 'hasActivatedExpandedContent'
>;

export type SceneStackBodyFrameProps = {
  sceneKey: string;
  visibilityStyle: StyleProp<ViewStyle>;
  // Touch routing is UI-THREAD driven (the swap-lane, BottomSheetSceneStackHost): pointerEvents
  // rides `useAnimatedProps` off the SAME live-role SharedValue as the leg's opacity, so 'auto'
  // (incoming/displayed) vs 'none' (leaving/idle) flips in LOCKSTEP with visibility. A JS
  // render-derived pointerEvents lagged the SV by the full flush→commit window (33-146ms), so a
  // warm early-flip left the invisible outgoing leg still swallowing taps over the visible
  // incoming leg. Applied to the leg's absolute-fill wrapper Animated.View.
  pointerEventsAnimatedProps: ReturnType<
    typeof useAnimatedProps<{ pointerEvents: 'auto' | 'none' }>
  >;
  children: React.ReactNode;
};

export type SceneStackBodyContentLayerProps = {
  contentEntry: BottomSheetSceneStackBodyContentEntry;
  transportEntry: BottomSheetSceneStackBodyTransportEntry;
  contentActivity: SceneStackBodyContentActivity;
  bodyDefaults: BottomSheetSceneStackBodyDefaults;
  bodyScrollRuntime: BottomSheetSceneStackBodyScrollRuntime;
  // W1 slice 1 — entry-keyed child mounts (see SceneStackBodyContentProps).
  mountedEntryUnits: readonly SceneEntryMountUnit[] | null;
  activeEntryId: string | null;
};
