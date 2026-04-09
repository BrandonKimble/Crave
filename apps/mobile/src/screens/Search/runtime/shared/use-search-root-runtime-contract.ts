import type useSearchSubmitOwner from '../../hooks/use-search-submit-owner';
import { useSearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type {
  SearchRootMapArgs,
  SearchRootRenderRuntime,
} from './search-root-render-runtime-contract';
import { useSearchForegroundInteractionRuntime } from './use-search-foreground-interaction-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import {
  type SearchRootSessionRuntime,
  type UseSearchRootSessionRuntimeArgs,
} from './use-search-root-session-runtime-contract';
import type { SearchRootVisualRuntime } from './use-search-root-visual-runtime';

export type UseSearchRootRuntimeArgs = {
  insets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  isSignedIn: boolean;
  accessToken: SearchRootMapArgs['accessToken'];
  startupPollBounds: UseSearchRootSessionRuntimeArgs['startupPollBounds'];
  startupCamera: UseSearchRootSessionRuntimeArgs['startupCamera'];
  startupLocationSnapshot: SearchRootMapArgs['userLocationSnapshot'];
  startupPollsSnapshot: Parameters<
    typeof import('./use-search-route-panel-publication-runtime').useSearchRoutePanelPublicationRuntime
  >[0]['startupPollsSnapshot'];
  markMainMapReady: UseSearchRootSessionRuntimeArgs['markMainMapReady'];
  userLocation: SearchRootMapArgs['userLocation'];
  userLocationRef: Parameters<typeof useSearchSubmitOwner>[0]['runtimePorts']['userLocationRef'];
  ensureUserLocation: Parameters<
    typeof useSearchSubmitOwner
  >[0]['runtimePorts']['ensureUserLocation'];
  activeMainIntent: Parameters<typeof useSearchForegroundInteractionRuntime>[0]['activeMainIntent'];
  consumeActiveMainIntent: Parameters<
    typeof useSearchForegroundInteractionRuntime
  >[0]['consumeActiveMainIntent'];
  navigation: Parameters<typeof useSearchForegroundInteractionRuntime>[0]['navigation'];
  routeSearchIntent: Parameters<
    typeof useSearchForegroundInteractionRuntime
  >[0]['routeSearchIntent'];
};

export type SearchRootPresentationRuntime = SearchRootRenderRuntime &
  Pick<SearchRootVisualRuntime, 'statusBarFadeHeight'> & {
    shouldRenderSearchOverlay: boolean;
    handleProfilerRender: SearchRootScaffoldRuntime['instrumentationRuntime']['handleProfilerRender'];
  };

export type SearchRootRuntime = SearchRootPresentationRuntime & {
  searchRuntimeBus: SearchRootSessionRuntime['runtimeOwner']['searchRuntimeBus'];
  markerEngineRef: ReturnType<typeof useSearchRootPrimitivesRuntime>['mapState']['markerEngineRef'];
  isInitialCameraReady: SearchRootSessionRuntime['mapBootstrapRuntime']['isInitialCameraReady'];
};
