import React from 'react';
import { SearchMapRenderSurface } from './components/SearchMapRenderSurface';
import {
  SearchRuntimeBusContext,
  type SearchRuntimeBus,
} from './runtime/shared/search-runtime-bus';
import {
  ResultsPresentationAuthorityContext,
  type ResultsPresentationAuthority,
} from './runtime/shared/results-presentation-authority';
import {
  ResultsPresentationSurfaceAuthorityContext,
  type ResultsPresentationSurfaceAuthority,
} from './runtime/shared/results-presentation-surface-authority';
import {
  SearchMapSourceFramePortContext,
  type SearchMapSourceFramePort,
} from './runtime/map/search-map-source-frame-port';
import type { SearchMapRenderHostAuthority } from './runtime/shared/search-root-host-authority-contract';
import type { SearchRootRuntimeStageRuntime } from './runtime/shared/search-root-runtime-stage-contract';
import { useSearchRootRuntimeStageRuntime } from './runtime/shared/use-search-root-runtime-stage-runtime';
import { useSearchScreenAppEntryPlaneRuntime } from './runtime/shared/use-search-screen-app-entry-plane-runtime';

const SearchRootCompositionHost = React.memo(function SearchRootCompositionHost({
  searchRuntimeBus,
  resultsPresentationAuthority,
  resultsPresentationSurfaceAuthority,
  searchMapSourceFramePort,
  mapRenderHostAuthority,
  onProfilerRender,
}: {
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  searchMapSourceFramePort: SearchMapSourceFramePort;
  mapRenderHostAuthority: SearchMapRenderHostAuthority;
  onProfilerRender: SearchRootRuntimeStageRuntime['onProfilerRender'];
}) {
  const searchRootComposition = (
    <SearchRuntimeBusContext.Provider value={searchRuntimeBus}>
      <ResultsPresentationAuthorityContext.Provider value={resultsPresentationAuthority}>
        <ResultsPresentationSurfaceAuthorityContext.Provider
          value={resultsPresentationSurfaceAuthority}
        >
          <SearchMapSourceFramePortContext.Provider value={searchMapSourceFramePort}>
            <SearchMapRenderSurface mapRenderHostAuthority={mapRenderHostAuthority} />
          </SearchMapSourceFramePortContext.Provider>
        </ResultsPresentationSurfaceAuthorityContext.Provider>
      </ResultsPresentationAuthorityContext.Provider>
    </SearchRuntimeBusContext.Provider>
  );

  return onProfilerRender ? (
    <React.Profiler id="SearchRootComposition" onRender={onProfilerRender}>
      {searchRootComposition}
    </React.Profiler>
  ) : (
    searchRootComposition
  );
});

const SearchScreen: React.FC = () => {
  const appEntryPlaneRuntime = useSearchScreenAppEntryPlaneRuntime();
  const {
    searchRuntimeBus,
    resultsPresentationAuthority,
    resultsPresentationSurfaceAuthority,
    searchMapSourceFramePort,
    mapRenderHostAuthority,
    onProfilerRender,
  } = useSearchRootRuntimeStageRuntime({
    appEntryPlaneRuntime,
  });

  return (
    <SearchRootCompositionHost
      searchRuntimeBus={searchRuntimeBus}
      resultsPresentationAuthority={resultsPresentationAuthority}
      resultsPresentationSurfaceAuthority={resultsPresentationSurfaceAuthority}
      searchMapSourceFramePort={searchMapSourceFramePort}
      mapRenderHostAuthority={mapRenderHostAuthority}
      onProfilerRender={onProfilerRender}
    />
  );
};

export default SearchScreen;
