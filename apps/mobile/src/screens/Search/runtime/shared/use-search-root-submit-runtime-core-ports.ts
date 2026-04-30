import React from 'react';
import { useSearchRootSubmitRuntimeBusPorts } from './use-search-root-submit-runtime-bus-ports';
import { useSearchRootSubmitRuntimeRequestPorts } from './use-search-root-submit-runtime-request-ports';

type SearchRootSubmitRuntimePorts = Parameters<
  typeof import('../../hooks/use-search-submit-owner').default
>[0]['runtimePorts'];

type SearchRootSubmitRuntimeCorePorts = Pick<
  SearchRootSubmitRuntimePorts,
  | 'runtimeWorkSchedulerRef'
  | 'searchRuntimeBus'
  | 'lastSearchRequestIdRef'
  | 'lastAutoOpenKeyRef'
  | 'requestRuntimeOwner'
>;

type UseSearchRootSubmitRuntimeCorePortsArgs = {
  runtimeWorkSchedulerRef: SearchRootSubmitRuntimePorts['runtimeWorkSchedulerRef'];
  searchRuntimeBus: SearchRootSubmitRuntimePorts['searchRuntimeBus'];
  lastSearchRequestIdRef: SearchRootSubmitRuntimePorts['lastSearchRequestIdRef'];
  lastAutoOpenKeyRef: SearchRootSubmitRuntimePorts['lastAutoOpenKeyRef'];
  requestRuntimeOwner: SearchRootSubmitRuntimePorts['requestRuntimeOwner'];
};

export const useSearchRootSubmitRuntimeCorePorts = ({
  runtimeWorkSchedulerRef,
  searchRuntimeBus,
  lastSearchRequestIdRef,
  lastAutoOpenKeyRef,
  requestRuntimeOwner,
}: UseSearchRootSubmitRuntimeCorePortsArgs): SearchRootSubmitRuntimeCorePorts => {
  const busRuntimePorts = useSearchRootSubmitRuntimeBusPorts({
    runtimeWorkSchedulerRef,
    searchRuntimeBus,
  });
  const requestRuntimePorts = useSearchRootSubmitRuntimeRequestPorts({
    lastSearchRequestIdRef,
    lastAutoOpenKeyRef,
    requestRuntimeOwner,
  });

  return React.useMemo(
    () => ({
      ...busRuntimePorts,
      ...requestRuntimePorts,
    }),
    [busRuntimePorts, requestRuntimePorts]
  );
};
