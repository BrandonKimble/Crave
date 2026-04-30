import type { AppRouteSceneChromeMotionRuntime } from '../../../../navigation/runtime/app-route-scene-chrome-motion-runtime-contract';
import { useSearchRootRuntimeHostVisualRuntime } from './use-search-root-runtime-host-visual-runtime';
import { useSearchRootRuntimeSceneVisualRuntime } from './use-search-root-runtime-scene-visual-runtime';
import type { SearchForegroundVisualRuntime } from './use-search-foreground-visual-runtime';
import type { SearchRootCloseHandoffVisualRuntime } from './search-root-visual-runtime-contract';

export const useSearchRootRuntimeVisualAssemblyRuntime = ({
  foregroundVisualRuntime,
  appRouteSceneChromeMotionRuntime,
  closeHandoffVisualRuntime,
}: {
  foregroundVisualRuntime: SearchForegroundVisualRuntime;
  appRouteSceneChromeMotionRuntime: AppRouteSceneChromeMotionRuntime;
  closeHandoffVisualRuntime: SearchRootCloseHandoffVisualRuntime;
}) => ({
  hostVisualRuntime: useSearchRootRuntimeHostVisualRuntime({
    foregroundVisualRuntime,
    appRouteSceneChromeMotionRuntime,
    closeHandoffVisualRuntime,
  }),
  sceneVisualRuntime: useSearchRootRuntimeSceneVisualRuntime({
    foregroundVisualRuntime,
    appRouteSceneChromeMotionRuntime,
  }),
});
