import React from 'react';

import { logger } from '../../../../utils';
import {
  areResultsPresentationReadModelsEqual,
  type ResultsPresentationReadModel,
} from './results-presentation-runtime-contract';
import { shouldLogSearchNavSwitchDiagnosticLogs } from './search-nav-switch-perf-probe';
import type { SearchRuntimeBusState } from './search-runtime-bus';

type UseSearchRootOverlayChromePresentationDiagnosticRuntimeArgs = {
  shouldRenderResultsSheet: boolean;
  runOneHandoffPhase: SearchRuntimeBusState['runOneHandoffPhase'];
  resultsPresentation: ResultsPresentationReadModel;
};

export const useSearchRootOverlayChromePresentationDiagnosticRuntime = ({
  shouldRenderResultsSheet,
  runOneHandoffPhase,
  resultsPresentation,
}: UseSearchRootOverlayChromePresentationDiagnosticRuntimeArgs) => {
  const resultsSheetDiagRef = React.useRef<{
    shouldRenderResultsSheet: boolean;
    runOneHandoffPhase: typeof runOneHandoffPhase;
    resultsPresentation: ResultsPresentationReadModel;
  } | null>(null);

  React.useEffect(() => {
    if (!shouldLogSearchNavSwitchDiagnosticLogs()) {
      resultsSheetDiagRef.current = null;
      return;
    }

    const nextSnapshot = {
      shouldRenderResultsSheet,
      runOneHandoffPhase,
      resultsPresentation,
    };
    const previousSnapshot = resultsSheetDiagRef.current;
    if (
      previousSnapshot &&
      previousSnapshot.shouldRenderResultsSheet === nextSnapshot.shouldRenderResultsSheet &&
      previousSnapshot.runOneHandoffPhase === nextSnapshot.runOneHandoffPhase &&
      areResultsPresentationReadModelsEqual(
        previousSnapshot.resultsPresentation,
        nextSnapshot.resultsPresentation
      )
    ) {
      return;
    }

    logger.debug('[RESULTS-SHEET-DIAG] screenState', nextSnapshot);
    resultsSheetDiagRef.current = nextSnapshot;
  }, [
    resultsPresentation,
    runOneHandoffPhase,
    shouldRenderResultsSheet,
  ]);
};
