import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewProps,
  StyleProp,
  ViewStyle,
} from 'react-native';

import type {
  BottomSheetSceneStackBodyContentEntry,
  BottomSheetSceneStackBodyDefaults,
  BottomSheetSceneStackBodyScrollRuntime,
  BottomSheetSceneStackBodyTransportEntry,
} from './bottomSheetSceneStackHostContract';
import type { AppRouteSceneStackSceneActivitySnapshot } from '../navigation/runtime/app-route-scene-stack-surface-contract';

export type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

export type StaticContentSurfaceProps = {
  content: React.ReactNode;
  containerStyle?: ScrollViewProps['contentContainerStyle'];
  surfaceStyle?: ScrollViewProps['style'];
};

export type SceneStackBodyContentProps = {
  sceneKey: string;
  shouldRenderListBody: boolean;
  shouldAttachMountedContent: boolean;
  bodyDefaults: BottomSheetSceneStackBodyDefaults;
  bodyScrollRuntime: BottomSheetSceneStackBodyScrollRuntime;
  sceneBodyContentEntry: BottomSheetSceneStackBodyContentEntry;
  sceneBodyTransportEntry: BottomSheetSceneStackBodyTransportEntry;
};

export type SceneStackBodyContentActivity = Pick<
  AppRouteSceneStackSceneActivitySnapshot,
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
  children: React.ReactNode;
};

export type SceneStackBodyContentLayerProps = {
  contentEntry: BottomSheetSceneStackBodyContentEntry;
  transportEntry: BottomSheetSceneStackBodyTransportEntry;
  contentActivity: SceneStackBodyContentActivity;
  bodyDefaults: BottomSheetSceneStackBodyDefaults;
  bodyScrollRuntime: BottomSheetSceneStackBodyScrollRuntime;
};
