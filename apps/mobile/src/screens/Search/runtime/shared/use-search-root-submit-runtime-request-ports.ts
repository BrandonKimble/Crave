import React from 'react';

type SearchRootSubmitRuntimePorts = Parameters<
  typeof import('../../hooks/use-search-submit-owner').default
>[0]['runtimePorts'];

type SearchRootSubmitRuntimeRequestPorts = Pick<
  SearchRootSubmitRuntimePorts,
  'lastSearchRequestIdRef' | 'lastAutoOpenKeyRef' | 'requestRuntimeOwner'
>;

type UseSearchRootSubmitRuntimeRequestPortsArgs = {
  lastSearchRequestIdRef: SearchRootSubmitRuntimePorts['lastSearchRequestIdRef'];
  lastAutoOpenKeyRef: SearchRootSubmitRuntimePorts['lastAutoOpenKeyRef'];
  requestRuntimeOwner: SearchRootSubmitRuntimePorts['requestRuntimeOwner'];
};

export const useSearchRootSubmitRuntimeRequestPorts = ({
  lastSearchRequestIdRef,
  lastAutoOpenKeyRef,
  requestRuntimeOwner,
}: UseSearchRootSubmitRuntimeRequestPortsArgs): SearchRootSubmitRuntimeRequestPorts =>
  React.useMemo(
    () => ({
      lastSearchRequestIdRef,
      lastAutoOpenKeyRef,
      requestRuntimeOwner,
    }),
    [lastAutoOpenKeyRef, lastSearchRequestIdRef, requestRuntimeOwner]
  );
