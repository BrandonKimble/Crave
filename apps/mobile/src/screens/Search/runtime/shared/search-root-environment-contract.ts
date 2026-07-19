import type { SearchMapWithMarkerEngineProps } from '../../components/SearchMapWithMarkerEngine';
import type useSearchSubmitOwner from '../../hooks/use-search-submit-owner';
import type {
  SearchForegroundLaunchIntentRuntimeArgs,
  SearchForegroundOverlayRuntimeArgs,
} from './use-search-foreground-interaction-runtime-contract';
import type { UseSearchRootSessionRuntimeArgs } from './use-search-root-session-runtime-contract';

export type SearchRootInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type SearchRootEnvironment = {
  insets: SearchRootInsets;
  isSignedIn: boolean;
  accessToken: string | null | undefined;
  startupLocationSnapshot: SearchMapWithMarkerEngineProps['userLocationSnapshot'];
  userLocation: SearchMapWithMarkerEngineProps['userLocation'];
  userLocationRef: Parameters<typeof useSearchSubmitOwner>[0]['runtimePorts']['userLocationRef'];
  activeMainIntent: SearchForegroundLaunchIntentRuntimeArgs['activeMainIntent'];
  consumeActiveMainIntent: SearchForegroundLaunchIntentRuntimeArgs['consumeActiveMainIntent'];
  navigation: SearchForegroundLaunchIntentRuntimeArgs['navigation'];
  routeSearchIntent: SearchForegroundOverlayRuntimeArgs['routeSearchIntent'];
};

export type SearchRootRenderEnvironment = Pick<
  SearchRootEnvironment,
  'insets' | 'accessToken' | 'startupLocationSnapshot' | 'userLocation'
>;

export type SearchRootMapPresentationEnvironment = Pick<
  SearchRootRenderEnvironment,
  'accessToken' | 'startupLocationSnapshot' | 'userLocation'
>;

export type SearchRootBootstrapEnvironment = {
  isSearchScreenFocused: boolean;
  startupPollBounds: UseSearchRootSessionRuntimeArgs['startupPollBounds'];
  startupCamera: UseSearchRootSessionRuntimeArgs['startupCamera'];
  markMainMapLoaded: UseSearchRootSessionRuntimeArgs['markMainMapLoaded'];
  markMainMapReady: UseSearchRootSessionRuntimeArgs['markMainMapReady'];
};
