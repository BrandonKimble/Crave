import React from 'react';

import type { SearchMapPresentationLifecyclePort } from './search-map-protocol-contract';

type UseSearchRootMapPresentationLifecycleRuntimeArgs = {
  presentationLifecycleHandlers: {
    handleExecutionBatchMountedHidden: SearchMapPresentationLifecyclePort['handleExecutionBatchMountedHidden'];
    handleMarkerEnterStarted: SearchMapPresentationLifecyclePort['handleMarkerEnterStarted'];
    handleMarkerEnterSettled: SearchMapPresentationLifecyclePort['handleMarkerEnterSettled'];
    handleMarkerExitStarted: SearchMapPresentationLifecyclePort['handleMarkerExitStarted'];
    handleMarkerExitSettled: SearchMapPresentationLifecyclePort['handleMarkerExitSettled'];
  };
};

export const useSearchRootMapPresentationLifecycleRuntime = ({
  presentationLifecycleHandlers,
}: UseSearchRootMapPresentationLifecycleRuntimeArgs): SearchMapPresentationLifecyclePort => {
  const presentationLifecycleHandlersRef = React.useRef({
    handleExecutionBatchMountedHidden:
      presentationLifecycleHandlers.handleExecutionBatchMountedHidden,
    handleMarkerEnterStarted:
      presentationLifecycleHandlers.handleMarkerEnterStarted,
    handleMarkerEnterSettled:
      presentationLifecycleHandlers.handleMarkerEnterSettled,
    handleMarkerExitStarted:
      presentationLifecycleHandlers.handleMarkerExitStarted,
    handleMarkerExitSettled:
      presentationLifecycleHandlers.handleMarkerExitSettled,
  });

  presentationLifecycleHandlersRef.current = {
    handleExecutionBatchMountedHidden:
      presentationLifecycleHandlers.handleExecutionBatchMountedHidden,
    handleMarkerEnterStarted:
      presentationLifecycleHandlers.handleMarkerEnterStarted,
    handleMarkerEnterSettled:
      presentationLifecycleHandlers.handleMarkerEnterSettled,
    handleMarkerExitStarted:
      presentationLifecycleHandlers.handleMarkerExitStarted,
    handleMarkerExitSettled:
      presentationLifecycleHandlers.handleMarkerExitSettled,
  };

  const presentationLifecyclePortRef =
    React.useRef<SearchMapPresentationLifecyclePort | null>(null);

  if (!presentationLifecyclePortRef.current) {
    presentationLifecyclePortRef.current = {
      handleExecutionBatchMountedHidden: (payload) => {
        presentationLifecycleHandlersRef.current.handleExecutionBatchMountedHidden(
          payload
        );
      },
      handleMarkerEnterStarted: (payload) => {
        presentationLifecycleHandlersRef.current.handleMarkerEnterStarted(
          payload
        );
      },
      handleMarkerEnterSettled: (payload) => {
        presentationLifecycleHandlersRef.current.handleMarkerEnterSettled(
          payload
        );
      },
      handleMarkerExitStarted: (payload) => {
        presentationLifecycleHandlersRef.current.handleMarkerExitStarted(
          payload
        );
      },
      handleMarkerExitSettled: (payload) => {
        presentationLifecycleHandlersRef.current.handleMarkerExitSettled(
          payload
        );
      },
    };
  }

  return presentationLifecyclePortRef.current;
};
