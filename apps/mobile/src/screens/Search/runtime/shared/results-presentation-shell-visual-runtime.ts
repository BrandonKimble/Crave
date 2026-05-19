import type {
  SearchHeaderChromeMode,
  SearchHeaderVisualModel,
  SearchSheetContentLane,
} from './results-presentation-shell-contract';
import type { SearchSurfaceVisualPolicySnapshot } from '../surface/search-surface-runtime';

export const resolveSearchSheetContentLane = ({
  surfaceVisualPolicy,
}: {
  hasActiveSearchContent: boolean;
  surfaceVisualPolicy: SearchSurfaceVisualPolicySnapshot;
}): SearchSheetContentLane => {
  if (surfaceVisualPolicy.phase === 'results_dismissing') {
    if (surfaceVisualPolicy.canReleasePersistentPolls) {
      return { kind: 'persistent_poll' };
    }
    return {
      kind: 'results_closing',
      closeIntentId: surfaceVisualPolicy.transactionId ?? 'search-results-close',
      targetSnap: 'collapsed',
    };
  }

  const searchSurfaceOwnsResultsPage =
    surfaceVisualPolicy.phase === 'results_redrawing' ||
    surfaceVisualPolicy.bottomBandOwner === 'results_header' ||
    surfaceVisualPolicy.sheetClipMode === 'animatedSearchTransition';

  if (searchSurfaceOwnsResultsPage) {
    return { kind: 'results_live' };
  }

  return { kind: 'persistent_poll' };
};

export const resolveSearchHeaderVisualModel = ({
  chromeMode,
  query,
  resultsDisplayQuery,
  shouldRenderSearchOverlay,
  shouldEnableShortcutInteractions,
  isSuggestionPanelActive,
  isCloseTransitionActive,
}: {
  chromeMode: SearchHeaderChromeMode;
  query: string;
  resultsDisplayQuery: string;
  shouldRenderSearchOverlay: boolean;
  shouldEnableShortcutInteractions: boolean;
  isSuggestionPanelActive: boolean;
  isCloseTransitionActive: boolean;
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
      shouldRenderSearchOverlay &&
      shouldEnableShortcutInteractions &&
      !isSuggestionPanelActive &&
      !isCloseTransitionActive,
  };
};
