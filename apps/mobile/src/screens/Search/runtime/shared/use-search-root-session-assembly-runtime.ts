import React from 'react';

import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import type { SearchRootSessionAssemblyRuntime } from './search-root-session-assembly-runtime-contract';
import type { UseSearchRootSessionRuntimeArgs } from './use-search-root-session-runtime-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchRootSessionServicesFoundationRuntime } from './use-search-root-session-services-foundation-runtime';

type UseSearchRootSessionAssemblyRuntimeArgs = Pick<
  UseSearchRootSessionRuntimeArgs,
  'startupPollBounds' | 'searchMapNativeCameraExecutor'
> & {
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  searchRuntimeBus: SearchRuntimeBus;
};

export const useSearchRootSessionAssemblyRuntime = ({
  startupPollBounds,
  rootPrimitivesRuntime,
  searchMapNativeCameraExecutor,
  searchRuntimeBus,
}: UseSearchRootSessionAssemblyRuntimeArgs): SearchRootSessionAssemblyRuntime => {
  const { interactionPrimitivesRuntime, sessionControlServices } =
    useSearchRootSessionServicesFoundationRuntime({
      startupPollBounds,
      rootPrimitivesRuntime,
      searchMapNativeCameraExecutor,
      searchRuntimeBus,
    });

  return React.useMemo(
    () => ({
      interactionPrimitivesRuntime,
      sessionControlServices,
    }),
    [interactionPrimitivesRuntime, sessionControlServices]
  );
};
