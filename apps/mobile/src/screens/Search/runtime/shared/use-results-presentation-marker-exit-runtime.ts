import React from 'react';

import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';

type ResultsPresentationMarkerExitRuntime = Pick<
  ResultsPresentationRuntimeOwner,
  'handleMarkerExitStarted' | 'handleMarkerExitSettled'
>;

export type UseResultsPresentationMarkerExitRuntimeArgs = {
  markSearchSheetCloseMapExitSettledRef: React.MutableRefObject<(requestKey: string) => void>;
  markExitStarted: (payload: { requestKey: string; startedAtMs: number }) => boolean;
  markExitSettled: (payload: { requestKey: string; settledAtMs: number }) => boolean;
};

export const useResultsPresentationMarkerExitRuntime = ({
  markSearchSheetCloseMapExitSettledRef,
  markExitStarted,
  markExitSettled,
}: UseResultsPresentationMarkerExitRuntimeArgs): ResultsPresentationMarkerExitRuntime => {
  const handleMarkerExitStarted = React.useCallback(
    (payload: { requestKey: string; startedAtMs: number }) => {
      markExitStarted(payload);
    },
    [markExitStarted]
  );

  const handleMarkerExitSettled = React.useCallback(
    (payload: { requestKey: string; settledAtMs: number }) => {
      if (!markExitSettled(payload)) {
        return;
      }
      markSearchSheetCloseMapExitSettledRef.current(payload.requestKey);
    },
    [markExitSettled, markSearchSheetCloseMapExitSettledRef]
  );

  return React.useMemo(
    () => ({
      handleMarkerExitStarted,
      handleMarkerExitSettled,
    }),
    [handleMarkerExitSettled, handleMarkerExitStarted]
  );
};
