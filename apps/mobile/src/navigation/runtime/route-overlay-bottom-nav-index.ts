// PURE module (hermetic-jest safe — no reanimated import): the scene-key →
// bottom-nav tab index mapping. Home aliases to the search tab (the docked
// scene presents under the search root); polls owns its own tab (Job 3).
import type { OverlayKey } from '../../overlays/types';

export const resolveRouteOverlayBottomNavIndex = (
  overlayKey: OverlayKey | null | undefined
): number => {
  switch (overlayKey) {
    case 'polls':
      return 1;
    case 'lists':
      return 2;
    case 'profile':
      return 3;
    case 'search':
    case 'home':
    default:
      return 0;
  }
};
