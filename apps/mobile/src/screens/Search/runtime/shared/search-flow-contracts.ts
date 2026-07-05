// R0 of the search-flow rebuild (plans/search-flow-plan.md §D6): LOUD CONTRACTS.
// The identity-key audit found 8 guards that silently no-op on key mismatches — the mechanism
// that made every D1a defect invisible until hand-instrumented. This helper makes a suspicious
// no-op a first-class, greppable event WITHOUT flooding: callers report only the suspicious
// sub-case (a non-null key mismatching a LIVE counterpart, partial identity, stuck staging),
// never the legitimate idle/superseded no-ops. Per-contract 1s throttle so a hot loop can't
// bury the log (a flooded contract log is the old silence with extra steps).
//
// Dev-only by design for now: R0 is diagnostic. When the R2 rebuild lands, violations of the
// rebuilt pipeline's contracts should graduate to perf-scenario contract events.

const lastReportAtMsByContract = new Map<string, number>();
const REPORT_THROTTLE_MS = 1000;

export const reportSearchFlowContractViolation = (
  contract: string,
  data: Record<string, unknown>
): void => {
  if (!__DEV__) {
    return;
  }
  const nowMs = Date.now();
  const lastAtMs = lastReportAtMsByContract.get(contract);
  if (lastAtMs != null && nowMs - lastAtMs < REPORT_THROTTLE_MS) {
    return;
  }
  lastReportAtMsByContract.set(contract, nowMs);
  // eslint-disable-next-line no-console
  console.warn(`[CONTRACT] ${contract}`, data);
};
