// PURE module (hermetic-jest safe — no reanimated import): the scene-key →
// bottom-nav tab index mapping. Home aliases to the search tab (the docked
// scene presents under the search root); polls owns its own tab (Job 3).
// Derived from APP_ROOT_NAV_ITEMS' own order (F959c) instead of a hand-written
// switch that had to be kept in sync with it by convention — two dedicated
// specs used to exist purely to pin that a hand-copy agreed with the array;
// deriving the index makes disagreement unrepresentable.
import type { OverlayKey } from '../../overlays/types';
import { APP_ROOT_NAV_ITEMS } from './app-route-root-nav-items';

export const resolveRouteOverlayBottomNavIndex = (
  overlayKey: OverlayKey | null | undefined
): number => {
  // 'home' docks under the search root and has no nav-item entry of its own.
  const effectiveKey = overlayKey === 'home' ? 'search' : overlayKey;
  const index = APP_ROOT_NAV_ITEMS.findIndex((item) => item.key === effectiveKey);
  return index === -1 ? 0 : index;
};
