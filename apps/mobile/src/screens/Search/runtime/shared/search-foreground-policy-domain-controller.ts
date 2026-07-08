import { selectIsSearchSessionActive } from './search-desired-tuple-selectors';
import type {
  AppRouteSceneForegroundPolicyInputs,
  AppRouteSceneForegroundState,
} from '../../../../navigation/runtime/app-route-scene-policy-contract';
import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { SearchSuggestionPanelStateController } from './search-suggestion-panel-state-controller';

export type SearchForegroundPolicyDomainSnapshot = {
  foregroundState: AppRouteSceneForegroundState;
  foregroundPolicyInputs: AppRouteSceneForegroundPolicyInputs;
};

export type SearchForegroundPolicyDomainDiagnostics = SearchForegroundPolicyDomainSnapshot & {
  readyForPublication: boolean;
};

export type SearchForegroundPolicyDomainController = {
  getSnapshot: () => SearchForegroundPolicyDomainSnapshot;
  getForegroundPolicyInputs: () => AppRouteSceneForegroundPolicyInputs;
  readDiagnostics: () => SearchForegroundPolicyDomainDiagnostics;
};

export const createSearchForegroundPolicyDomainController = ({
  searchRuntimeBus,
  routeSceneVisibilityPolicyRuntime,
  suggestionPanelStateController,
}: {
  searchRuntimeBus: SearchRuntimeBus;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
  suggestionPanelStateController: SearchSuggestionPanelStateController;
}): SearchForegroundPolicyDomainController => {
  const getSnapshot: SearchForegroundPolicyDomainController['getSnapshot'] = () => {
    const runtimeState = searchRuntimeBus.getState();
    const transitionVisibility =
      routeSceneVisibilityPolicyRuntime.getSnapshot().transitionVisibility;
    const foregroundState: AppRouteSceneForegroundState = {
      inputMode: transitionVisibility.inputMode,
      isCloseTransitionActive: transitionVisibility.isCloseTransitionActive,
      isSuggestionPanelActive: suggestionPanelStateController.getSnapshot().isSuggestionPanelActive,
      isSearchSessionActive: selectIsSearchSessionActive(runtimeState),
      isSearchLoading: runtimeState.isSearchLoading,
    };

    return {
      foregroundState,
      foregroundPolicyInputs: {
        foregroundState,
      },
    };
  };

  return {
    getSnapshot,
    getForegroundPolicyInputs: () => getSnapshot().foregroundPolicyInputs,
    readDiagnostics: () => ({
      ...getSnapshot(),
      readyForPublication: true,
    }),
  };
};
