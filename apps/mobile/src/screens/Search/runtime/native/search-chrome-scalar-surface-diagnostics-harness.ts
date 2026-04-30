import { logger } from '../../../../utils/logger';
import type {
  SearchChromeScalarSurfaceDiagnosticsReadOptions,
  SearchChromeScalarSurfaceDiagnosticsReport,
  SearchChromeScalarSurfaceRuntime,
} from './search-chrome-scalar-surface-runtime';

export type SearchChromeScalarSurfaceDiagnosticsHarnessResult =
  | {
      status: 'disabled';
      reason: 'dev_only';
    }
  | {
      status: 'ready';
      report: SearchChromeScalarSurfaceDiagnosticsReport;
    };

export type SearchChromeScalarSurfaceDiagnosticsHarnessOptions =
  SearchChromeScalarSurfaceDiagnosticsReadOptions & {
    logResult?: boolean;
  };

const isDevEnvironment = typeof __DEV__ !== 'undefined' && __DEV__;

const buildDiagnosticsSummary = ({
  report,
}: {
  report: SearchChromeScalarSurfaceDiagnosticsReport;
}) => ({
  readyForActivation: report.readyForActivation,
  requiredControlIds: report.requiredControlIds,
  measuredControlIds: report.measuredControlIds,
  scalarControlIds: report.scalarControlIds,
  nativeRegionControlIds: report.nativeRegionControlIds,
  missingMeasuredControlIds: report.missingMeasuredControlIds,
  missingScalarControlIds: report.missingScalarControlIds,
  missingNativeRegionControlIds: report.missingNativeRegionControlIds,
});

export const readSearchChromeScalarSurfaceDiagnosticsManually = async (
  runtime: Pick<SearchChromeScalarSurfaceRuntime, 'readDiagnostics'>,
  {
    logResult = true,
    measureNativeFrames = false,
  }: SearchChromeScalarSurfaceDiagnosticsHarnessOptions = {}
): Promise<SearchChromeScalarSurfaceDiagnosticsHarnessResult> => {
  if (!isDevEnvironment) {
    return {
      status: 'disabled',
      reason: 'dev_only',
    };
  }

  const report = await runtime.readDiagnostics({
    measureNativeFrames,
  });

  if (logResult) {
    logger.info(
      '[SEARCH-CHROME-SCALAR-SURFACE-DIAG] readiness',
      buildDiagnosticsSummary({ report })
    );
  }

  return {
    status: 'ready',
    report,
  };
};
