import { JudgeContract } from '../judge-contract';

/**
 * WORD-CLAIM ADJUDICATOR — the judge behind the collision guard: two
 * INFERRED word→concept claims collide (`picante` on hot sauce vs spicy)
 * and a judge rules per word; losers are remembered-deprecated, both may
 * win; testimony always outranks inference.
 * Site verified: entity-resolver/word-claim-adjudicator.service.ts, adapter
 * word-claim-lane.ts (WORD_CLAIM_LANE — the ledger's first adopter).
 */
export const WORD_CLAIM_CONTRACT: JudgeContract = {
  plainName: 'Word-Claim Adjudicator',
  lane: 'word_claim',
  site: 'modules/content-processing/entity-resolver/word-claim-adjudicator.service.ts',
  promptKind: {
    unversioned: 'claim-judge-prompt.md — disk bytes outside llm_prompts.',
  },
  rule: {
    releaseFile:
      'modules/content-processing/entity-resolver/claim-judge-rule.ts',
  },
  claimKeySpec:
    'folded word form + concept identity — the lane that spent months adjudicating on the accent-destroying recall fold (bò and bơ as one case), which is why keyFoldVersion exists at all.',
  foldParticipation: 2,
  reopenOn: 'rule_version',
  ledger: 'claim_verdicts',
  record: false,
  effectSeparation: true,
  responseSchema: {
    source:
      'modules/external-integrations/llm/prompts/llm-response-schemas.ts (claim-judge schema)',
  },
  reasonPolicy: { required: true },
  context:
    'The colliding word, both claimant concepts with their surfaces and evidence provenance (testimony vs inference).',
  batching: 'interactive',
  spend: {
    caller: 'aliases.claim_judge',
    workClass: 'gemini.interactive_pipeline',
  },
  failure: { posture: 'fail_closed' }, // a collision stays quarantined-blocked
  certSuite: {
    uncertified:
      'No gold ×3 gate; rehearing via scripts/rehear-word-claims.ts.',
  },
};
