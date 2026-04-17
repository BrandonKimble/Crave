import type useSearchSubmitOwner from '../../hooks/use-search-submit-owner';
import type { SearchRootMapArgs } from './search-root-render-runtime-contract';
import { useSearchForegroundInteractionRuntime } from './use-search-foreground-interaction-runtime';

export type SearchRootInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type SearchRootEnvironment = {
  insets: SearchRootInsets;
  isSignedIn: boolean;
  accessToken: SearchRootMapArgs['accessToken'];
  startupLocationSnapshot: SearchRootMapArgs['userLocationSnapshot'];
  startupPollsSnapshot: Parameters<
    typeof import('./use-search-route-panel-publication-runtime').useSearchRoutePanelPublicationRuntime
  >[0]['startupPollsSnapshot'];
  userLocation: SearchRootMapArgs['userLocation'];
  userLocationRef: Parameters<typeof useSearchSubmitOwner>[0]['runtimePorts']['userLocationRef'];
  activeMainIntent: Parameters<typeof useSearchForegroundInteractionRuntime>[0]['activeMainIntent'];
  consumeActiveMainIntent: Parameters<
    typeof useSearchForegroundInteractionRuntime
  >[0]['consumeActiveMainIntent'];
  navigation: Parameters<typeof useSearchForegroundInteractionRuntime>[0]['navigation'];
  routeSearchIntent: Parameters<
    typeof useSearchForegroundInteractionRuntime
  >[0]['routeSearchIntent'];
};

export type SearchRootProfileEnvironment = Pick<
  SearchRootEnvironment,
  'insets' | 'isSignedIn' | 'userLocation' | 'userLocationRef'
>;

export type SearchRootRenderEnvironment = Pick<
  SearchRootEnvironment,
  'insets' | 'accessToken' | 'startupLocationSnapshot' | 'startupPollsSnapshot' | 'userLocation'
>;

export type SearchRootMapPresentationEnvironment = Pick<
  SearchRootRenderEnvironment,
  'accessToken' | 'startupLocationSnapshot' | 'userLocation'
>;

export type SearchRootOverlayPublicationEnvironment = Pick<
  SearchRootRenderEnvironment,
  'startupPollsSnapshot'
>;
