import type {
  SearchCloseTransitionState,
  SearchHeaderChromeMode,
  SearchHeaderVisualModel,
  SearchSheetContentLane,
} from './results-presentation-shell-contract';

export const resolveSearchSheetContentLane = ({
  hasActiveSearchContent,
  closeTransitionState,
  holdPersistentPollLane,
}: {
  hasActiveSearchContent: boolean;
  closeTransitionState: SearchCloseTransitionState;
  holdPersistentPollLane: boolean;
}): SearchSheetContentLane => {
  if (closeTransitionState) {
    return {
      kind: 'results_closing',
      closeIntentId: closeTransitionState.closeIntentId,
      targetSnap: 'collapsed',
    };
  }
  if (holdPersistentPollLane) {
    return { kind: 'persistent_poll' };
  }
  return hasActiveSearchContent ? { kind: 'results_live' } : { kind: 'persistent_poll' };
};

export const resolveSearchHeaderVisualModel = ({
  chromeMode,
  query,
  resultsDisplayQuery,
  shouldRenderSearchOverlay,
  shouldEnableShortcutInteractions,
  isSuggestionPanelActive,
}: {
  chromeMode: SearchHeaderChromeMode;
  query: string;
  resultsDisplayQuery: string;
  shouldRenderSearchOverlay: boolean;
  shouldEnableShortcutInteractions: boolean;
  isSuggestionPanelActive: boolean;
}): SearchHeaderVisualModel => {
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
};
