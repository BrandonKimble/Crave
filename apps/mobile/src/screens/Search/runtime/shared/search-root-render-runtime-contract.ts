import type { SearchMapWithMarkerEngineProps } from '../../components/SearchMapWithMarkerEngine';

export type SearchRootMapArgs = Omit<
  SearchMapWithMarkerEngineProps,
  | 'styleURL'
  | 'mapZoom'
  | 'getQualityColorFromScore'
  | 'maxFullPins'
  | 'lodVisibleCandidateBuffer'
  | 'lodPinPromoteStableMsMoving'
  | 'lodPinDemoteStableMsMoving'
  | 'lodPinToggleStableMsIdle'
  | 'lodPinOffscreenToggleStableMsMoving'
  | 'disableMarkers'
> & {
  accessToken: string | null | undefined;
  mapZoom: number | null;
};

export type SearchRootMapRenderSurfaceModel = {
  searchMapProps: SearchMapWithMarkerEngineProps;
};

export type SearchRootRenderRuntime = {
  mapRenderSurfaceModel: SearchRootMapRenderSurfaceModel;
};
