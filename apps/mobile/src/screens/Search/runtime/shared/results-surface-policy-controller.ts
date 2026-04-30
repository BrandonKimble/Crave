import type { AppRouteSceneSheetPolicyInputs } from '../../../../navigation/runtime/app-route-scene-policy-contract';
import type {
  SearchCloseTransitionState,
  SearchSheetContentLane,
} from './results-presentation-shell-contract';
import type { ResultsPresentationReadModel } from './results-presentation-runtime-contract';
import type { ResultsPresentationPanelState } from './results-presentation-panel-state-contract';
import { resolveResultsPresentationPanelPolicyFacts } from './results-presentation-policy-facts-resolver';
import { resolveSearchSheetContentLane } from './results-presentation-shell-visual-runtime';
import type { SearchFreezeClassification } from './search-freeze-classification-runtime';
import type { SearchRuntimeBusState } from './search-runtime-bus';
import type { SearchResultsExactMatchProjection } from '../read-models/results-read-model-exact-match-state';
import { buildSafeResultsData } from '../read-models/list-read-model-builder';
import {
  createResultsSurfaceReadModelPolicySnapshot,
  type ResultsSurfaceReadModelPolicySnapshot,
} from './results-surface-read-model-policy-contract';
import {
  resolveCommittedRetainedResults,
  resolveSearchResultsRetainedReadModel,
  type SearchResultsRetainedReadModel,
} from './results-retained-read-model-controller';

export type ResultsSurfacePolicyTab = 'dishes' | 'restaurants';

export type ResultsSurfacePolicySafeRowCounts = Record<ResultsSurfacePolicyTab, number>;

export type ResultsSurfacePolicyRowCounts = Record<ResultsSurfacePolicyTab, number>;

// Full SearchResponse payload only. SearchSessionEventPayload envelopes must be unwrapped upstream.
export type ResultsSurfacePolicyResults = SearchRuntimeBusState['results'];

export type ResultsSurfacePolicyRetainedReadModel =
  SearchResultsRetainedReadModel<ResultsSurfacePolicyResults>;

export type ResultsSurfacePolicyPanelInputs = {
  renderPolicy: ResultsPresentationReadModel;
  allowsInteractionLoadingState: boolean;
  isSearchLoading: boolean;
  freezeClassification: SearchFreezeClassification;
  shouldUsePlaceholderRows: boolean;
};

export type ResultsSurfacePolicySnapshot = {
  searchSheetContentLane: SearchSheetContentLane;
  sheetContentLaneKind: SearchSheetContentLane['kind'];
  closeLaneState: SearchCloseTransitionState;
  holdPersistentPollLane: boolean;
  retainedResults: ResultsSurfacePolicyResults;
  retainedReadModel: ResultsSurfacePolicyRetainedReadModel;
  hasRetainedResults: boolean;
  activeTab: ResultsSurfacePolicyTab;
  safeRowCountByTab: ResultsSurfacePolicySafeRowCounts;
  rowCountByTab: ResultsSurfacePolicyRowCounts | null;
  activeTabSafeRowCount: number;
  activeTabRowCount: number;
  hasActiveTabSafeRows: boolean;
  hasActiveTabRenderableRows: boolean;
  hasResolvedResults: boolean;
  panelState: ResultsPresentationPanelState;
  shouldShowResultsSurface: boolean;
  shouldRenderResultsSheet: boolean;
  sheetPolicyInputs: AppRouteSceneSheetPolicyInputs;
};

export type ResultsSurfacePolicyController = {
  getSnapshot: () => ResultsSurfacePolicySnapshot;
  getSheetPolicyInputs: () => AppRouteSceneSheetPolicyInputs;
  readReadModelPolicyDiagnostics: (args: {
    exactMatchState: SearchResultsExactMatchProjection;
  }) => ResultsSurfaceReadModelPolicySnapshot;
  updateActiveSearchContent: (hasActiveSearchContent: boolean) => void;
  updateActiveTab: (activeTab: ResultsSurfacePolicyTab) => void;
  updateCloseLaneState: (closeLaneState: SearchCloseTransitionState) => void;
  updateHoldPersistentPollLane: (holdPersistentPollLane: boolean) => void;
  updateShellFacts: (facts: {
    hasActiveSearchContent: boolean;
    closeLaneState: SearchCloseTransitionState;
    holdPersistentPollLane: boolean;
  }) => void;
  updatePanelInputs: (panelInputs: ResultsSurfacePolicyPanelInputs) => void;
  updateReadModelFacts: (facts: {
    activeTab: ResultsSurfacePolicyTab;
    results: ResultsSurfacePolicyResults;
    rowCountByTab: ResultsSurfacePolicyRowCounts;
  }) => void;
  updateReadModelRowCountByTab: (rowCountByTab: ResultsSurfacePolicyRowCounts | null) => void;
  updateResults: (results: ResultsSurfacePolicyResults) => void;
  reset: () => void;
};

