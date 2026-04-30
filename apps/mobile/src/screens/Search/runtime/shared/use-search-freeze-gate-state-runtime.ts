import {
  type ResultsPresentationReadModel,
  areResultsPresentationReadModelsEqual,
} from './results-presentation-runtime-contract';
import type { SearchFreezeClassification } from './search-freeze-classification-runtime';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';

type SearchFreezeGateState = {
  isRunOneChromeFreezeActive: boolean;
  isRunOnePreflightFreezeActive: boolean;
  isRun1HandoffActive: boolean;
  isResponseFrameFreezeActive: boolean;
  freezeClassification: SearchFreezeClassification;
};

type SearchFreezeGateRuntimeState = {
  runOneHandoffPhase: ReturnType<SearchRuntimeBus['getState']>['runOneHandoffPhase'];
  resultsPresentation: ResultsPresentationReadModel;
};

type SearchRunOneHandoffRuntimeState = {
  runOneHandoffOperationId: ReturnType<SearchRuntimeBus['getState']>['runOneHandoffOperationId'];
  runOneHandoffPhase: ReturnType<SearchRuntimeBus['getState']>['runOneHandoffPhase'];
};

export const useSearchFreezeGateStateRuntime = (searchRuntimeBus: SearchRuntimeBus) => {
  const freezeGateState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      isRunOneChromeFreezeActive: state.isRunOneChromeFreezeActive,
      isRunOnePreflightFreezeActive: state.isRunOnePreflightFreezeActive,
      isRun1HandoffActive: state.isRun1HandoffActive,
      isResponseFrameFreezeActive: state.isResponseFrameFreezeActive,
      freezeClassification: searchRuntimeBus.getPolicyFactsSnapshot().freezeClassification,
    }),
    (left, right) =>
      left.isRunOneChromeFreezeActive === right.isRunOneChromeFreezeActive &&
      left.isRunOnePreflightFreezeActive === right.isRunOnePreflightFreezeActive &&
      left.isRun1HandoffActive === right.isRun1HandoffActive &&
      left.isResponseFrameFreezeActive === right.isResponseFrameFreezeActive &&
      left.freezeClassification === right.freezeClassification,
    [
      'isRunOneChromeFreezeActive',
      'isRunOnePreflightFreezeActive',
      'isRun1HandoffActive',
      'isResponseFrameFreezeActive',
      'isChromeDeferred',
      'runOneCommitSpanPressureActive',
    ] as const
  );

  const runOneHandoffRuntimeState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      runOneHandoffOperationId: state.runOneHandoffOperationId,
      runOneHandoffPhase: state.runOneHandoffPhase,
    }),
    (left, right) =>
      left.runOneHandoffOperationId === right.runOneHandoffOperationId &&
      left.runOneHandoffPhase === right.runOneHandoffPhase,
    ['runOneHandoffOperationId', 'runOneHandoffPhase'] as const
  );

  const freezeGateRuntimeState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      runOneHandoffPhase: state.runOneHandoffPhase,
      resultsPresentation: state.resultsPresentation,
    }),
    (left, right) =>
      left.runOneHandoffPhase === right.runOneHandoffPhase &&
      areResultsPresentationReadModelsEqual(left.resultsPresentation, right.resultsPresentation),
    ['runOneHandoffPhase', 'resultsPresentation'] as const
  );

  return {
    freezeGateState,
    runOneHandoffRuntimeState,
    freezeGateRuntimeState,
  } satisfies {
    freezeGateState: SearchFreezeGateState;
    runOneHandoffRuntimeState: SearchRunOneHandoffRuntimeState;
    freezeGateRuntimeState: SearchFreezeGateRuntimeState;
  };
};
