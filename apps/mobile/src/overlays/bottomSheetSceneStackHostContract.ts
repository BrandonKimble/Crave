import type {
  LayoutChangeEvent,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import type { FlashListProps } from '@shopify/flash-list';

import type { SharedValue } from 'react-native-reanimated';

import type { BottomSheetWithFlashListBaseProps } from './bottomSheetWithFlashListContract';
import type {
  SearchRouteSceneStackBodyContentEntry as SearchRouteSceneBodyContentEntry,
  SearchRouteSceneStackBodyTransportEntry as SearchRouteSceneBodyTransportEntry,
  SearchRouteSceneStackChromeEntry as SearchRouteSceneChromeEntry,
} from './searchRouteSceneStackSheetContract';
import type { AppRouteSceneStackSurfaceAuthority } from '../navigation/runtime/app-route-scene-stack-surface-contract';
import type { AppRouteSceneDisplayTargetRegistry } from '../navigation/runtime/app-route-scene-display-target-registry';

export type BottomSheetSceneStackBodyDefaults = {
  scrollHeaderComponent: React.ReactNode;
  scrollHeaderHeight: number;
  effectiveShowsVerticalScrollIndicator: boolean;
  resolvedKeyboardShouldPersistTaps: ScrollViewProps['keyboardShouldPersistTaps'];
  resolvedKeyboardDismissMode: ScrollViewProps['keyboardDismissMode'];
  resolvedBounces: ScrollViewProps['bounces'];
  resolvedAlwaysBounceVertical: ScrollViewProps['alwaysBounceVertical'];
  resolvedOverScrollMode: ScrollViewProps['overScrollMode'];
  resolvedScrollIndicatorInsets: ScrollViewProps['scrollIndicatorInsets'];
  resolvedTestID?: string;
  resolvedContentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  activeFlashListProps?: BottomSheetWithFlashListBaseProps<unknown>['flashListProps'];
};

export type BottomSheetSceneStackBodyScrollRuntime = {
  shouldEnableScroll: boolean;
  ScrollComponent: React.ComponentType<ScrollViewProps & React.RefAttributes<ScrollView>>;
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
  fixedHeaderComponent: React.ReactNode;
  scrollHeaderComponent: React.ReactNode;
  onHeaderLayout: (event: LayoutChangeEvent) => void;
  onScrollHeaderLayout: (event: LayoutChangeEvent) => void;
  scrollHeaderSyncStyle: StyleProp<ViewStyle>;
  bodyRuntimeAuthority: BottomSheetSceneStackBodyRuntimeAuthority;
};
