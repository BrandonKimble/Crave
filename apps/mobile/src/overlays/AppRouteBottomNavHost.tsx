import React from 'react';
import type { ProfilerOnRenderCallback } from 'react';

import type { OverlayKey } from '../navigation/runtime/app-overlay-route-types';
import type { AppRouteSceneDisplayTargetRegistry } from '../navigation/runtime/app-route-scene-display-target-registry';
import type { RouteSceneSwitchTransitionActions } from '../navigation/runtime/app-route-scene-switch-controller';
import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';
import SearchBottomNav from '../screens/Search/components/SearchBottomNav';
import { SEARCH_BOTTOM_NAV_ICON_RENDERERS } from '../screens/Search/components/search-bottom-nav-icons';
import type { SearchBottomNavVisualInputs } from '../screens/Search/runtime/shared/search-bottom-nav-visual-input-contract';
import type { SearchOverlayHostGateSnapshot } from '../screens/Search/runtime/shared/search-overlay-host-gate-snapshot-contract';
import type { SearchOverlayShellHostSnapshot } from '../screens/Search/runtime/shared/search-overlay-shell-host-snapshot-contract';
import type {
  SearchOverlayGateHostAuthority,
  SearchOverlayShellHostAuthority,
} from '../screens/Search/runtime/shared/search-root-host-authority-contract';

const SEARCH_BOTTOM_NAV_ITEMS = [
  { key: 'search', label: 'Search' },
  { key: 'bookmarks', label: 'Favorites' },
  { key: 'profile', label: 'Profile' },
] as const;

type AppRouteBottomNavShellSnapshot = {
  isFocused: boolean;
  bottomNavVisualInputs: SearchBottomNavVisualInputs;
};

type AppRouteBottomNavProfilerSnapshot = {
  onProfilerRender: ProfilerOnRenderCallback | null;
};

const areShellSnapshotsEqual = (
  left: AppRouteBottomNavShellSnapshot,
  right: AppRouteBottomNavShellSnapshot
): boolean =>
  left.isFocused === right.isFocused && left.bottomNavVisualInputs === right.bottomNavVisualInputs;

const areProfilerSnapshotsEqual = (
  left: AppRouteBottomNavProfilerSnapshot,
  right: AppRouteBottomNavProfilerSnapshot
): boolean => left.onProfilerRender === right.onProfilerRender;

export type AppRouteBottomNavHostProps = {
  overlayGateHostAuthority: SearchOverlayGateHostAuthority;
  overlayShellHostAuthority: SearchOverlayShellHostAuthority;
  routeSceneDisplayTargetRegistry: AppRouteSceneDisplayTargetRegistry;
  routeOverlayTransitionActions: RouteSceneSwitchTransitionActions;
};

export const AppRouteBottomNavHost = React.memo(function AppRouteBottomNavHost({
  overlayGateHostAuthority,
  overlayShellHostAuthority,
  routeSceneDisplayTargetRegistry,
  routeOverlayTransitionActions,
}: AppRouteBottomNavHostProps) {
  const { isFocused, bottomNavVisualInputs } = useRouteAuthoritySelector<
    SearchOverlayShellHostSnapshot,
    AppRouteBottomNavShellSnapshot
  >({
    subscribe: React.useCallback(
      (listener: () => void) => overlayShellHostAuthority.subscribe(listener),
      [overlayShellHostAuthority]
    ),
    getSnapshot: overlayShellHostAuthority.getSnapshot,
    selector: React.useCallback(
      (snapshot: SearchOverlayShellHostSnapshot) => ({
        isFocused: snapshot.isFocused,
        bottomNavVisualInputs: snapshot.bottomNavVisualInputs,
      }),
      []
    ),
    isEqual: areShellSnapshotsEqual,
  });
  const { onProfilerRender } = useRouteAuthoritySelector<
    SearchOverlayHostGateSnapshot,
    AppRouteBottomNavProfilerSnapshot
  >({
    subscribe: React.useCallback(
      (listener: () => void) => overlayGateHostAuthority.subscribe(listener),
      [overlayGateHostAuthority]
    ),
    getSnapshot: overlayGateHostAuthority.getSnapshot,
    selector: React.useCallback(
      (snapshot: SearchOverlayHostGateSnapshot) => ({
        onProfilerRender: snapshot.onProfilerRender,
      }),
      []
    ),
    isEqual: areProfilerSnapshotsEqual,
  });
  const handleOverlaySelect = React.useCallback(
    (targetSceneKey: OverlayKey) => {
      routeOverlayTransitionActions.requestOverlaySwitch({
        targetSceneKey,
      });
    },
    [routeOverlayTransitionActions]
  );
  const handleProfilePress = React.useCallback(() => {
    handleOverlaySelect('profile');
  }, [handleOverlaySelect]);

  if (!isFocused || !bottomNavVisualInputs) {
    return null;
  }

  const content = (
    <SearchBottomNav
      {...bottomNavVisualInputs}
      shouldDisableSearchBlur={false}
      navItems={SEARCH_BOTTOM_NAV_ITEMS}
      activeTabIndexValue={routeSceneDisplayTargetRegistry.activeTabIndexValue}
      navIconRenderers={SEARCH_BOTTOM_NAV_ICON_RENDERERS}
      handleProfilePress={handleProfilePress}
      handleOverlaySelect={handleOverlaySelect}
    />
  );

  return onProfilerRender ? (
    <React.Profiler id="BottomNav" onRender={onProfilerRender}>
      {content}
    </React.Profiler>
  ) : (
    content
  );
});
