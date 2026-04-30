import type { ResultsPresentationPanelPolicyInputs } from './results-presentation-policy-facts-resolver';
import { resolveSearchSheetContentLane } from './results-presentation-shell-visual-runtime';
import type {
  SearchCloseTransitionState,
  SearchSheetContentLane,
} from './results-presentation-shell-contract';
import type { SearchRuntimeBusPolicyFactsSnapshot } from './search-runtime-bus';

export type ResultsPresentationPolicyFactsShellInputs = {
  hasActiveSearchContent: boolean;
  closeTransitionState: SearchCloseTransitionState;
  holdPersistentPollLane: boolean;
};

export type ResultsPresentationPolicyFactsSnapshot = ResultsPresentationPolicyFactsShellInputs & {
  searchSheetContentLane: SearchSheetContentLane;
  sheetContentLaneKind: SearchSheetContentLane['kind'];
  policyFacts: SearchRuntimeBusPolicyFactsSnapshot;
  unresolvedPanelInputs: readonly [
    'allowsInteractionLoadingState',
    'hasRenderableRows',
    'hasResolvedResults',
    'isSearchLoading',
    'shouldUsePlaceholderRows'
  ];
};

export type ResultsPresentationPolicyFactsLaneChange = {
  hasActiveSearchContent: boolean;
  closeTransitionState: SearchCloseTransitionState;
  holdPersistentPollLane: boolean;
  searchSheetContentLane: SearchSheetContentLane;
};

export type ResultsPresentationPolicyFactsController = {
  getSnapshot: () => ResultsPresentationPolicyFactsSnapshot;
  updateShellFacts: (
    inputs: ResultsPresentationPolicyFactsShellInputs & {
      policyFacts: SearchRuntimeBusPolicyFactsSnapshot;
    }
  ) => ResultsPresentationPolicyFactsSnapshot;
  readPanelPolicyInputs: (inputs: {
    allowsInteractionLoadingState: boolean;
    hasRenderableRows: boolean;
    hasResolvedResults: boolean;
    isSearchLoading: boolean;
    shouldUsePlaceholderRows: boolean;
  }) => ResultsPresentationPanelPolicyInputs;
  reset: (policyFacts: SearchRuntimeBusPolicyFactsSnapshot) => void;
};

const UNRESOLVED_PANEL_INPUTS: ResultsPresentationPolicyFactsSnapshot['unresolvedPanelInputs'] = [
  'allowsInteractionLoadingState',
  'hasRenderableRows',
  'hasResolvedResults',
  'isSearchLoading',
  'shouldUsePlaceholderRows',
];

const createSnapshot = ({
  hasActiveSearchContent,
  closeTransitionState,
  holdPersistentPollLane,
  policyFacts,
}: ResultsPresentationPolicyFactsShellInputs & {
  policyFacts: SearchRuntimeBusPolicyFactsSnapshot;
}): ResultsPresentationPolicyFactsSnapshot => {
  const searchSheetContentLane = resolveSearchSheetContentLane({
    hasActiveSearchContent,
    closeTransitionState,
    holdPersistentPollLane,
  });

  return {
    hasActiveSearchContent,
    closeTransitionState,
    holdPersistentPollLane,
    searchSheetContentLane,
    sheetContentLaneKind: searchSheetContentLane.kind,
    policyFacts,
    unresolvedPanelInputs: UNRESOLVED_PANEL_INPUTS,
  };
};

const areShellInputsEqual = (
  current: ResultsPresentationPolicyFactsSnapshot,
  next: ResultsPresentationPolicyFactsShellInputs & {
    policyFacts: SearchRuntimeBusPolicyFactsSnapshot;
  }
): boolean =>
  current.hasActiveSearchContent === next.hasActiveSearchContent &&
  current.closeTransitionState === next.closeTransitionState &&
  current.holdPersistentPollLane === next.holdPersistentPollLane &&
  current.policyFacts === next.policyFacts;

export const createResultsPresentationPolicyFactsController = ({
  onSearchSheetContentLaneChanged,
  policyFacts,
}: {
  onSearchSheetContentLaneChanged?: (change: ResultsPresentationPolicyFactsLaneChange) => void;
  policyFacts: SearchRuntimeBusPolicyFactsSnapshot;
}): ResultsPresentationPolicyFactsController => {
  const initialInputs = {
    hasActiveSearchContent: false,
    closeTransitionState: null,
    holdPersistentPollLane: false,
    policyFacts,
  };
  let snapshot = createSnapshot(initialInputs);

  return {
    getSnapshot: () => snapshot,
    updateShellFacts(inputs) {
      if (!areShellInputsEqual(snapshot, inputs)) {
        snapshot = createSnapshot(inputs);
        onSearchSheetContentLaneChanged?.({
          hasActiveSearchContent: snapshot.hasActiveSearchContent,
          closeTransitionState: snapshot.closeTransitionState,
          holdPersistentPollLane: snapshot.holdPersistentPollLane,
          searchSheetContentLane: snapshot.searchSheetContentLane,
        });
      }
      return snapshot;
    },
    readPanelPolicyInputs({
      allowsInteractionLoadingState,
      hasRenderableRows: _hasRenderableRows,
      hasResolvedResults: _hasResolvedResults,
      isSearchLoading,
      shouldUsePlaceholderRows,
    }) {
      return {
        renderPolicy: snapshot.policyFacts.renderPolicy,
        allowsInteractionLoadingState,
        hasRenderableRows: _hasRenderableRows,
        hasResolvedResults: _hasResolvedResults,
        isSearchLoading,
        shouldUsePlaceholderRows,
        freezeClassification: snapshot.policyFacts.freezeClassification,
      };
    },
    reset(nextPolicyFacts) {
      snapshot = createSnapshot({
        ...initialInputs,
        policyFacts: nextPolicyFacts,
      });
    },
  };
};
