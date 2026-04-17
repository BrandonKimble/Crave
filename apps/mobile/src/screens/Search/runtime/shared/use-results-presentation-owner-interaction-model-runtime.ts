import React from 'react';

import { createPreparedResultsEnterSnapshot } from './prepared-presentation-transaction';
import type { ResultsInteractionModel } from './results-presentation-owner-contract';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';

type UseResultsPresentationOwnerInteractionModelRuntimeArgs = {
  activeTab: 'dishes' | 'restaurants';
  setActiveTab: (next: 'dishes' | 'restaurants') => void;
  setActiveTabPreference: (next: 'dishes' | 'restaurants') => void;
  isSearchSessionActive: boolean;
  searchRuntimeBus: SearchRuntimeBus;
  resultsRuntimeOwner: Pick<
    ResultsPresentationRuntimeOwner,
    | 'scheduleToggleCommit'
    | 'notifyFrostReady'
    | 'clearStagedPreparedResultsSnapshot'
    | 'commitPreparedResultsSnapshot'
  >;
};

export const useResultsPresentationOwnerInteractionModelRuntime = ({
  activeTab,
  setActiveTab,
  setActiveTabPreference,
  isSearchSessionActive,
  searchRuntimeBus,
  resultsRuntimeOwner,
}: UseResultsPresentationOwnerInteractionModelRuntimeArgs): ResultsInteractionModel => {
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

      searchRuntimeBus.publish({
        pendingTabSwitchTab: next,
      });

      resultsRuntimeOwner.scheduleToggleCommit(
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
        { kind: 'tab_switch' }
      );
    },
    [commitTabChange, resultsRuntimeOwner, searchRuntimeBus]
  );

  return React.useMemo(
    () => ({
      scheduleTabToggleCommit,
      notifyToggleInteractionFrostReady: resultsRuntimeOwner.notifyFrostReady,
    }),
    [resultsRuntimeOwner.notifyFrostReady, scheduleTabToggleCommit]
  );
};