const EMPTY_SAFE_ROW_COUNTS: ResultsSurfacePolicySafeRowCounts = {
  dishes: 0,
  restaurants: 0,
};

const EMPTY_PANEL_INPUTS: ResultsSurfacePolicyPanelInputs = {
  renderPolicy: {
    surfaceMode: 'none',
    contentVisibility: 'hidden',
    isAwaitingEnterMount: false,
    isEntering: false,
    isClosing: false,
    isPending: false,
    isSettled: true,
  },
  allowsInteractionLoadingState: false,
  isSearchLoading: false,
  freezeClassification: 'none',
  shouldUsePlaceholderRows: false,
};

const resolveRetainedReadModel = (
  retainedResults: ResultsSurfacePolicyResults
): ResultsSurfacePolicyRetainedReadModel =>
  resolveSearchResultsRetainedReadModel({
    retainedResults,
    results: null,
    shouldRetainCommittedResults: true,
  });

const resolveSafeRowCounts = (
  retainedReadModel: ResultsSurfacePolicyRetainedReadModel
): ResultsSurfacePolicySafeRowCounts => ({
  dishes: buildSafeResultsData({
    activeTab: 'dishes',
    dishes: retainedReadModel.dishes,
    restaurants: retainedReadModel.restaurants,
  }).length,
  restaurants: buildSafeResultsData({
    activeTab: 'restaurants',
    dishes: retainedReadModel.dishes,
    restaurants: retainedReadModel.restaurants,
  }).length,
});

const createSnapshot = ({
  activeTab,
  closeLaneState,
  hasActiveSearchContent,
  holdPersistentPollLane,
  panelInputs,
  rowCountByTab,
  retainedResults,
}: {
  activeTab: ResultsSurfacePolicyTab;
  closeLaneState: SearchCloseTransitionState;
  hasActiveSearchContent: boolean;
  holdPersistentPollLane: boolean;
  panelInputs: ResultsSurfacePolicyPanelInputs;
  rowCountByTab: ResultsSurfacePolicyRowCounts | null;
  retainedResults: ResultsSurfacePolicyResults;
}): ResultsSurfacePolicySnapshot => {
  const searchSheetContentLane = resolveSearchSheetContentLane({
    hasActiveSearchContent,
    closeTransitionState: closeLaneState,
    holdPersistentPollLane,
  });
  const retainedReadModel = resolveRetainedReadModel(retainedResults);
  const safeRowCountByTab = resolveSafeRowCounts(retainedReadModel);
  const activeTabSafeRowCount = safeRowCountByTab[activeTab];
  const activeTabRowCount = (rowCountByTab ?? safeRowCountByTab)[activeTab];
  const hasResolvedResults = retainedResults != null;
  const panelState = resolveResultsPresentationPanelPolicyFacts({
    renderPolicy: panelInputs.renderPolicy,
    allowsInteractionLoadingState: panelInputs.allowsInteractionLoadingState,
    hasRenderableRows: activeTabRowCount > 0,
    hasResolvedResults,
    isSearchLoading: panelInputs.isSearchLoading,
    shouldUsePlaceholderRows: panelInputs.shouldUsePlaceholderRows,
    freezeClassification: panelInputs.freezeClassification,
  });
  const sheetPolicyInputs: AppRouteSceneSheetPolicyInputs = {
    sheetContentLaneKind: searchSheetContentLane.kind,
    shouldRenderResultsSheet: panelState.shouldShowResultsSurface,
  };

  return {
    searchSheetContentLane,
    sheetContentLaneKind: searchSheetContentLane.kind,
    closeLaneState,
    holdPersistentPollLane,
    retainedResults,
    retainedReadModel,
    hasRetainedResults: retainedResults != null,
    activeTab,
    safeRowCountByTab,
    rowCountByTab,
    activeTabSafeRowCount,
    activeTabRowCount,
    hasActiveTabSafeRows: activeTabSafeRowCount > 0,
    hasActiveTabRenderableRows: activeTabRowCount > 0,
    hasResolvedResults,
    panelState,
    shouldShowResultsSurface: panelState.shouldShowResultsSurface,
    shouldRenderResultsSheet: panelState.shouldShowResultsSurface,
    sheetPolicyInputs,
  };
};

