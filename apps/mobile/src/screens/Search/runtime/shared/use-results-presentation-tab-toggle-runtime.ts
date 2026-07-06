import React from 'react';

import { createSearchSurfaceResultsEnterTransaction } from './search-surface-results-transaction';
import type { ResultsInteractionModel } from './results-presentation-owner-contract';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { useResultsPresentationToggleLifecycleRuntime } from './use-results-presentation-toggle-lifecycle-runtime';
import { getSearchSurfaceRuntime } from '../surface/search-surface-runtime';

type UseResultsPresentationTabToggleRuntimeArgs = {
  activeTab: 'dishes' | 'restaurants';
  setActiveTab: (next: 'dishes' | 'restaurants') => void;
  setActiveTabPreference: (next: 'dishes' | 'restaurants') => void;
  isSearchSessionActive: boolean;
  searchRuntimeBus: SearchRuntimeBus;
  toggleLifecycleRuntime: ReturnType<typeof useResultsPresentationToggleLifecycleRuntime>;
  resultsRuntimeOwner: Pick<
    ResultsPresentationRuntimeOwner,
    'clearStagedSearchSurfaceResultsTransaction' | 'stageSearchSurfaceResultsTransaction'
  >;
};

export const useResultsPresentationTabToggleRuntime = ({
  activeTab,
  setActiveTab,
  setActiveTabPreference,
  isSearchSessionActive,
  searchRuntimeBus,
  toggleLifecycleRuntime,
  resultsRuntimeOwner,
}: UseResultsPresentationTabToggleRuntimeArgs): ResultsInteractionModel => {
  const activeTabRef = React.useRef(activeTab);
  const isSearchSessionActiveRef = React.useRef(isSearchSessionActive);

  activeTabRef.current = activeTab;
  isSearchSessionActiveRef.current = isSearchSessionActive;

  const commitTabChange = React.useCallback(
    (next: 'dishes' | 'restaurants') => {
      if (__DEV__) console.log(`[T1DBG] commitTabChange:start t=${performance.now().toFixed(1)}`);
      if (activeTabRef.current === next) {
        searchRuntimeBus.publish({
          pendingTabSwitchTab: null,
        });
        setActiveTabPreference(next);
        return;
      }

      // R1c: setActiveTab publishes activeTab to the bus itself (single writer) — no second
      // activeTab publish here.
      setActiveTab(next);
      searchRuntimeBus.publish({
        pendingTabSwitchTab: null,
      });
      setActiveTabPreference(next);
    },
    [searchRuntimeBus, setActiveTab, setActiveTabPreference]
  );

  const scheduleTabToggleCommit = React.useCallback(
    (next: 'dishes' | 'restaurants') => {
      if (!isSearchSessionActiveRef.current) {
        commitTabChange(next);
        return;
      }

      // The press-up map fade-out is now owned by the shared coordinator (beginToggleInteraction), so every
      // trigger — tab toggle, filter chips, dropdowns — fades identically. No per-trigger fade call here.
      toggleLifecycleRuntime.beginToggleInteraction(
        ({ intentId }) => {
          const shouldSwitchTab = activeTabRef.current !== next;
          // Always re-reveal when the session is active: the press-up fade-out already dimmed the markers, so
          // the settle MUST fade them back in even on a net-zero burst (rapid even-count taps landing back on
          // the start tab) — otherwise the markers would stay faded out. On a net-zero the redraw re-projects
          // the current tab's data (a cheap, rare re-reveal); on a real switch it swaps as before.
          const shouldAwaitVisualSync = isSearchSessionActiveRef.current;

          // The consequence (data swap + native redraw arm) runs SYNCHRONOUSLY and promptly:
          // it arms the redraw cover + the reveal gate, so deferring it (e.g. startTransition)
          // would delay the reveal by seconds when commits stack up. The debounce already runs
          // this once per burst in the quiet window after the user pauses, so there is no pill
          // animating to protect here.
          if (shouldSwitchTab) {
            commitTabChange(next);
          } else {
            searchRuntimeBus.publish({
              pendingTabSwitchTab: null,
            });
          }

          if (shouldAwaitVisualSync) {
            resultsRuntimeOwner.clearStagedSearchSurfaceResultsTransaction();
            getSearchSurfaceRuntime().beginRedrawTransaction({
              reason: 'toggle',
              transactionId: intentId,
              targetTab: next,
              coverState: 'interaction_loading',
            });
            resultsRuntimeOwner.stageSearchSurfaceResultsTransaction(
              createSearchSurfaceResultsEnterTransaction(
                intentId,
                'initial_search',
                'interaction_loading',
                null,
                'cache'
              )
            );
          }

          return {
            awaitVisualSync: shouldAwaitVisualSync,
          };
        },
        {
          kind: 'tab_switch',
        },
        {
          pendingTabSwitchTab: next,
        }
      );
    },
    [commitTabChange, resultsRuntimeOwner, searchRuntimeBus, toggleLifecycleRuntime]
  );

  return React.useMemo(
    () => ({
      scheduleTabToggleCommit,
      notifyToggleInteractionFrostReady: toggleLifecycleRuntime.notifyFrostReady,
    }),
    [scheduleTabToggleCommit, toggleLifecycleRuntime.notifyFrostReady]
  );
};
