import React from 'react';

import type { RouteShellSceneInputLane } from '../../../../navigation/runtime/app-route-scene-runtime';
import type { useSearchRouteSearchSceneModelOwner } from './use-search-route-search-scene-model-owner';

export const useSearchRouteSearchSceneRouteInputOwner = ({
  routeSceneInputLane,
  routeSearchSceneModel,
}: {
  routeSceneInputLane: RouteShellSceneInputLane;
  routeSearchSceneModel: ReturnType<typeof useSearchRouteSearchSceneModelOwner>;
}): void => {
  React.useEffect(() => {
    routeSceneInputLane.publishRouteSceneShell({
      sceneKey: 'search',
      shellSpec: routeSearchSceneModel.routeSearchSceneShellSpec,
    });
  }, [routeSceneInputLane, routeSearchSceneModel.routeSearchSceneShellSpec]);

  React.useEffect(() => {
    routeSceneInputLane.publishRouteSceneChrome({
      sceneKey: 'search',
      sceneChrome: routeSearchSceneModel.routeSearchSceneChromePublication,
    });
  }, [routeSceneInputLane, routeSearchSceneModel.routeSearchSceneChromePublication]);

  React.useEffect(() => {
    routeSceneInputLane.publishRouteSceneSheetPolicyInputs({
      sceneKey: 'search',
      sheetPolicyInputs: routeSearchSceneModel.routeSearchSceneSheetPolicyInputs,
    });
  }, [routeSceneInputLane, routeSearchSceneModel.routeSearchSceneSheetPolicyInputs]);

  React.useEffect(
    () => () => {
      routeSceneInputLane.clearRouteSceneInput('search');
    },
    [routeSceneInputLane]
  );
};
