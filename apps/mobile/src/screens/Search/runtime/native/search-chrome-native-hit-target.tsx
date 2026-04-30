import React from 'react';
import {
  NativeModules,
  Platform,
  requireNativeComponent,
  StyleSheet,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { SearchChromeTouchSurfaceRuntime } from '../shared/search-chrome-touch-surface-contract';

export type SearchChromeNativeHitTargetId =
  | 'shortcut_restaurants'
  | 'shortcut_dishes'
  | 'search_this_area';

export type SearchChromeNativeHitTargetRegion = {
  targetId: SearchChromeNativeHitTargetId;
  x: number;
  y: number;
  width: number;
  height: number;
  enabled: boolean;
};

export type SearchChromeNativeHitTargetSyncPayload = {
  hostKey: string;
  regions: SearchChromeNativeHitTargetRegion[];
};

type NativeSearchChromeNativeHitTargetRegistry = {
  searchChromeNativeHitTargetAvailable?: boolean;
  syncRegions: (payload: SearchChromeNativeHitTargetSyncPayload) => Promise<void>;
};

type NativeSearchChromeNativeHitTargetPressEvent = {
  targetId: SearchChromeNativeHitTargetId;
};

type NativeSearchChromeNativeHitTargetSurfaceProps = {
  hostKey: string;
  style?: StyleProp<ViewStyle>;
  onSearchChromeNativeHitTargetPress?: (
    event: NativeSyntheticEvent<NativeSearchChromeNativeHitTargetPressEvent>
  ) => void;
};

const MODULE_NAME = 'SearchChromeNativeHitTargetRegistry';
export const SEARCH_CHROME_NATIVE_HIT_TARGET_HOST_KEY = 'search_chrome_touch_surface';

const nativeRegistry = (
  Platform.OS === 'ios' || Platform.OS === 'android'
    ? (NativeModules as Record<string, unknown>)[MODULE_NAME]
    : null
) as NativeSearchChromeNativeHitTargetRegistry | null;

const NativeSearchChromeNativeHitTargetSurface =
  requireNativeComponent<NativeSearchChromeNativeHitTargetSurfaceProps>(
    'SearchChromeNativeHitTargetSurface'
  );

const actionHandlers: Partial<Record<SearchChromeNativeHitTargetId, () => void>> = {};

const mapTouchableToRegion = (
  targetId: SearchChromeNativeHitTargetId,
  touchable: SearchChromeTouchSurfaceRuntime['searchThisArea']
): SearchChromeNativeHitTargetRegion | null => {
  const hitRegion = touchable.hitRegion;
  if (hitRegion == null || hitRegion.width <= 0 || hitRegion.height <= 0) {
    delete actionHandlers[targetId];
    return null;
  }

  if (touchable.enabled) {
    actionHandlers[targetId] = touchable.onPress;
  } else {
    delete actionHandlers[targetId];
  }

  return {
    targetId,
    x: hitRegion.x,
    y: hitRegion.y,
    width: hitRegion.width,
    height: hitRegion.height,
    enabled: touchable.enabled,
  };
};

export const searchChromeNativeHitTargetRegistry = {
  searchChromeNativeHitTargetAvailable:
    nativeRegistry?.searchChromeNativeHitTargetAvailable === true,
  syncRegions(payload: SearchChromeNativeHitTargetSyncPayload): boolean {
    if (nativeRegistry?.searchChromeNativeHitTargetAvailable !== true) {
      return false;
    }
    void nativeRegistry.syncRegions(payload);
    return true;
  },
  syncRuntime(runtime: SearchChromeTouchSurfaceRuntime): boolean {
    const regions = [
      mapTouchableToRegion('shortcut_restaurants', runtime.shortcuts.restaurants),
      mapTouchableToRegion('shortcut_dishes', runtime.shortcuts.dishes),
      mapTouchableToRegion('search_this_area', runtime.searchThisArea),
    ].filter((region): region is SearchChromeNativeHitTargetRegion => region != null);

    return this.syncRegions({
      hostKey: SEARCH_CHROME_NATIVE_HIT_TARGET_HOST_KEY,
      regions,
    });
  },
  dispatchTarget(targetId: SearchChromeNativeHitTargetId): boolean {
    const handler = actionHandlers[targetId];
    if (!handler) {
      return false;
    }
    handler();
    return true;
  },
};

type SearchChromeNativeHitTargetSurfaceProps = {
  hostKey?: string;
  style?: StyleProp<ViewStyle>;
  onPressTarget?: (targetId: SearchChromeNativeHitTargetId) => void;
};

export const SearchChromeNativeHitTargetSurface = React.memo(
  function SearchChromeNativeHitTargetSurface({
    hostKey = SEARCH_CHROME_NATIVE_HIT_TARGET_HOST_KEY,
    style,
    onPressTarget = searchChromeNativeHitTargetRegistry.dispatchTarget,
  }: SearchChromeNativeHitTargetSurfaceProps) {
    const handlePress = React.useCallback(
      (event: NativeSyntheticEvent<NativeSearchChromeNativeHitTargetPressEvent>) => {
        onPressTarget?.(event.nativeEvent.targetId);
      },
      [onPressTarget]
    );

    return (
      <NativeSearchChromeNativeHitTargetSurface
        hostKey={hostKey}
        style={[StyleSheet.absoluteFill, style]}
        onSearchChromeNativeHitTargetPress={handlePress}
      />
    );
  }
);
