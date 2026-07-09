import React from 'react';

import type { SearchResultsPanelEnvironment } from './search-results-panel-environment-contract';
import type { SearchRootResultsPresentationStateControlLane } from './use-search-root-control-plane-runtime-contract';

export const useSearchRootOverlayForegroundVisualPresentationSourceRuntime = ({
  resultsPresentationStateControlLane,
  resultsPresentationOwner,
}: {
  resultsPresentationStateControlLane: SearchRootResultsPresentationStateControlLane;
  resultsPresentationOwner: SearchResultsPanelEnvironment['resultsPresentationOwner'];
}) =>
  React.useMemo<{
    shouldDimResultsSheet: boolean;
    inputMode: 'editing' | 'resting';
    searchSheetContentLaneKind: SearchResultsPanelEnvironment['resultsPresentationOwner']['shellModel']['searchSheetContentLane']['kind'];
    searchHeaderDefaultChromeProgress: SearchResultsPanelEnvironment['resultsPresentationOwner']['shellModel']['defaultChromeProgress'];
    headerShortcutsVisibleTarget: boolean;
    headerShortcutsInteractive: boolean;
    backdropTarget: 'suggestions' | 'results' | 'none';
  }>(
    () => ({
      shouldDimResultsSheet:
        resultsPresentationStateControlLane.presentationState.shouldDimResultsSheet,
      inputMode:
        resultsPresentationOwner.shellModel.inputMode === 'editing' ? 'editing' : 'resting',
      searchSheetContentLaneKind: resultsPresentationOwner.shellModel.searchSheetContentLane.kind,
      searchHeaderDefaultChromeProgress: resultsPresentationOwner.shellModel.defaultChromeProgress,
      headerShortcutsVisibleTarget:
        resultsPresentationOwner.shellModel.headerVisualModel.shortcutsVisibleTarget,
      headerShortcutsInteractive:
        resultsPresentationOwner.shellModel.headerVisualModel.shortcutsInteractive,
      backdropTarget:
        resultsPresentationOwner.shellModel.backdropTarget === 'default'
          ? 'none'
          : resultsPresentationOwner.shellModel.backdropTarget,
    }),
    [
      resultsPresentationOwner.shellModel.backdropTarget,
      resultsPresentationOwner.shellModel.defaultChromeProgress,
      resultsPresentationOwner.shellModel.headerVisualModel.shortcutsInteractive,
      resultsPresentationOwner.shellModel.headerVisualModel.shortcutsVisibleTarget,
      resultsPresentationOwner.shellModel.inputMode,
      resultsPresentationOwner.shellModel.searchSheetContentLane.kind,
      resultsPresentationStateControlLane.presentationState.shouldDimResultsSheet,
    ]
  );
