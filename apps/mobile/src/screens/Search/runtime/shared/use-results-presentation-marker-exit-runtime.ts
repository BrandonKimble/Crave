import React from 'react';

import type { ResultsPresentationRuntimeMachine } from './results-presentation-runtime-machine';

export const useResultsPresentationMarkerExitRuntime = ({
  runtimeMachineRef,
  markSearchSheetCloseMapExitSettledRef,
}: {
  runtimeMachineRef: React.MutableRefObject<ResultsPresentationRuntimeMachine | null>;
  markSearchSheetCloseMapExitSettledRef: React.MutableRefObject<(requestKey: string) => void>;
}) => {
  const handleMarkerExitStarted = React.useCallback(
    (payload: { requestKey: string; startedAtMs: number }) => {
      runtimeMachineRef.current!.markExitStarted(payload);
    },
    [runtimeMachineRef]
  );

  const handleMarkerExitSettled = React.useCallback(
    (payload: { requestKey: string; settledAtMs: number }) => {
      if (!runtimeMachineRef.current!.markExitSettled(payload)) {
        return;
      }
      markSearchSheetCloseMapExitSettledRef.current(payload.requestKey);
    },
    [markSearchSheetCloseMapExitSettledRef, runtimeMachineRef]
  );

  return {
    handleMarkerExitStarted,
    handleMarkerExitSettled,
  };
};
