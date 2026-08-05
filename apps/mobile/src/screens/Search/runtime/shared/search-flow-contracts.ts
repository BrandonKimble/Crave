import { logger } from '../../../../utils/logger';

// R0 of the search-flow rebuild (plans/search-flow-plan.md §D6): LOUD CONTRACTS.
// The identity-key audit found 8 guards that silently no-op on key mismatches — the mechanism
// that made every D1a defect invisible until hand-instrumented. This helper makes a suspicious
// no-op a first-class, greppable event WITHOUT flooding: callers report only the suspicious
// sub-case (a non-null key mismatching a LIVE counterpart, partial identity, stuck staging),
// never the legitimate idle/superseded no-ops. Per-contract 1s throttle so a hot loop can't
// bury the log (a flooded contract log is the old silence with extra steps).
//
// F1046: this used to return immediately when `!__DEV__`, so a contract violation —
// including the "stuck staging forever" defect this file's own callers document —
// reached production silently. That was the exact "guards that silently no-op"
// disease this file was built to cure. Now every level routes through the house
// logger (apps/mobile/src/utils/logger.ts): `error` always records a Sentry
// breadcrumb (production-visible, no bridge write in release builds) and additionally
// prints to console in dev. Still throttled 1s/contract so a hot loop can't flood it —
// the throttle was always the answer to "prod noise", not the __DEV__ gate.

const lastReportAtMsByContract = new Map<string, number>();
const REPORT_THROTTLE_MS = 1000;

export const reportSearchFlowContractViolation = (
  contract: string,
  data: Record<string, unknown>
): void => {
  const nowMs = Date.now();
  const lastAtMs = lastReportAtMsByContract.get(contract);
  if (lastAtMs != null && nowMs - lastAtMs < REPORT_THROTTLE_MS) {
    return;
  }
  lastReportAtMsByContract.set(contract, nowMs);
  logger.error(`[CONTRACT] ${contract}`, data);
};
