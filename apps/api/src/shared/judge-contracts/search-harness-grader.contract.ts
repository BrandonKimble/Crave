import { JudgeContract } from '../judge-contract';

/**
 * SEARCH LAUNCH-GATE GRADER — a SCRIPT-ONLY judge (scripts/search-harness/
 * run-launch-gate.ts) that grades harness search results against the
 * launch gate's expectations. It ran for weeks with no profile and no
 * contract, invisible to the lockdown scanner (red team 2026-09-04 G-5).
 * Declared here as what it is: an operator-run grader whose verdicts are
 * a report, never a corpus write.
 */
export const SEARCH_HARNESS_GRADER_CONTRACT: JudgeContract = {
  plainName: 'Search launch-gate grader',
  lane: 'search_harness_grader',
  site: 'scripts/search-harness/run-launch-gate.ts',
  promptKind: {
    unversioned: 'Inline prompt inside the script; the harness pins the cases.',
  },
  rule: { unversionedRule: 'Grading rubric lives in the script.' },
  claimKeySpec: 'None — every harness run grades fresh.',
  foldParticipation: { noClaimKey: 'per-run report, never re-asked' },
  reopenOn: {
    final: 'A harness verdict is a report about one run; nothing persists.',
    debt: false,
  },
  ledger: { unledgered: 'Report only; api_usage_ledger meters the spend.' },
  record: false,
  effectSeparation: true,
  responseSchema: { source: 'scripts/search-harness/run-launch-gate.ts' },
  reasonPolicy: { required: true },
  context: 'The harness query, its expectations, and the served results.',
  batching: 'interactive',
  spend: {
    caller: 'searchHarness.launchGateGrader',
    workClass: 'gemini.interactive_pipeline',
  },
  failure: { posture: 'fail_closed' }, // an ungraded run is a failed gate
  certSuite: {
    script: 'scripts/search-harness/run-launch-gate.ts',
    fixtures: 'scripts/search-harness/gold-corpus',
  },
};
