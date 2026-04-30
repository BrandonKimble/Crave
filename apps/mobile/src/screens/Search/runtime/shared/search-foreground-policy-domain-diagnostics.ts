import { logger } from '../../../../utils/logger';
import {
  areAppRouteSceneForegroundPolicyInputsEqual,
  type AppRouteSceneForegroundPolicyInputs,
} from '../../../../navigation/runtime/app-route-scene-policy-contract';

export type SearchForegroundPolicyDomainDiagnosticsReport = {
  status: 'ready';
  activeForegroundPolicyInputs: AppRouteSceneForegroundPolicyInputs;
  domainForegroundPolicyInputs: AppRouteSceneForegroundPolicyInputs;
  matchesActiveForegroundPolicy: boolean;
  mismatchedFields: Array<keyof AppRouteSceneForegroundPolicyInputs['foregroundState']>;
};

export type SearchForegroundPolicyDomainDiagnosticsOptions = {
  activeForegroundPolicyInputs: AppRouteSceneForegroundPolicyInputs;
  domainForegroundPolicyInputs: AppRouteSceneForegroundPolicyInputs;
  logResult?: boolean;
};

const isDevEnvironment = typeof __DEV__ !== 'undefined' && __DEV__;

const resolveMismatchedForegroundFields = ({
  activeForegroundPolicyInputs,
  domainForegroundPolicyInputs,
}: Pick<
  SearchForegroundPolicyDomainDiagnosticsOptions,
  'activeForegroundPolicyInputs' | 'domainForegroundPolicyInputs'
>): Array<keyof AppRouteSceneForegroundPolicyInputs['foregroundState']> => {
  const mismatchedFields: Array<keyof AppRouteSceneForegroundPolicyInputs['foregroundState']> = [];
  const activeState = activeForegroundPolicyInputs.foregroundState;
  const domainState = domainForegroundPolicyInputs.foregroundState;

  if (activeState.inputMode !== domainState.inputMode) {
    mismatchedFields.push('inputMode');
  }
  if (activeState.isCloseTransitionActive !== domainState.isCloseTransitionActive) {
    mismatchedFields.push('isCloseTransitionActive');
  }
  if (activeState.isSuggestionPanelActive !== domainState.isSuggestionPanelActive) {
    mismatchedFields.push('isSuggestionPanelActive');
  }
  if (activeState.isSearchSessionActive !== domainState.isSearchSessionActive) {
    mismatchedFields.push('isSearchSessionActive');
  }
  if (activeState.isSearchLoading !== domainState.isSearchLoading) {
    mismatchedFields.push('isSearchLoading');
  }

  return mismatchedFields;
};

const buildDiagnosticsSummary = ({
  mismatchedFields,
  matchesActiveForegroundPolicy,
}: SearchForegroundPolicyDomainDiagnosticsReport) => ({
  mismatchedFields,
  matchesActiveForegroundPolicy,
});

export const readSearchForegroundPolicyDomainDiagnosticsManually = ({
  activeForegroundPolicyInputs,
  domainForegroundPolicyInputs,
  logResult = true,
}: SearchForegroundPolicyDomainDiagnosticsOptions):
  | {
      status: 'disabled';
      reason: 'dev_only';
    }
  | SearchForegroundPolicyDomainDiagnosticsReport => {
  if (!isDevEnvironment) {
    return {
      status: 'disabled',
      reason: 'dev_only',
    };
  }

  const mismatchedFields = resolveMismatchedForegroundFields({
    activeForegroundPolicyInputs,
    domainForegroundPolicyInputs,
  });
  const report: SearchForegroundPolicyDomainDiagnosticsReport = {
    status: 'ready',
    activeForegroundPolicyInputs,
    domainForegroundPolicyInputs,
    mismatchedFields,
    matchesActiveForegroundPolicy: areAppRouteSceneForegroundPolicyInputsEqual(
      activeForegroundPolicyInputs,
      domainForegroundPolicyInputs
    ),
  };

  if (logResult) {
    logger.info('[SEARCH-FOREGROUND-POLICY-DOMAIN-DIAG] parity', buildDiagnosticsSummary(report));
  }

  return report;
};
