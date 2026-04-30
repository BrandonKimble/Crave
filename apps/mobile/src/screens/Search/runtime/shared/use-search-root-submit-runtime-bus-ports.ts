import React from 'react';

type SearchRootSubmitRuntimePorts = Parameters<
  typeof import('../../hooks/use-search-submit-owner').default
>[0]['runtimePorts'];

type SearchRootSubmitRuntimeBusPorts = Pick<
  SearchRootSubmitRuntimePorts,
  'runtimeWorkSchedulerRef' | 'searchRuntimeBus'
>;

type UseSearchRootSubmitRuntimeBusPortsArgs = {
  runtimeWorkSchedulerRef: SearchRootSubmitRuntimePorts['runtimeWorkSchedulerRef'];
  searchRuntimeBus: SearchRootSubmitRuntimePorts['searchRuntimeBus'];
};

export const useSearchRootSubmitRuntimeBusPorts = ({
  runtimeWorkSchedulerRef,
  searchRuntimeBus,
}: UseSearchRootSubmitRuntimeBusPortsArgs): SearchRootSubmitRuntimeBusPorts =>
  React.useMemo(
    () => ({
      runtimeWorkSchedulerRef,
      searchRuntimeBus,
    }),
    [runtimeWorkSchedulerRef, searchRuntimeBus]
  );
