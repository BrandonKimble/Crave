import React from 'react';

import { type SharedValue, useDerivedValue } from 'react-native-reanimated';

import type { OverlaySheetSnap } from '../../../overlays/types';

export type SearchBackdropTarget = 'default' | 'results';
export type SearchInputMode = 'idle' | 'editing';
export type SearchHeaderChromeMode = 'default' | 'editing' | 'results';
export type SearchSheetContentLane =
  | { kind: 'results_live' }
  | { kind: 'results_closing'; closeIntentId: string; targetSnap: 'collapsed' }
  | { kind: 'persistent_poll' };

type SearchCloseTransitionState = {
  closeIntentId: string;
  mapDismissSettled: boolean;
  sheetCollapsedSettled: boolean;
} | null;

export type SearchPresentationIntent =
  | { kind: 'close' }
  | {
      kind: 'shortcut_submit';
      query: string;
      targetTab: 'restaurants' | 'dishes';
      preserveSheetState?: boolean;
      transitionFromDockedPolls?: boolean;
    }
  | {
      kind: 'manual_submit' | 'autocomplete_submit' | 'recent_submit' | 'search_this_area';
      query: string;
      targetTab?: 'restaurants' | 'dishes';
      preserveSheetState?: boolean;
      transitionFromDockedPolls?: boolean;
    }
  | { kind: 'focus_editing' }
  | { kind: 'exit_editing' };

export type SearchHeaderVisualModel = {
  displayQuery: string;
  chromeMode: SearchHeaderChromeMode;
  leadingIconMode: 'search' | 'back' | 'none';
  trailingActionMode: 'hidden' | 'default_clear' | 'session_clear';
  editable: boolean;
  shortcutsVisibleTarget: boolean;
  shortcutsInteractive: boolean;
};

type MapPresentationTargetOptions = {
  target: SearchBackdropTarget;
  kind?: 'initial_search' | 'shortcut_rerun' | 'close_search';
  preserveSheetState?: boolean;
  requiresCoverage?: boolean;
};

type ArmSearchCloseRestoreOptions = {
  allowFallback?: boolean;
  searchRootRestoreSnap?: 'expanded' | 'middle' | 'collapsed';
};

type UseSearchPresentationControllerArgs = {
  query: string;
  submittedQuery: string;
  hasActiveSearchContent: boolean;
  isSearchSessionActive: boolean;
  isSearchLoading: boolean;
  isSuggestionPanelActive: boolean;
  shouldRenderSearchOverlay: boolean;
  shouldEnableShortcutInteractions: boolean;
  sheetY: SharedValue<number>;
  resultsSnapY: number;
  collapsedY: number;
  animateSheetTo: (snap: Exclude<OverlaySheetSnap, 'hidden'>, velocity?: number) => void;
  prepareShortcutSheetTransition?: () => boolean;
  requestMapPresentationTarget: (options: MapPresentationTargetOptions) => string;
  armSearchCloseRestore: (options?: ArmSearchCloseRestoreOptions) => boolean;
  commitSearchCloseRestore: () => boolean;
  cancelSearchCloseRestore: () => void;
  flushPendingSearchOriginRestore: () => boolean;
  requestDefaultPostSearchRestore: () => void;
  finalizeCloseSearch: (intentId: string) => void;
};

type UseSearchPresentationControllerResult = {
  backdropTarget: SearchBackdropTarget;
  inputMode: SearchInputMode;
  backgroundProgress: SharedValue<number>;
  defaultChromeProgress: SharedValue<number>;
  headerVisualModel: SearchHeaderVisualModel;
  searchSheetContentLane: SearchSheetContentLane;
  requestIntent: (intent: SearchPresentationIntent) => string | null;
  markMapTargetSettled: (requestKey: string) => void;
  markSheetSettled: (snap: OverlaySheetSnap) => void;
  cancelActiveClose: (closeIntentId?: string) => void;
};

const clamp01 = (value: number): number => {
  'worklet';
  return Math.max(0, Math.min(1, value));
};

