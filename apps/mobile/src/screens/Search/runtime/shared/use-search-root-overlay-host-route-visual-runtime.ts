import type { AppRouteSceneChromeMotionRuntime } from '../../../../navigation/runtime/app-route-scene-chrome-motion-runtime-contract';
import type { AppRouteHostVisualRuntime } from '../../../../navigation/runtime/app-route-host-visual-runtime-contract';
import type {
  SearchRootCloseHandoffVisualRuntime,
} from './search-root-visual-runtime-contract';
import type { SearchForegroundVisualRuntime } from './use-search-foreground-visual-runtime';

export const useSearchRootOverlayHostRouteVisualRuntime = ({
  foregroundVisualRuntime,
  appRouteSceneChromeMotionRuntime,
  closeHandoffVisualRuntime,
}: {
  foregroundVisualRuntime: SearchForegroundVisualRuntime;
  appRouteSceneChromeMotionRuntime: AppRouteSceneChromeMotionRuntime;
  closeHandoffVisualRuntime: SearchRootCloseHandoffVisualRuntime;
}): AppRouteHostVisualRuntime => ({
  navBarHeight: foregroundVisualRuntime.navBarHeight,
  navBarTop: foregroundVisualRuntime.navBarTop,
  overlayHeaderActionProgress:
    appRouteSceneChromeMotionRuntime.overlayHeaderActionProgress,
  closeVisualHandoffProgress:
    closeHandoffVisualRuntime.closeVisualHandoffProgress,
  navBarCutoutProgress: foregroundVisualRuntime.navBarCutoutProgress,
  navBarCutoutIsHiding: foregroundVisualRuntime.navBarCutoutIsHiding,
});
