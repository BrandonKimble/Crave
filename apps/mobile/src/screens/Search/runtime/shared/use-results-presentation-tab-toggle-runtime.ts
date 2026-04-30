import React from 'react';

import { createPreparedResultsEnterSnapshot } from './prepared-presentation-transaction';
import type { ResultsInteractionModel } from './results-presentation-owner-contract';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { useResultsPresentationToggleLifecycleRuntime } from './use-results-presentation-toggle-lifecycle-runtime';

type UseResultsPresentationTabToggleRuntimeArgs = {
  activeTab: 'dishes' | 'restaurants';
  setActiveTab: (next: 'dishes' | 'restaurants') => void;
  setActiveTabPreference: (next: 'dishes' | 'restaurants') => void;
  isSearchSessionActive: boolean;
  searchRuntimeBus: SearchRuntimeBus;
  toggleLifecycleRuntime: ReturnType<typeof useResultsPresentationToggleLifecycleRuntime>;
  resultsRuntimeOwner: Pick<
    ResultsPresentationRuntimeOwner,
    'clearStagedPreparedResultsSnapshot' | 'commitPreparedResultsSnapshot'
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
      if (activeTabRef.current === next) {
        searchRuntimeBus.publish({
          pendingTabSwitchTab: null,
        });
        setActiveTabPreference(next);
        return;
      }

      setActiveTab(next);
      searchRuntimeBus.publish({
        activeTab: next,
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

      toggleLifecycleRuntime.beginToggleInteraction(
        ({ intentId }) => {
          const shouldSwitchTab = activeTabRef.current !== next;
          if (shouldSwitchTab) {
            commitTabChange(next);
          } else {
            searchRuntimeBus.publish({
              pendingTabSwitchTab: null,
            });
          }

          const shouldAwaitVisualSync = shouldSwitchTab && isSearchSessionActiveRef.current;
          if (!shouldAwaitVisualSync) {
            return {
              awaitVisualSync: false,
            };
          }

          resultsRuntimeOwner.clearStagedPreparedResultsSnapshot();
          resultsRuntimeOwner.commitPreparedResultsSnapshot(
            createPreparedResultsEnterSnapshot(intentId, 'initial_search', 'interaction_loading')
          );

          return {
            awaitVisualSync: true,
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