export const useSearchPresentationController = ({
  query,
  submittedQuery,
  hasActiveSearchContent,
  isSearchSessionActive,
  isSearchLoading,
  isSuggestionPanelActive,
  shouldRenderSearchOverlay,
  shouldEnableShortcutInteractions,
  sheetY,
  resultsSnapY,
  collapsedY,
  animateSheetTo,
  prepareShortcutSheetTransition,
  requestMapPresentationTarget,
  armSearchCloseRestore,
  commitSearchCloseRestore,
  cancelSearchCloseRestore,
  flushPendingSearchOriginRestore,
  requestDefaultPostSearchRestore,
  finalizeCloseSearch,
}: UseSearchPresentationControllerArgs): UseSearchPresentationControllerResult => {
  const [backdropTarget, setBackdropTarget] = React.useState<SearchBackdropTarget>(
    hasActiveSearchContent ? 'results' : 'default'
  );
  const [inputMode, setInputMode] = React.useState<SearchInputMode>('idle');
  const [displayQueryOverride, setDisplayQueryOverride] = React.useState<string>('');
  const [searchSheetContentLane, setSearchSheetContentLane] =
    React.useState<SearchSheetContentLane>(
      hasActiveSearchContent ? { kind: 'results_live' } : { kind: 'persistent_poll' }
    );
  const [searchCloseTransitionState, setSearchCloseTransitionState] =
    React.useState<SearchCloseTransitionState>(null);
  const activeCloseIntentIdRef = React.useRef<string | null>(null);
  const hasArmedRestoreRef = React.useRef(false);
  const hasCommittedRestoreRef = React.useRef(false);
  const finalizedCloseIntentIdRef = React.useRef<string | null>(null);
  const holdPersistentPollLaneRef = React.useRef(false);

  const resetCloseTransition = React.useCallback(() => {
    activeCloseIntentIdRef.current = null;
    hasArmedRestoreRef.current = false;
    hasCommittedRestoreRef.current = false;
    finalizedCloseIntentIdRef.current = null;
    setSearchCloseTransitionState(null);
  }, []);

  const finalizeClose = React.useCallback(
    (closeIntentId: string) => {
      if (finalizedCloseIntentIdRef.current === closeIntentId) {
        return;
      }
      finalizedCloseIntentIdRef.current = closeIntentId;
      finalizeCloseSearch(closeIntentId);
      const restored = flushPendingSearchOriginRestore();
      if (!restored) {
        requestDefaultPostSearchRestore();
      }
      resetCloseTransition();
    },
    [
      finalizeCloseSearch,
      flushPendingSearchOriginRestore,
      requestDefaultPostSearchRestore,
      resetCloseTransition,
    ]
  );

  const beginClose = React.useCallback(
    (closeIntentId: string) => {
      if (activeCloseIntentIdRef.current === closeIntentId) {
        return;
      }
      activeCloseIntentIdRef.current = closeIntentId;
      finalizedCloseIntentIdRef.current = null;
      hasArmedRestoreRef.current = armSearchCloseRestore({
        allowFallback: true,
        searchRootRestoreSnap: 'collapsed',
      });
      hasCommittedRestoreRef.current = false;
      holdPersistentPollLaneRef.current = false;
      setSearchSheetContentLane({
        kind: 'results_closing',
        closeIntentId,
        targetSnap: 'collapsed',
      });
      setSearchCloseTransitionState({
        closeIntentId,
        mapDismissSettled: false,
        sheetCollapsedSettled: false,
      });
      animateSheetTo('collapsed');
    },
    [animateSheetTo, armSearchCloseRestore]
  );

  const markMapDismissSettled = React.useCallback(
    (closeIntentId: string) => {
      let nextState: SearchCloseTransitionState = null;
      setSearchCloseTransitionState((current) => {
        if (!current || current.closeIntentId !== closeIntentId || current.mapDismissSettled) {
          nextState = current;
          return current;
        }
        nextState = {
          ...current,
          mapDismissSettled: true,
        };
        return nextState;
      });
      if (nextState?.mapDismissSettled && nextState.sheetCollapsedSettled) {
        finalizeClose(closeIntentId);
      }
    },
    [finalizeClose]
  );

  const markSheetSettled = React.useCallback(
    (snap: OverlaySheetSnap) => {
      if (snap !== 'collapsed') {
        return;
      }
      const activeCloseIntentId = activeCloseIntentIdRef.current;
      if (!activeCloseIntentId) {
        return;
      }
      if (hasArmedRestoreRef.current && !hasCommittedRestoreRef.current) {
        hasCommittedRestoreRef.current = commitSearchCloseRestore();
      }
      holdPersistentPollLaneRef.current = true;
      setSearchSheetContentLane({ kind: 'persistent_poll' });
      let nextState: SearchCloseTransitionState = null;
      setSearchCloseTransitionState((current) => {
        if (
          !current ||
          current.closeIntentId !== activeCloseIntentId ||
          current.sheetCollapsedSettled
        ) {
          nextState = current;
          return current;
        }
        nextState = {
          ...current,
          sheetCollapsedSettled: true,
        };
        return nextState;
      });
      if (nextState?.mapDismissSettled && nextState.sheetCollapsedSettled) {
        finalizeClose(activeCloseIntentId);
      }
    },
    [commitSearchCloseRestore, finalizeClose]
  );

  const cancelClose = React.useCallback(
    (closeIntentId?: string) => {
      if (
        closeIntentId != null &&
        activeCloseIntentIdRef.current != null &&
        activeCloseIntentIdRef.current !== closeIntentId
      ) {
        return;
      }
      cancelSearchCloseRestore();
      resetCloseTransition();
      holdPersistentPollLaneRef.current = false;
      setSearchSheetContentLane(
        hasActiveSearchContent ? { kind: 'results_live' } : { kind: 'persistent_poll' }
      );
    },
    [cancelSearchCloseRestore, hasActiveSearchContent, resetCloseTransition]
  );

  const backgroundProgress = useDerivedValue(() => {
    const openY = Math.min(resultsSnapY, collapsedY - 1);
    const closedY = Math.max(collapsedY, openY + 1);
    const distance = Math.max(1, closedY - openY);
    return clamp01((closedY - sheetY.value) / distance);
  });

  const defaultChromeProgress = useDerivedValue(() => {
    if (inputMode === 'editing') {
      return 0;
    }
    return 1 - backgroundProgress.value;
  });

  React.useEffect(() => {
    if (isSuggestionPanelActive && inputMode !== 'editing') {
      setInputMode('editing');
    }
  }, [inputMode, isSuggestionPanelActive]);

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
    if (searchCloseTransitionState) {
      return;
    }
    if (holdPersistentPollLaneRef.current) {
      setSearchSheetContentLane({ kind: 'persistent_poll' });
      if (!hasActiveSearchContent) {
        holdPersistentPollLaneRef.current = false;
      }
      return;
    }
    setSearchSheetContentLane(
      hasActiveSearchContent ? { kind: 'results_live' } : { kind: 'persistent_poll' }
    );
  }, [hasActiveSearchContent, searchCloseTransitionState]);

  const requestIntent = React.useCallback(
    (intent: SearchPresentationIntent): string | null => {
      switch (intent.kind) {
        case 'focus_editing':
          setInputMode('editing');
          return null;
        case 'exit_editing':
          setInputMode('idle');
          return null;
        case 'close': {
          setInputMode('idle');
          setBackdropTarget('default');
          setDisplayQueryOverride('');
          const closeIntentId = requestMapPresentationTarget({
            target: 'default',
            kind: 'close_search',
          });
          beginClose(closeIntentId);
          return closeIntentId;
        }
        case 'shortcut_submit':
        case 'manual_submit':
        case 'autocomplete_submit':
        case 'recent_submit':
        case 'search_this_area': {
          cancelClose();
          setInputMode('idle');
          setBackdropTarget('results');
          setDisplayQueryOverride(intent.query);
          if (!intent.preserveSheetState) {
            if (intent.transitionFromDockedPolls) {
              prepareShortcutSheetTransition?.();
            }
            animateSheetTo('middle');
          }
          const revealKind =
            intent.kind === 'shortcut_submit' || intent.kind === 'search_this_area'
              ? 'shortcut_rerun'
              : 'initial_search';
          return requestMapPresentationTarget({
            target: 'results',
            kind: revealKind,
            preserveSheetState: intent.preserveSheetState,
            requiresCoverage:
              intent.kind === 'shortcut_submit' || intent.kind === 'search_this_area',
          });
        }
      }
    },
    [
      animateSheetTo,
      beginClose,
      cancelClose,
      prepareShortcutSheetTransition,
      requestMapPresentationTarget,
    ]
  );

  const resultsDisplayQuery =
    query.trim().length > 0
      ? query
      : submittedQuery.trim().length > 0
      ? submittedQuery
      : displayQueryOverride;

  const chromeMode: SearchHeaderChromeMode =
    inputMode === 'editing' ? 'editing' : backdropTarget === 'results' ? 'results' : 'default';

  const headerVisualModel = React.useMemo<SearchHeaderVisualModel>(() => {
    if (chromeMode === 'editing') {
      return {
        displayQuery: query,
        chromeMode,
        leadingIconMode: 'back',
        trailingActionMode: query.length > 0 ? 'default_clear' : 'hidden',
        editable: true,
        shortcutsVisibleTarget: false,
        shortcutsInteractive: shouldRenderSearchOverlay && shouldEnableShortcutInteractions,
      };
    }
    if (chromeMode === 'results') {
      return {
        displayQuery: resultsDisplayQuery,
        chromeMode,
        leadingIconMode: 'none',
        trailingActionMode: 'session_clear',
        editable: true,
        shortcutsVisibleTarget: false,
        shortcutsInteractive: false,
      };
    }
    return {
      displayQuery: '',
      chromeMode,
      leadingIconMode: 'search',
      trailingActionMode: 'hidden',
      editable: true,
      shortcutsVisibleTarget: shouldRenderSearchOverlay,
      shortcutsInteractive:
        shouldRenderSearchOverlay && shouldEnableShortcutInteractions && !isSuggestionPanelActive,
    };
  }, [
    chromeMode,
    isSuggestionPanelActive,
    query,
    resultsDisplayQuery,
    shouldEnableShortcutInteractions,
    shouldRenderSearchOverlay,
  ]);

  return {
    backdropTarget,
    inputMode,
    backgroundProgress,
    defaultChromeProgress,
    headerVisualModel,
    searchSheetContentLane,
    requestIntent,
    markMapTargetSettled: markMapDismissSettled,
    markSheetSettled,
    cancelActiveClose: cancelClose,
  };
};

export default useSearchPresentationController;
