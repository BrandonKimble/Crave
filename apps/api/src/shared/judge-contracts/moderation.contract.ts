import { JudgeContract } from '../judge-contract';

/**
 * MODERATION — LLM text moderation returning a VERDICT; each caller names
 * its own policy. Site verified: moderation/moderation.service.ts via
 * llm.service.ts moderateText (caller 'moderation.classify').
 */
export const MODERATION_CONTRACT: JudgeContract = {
  plainName: 'Moderation',
  lane: 'moderation_text',
  site: 'modules/moderation/moderation.service.ts',
  promptKind: {
    unversioned:
      'D6 residue — moderation-prompt.md loads from disk, outside llm_prompts.',
  },
  rule: { unversionedRule: 'No release file; policy changes are invisible.' },
  claimKeySpec:
    'None — every submission is judged fresh; no verdict is remembered against the text.',
  foldParticipation: { noClaimKey: 'per-submission, never re-asked' },
  // PERMANENT AND CORRECT: a username is judged at submission time against
  // the policy of that day — the spec's canonical `{ final }` example. This
  // is the one lane where permanence is the declared POLICY, not debt.
  reopenOn: {
    final:
      'A username/text is judged at submission time; a later policy change governs later submissions, never retroactively.',
  },
  ledger: {
    unledgered:
      'No verdict table; llm_decision_records holds the trace (rejected content otherwise leaves none — disputes need the verdict + label).',
  },
  record: true, // llm_decision_records kind 'moderation'
  effectSeparation: true, // verdict returned; the caller applies its policy
  responseSchema: {
    source:
      'modules/external-integrations/llm/prompts/llm-response-schemas.ts (MODERATION_RESPONSE_JSON_SCHEMA)',
  },
  reasonPolicy: { required: true },
  context: 'The user-submitted text alone, no corpus context.',
  batching: 'interactive',
  spend: {
    caller: 'moderation.classify',
    workClass: 'gemini.interactive_pipeline',
  },
  failure: { posture: 'fail_closed' }, // user text is held, never published unjudged
  certSuite: {
    script: 'scripts/prompt-gold.ts',
    fixtures: 'scripts/fixtures/moderation-gold-cases.json',
  },
};
