import { areResultsPresentationReadModelsEqual } from './results-presentation-runtime-contract';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';

export const useSearchRootOverlayChromeDiagnosticRuntime = ({
  searchRuntimeBus,
}: {
  searchRuntimeBus: SearchRootSessionCoreLane['searchRuntimeBus'];
}) =>
  useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      runOneHandoffPhase: state.runOneHandoffPhase,
      resultsPresentation: state.resultsPresentation,
    }),
    (left, right) =>
      left.runOneHandoffPhase === right.runOneHandoffPhase &&
      areResultsPresentationReadModelsEqual(
        left.resultsPresentation,
        right.resultsPresentation
      ),
    ['runOneHandoffPhase', 'resultsPresentation'] as const
  );
