import type { RefObject } from 'react';

import type { SearchMapMarkerEngineHandle } from '../../components/SearchMapWithMarkerEngine';

export type SearchMapRenderEngineSnapshot = {
  markerEngineRef: RefObject<SearchMapMarkerEngineHandle | null>;
};
