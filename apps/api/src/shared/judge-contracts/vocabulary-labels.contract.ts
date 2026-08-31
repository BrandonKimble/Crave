import { JudgeContract } from '../judge-contract';

/**
 * LABEL/VOCABULARY SWEEP — the orthographic/vocabulary generation lane:
 * per-locale display labels + surfaces for concepts, drained by the 6AM
 * knowledge rail in dependency order (vocabulary → satisfies), blocked
 * surfaces auto-routed to the word-claim adjudicator.
 * Site verified: entity-display/vocabulary-generator.ts (lane string
 * 'labels.vocabulary' in recordUnanswered calls; caller profile
 * 'labels.vocabulary' in gemini-caller-profiles.ts).
 */
export const VOCABULARY_LABELS_CONTRACT: JudgeContract = {
  plainName: 'Label/Vocabulary Sweep',
  lane: 'labels.vocabulary',
  site: 'modules/entity-display/vocabulary-generator.ts',
  promptKind: {
    inline:
      'Prompt is built by buildVocabularyPrompt in vocabulary-generator.ts (builder-lane shape; predecessors pinned under scripts/fixtures/) — not in llm_prompts.',
  },
  rule: {
    unversionedRule:
      'No release file; version history lives in the pinned fixture builders (v4/v6/v7), not a release table the ledger reads.',
  },
  claimKeySpec:
    'Concept entity id + locale, watermarked via knowledge_pass_runs — not claim_verdicts keys.',
  foldParticipation: { noClaimKey: 'watermark-driven, not verdict-keyed' },
  reopenOn: {
    final:
      'The watermark re-pays on manual reset only; a prompt-builder change does not re-open generated labels.',
    debt: true,
  },
  ledger: {
    unledgered:
      'Labels/surfaces land via the surface writer; unanswered asks are logged (recordUnanswered), not ledgered.',
  },
  record: false,
  effectSeparation: true,
  responseSchema: {
    source:
      'modules/entity-display/vocabulary-generator.ts (VOCABULARY_RESPONSE_SCHEMA)',
  },
  reasonPolicy: { none: 'Generation lane, not adjudication.' },
  context:
    'Concept name + surfaces per locale, deadline-bounded batches (nothing unasked is ever ledgered — deadline_elapsed marks ALL unanswered).',
  batching: 'interactive',
  spend: {
    caller: 'labels.vocabulary',
    // The vocabulary generator runs on the pooled batch rail
    // (PooledBatchRunner purpose 'pooled.<caller>').
    batchPurposes: ['pooled.labels.vocabulary'],
    workClass: 'gemini.interactive_pipeline',
  },
  failure: { posture: 'fail_closed' }, // unanswered concepts stay pending for the next sweep
  certSuite: {
    script: 'scripts/prompt-gold.ts',
    fixtures: 'scripts/fixtures/vocabulary-gold-cases.json',
  },
};
