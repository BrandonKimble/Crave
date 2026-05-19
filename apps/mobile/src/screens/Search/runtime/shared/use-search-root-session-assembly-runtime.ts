import React from 'react';

import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import type { SearchRootSessionAssemblyRuntime } from './search-root-session-assembly-runtime-contract';
import type { UseSearchRootSessionRuntimeArgs } from './use-search-root-session-runtime-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchMapSourceFramePort } from '../map/search-map-source-frame-port';
import { useSearchRootSessionServicesFoundationRuntime } from './use-search-root-session-services-foundation-runtime';

type UseSearchRootSessionAssemblyRuntimeArgs = Pick<
  UseSearchRootSessionRuntimeArgs,
  'startupPollBounds' | 'searchMapNativeCameraExecutor'
> & {
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  searchMapSourceFramePort: SearchMapSourceFramePort;
};

export const useSearchRootSessionAssemblyRuntime = ({
  startupPollBounds,
  rootPrimitivesRuntime,
  searchMapNativeCameraExecutor,
  searchRuntimeBus,
  resultsPresentationAuthority,
  resultsPresentationSurfaceAuthority,
  searchMapSourceFramePort,
}: UseSearchRootSessionAssemblyRuntimeArgs): SearchRootSessionAssemblyRuntime => {
  const { interactionPrimitivesRuntime, sessionControlServices } =
    useSearchRootSessionServicesFoundationRuntime({
      startupPollBounds,
      rootPrimitivesRuntime,
      searchMapNativeCameraExecutor,
      searchRuntimeBus,
      resultsPresentationAuthority,
      resultsPresentationSurfaceAuthority,
      searchMapSourceFramePort,
    });

  return React.useMemo(
    () => ({
      interactionPrimitivesRuntime,
      sessionControlServices,
    }),
    [interactionPrimitivesRuntime, sessionControlServices]
  );
};
