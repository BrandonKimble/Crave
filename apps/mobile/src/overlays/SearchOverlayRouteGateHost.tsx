import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { SearchOverlayHostGateSnapshot } from '../screens/Search/runtime/shared/search-overlay-host-gate-snapshot-contract';
import type { SearchOverlayGateHostAuthority } from '../screens/Search/runtime/shared/search-root-host-authority-contract';
import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';
import { SearchOverlayProfilerProvider } from './SearchOverlayProfilerContext';
import { OVERLAY_STACK_ZINDEX } from './overlaySheetStyles';
import {
  finishSearchNavSwitchRuntimeAttributionSpan,
  startSearchNavSwitchRuntimeAttributionSpan,
} from '../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import { useSearchNavSwitchCommitAttribution } from '../screens/Search/runtime/shared/use-search-nav-switch-commit-attribution';

const areRouteOverlayGateSelectionsEqual = (
  left: Pick<SearchOverlayHostGateSnapshot, 'isFocused' | 'onProfilerRender'>,
  right: Pick<SearchOverlayHostGateSnapshot, 'isFocused' | 'onProfilerRender'>
): boolean =>
  left.isFocused === right.isFocused && left.onProfilerRender === right.onProfilerRender;

export const SearchOverlayRouteGateHost = React.memo(
  ({
    overlayGateHostAuthority,
    children,
  }: {
    overlayGateHostAuthority: SearchOverlayGateHostAuthority;
    children: React.ReactNode;
  }) => {
    useSearchNavSwitchCommitAttribution('SearchOverlayRouteGateHost');
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const routeOverlayGateRuntime = useRouteAuthoritySelector<
      SearchOverlayHostGateSnapshot,
      Pick<SearchOverlayHostGateSnapshot, 'isFocused' | 'onProfilerRender'>
    >({
      subscribe: React.useCallback(
        (listener: () => void) => overlayGateHostAuthority.subscribe(listener),
        [overlayGateHostAuthority]
      ),
      getSnapshot: overlayGateHostAuthority.getSnapshot,
      selector: React.useCallback(
        (snapshot: SearchOverlayHostGateSnapshot) => ({
          isFocused: snapshot.isFocused,
          onProfilerRender: snapshot.onProfilerRender,
        }),
        []
      ),
      isEqual: areRouteOverlayGateSelectionsEqual,
      attributionOwner: 'SearchOverlayRouteGateHost',
      attributionOperation: 'gateSelector',
    });
    const { isFocused, onProfilerRender } = routeOverlayGateRuntime;

    const routeOverlayGateHost = (
      <View
        pointerEvents={isFocused ? 'box-none' : 'none'}
        style={[styles.routeOverlayHostLayer, !isFocused && styles.routeOverlayHostHidden]}
      >
        <SearchOverlayProfilerProvider value={onProfilerRender}>
          {onProfilerRender ? (
            <React.Profiler id="SearchRouteOverlayHost" onRender={onProfilerRender}>
              {children}
            </React.Profiler>
          ) : (
            children
          )}
        </SearchOverlayProfilerProvider>
      </View>
    );

    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'SearchOverlayRouteGateHost',
      operation: 'render',
      startedAtMs: renderStartedAtMs,
    });

    return routeOverlayGateHost;
  }
);

const styles = StyleSheet.create({
  routeOverlayHostLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: OVERLAY_STACK_ZINDEX,
  },
  routeOverlayHostHidden: {
    opacity: 0,
  },
});
