import React from 'react';

import type {
  SearchBackdropTarget,
  SearchCloseTransitionState,
  SearchInputMode,
} from './results-presentation-shell-contract';

type UseResultsPresentationShellLocalStateArgs = {
  query: string;
  submittedQuery: string;
  hasActiveSearchContent: boolean;
  isSearchSessionActive: boolean;
  isSearchLoading: boolean;
  isSuggestionPanelActive: boolean;
};

export type ResultsPresentationShellLocalState = {
  backdropTarget: SearchBackdropTarget;
  inputMode: SearchInputMode;
  displayQueryOverride: string;
  searchCloseTransitionState: SearchCloseTransitionState;
  holdDockedLane: boolean;
  setBackdropTarget: React.Dispatch<React.SetStateAction<SearchBackdropTarget>>;
  setInputMode: React.Dispatch<React.SetStateAction<SearchInputMode>>;
  setDisplayQueryOverride: React.Dispatch<React.SetStateAction<string>>;
  setSearchCloseTransitionState: React.Dispatch<React.SetStateAction<SearchCloseTransitionState>>;
  setHoldDockedLane: React.Dispatch<React.SetStateAction<boolean>>;
};

export const useResultsPresentationShellLocalState = ({
  query,
  submittedQuery,
  hasActiveSearchContent,
  isSearchSessionActive,
  isSearchLoading,
  isSuggestionPanelActive,
}: UseResultsPresentationShellLocalStateArgs): ResultsPresentationShellLocalState => {
  const [backdropTarget, setBackdropTarget] = React.useState<SearchBackdropTarget>(
    hasActiveSearchContent ? 'results' : 'default'
  );
  const [inputMode, setInputMode] = React.useState<SearchInputMode>('idle');
  const [displayQueryOverride, setDisplayQueryOverride] = React.useState<string>('');
  const [searchCloseTransitionState, setSearchCloseTransitionState] =
    React.useState<SearchCloseTransitionState>(null);
  const [holdDockedLane, setHoldDockedLane] = React.useState(false);

  React.useEffect(() => {
    if (isSuggestionPanelActive && backdropTarget !== 'results' && inputMode !== 'editing') {
      setInputMode('editing');
    }
  }, [backdropTarget, inputMode, isSuggestionPanelActive]);

  React.useEffect(() => {
    if (searchCloseTransitionState) {
      return;
    }
    if (hasActiveSearchContent) {
      setBackdropTarget('results');
      return;
    }
    if (inputMode === 'idle') {
      setBackdropTarget('default');
      if (
        !isSearchSessionActive &&
        !isSearchLoading &&
        query.length === 0 &&
        submittedQuery.length === 0
      ) {
        setDisplayQueryOverride('');
      }
    }
  }, [
    hasActiveSearchContent,
    inputMode,
    isSearchLoading,
    isSearchSessionActive,
    query.length,
    searchCloseTransitionState,
    submittedQuery.length,
  ]);

  React.useEffect(() => {
    if (holdDockedLane && !hasActiveSearchContent) {
      setHoldDockedLane(false);
    }
  }, [hasActiveSearchContent, holdDockedLane]);

  return React.useMemo(
    () => ({
      backdropTarget,
      inputMode,
      displayQueryOverride,
      searchCloseTransitionState,
      holdDockedLane,
      setBackdropTarget,
      setInputMode,
      setDisplayQueryOverride,
      setSearchCloseTransitionState,
      setHoldDockedLane,
    }),
    [backdropTarget, displayQueryOverride, holdDockedLane, inputMode, searchCloseTransitionState]
  );
};
