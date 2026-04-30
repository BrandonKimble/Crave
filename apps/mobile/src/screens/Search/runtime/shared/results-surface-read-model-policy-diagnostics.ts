import { logger } from '../../../../utils/logger';
import type { ResultsListItem } from '../read-models/list-read-model-builder';
import type { ResultsSurfaceReadModelPolicyController } from './results-surface-read-model-policy-controller';
import type { ResultsSurfaceReadModelPolicySnapshot } from './results-surface-read-model-policy-contract';
import type {
  ResultsSurfacePolicyResults,
  ResultsSurfacePolicyRowCounts,
  ResultsSurfacePolicyTab,
} from './results-surface-policy-controller';

export type ResultsSurfaceReadModelPolicyActiveRowsSnapshot = {
  rowsByTab: {
    dishes: ResultsListItem[];
    restaurants: ResultsListItem[];
  };
};

export type ResultsSurfaceReadModelPolicyDiagnosticsReport = {
  status: 'ready';
  policySnapshot: ResultsSurfaceReadModelPolicySnapshot;
  activeRowCountByTab: ResultsSurfacePolicyRowCounts;
  rowCountByTabForSheetPolicy: ResultsSurfacePolicyRowCounts;
  mismatchedTabs: ResultsSurfacePolicyTab[];
  matchesActiveReadModelRows: boolean;
};

export type ResultsSurfaceReadModelPolicyDiagnosticsOptions = {
  activeRowsSnapshot: ResultsSurfaceReadModelPolicyActiveRowsSnapshot;
  activeTab: ResultsSurfacePolicyTab;
  controller: Pick<ResultsSurfaceReadModelPolicyController, 'readSnapshot'>;
  logResult?: boolean;
  results: ResultsSurfacePolicyResults;
  shouldRetainCommittedResults: boolean;
};

const isDevEnvironment = typeof __DEV__ !== 'undefined' && __DEV__;

const toRowCountByTab = ({
  rowsByTab,
}: ResultsSurfaceReadModelPolicyActiveRowsSnapshot): ResultsSurfacePolicyRowCounts => ({
  dishes: rowsByTab.dishes.length,
  restaurants: rowsByTab.restaurants.length,
});

const resolveMismatchedTabs = ({
  activeRowCountByTab,
  rowCountByTabForSheetPolicy,
}: {
  activeRowCountByTab: ResultsSurfacePolicyRowCounts;
  rowCountByTabForSheetPolicy: ResultsSurfacePolicyRowCounts;
}): ResultsSurfacePolicyTab[] => {
  const mismatchedTabs: ResultsSurfacePolicyTab[] = [];
  if (activeRowCountByTab.dishes !== rowCountByTabForSheetPolicy.dishes) {
    mismatchedTabs.push('dishes');
  }
  if (activeRowCountByTab.restaurants !== rowCountByTabForSheetPolicy.restaurants) {
    mismatchedTabs.push('restaurants');
  }
  return mismatchedTabs;
};

const buildDiagnosticsSummary = ({
  activeRowCountByTab,
  mismatchedTabs,
  policySnapshot,
  rowCountByTabForSheetPolicy,
}: ResultsSurfaceReadModelPolicyDiagnosticsReport) => ({
  activeTab: policySnapshot.activeTab,
  activeRowCountByTab,
  rowCountByTabForSheetPolicy,
  mismatchedTabs,
  matchesActiveReadModelRows: mismatchedTabs.length === 0,
});

export const readResultsSurfaceReadModelPolicyDiagnosticsManually = ({
  activeRowsSnapshot,
  activeTab,
  controller,
  logResult = true,
  results,
  shouldRetainCommittedResults,
}: ResultsSurfaceReadModelPolicyDiagnosticsOptions):
  | {
      status: 'disabled';
      reason: 'dev_only';
    }
  | ResultsSurfaceReadModelPolicyDiagnosticsReport => {
  if (!isDevEnvironment) {
    return {
      status: 'disabled',
      reason: 'dev_only',
    };
  }

  const policySnapshot = controller.readSnapshot({
    activeTab,
    results,
    shouldRetainCommittedResults,
  });
  const activeRowCountByTab = toRowCountByTab(activeRowsSnapshot);
  const { rowCountByTabForSheetPolicy } = policySnapshot;
  const mismatchedTabs = resolveMismatchedTabs({
    activeRowCountByTab,
    rowCountByTabForSheetPolicy,
  });
  const report: ResultsSurfaceReadModelPolicyDiagnosticsReport = {
    status: 'ready',
    policySnapshot,
    activeRowCountByTab,
    rowCountByTabForSheetPolicy,
    mismatchedTabs,
    matchesActiveReadModelRows: mismatchedTabs.length === 0,
  };

  if (logResult) {
    logger.info('[RESULTS-SURFACE-READ-MODEL-POLICY-DIAG] parity', buildDiagnosticsSummary(report));
  }

  return report;
};
