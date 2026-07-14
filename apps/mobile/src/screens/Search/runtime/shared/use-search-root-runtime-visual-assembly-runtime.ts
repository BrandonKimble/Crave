import type { AppRouteSceneChromeMotionRuntime } from '../../../../navigation/runtime/app-route-scene-chrome-motion-runtime-contract';
import { useSearchRootRuntimeHostVisualRuntime } from './use-search-root-runtime-host-visual-runtime';
import { useSearchRootRuntimeSceneVisualRuntime } from './use-search-root-runtime-scene-visual-runtime';
import type { SearchForegroundVisualRuntime } from './use-search-foreground-visual-runtime';
import type { SearchRootSurfaceBundleVisualRuntime } from './search-root-visual-runtime-contract';

export const useSearchRootRuntimeVisualAssemblyRuntime = ({
  foregroundVisualRuntime,
  appRouteSceneChromeMotionRuntime,
  surfaceBundleVisualRuntime,
}: {
  foregroundVisualRuntime: SearchForegroundVisualRuntime;
  appRouteSceneChromeMotionRuntime: AppRouteSceneChromeMotionRuntime;
  surfaceBundleVisualRuntime: SearchRootSurfaceBundleVisualRuntime;
}) => ({
  hostVisualRuntime: useSearchRootRuntimeHostVisualRuntime({
    foregroundVisualRuntime,
    appRouteSceneChromeMotionRuntime,
    surfaceBundleVisualRuntime,
  }),
  sceneVisualRuntime: useSearchRootRuntimeSceneVisualRuntime({
    foregroundVisualRuntime,
  }),
});
