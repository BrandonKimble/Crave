import React from 'react';
import { SearchMapRenderSurface } from './components/SearchMapRenderSurface';
import {
  SearchRuntimeBusContext,
  type SearchRuntimeBus,
} from './runtime/shared/search-runtime-bus';
import type { SearchMapRenderHostAuthority } from './runtime/shared/search-root-host-authority-contract';
import type { SearchRootRuntimeStageRuntime } from './runtime/shared/search-root-runtime-stage-contract';
import { useSearchRootRuntimeStageRuntime } from './runtime/shared/use-search-root-runtime-stage-runtime';
import { useSearchScreenAppEntryPlaneRuntime } from './runtime/shared/use-search-screen-app-entry-plane-runtime';

const SearchRootCompositionHost = React.memo(
  function SearchRootCompositionHost({
    searchRuntimeBus,
    mapRenderHostAuthority,
    onProfilerRender,
  }: {
    searchRuntimeBus: SearchRuntimeBus;
    mapRenderHostAuthority: SearchMapRenderHostAuthority;
    onProfilerRender: SearchRootRuntimeStageRuntime['onProfilerRender'];
  }) {
    const searchRootComposition = (
      <SearchRuntimeBusContext.Provider value={searchRuntimeBus}>
        <SearchMapRenderSurface mapRenderHostAuthority={mapRenderHostAuthority} />
      </SearchRuntimeBusContext.Provider>
    );

    return (
      <React.Profiler id="SearchRootComposition" onRender={onProfilerRender}>
        {searchRootComposition}
      </React.Profiler>
    );
  }
);

const SearchScreen: React.FC = () => {
  const appEntryPlaneRuntime = useSearchScreenAppEntryPlaneRuntime();
  const {
    searchRuntimeBus,
    mapRenderHostAuthority,
    onProfilerRender,
  } = useSearchRootRuntimeStageRuntime({
    appEntryPlaneRuntime,
  });

  return (
    <SearchRootCompositionHost
      searchRuntimeBus={searchRuntimeBus}
      mapRenderHostAuthority={mapRenderHostAuthority}
      onProfilerRender={onProfilerRender}
    />
  );
};

export default SearchScreen;
