import React from 'react';

import type { SearchMapRenderHostAuthority } from '../runtime/shared/search-root-host-authority-contract';
import type { SearchMapRenderHostLayerRuntime } from '../runtime/shared/search-map-render-host-layer-runtime-contract';
import { useRouteAuthoritySelector } from '../../../navigation/runtime/use-route-authority-selector';
import { SearchMapRenderHostLayers } from './SearchMapRenderHostLayers';

export const SearchMapRenderSurface = React.memo(
  ({
    mapRenderHostAuthority,
  }: {
    mapRenderHostAuthority: SearchMapRenderHostAuthority;
  }) => {
    const hostLayerRuntime = useRouteAuthoritySelector({
      subscribe: React.useCallback(
        (listener: () => void) => mapRenderHostAuthority.subscribe(listener),
        [mapRenderHostAuthority]
      ),
      getSnapshot: mapRenderHostAuthority.getSnapshot,
      selector: React.useCallback(
        (snapshot: SearchMapRenderHostLayerRuntime) => snapshot,
        []
      ),
      attributionOwner: 'SearchMapRenderSurface',
      attributionOperation: 'hostLayerRuntimeSelector',
    });

    return <SearchMapRenderHostLayers hostLayerRuntime={hostLayerRuntime} />;
  }
);
