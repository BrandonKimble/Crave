import {
  resolveResultsPresentationPanelState,
  type ResultsPresentationPanelState,
} from './results-presentation-panel-state-contract';
import type { ResultsPresentationReadModel } from './results-presentation-runtime-contract';
import {
  resolveSearchRecoveryFreezeClassification,
  type SearchFreezeClassification,
} from './search-freeze-classification-runtime';

export type ResultsPresentationFreezePolicyInputs = {
  isRunOneChromeFreezeActive: boolean;
  isRunOnePreflightFreezeActive: boolean;
  isRun1HandoffActive: boolean;
  isResponseFrameFreezeActive: boolean;
  isChromeDeferred: boolean;
  runOneCommitSpanPressureActive: boolean;
};

export type ResultsPresentationFreezePolicyFacts = {
  isRunOneChromeDeferred: boolean;
  freezeClassification: SearchFreezeClassification;
};

export const resolveResultsPresentationFreezePolicyFacts = ({
  isRunOneChromeFreezeActive,
  isRunOnePreflightFreezeActive,
  isRun1HandoffActive,
  isResponseFrameFreezeActive,
  isChromeDeferred,
  runOneCommitSpanPressureActive,
}: ResultsPresentationFreezePolicyInputs): ResultsPresentationFreezePolicyFacts => ({
  isRunOneChromeDeferred:
    isRunOneChromeFreezeActive || runOneCommitSpanPressureActive || isChromeDeferred,
  freezeClassification: resolveSearchRecoveryFreezeClassification({
    isRunOneChromeFreezeActive,
    isRunOnePreflightFreezeActive,
    isRun1HandoffActive,
    isResponseFrameFreezeActive,
    isChromeDeferred,
    runOneCommitSpanPressureActive,
  }),
});

export type ResultsPresentationPanelPolicyInputs = {
  renderPolicy: ResultsPresentationReadModel;
  allowsInteractionLoadingState: boolean;
  hasRenderableRows: boolean;
  hasResolvedResults: boolean;
  isSearchLoading: boolean;
  shouldUsePlaceholderRows: boolean;
  freezeClassification: SearchFreezeClassification;
};

export type ResultsPresentationPanelPolicyFacts = ResultsPresentationPanelState;

export const resolveResultsPresentationPanelPolicyFacts = (
  inputs: ResultsPresentationPanelPolicyInputs
): ResultsPresentationPanelPolicyFacts => resolveResultsPresentationPanelState(inputs);
