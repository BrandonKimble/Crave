import type { ResultsPresentationPanelPolicyInputs } from './results-presentation-policy-facts-resolver';
import { resolveSearchSheetContentLane } from './results-presentation-shell-visual-runtime';
import type {
  SearchCloseTransitionState,
  SearchSheetContentLane,
} from './results-presentation-shell-contract';
import type { ResultsPresentationAuthorityPolicyFactsSnapshot } from './results-presentation-authority';
import {
  EMPTY_SEARCH_SURFACE_VISUAL_POLICY,
  type SearchSurfaceVisualPolicySnapshot,
} from '../surface/search-surface-runtime';

export type ResultsPresentationPolicyFactsShellInputs = {
  hasActiveSearchContent: boolean;
  closeTransitionState: SearchCloseTransitionState;
  holdPersistentPollLane: boolean;
  surfaceVisualPolicy: SearchSurfaceVisualPolicySnapshot;
};

export type ResultsPresentationPolicyFactsSnapshot = ResultsPresentationPolicyFactsShellInputs & {
  searchSheetContentLane: SearchSheetContentLane;
  sheetContentLaneKind: SearchSheetContentLane['kind'];
  policyFacts: ResultsPresentationAuthorityPolicyFactsSnapshot;
  unresolvedPanelInputs: readonly [
    'allowsInteractionLoadingState',
    'hasRenderableRows',
    'hasResolvedResults',
    'isSearchLoading',
    'shouldUsePlaceholderRows',
  ];
};

export type ResultsPresentationPolicyFactsLaneChange = {
  hasActiveSearchContent: boolean;
  closeTransitionState: SearchCloseTransitionState;
  holdPersistentPollLane: boolean;
  surfaceVisualPolicy: SearchSurfaceVisualPolicySnapshot;
  searchSheetContentLane: SearchSheetContentLane;
};

export type ResultsPresentationPolicyFactsController = {
  getSnapshot: () => ResultsPresentationPolicyFactsSnapshot;
  updateShellFacts: (
    inputs: ResultsPresentationPolicyFactsShellInputs & {
      policyFacts: ResultsPresentationAuthorityPolicyFactsSnapshot;
    }
  ) => ResultsPresentationPolicyFactsSnapshot;
  consumeSearchSheetContentLaneChange: () => ResultsPresentationPolicyFactsLaneChange | null;
  readPanelPolicyInputs: (inputs: {
    allowsInteractionLoadingState: boolean;
    hasRenderableRows: boolean;
    hasResolvedResults: boolean;
    isSearchLoading: boolean;
    shouldUsePlaceholderRows: boolean;
  }) => ResultsPresentationPanelPolicyInputs;
  reset: (policyFacts: ResultsPresentationAuthorityPolicyFactsSnapshot) => void;
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
  surfaceVisualPolicy,
  policyFacts,
}: ResultsPresentationPolicyFactsShellInputs & {
  policyFacts: ResultsPresentationAuthorityPolicyFactsSnapshot;
}): ResultsPresentationPolicyFactsSnapshot => {
  const searchSheetContentLane = resolveSearchSheetContentLane({
    hasActiveSearchContent,
    surfaceVisualPolicy,
  });

  return {
    hasActiveSearchContent,
    closeTransitionState,
    holdPersistentPollLane,
    surfaceVisualPolicy,
    searchSheetContentLane,
    sheetContentLaneKind: searchSheetContentLane.kind,
    policyFacts,
    unresolvedPanelInputs: UNRESOLVED_PANEL_INPUTS,
  };
};

const areShellInputsEqual = (
  current: ResultsPresentationPolicyFactsSnapshot,
  next: ResultsPresentationPolicyFactsShellInputs & {
    policyFacts: ResultsPresentationAuthorityPolicyFactsSnapshot;
  }
): boolean =>
  current.hasActiveSearchContent === next.hasActiveSearchContent &&
  current.closeTransitionState === next.closeTransitionState &&
  current.holdPersistentPollLane === next.holdPersistentPollLane &&
  current.surfaceVisualPolicy === next.surfaceVisualPolicy &&
  current.policyFacts === next.policyFacts;

export const createResultsPresentationPolicyFactsController = ({
  policyFacts,
}: {
  policyFacts: ResultsPresentationAuthorityPolicyFactsSnapshot;
}): ResultsPresentationPolicyFactsController => {
  const initialInputs = {
    hasActiveSearchContent: false,
    closeTransitionState: null,
    holdPersistentPollLane: false,
    surfaceVisualPolicy: EMPTY_SEARCH_SURFACE_VISUAL_POLICY,
    policyFacts,
  };
  let snapshot = createSnapshot(initialInputs);
  let pendingSearchSheetContentLaneChange: ResultsPresentationPolicyFactsLaneChange | null = null;

  return {
    getSnapshot: () => snapshot,
    updateShellFacts(inputs) {
      if (!areShellInputsEqual(snapshot, inputs)) {
        snapshot = createSnapshot(inputs);
        pendingSearchSheetContentLaneChange = {
          hasActiveSearchContent: snapshot.hasActiveSearchContent,
          closeTransitionState: snapshot.closeTransitionState,
          holdPersistentPollLane: snapshot.holdPersistentPollLane,
          surfaceVisualPolicy: snapshot.surfaceVisualPolicy,
          searchSheetContentLane: snapshot.searchSheetContentLane,
        };
      }
      return snapshot;
    },
    consumeSearchSheetContentLaneChange() {
      const change = pendingSearchSheetContentLaneChange;
      pendingSearchSheetContentLaneChange = null;
      return change;
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
      pendingSearchSheetContentLaneChange = null;
    },
  };
};
