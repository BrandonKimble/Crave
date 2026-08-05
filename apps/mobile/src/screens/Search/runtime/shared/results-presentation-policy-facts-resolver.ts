import {
  resolveResultsPresentationPanelState,
  type ResultsPresentationPanelState,
} from './results-presentation-panel-state-contract';
import type { ResultsPresentationReadModel } from './results-presentation-runtime-contract';
import {
  resolveSearchRecoveryFreezeClassification,
  type SearchFreezeClassification,
} from './search-freeze-classification-runtime';

/** F1735: the surface-redraw coordinator was a structural fossil (the phase machine could
 *  never leave 'idle'), so every redraw-derived freeze input this resolver used to take
 *  (chrome/preflight freeze, active, chrome-deferred, commit-span pressure) was pinned
 *  false. The one live input is the response-frame freeze. */
export type ResultsPresentationFreezePolicyInputs = {
  isResponseFrameFreezeActive: boolean;
};

export type ResultsPresentationFreezePolicyFacts = {
  freezeClassification: SearchFreezeClassification;
};

export const resolveResultsPresentationFreezePolicyFacts = ({
  isResponseFrameFreezeActive,
}: ResultsPresentationFreezePolicyInputs): ResultsPresentationFreezePolicyFacts => ({
  freezeClassification: resolveSearchRecoveryFreezeClassification({
    isResponseFrameFreezeActive,
  }),
});

export type ResultsPresentationPanelPolicyInputs = {
  renderPolicy: ResultsPresentationReadModel;
  allowsInteractionLoadingState: boolean;
  hasRenderableRows: boolean;
  hasResolvedResults: boolean;
  hasResolutionFailure?: boolean;
  isSearchLoading: boolean;
  shouldUsePlaceholderRows: boolean;
  freezeClassification: SearchFreezeClassification;
};

export type ResultsPresentationPanelPolicyFacts = ResultsPresentationPanelState;

export const resolveResultsPresentationPanelPolicyFacts = (
  inputs: ResultsPresentationPanelPolicyInputs
): ResultsPresentationPanelPolicyFacts => resolveResultsPresentationPanelState(inputs);
