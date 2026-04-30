import React from 'react';
import { StyleSheet } from 'react-native';

import Reanimated from 'react-native-reanimated';

import type { AppRouteSheetHostSurfaceFrameAuthority } from '../navigation/runtime/app-route-sheet-host-surface-runtime-contract';
import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';
import type { SearchRouteSheetHostFrameSnapshot } from '../screens/Search/runtime/shared/search-route-sheet-host-frame-snapshot-contract';
import { OVERLAY_STACK_ZINDEX } from './overlaySheetStyles';
import { useSearchOverlayProfilerRender } from './SearchOverlayProfilerContext';
import {
  finishSearchNavSwitchRuntimeAttributionSpan,
  startSearchNavSwitchRuntimeAttributionSpan,
} from '../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import { useSearchNavSwitchCommitAttribution } from '../screens/Search/runtime/shared/use-search-nav-switch-commit-attribution';

const selectHasSheetClipStyle = (
  snapshot: SearchRouteSheetHostFrameSnapshot
): boolean => snapshot.sheetClipStyle != null;

export const SearchRouteSheetFrameHost = React.memo(
  ({
    routeSheetSurfaceFrameAuthority,
    children,
  }: {
    routeSheetSurfaceFrameAuthority: AppRouteSheetHostSurfaceFrameAuthority;
    children: React.ReactNode;
  }) => {
    useSearchNavSwitchCommitAttribution('SearchRouteSheetFrameHost');
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    const hasSheetClipStyle = useRouteAuthoritySelector({
      subscribe: React.useCallback(
        (listener: () => void) => routeSheetSurfaceFrameAuthority.subscribe(listener),
        [routeSheetSurfaceFrameAuthority]
      ),
      getSnapshot: routeSheetSurfaceFrameAuthority.getSnapshot,
      selector: selectHasSheetClipStyle,
      isEqual: Object.is,
      attributionOwner: 'SearchRouteSheetFrameHost',
      attributionOperation: 'frameStylePresenceSelector',
    });
    const sheetClipStyleRef =
      React.useRef<SearchRouteSheetHostFrameSnapshot['sheetClipStyle']>(null);
    if (sheetClipStyleRef.current == null && hasSheetClipStyle) {
      sheetClipStyleRef.current =
        routeSheetSurfaceFrameAuthority.getSnapshot().sheetClipStyle;
    }
    const frameHost = (
      <Reanimated.View
        pointerEvents="box-none"
        style={[styles.sheetClip, sheetClipStyleRef.current]}
      >
        {children}
      </Reanimated.View>
    );

    const profiledFrameHost = onProfilerRender ? (
      <React.Profiler id="SearchRouteSheetFrameHost" onRender={onProfilerRender}>
        {frameHost}
      </React.Profiler>
    ) : (
      frameHost
    );

    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'SearchRouteSheetFrameHost',
      operation: 'render',
      startedAtMs: renderStartedAtMs,
    });

    return profiledFrameHost;
  }
);

const styles = StyleSheet.create({
  sheetClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: OVERLAY_STACK_ZINDEX,
  },
});
