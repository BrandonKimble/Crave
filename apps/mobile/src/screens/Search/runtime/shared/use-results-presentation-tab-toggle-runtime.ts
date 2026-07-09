import React from 'react';

import type { ResultsInteractionModel } from './results-presentation-owner-contract';

type UseResultsPresentationTabToggleRuntimeArgs = {
  setActiveTab: (next: 'dishes' | 'restaurants') => void;
  setActiveTabPreference: (next: 'dishes' | 'restaurants') => void;
};

// S4c-1b: the pill tap is a PURE DESIRE WRITE (setActiveTab routes through the tuple
// writer). Presentation is derived: the reconciler's tab_switch branch rides the toggle
// coordinator (press-up fade + debounce) and presents the CURRENT desire at commit —
// identical choreography to chips, no lane-owned commit body here.
export const useResultsPresentationTabToggleRuntime = ({
  setActiveTab,
  setActiveTabPreference,
}: UseResultsPresentationTabToggleRuntimeArgs): ResultsInteractionModel => {
  const scheduleTabToggleCommit = React.useCallback(
    (next: 'dishes' | 'restaurants') => {
      setActiveTabPreference(next);
      setActiveTab(next);
    },
    [setActiveTab, setActiveTabPreference]
  );

  return React.useMemo(
    () => ({
      scheduleTabToggleCommit,
    }),
    [scheduleTabToggleCommit]
  );
};
