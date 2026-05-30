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
import { logPerfScenarioStackAttribution } from '../perf/perf-scenario-attribution';

const areRouteOverlayGateSelectionsEqual = (
  left: Pick<SearchOverlayHostGateSnapshot, 'isFocused' | 'onProfilerRender'>,
  right: Pick<SearchOverlayHostGateSnapshot, 'isFocused' | 'onProfilerRender'>
): boolean => {
  if (left.isFocused === right.isFocused && left.onProfilerRender === right.onProfilerRender) {
    return true;
  }
  if (left.isFocused !== right.isFocused) {
    logPerfScenarioStackAttribution({
      owner: 'search_overlay_route_gate_selector_diff',
      path: 'field:isFocused',
    });
  }
  if (left.onProfilerRender !== right.onProfilerRender) {
    logPerfScenarioStackAttribution({
      owner: 'search_overlay_route_gate_selector_diff',
      path: 'field:onProfilerRender',
    });
  }
  return false;
};

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
      subscribeSelector: overlayGateHostAuthority.subscribeSelector,
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
    const profilerRenderRef = React.useRef(onProfilerRender);
    profilerRenderRef.current = onProfilerRender;
    const stableProfilerRender = React.useCallback<React.ProfilerOnRenderCallback>(
      (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
        profilerRenderRef.current?.(id, phase, actualDuration, baseDuration, startTime, commitTime);
      },
      []
    );
    const profilerContextValue = onProfilerRender ? stableProfilerRender : null;

    const routeOverlayGateHost = (
      <View
        pointerEvents={isFocused ? 'box-none' : 'none'}
        style={[styles.routeOverlayHostLayer, !isFocused && styles.routeOverlayHostHidden]}
      >
        <SearchOverlayProfilerProvider value={profilerContextValue}>
          {onProfilerRender ? (
            <React.Profiler id="SearchRouteOverlayHost" onRender={stableProfilerRender}>
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
  },
  (previousProps, nextProps) => {
    if (previousProps.overlayGateHostAuthority !== nextProps.overlayGateHostAuthority) {
      logPerfScenarioStackAttribution({
        owner: 'search_overlay_route_gate_host_props_diff',
        path: 'field:overlayGateHostAuthority',
      });
    }
    if (previousProps.children !== nextProps.children) {
      logPerfScenarioStackAttribution({
        owner: 'search_overlay_route_gate_host_props_diff',
        path: 'field:children',
      });
    }
    return (
      previousProps.overlayGateHostAuthority === nextProps.overlayGateHostAuthority &&
      previousProps.children === nextProps.children
    );
  }
);

const styles = StyleSheet.create({
  routeOverlayHostLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: OVERLAY_STACK_ZINDEX,
    elevation: OVERLAY_STACK_ZINDEX,
  },
  routeOverlayHostHidden: {
    opacity: 0,
  },
});
