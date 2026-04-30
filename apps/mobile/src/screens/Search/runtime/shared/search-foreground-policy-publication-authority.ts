import {
  areAppRouteSceneForegroundPolicyInputsEqual,
  type AppRouteSceneForegroundPolicyInputs,
} from '../../../../navigation/runtime/app-route-scene-policy-contract';
import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import type { RouteShellSceneInputLane } from '../../../../navigation/runtime/app-route-scene-runtime';
import type { SearchForegroundPolicyDomainController } from './search-foreground-policy-domain-controller';
import type { SearchSuggestionPanelStateController } from './search-suggestion-panel-state-controller';

export type SearchForegroundPolicyPublicationReason =
  | 'suggestionPanelActive'
  | 'inputMode'
  | 'closeTransitionActive'
  | 'searchSessionActive'
  | 'searchLoading';

export type SearchForegroundPolicyPublicationAuthority = {
  publishCurrent: (reason: SearchForegroundPolicyPublicationReason) => boolean;
  suggestionPanelStateController: SearchSuggestionPanelStateController;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
};

export const createSearchForegroundPolicyPublicationAuthority = ({
  foregroundPolicyDomain,
  routeSceneInputLane,
  routeSceneVisibilityPolicyRuntime,
  suggestionPanelStateController,
}: {
  foregroundPolicyDomain: SearchForegroundPolicyDomainController;
  routeSceneInputLane: Pick<RouteShellSceneInputLane, 'publishRouteSceneForegroundPolicyInputs'>;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
  suggestionPanelStateController: SearchSuggestionPanelStateController;
}): SearchForegroundPolicyPublicationAuthority => {
  let lastPublishedForegroundPolicyInputs: AppRouteSceneForegroundPolicyInputs | null = null;

  const publishCurrent = (_reason: SearchForegroundPolicyPublicationReason): boolean => {
    const foregroundPolicyInputs = foregroundPolicyDomain.getForegroundPolicyInputs();
    if (
      lastPublishedForegroundPolicyInputs != null &&
      areAppRouteSceneForegroundPolicyInputsEqual(
        lastPublishedForegroundPolicyInputs,
        foregroundPolicyInputs
      )
    ) {
      return false;
    }

    lastPublishedForegroundPolicyInputs = foregroundPolicyInputs;
    routeSceneInputLane.publishRouteSceneForegroundPolicyInputs({
      sceneKey: 'search',
      foregroundPolicyInputs,
    });
    return true;
  };

  const suggestionPanelStateControllerFacade: SearchSuggestionPanelStateController = {
    getSnapshot: suggestionPanelStateController.getSnapshot,
    setIsSuggestionPanelActive(nextValue) {
      const nextSnapshot = suggestionPanelStateController.setIsSuggestionPanelActive(nextValue);
      if (nextSnapshot != null) {
        publishCurrent('suggestionPanelActive');
      }
      return nextSnapshot;
    },
    reset() {
      const nextSnapshot = suggestionPanelStateController.reset();
      if (nextSnapshot != null) {
        publishCurrent('suggestionPanelActive');
      }
      return nextSnapshot;
    },
  };

  const routeSceneVisibilityPolicyRuntimeFacade: RouteSceneVisibilityPolicyRuntime = {
    getSnapshot: routeSceneVisibilityPolicyRuntime.getSnapshot.bind(
      routeSceneVisibilityPolicyRuntime
    ),
    updateTransitionVisibility: routeSceneVisibilityPolicyRuntime.updateTransitionVisibility.bind(
      routeSceneVisibilityPolicyRuntime
    ),
    updateSheetPolicyVisibility: routeSceneVisibilityPolicyRuntime.updateSheetPolicyVisibility.bind(
      routeSceneVisibilityPolicyRuntime
    ),
    updateChromeSurfaceVisibility:
      routeSceneVisibilityPolicyRuntime.updateChromeSurfaceVisibility.bind(
        routeSceneVisibilityPolicyRuntime
      ),
    updateInputMode(inputMode) {
      const nextSnapshot = routeSceneVisibilityPolicyRuntime.updateInputMode(inputMode);
      publishCurrent('inputMode');
      return nextSnapshot;
    },
    updateCloseTransitionActive(isCloseTransitionActive) {
      const nextSnapshot =
        routeSceneVisibilityPolicyRuntime.updateCloseTransitionActive(isCloseTransitionActive);
      publishCurrent('closeTransitionActive');
      return nextSnapshot;
    },
    updateFromRouteScenePolicySnapshot:
      routeSceneVisibilityPolicyRuntime.updateFromRouteScenePolicySnapshot.bind(
        routeSceneVisibilityPolicyRuntime
      ),
    dispose: routeSceneVisibilityPolicyRuntime.dispose.bind(routeSceneVisibilityPolicyRuntime),
  };

  return {
    publishCurrent,
    suggestionPanelStateController: suggestionPanelStateControllerFacade,
    routeSceneVisibilityPolicyRuntime: routeSceneVisibilityPolicyRuntimeFacade,
  };
};
