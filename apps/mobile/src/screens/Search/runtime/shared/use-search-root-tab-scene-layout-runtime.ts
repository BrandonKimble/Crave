import { EMPTY_SEARCH_ROUTE_SCENE_LAYOUT_STATE } from '../../../../overlays/searchRouteSceneLayoutContract';
import type { SearchRouteSceneLayoutState } from '../../../../overlays/searchRouteSceneLayoutContract';
import type { RouteSceneLayoutSnapshot } from './route-scene-layout-snapshot-contract';
import { useRouteAuthoritySelector } from '../../../../navigation/runtime/use-route-authority-selector';
import type { RouteSceneLayoutAuthority } from './use-search-root-session-runtime-contract';

export type SearchRootTabSceneLayoutRuntime = {
  resolvedSceneLayout: SearchRouteSceneLayoutState;
  hasPublishedSceneLayout: boolean;
};

export const useSearchRootTabSceneLayoutRuntime = ({
  routeSceneLayoutAuthority,
}: {
  routeSceneLayoutAuthority: RouteSceneLayoutAuthority;
}): SearchRootTabSceneLayoutRuntime => {
  const sceneLayout = useRouteAuthoritySelector({
    subscribe: routeSceneLayoutAuthority.subscribe,
    getSnapshot: routeSceneLayoutAuthority.getSnapshot,
    selector: (snapshot: RouteSceneLayoutSnapshot) => snapshot.routeSceneLayout,
    attributionOwner: 'SearchRootTabSceneLayoutRuntime',
    attributionOperation: 'sceneLayoutSelector',
  });

  return {
    resolvedSceneLayout: sceneLayout ?? EMPTY_SEARCH_ROUTE_SCENE_LAYOUT_STATE,
    hasPublishedSceneLayout: sceneLayout != null,
  };
};
