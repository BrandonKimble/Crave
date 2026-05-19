import React from 'react';

import { logger } from '../../../../utils';
import {
  areResultsPresentationReadModelsEqual,
  type ResultsPresentationReadModel,
} from './results-presentation-runtime-contract';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import { shouldLogSearchNavSwitchDiagnosticLogs } from './search-nav-switch-perf-probe';
import type { SearchRuntimeBus } from './search-runtime-bus';

type UseSearchRootOverlayChromePresentationDiagnosticRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  shouldRenderResultsSheet: boolean;
};

export const useSearchRootOverlayChromePresentationDiagnosticRuntime = ({
  searchRuntimeBus,
  resultsPresentationAuthority,
  shouldRenderResultsSheet,
}: UseSearchRootOverlayChromePresentationDiagnosticRuntimeArgs) => {
  const resultsSheetDiagRef = React.useRef<{
    shouldRenderResultsSheet: boolean;
    searchSurfaceRedrawPhase: ReturnType<SearchRuntimeBus['getState']>['searchSurfaceRedrawPhase'];
    resultsPresentation: ResultsPresentationReadModel;
  } | null>(null);

  React.useEffect(() => {
    if (!shouldLogSearchNavSwitchDiagnosticLogs()) {
      resultsSheetDiagRef.current = null;
      return;
    }

    const logNextSnapshot = (): void => {
      const runtimeState = searchRuntimeBus.getState();
      const presentationSnapshot = resultsPresentationAuthority.getSnapshot();
      const nextSnapshot = {
        shouldRenderResultsSheet,
        searchSurfaceRedrawPhase: runtimeState.searchSurfaceRedrawPhase,
        resultsPresentation: presentationSnapshot.resultsPresentation,
      };
      const previousSnapshot = resultsSheetDiagRef.current;
      if (
        previousSnapshot &&
        previousSnapshot.shouldRenderResultsSheet === nextSnapshot.shouldRenderResultsSheet &&
        previousSnapshot.searchSurfaceRedrawPhase === nextSnapshot.searchSurfaceRedrawPhase &&
        areResultsPresentationReadModelsEqual(
          previousSnapshot.resultsPresentation,
          nextSnapshot.resultsPresentation
        )
      ) {
        return;
      }

      logger.debug('[RESULTS-SHEET-DIAG] screenState', nextSnapshot);
      resultsSheetDiagRef.current = nextSnapshot;
    };

    logNextSnapshot();
    const unsubscribeBus = searchRuntimeBus.subscribe(
      logNextSnapshot,
      ['searchSurfaceRedrawPhase'] as const,
      'overlay_chrome_presentation_diagnostic_runtime'
    );
    const unsubscribePresentation = resultsPresentationAuthority.subscribe(
      logNextSnapshot,
      ['resultsPresentation'] as const,
      'overlay_chrome_presentation_diagnostic_runtime'
    );
    return () => {
      unsubscribeBus();
      unsubscribePresentation();
    };
  }, [resultsPresentationAuthority, searchRuntimeBus, shouldRenderResultsSheet]);
};
