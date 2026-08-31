import { JudgeContract } from '../judge-contract';

/**
 * NIGHTLY DUPLICATE MERGER (judge half) — same-thing twins found later.
 * Site verified: entity-resolver/food-dedupe-merge.service.ts (trigram scan,
 * deterministic token-multiset rule first, LLM judge for the rest; full
 * merge plan stored in the verdict subject; crash-resume replays stored
 * bytes), adapter entity-dedupe-lane.adapter.ts (ENTITY_DEDUPE_LANE).
 * Gated: DEDUPE_JUDGE_LANES_ENABLED off ⇒ pairs silently `judgeHeld`
 * (flip-list row — launch).
 */
export const ENTITY_DEDUPE_CONTRACT: JudgeContract = {
  plainName: 'Nightly Duplicate Merger',
  lane: 'entity_dedupe',
  site: 'modules/content-processing/entity-resolver/food-dedupe-merge.service.ts',
  promptKind: {
    unversioned:
      'entity-match-prompt.md (shared with entity_match) — unversioned disk bytes; a prompt edit re-judges BOTH lanes or neither, and nothing forces the reasoning.',
  },
  rule: {
    releaseFile:
      'modules/content-processing/entity-resolver/entity-dedupe-rule.ts',
  },
  claimKeySpec:
    'unordered PAIR of entity ids (order-normalized) — the shape that proved the base adapter could not assume the word lane’s row shape.',
  foldParticipation: 'UNFOLDED', // UUID pair; nothing here can drift
  reopenOn: 'rule_version',
  ledger: 'claim_verdicts',
  record: true, // kind 'entity_match' rows from matchEntitiesBatch
  effectSeparation: true, // verdict row first, merge tx second, executedAt last
  responseSchema: {
    source:
      'modules/external-integrations/llm/prompts/llm-response-schemas.ts (entity-match batch schema)',
  },
  // THE 47 WRONG MERGES bought this tripwire: "the judge announced every bad
  // merge in its reason and nothing read it." merge-reason-tripwire.ts now
  // reads fold-class reason patterns before the effect applies.
  reasonPolicy: {
    required: true,
    tripwire: ['shared/merge-reason-tripwire.ts fold-class patterns'],
  },
  context:
    'Candidate duplicate pair with both entities’ names, surfaces, and connection evidence from the trigram recall scan; lexically distant twins (soup dumplings / xiao long bao) are structurally invisible to it (map overlap #12).',
  batching: 'batch_rail',
  spend: {
    caller: 'entity-resolution.match_batch',
    workClass: 'gemini.interactive_pipeline',
  },
  failure: { posture: 'fail_closed' }, // an unanswered pair stays unmerged
  certSuite: {
    uncertified:
      'No dedupe-specific gold gate: scripts/entity-match-gold.ts pins the SHARED prompt’s match doctrine, but no fixture exercises the pair-merge question this lane actually asks.',
  },
};
