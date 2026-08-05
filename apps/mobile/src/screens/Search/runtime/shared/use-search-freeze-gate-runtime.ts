import React from 'react';

import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchFreezeGateStateRuntime } from './use-search-freeze-gate-state-runtime';
import { useSearchResponseFrameFreezeRuntime } from './use-search-response-frame-freeze-runtime';
import type { SearchFreezeClassification } from './search-freeze-classification-runtime';

type UseSearchFreezeGateRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  resultsRequestKey: string | null;
};

/** F1735: the surface-redraw freeze flags and the stall-pressure runtime this gate used
 *  to host were part of the redraw-coordinator fossil (phase machine pinned at 'idle',
 *  every flag pinned false) and are deleted. */
type UseSearchFreezeGateRuntimeResult = {
  isResponseFrameFreezeActive: boolean;
  freezeClassification: SearchFreezeClassification;
};

export const useSearchFreezeGateRuntime = ({
  searchRuntimeBus,
  resultsRequestKey,
}: UseSearchFreezeGateRuntimeArgs): UseSearchFreezeGateRuntimeResult => {
  useSearchResponseFrameFreezeRuntime({
    searchRuntimeBus,
    resultsRequestKey,
  });

  const freezeGateState = useSearchFreezeGateStateRuntime(searchRuntimeBus);

  return React.useMemo<UseSearchFreezeGateRuntimeResult>(
    () => ({
      isResponseFrameFreezeActive: freezeGateState.isResponseFrameFreezeActive,
      freezeClassification: freezeGateState.freezeClassification,
    }),
    [freezeGateState]
  );
};
