import React from 'react';
import { useSearchRootSubmitRuntimeBusPorts } from './use-search-root-submit-runtime-bus-ports';
import { useSearchRootSubmitRuntimeRequestPorts } from './use-search-root-submit-runtime-request-ports';

type SearchRootSubmitRuntimePorts = Parameters<
  typeof import('../../hooks/use-search-submit-owner').default
>[0]['runtimePorts'];

type SearchRootSubmitRuntimeCorePorts = Pick<
  SearchRootSubmitRuntimePorts,
  'runtimeWorkSchedulerRef' | 'searchRuntimeBus' | 'lastSearchRequestIdRef' | 'lastAutoOpenKeyRef'
>;

type UseSearchRootSubmitRuntimeCorePortsArgs = {
  runtimeWorkSchedulerRef: SearchRootSubmitRuntimePorts['runtimeWorkSchedulerRef'];
  searchRuntimeBus: SearchRootSubmitRuntimePorts['searchRuntimeBus'];
  lastSearchRequestIdRef: SearchRootSubmitRuntimePorts['lastSearchRequestIdRef'];
  lastAutoOpenKeyRef: SearchRootSubmitRuntimePorts['lastAutoOpenKeyRef'];
};

export const useSearchRootSubmitRuntimeCorePorts = ({
  runtimeWorkSchedulerRef,
  searchRuntimeBus,
  lastSearchRequestIdRef,
  lastAutoOpenKeyRef,
}: UseSearchRootSubmitRuntimeCorePortsArgs): SearchRootSubmitRuntimeCorePorts => {
  const busRuntimePorts = useSearchRootSubmitRuntimeBusPorts({
    runtimeWorkSchedulerRef,
    searchRuntimeBus,
  });
  const requestRuntimePorts = useSearchRootSubmitRuntimeRequestPorts({
    lastSearchRequestIdRef,
    lastAutoOpenKeyRef,
  });

  return React.useMemo(
    () => ({
      ...busRuntimePorts,
      ...requestRuntimePorts,
    }),
    [busRuntimePorts, requestRuntimePorts]
  );
};
