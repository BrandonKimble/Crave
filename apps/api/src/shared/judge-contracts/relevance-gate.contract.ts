import { JudgeContract } from '../judge-contract';

/**
 * REDDIT POST FILTER — drops non-food posts before extraction spends money.
 * Site verified: reddit-collector/relevance-gate.service.ts. THE PARALLEL
 * LEDGER (map overlap #8): verdicts persist per (platform, postId,
 * promptHash) in collection_relevance_verdicts — the same buy-once idea as
 * claim_verdicts, second implementation, none of the ledger's budget
 * metering, rehearing gates, or crash-resume. post_id+prompt_hash is just a
 * claim-key recipe; the migration expresses it as one.
 */
export const RELEVANCE_GATE_CONTRACT: JudgeContract = {
  plainName: 'Reddit Post Filter',
  lane: 'collection_relevance',
  site: 'modules/content-processing/reddit-collector/relevance-gate.service.ts',
  // One of TWO prompts actually in llm_prompts (with the Extractor).
  promptKind: 'relevance-gate-prompt.md',
  rule: {
    unversionedRule:
      'No *-rule.ts: the prompt hash IS the whole rule identity — a semantics change with unchanged bytes is invisible.',
  },
  claimKeySpec: '(platform, postId, promptHash) — per-post, per-prompt-bytes.',
  foldParticipation: 'UNFOLDED',
  reopenOn: 'prompt_hash',
  ledger: {
    ownTable: 'collection_relevance_verdicts',
    why: 'Predates the claim ledger; keyed by prompt hash; also feeds crave-score gate-passing mass.',
  },
  record: false,
  effectSeparation: true, // verdict row, then the post is (not) extracted
  responseSchema: {
    source:
      'modules/external-integrations/llm/prompts/llm-response-schemas.ts (RELEVANCE_GATE_RESPONSE_JSON_SCHEMA)',
  },
  reasonPolicy: { none: 'Keep/drop labels only — no stored reasons.' },
  context:
    'Post titles packed dynamically (no body truncation), judged in batches before any extraction spend.',
  batching: 'interactive',
  spend: {
    caller: 'relevance-gate.judgeBatch',
    workClass: 'gemini.relevance_gate',
  },
  failure: { posture: 'fail_open' }, // errors KEEP the post — money-risk over data-loss
  certSuite: {
    script: 'scripts/prompt-gold.ts',
    fixtures: 'scripts/fixtures/relevance-gate-gold-cases.json',
  },
};
