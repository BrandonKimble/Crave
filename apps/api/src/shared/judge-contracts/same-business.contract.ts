import { JudgeContract } from '../judge-contract';

/**
 * SAME-BUSINESS COURT — "are these two restaurant records one operating
 * business, or two strangers on one ordering platform?" Hears exactly the
 * pairs the deterministic owned-domain test (brandClusterPurity) cannot
 * vouch for — the getsauce.com / order.online mega-merge class, where 35 of
 * 95 executed merges joined different restaurants. 'distinct' is remembered
 * so the nightly sweep never re-pays; 'same_business' routes to the normal
 * merge path, which records its own place_merge verdict.
 */
export const SAME_BUSINESS_CONTRACT: JudgeContract = {
  plainName: 'Same-Business Court',
  lane: 'same_business',
  site: 'modules/restaurant-enrichment/restaurant-entity-merge.service.ts',
  promptKind: {
    unversioned:
      'same-business-judge-prompt.md — disk bytes outside llm_prompts.',
  },
  rule: {
    releaseFile: 'modules/restaurant-enrichment/same-business-rule.ts',
  },
  claimKeySpec:
    'order-independent uuid pair — sameBusinessClaimKey in business-identity-rules.ts (fold 0: never fold-stranded).',
  foldParticipation: 0,
  reopenOn: 'rule_version',
  ledger: 'claim_verdicts',
  record: false,
  effectSeparation: true, // ruling recorded, then the merge lane executes its own verdict
  responseSchema: {
    source:
      'inline in hearSameBusinessPair (restaurant-entity-merge.service.ts)',
  },
  reasonPolicy: { required: true },
  context:
    'Both records’ names, grounded addresses, active mention counts, communities, and the shared domain shown as context (never as proof).',
  batching: 'interactive',
  spend: {
    caller: 'enrichment.same_business_judge',
    workClass: 'gemini.interactive_pipeline',
  },
  failure: { posture: 'fail_closed' }, // an unheard pair holds, never merges
  certSuite: {
    uncertified:
      'No gold ×3 gate yet; retro-validated against the 95-merge audit ground truth (2026-09-03).',
  },
  dependsOn: [],
};
