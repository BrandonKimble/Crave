import React from 'react';

type SearchRootSubmitRuntimePorts = Parameters<
  typeof import('../../hooks/use-search-submit-owner').default
>[0]['runtimePorts'];

type SearchRootSubmitRuntimeRequestPorts = Pick<
  SearchRootSubmitRuntimePorts,
  'lastSearchRequestIdRef' | 'lastAutoOpenKeyRef'
>;

type UseSearchRootSubmitRuntimeRequestPortsArgs = {
  lastSearchRequestIdRef: SearchRootSubmitRuntimePorts['lastSearchRequestIdRef'];
  lastAutoOpenKeyRef: SearchRootSubmitRuntimePorts['lastAutoOpenKeyRef'];
};

export const useSearchRootSubmitRuntimeRequestPorts = ({
  lastSearchRequestIdRef,
  lastAutoOpenKeyRef,
}: UseSearchRootSubmitRuntimeRequestPortsArgs): SearchRootSubmitRuntimeRequestPorts =>
  React.useMemo(
    () => ({
      lastSearchRequestIdRef,
      lastAutoOpenKeyRef,
    }),
    [lastAutoOpenKeyRef, lastSearchRequestIdRef]
  );
