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
  isSearchSurfaceRedrawChromeFreezeActive: boolean;
  isSearchSurfaceRedrawPreflightFreezeActive: boolean;
  isSearchSurfaceRedrawActive: boolean;
  isResponseFrameFreezeActive: boolean;
  isChromeDeferred: boolean;
  searchSurfaceRedrawCommitSpanPressureActive: boolean;
};

export type ResultsPresentationFreezePolicyFacts = {
  isSearchSurfaceRedrawChromeDeferred: boolean;
  freezeClassification: SearchFreezeClassification;
};

export const resolveResultsPresentationFreezePolicyFacts = ({
  isSearchSurfaceRedrawChromeFreezeActive,
  isSearchSurfaceRedrawPreflightFreezeActive,
  isSearchSurfaceRedrawActive,
  isResponseFrameFreezeActive,
  isChromeDeferred,
  searchSurfaceRedrawCommitSpanPressureActive,
}: ResultsPresentationFreezePolicyInputs): ResultsPresentationFreezePolicyFacts => ({
  isSearchSurfaceRedrawChromeDeferred:
    isSearchSurfaceRedrawChromeFreezeActive || searchSurfaceRedrawCommitSpanPressureActive || isChromeDeferred,
  freezeClassification: resolveSearchRecoveryFreezeClassification({
    isSearchSurfaceRedrawChromeFreezeActive,
    isSearchSurfaceRedrawPreflightFreezeActive,
    isSearchSurfaceRedrawActive,
    isResponseFrameFreezeActive,
    isChromeDeferred,
    searchSurfaceRedrawCommitSpanPressureActive,
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