export const createResultsSurfacePolicyController = (): ResultsSurfacePolicyController => {
  let activeTab: ResultsSurfacePolicyTab = 'dishes';
  let closeLaneState: SearchCloseTransitionState = null;
  let hasActiveSearchContent = false;
  let holdPersistentPollLane = false;
  let panelInputs: ResultsSurfacePolicyPanelInputs = EMPTY_PANEL_INPUTS;
  let rowCountByTab: ResultsSurfacePolicyRowCounts | null = null;
  let retainedResults: ResultsSurfacePolicyResults = null;
  let latestResults: ResultsSurfacePolicyResults = null;
  let snapshot = createSnapshot({
    activeTab,
    closeLaneState,
    hasActiveSearchContent,
    holdPersistentPollLane,
    panelInputs,
    rowCountByTab,
    retainedResults,
  });

  const recompute = (): void => {
    const nextLane = resolveSearchSheetContentLane({
      hasActiveSearchContent,
      closeTransitionState: closeLaneState,
      holdPersistentPollLane,
    });
    retainedResults = resolveCommittedRetainedResults({
      currentRetainedResults: retainedResults,
      results: latestResults,
      shouldRetainCommittedResults: nextLane.kind !== 'persistent_poll',
    });
    snapshot = createSnapshot({
      activeTab,
      closeLaneState,
      hasActiveSearchContent,
      holdPersistentPollLane,
      panelInputs,
      rowCountByTab,
      retainedResults,
    });
  };

  return {
    getSnapshot: () => snapshot,
    getSheetPolicyInputs: () => snapshot.sheetPolicyInputs,
    readReadModelPolicyDiagnostics({ exactMatchState }) {
      return createResultsSurfaceReadModelPolicySnapshot({
        activeTab: snapshot.activeTab,
        exactMatchState,
        retainedReadModel: snapshot.retainedReadModel,
      });
    },
    updateActiveSearchContent(nextHasActiveSearchContent) {
      hasActiveSearchContent = nextHasActiveSearchContent;
      recompute();
    },
    updateActiveTab(nextActiveTab) {
      activeTab = nextActiveTab;
      recompute();
    },
    updateCloseLaneState(nextCloseLaneState) {
      closeLaneState = nextCloseLaneState;
      recompute();
    },
    updateHoldPersistentPollLane(nextHoldPersistentPollLane) {
      holdPersistentPollLane = nextHoldPersistentPollLane;
      recompute();
    },
    updateShellFacts({
      hasActiveSearchContent: nextHasActiveSearchContent,
      closeLaneState: nextCloseLaneState,
      holdPersistentPollLane: nextHoldPersistentPollLane,
    }) {
      hasActiveSearchContent = nextHasActiveSearchContent;
      closeLaneState = nextCloseLaneState;
      holdPersistentPollLane = nextHoldPersistentPollLane;
      recompute();
    },
    updatePanelInputs(nextPanelInputs) {
      panelInputs = nextPanelInputs;
      recompute();
    },
    updateReadModelFacts({
      activeTab: nextActiveTab,
      results: nextResults,
      rowCountByTab: nextRowCountByTab,
    }) {
      activeTab = nextActiveTab;
      latestResults = nextResults;
      rowCountByTab = nextRowCountByTab;
      recompute();
    },
    updateReadModelRowCountByTab(nextRowCountByTab) {
      rowCountByTab = nextRowCountByTab;
      recompute();
    },
    updateResults(nextResults) {
      latestResults = nextResults;
      recompute();
    },
    reset() {
      activeTab = 'dishes';
      closeLaneState = null;
      hasActiveSearchContent = false;
      holdPersistentPollLane = false;
      panelInputs = EMPTY_PANEL_INPUTS;
      rowCountByTab = null;
      retainedResults = null;
      latestResults = null;
      snapshot = createSnapshot({
        activeTab,
        closeLaneState,
        hasActiveSearchContent,
        holdPersistentPollLane,
        panelInputs,
        rowCountByTab,
        retainedResults,
      });
    },
  };
};

export { EMPTY_SAFE_ROW_COUNTS as EMPTY_RESULTS_SURFACE_POLICY_SAFE_ROW_COUNTS };
