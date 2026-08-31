import { JudgeContract } from '../judge-contract';

/**
 * POLL SUBJECT INFERENCE — ranked-leaderboard vs discussion, per new poll.
 * Site verified: polls/polls.service.ts → inferPollSubject via
 * llm.service.ts (caller 'poll.infer_subject'). The poll survives a dead
 * LLM (falls back to discussion).
 */
export const POLL_SUBJECT_CONTRACT: JudgeContract = {
  plainName: 'Poll Subject Inference',
  lane: 'poll_subject_inference',
  site: 'modules/polls/polls.service.ts',
  promptKind: {
    unversioned:
      'D6 residue — poll-subject-prompt.md loads from disk, outside llm_prompts.',
  },
  rule: { unversionedRule: 'No release file.' },
  claimKeySpec: 'None — one inference per poll at creation.',
  foldParticipation: { noClaimKey: 'per-poll, never re-asked' },
  // Permanent by ACCIDENT (the audit's exact example): nothing anywhere said
  // a poll's classification is final. Recorded as debt until an owner rules
  // it into a real { final } policy or a reopen mechanism.
  reopenOn: {
    final:
      'DECLARED DEBT: permanent by accident — no mechanism re-classifies a poll after a prompt change; nobody has ruled that permanence is intended.',
  },
  ledger: { unledgered: 'No verdict rows; the poll row carries the subject.' },
  record: false,
  effectSeparation: {
    violated: 'The inference writes the poll subject directly.',
  },
  responseSchema: {
    source:
      'modules/external-integrations/llm/prompts/llm-response-schemas.ts (POLL_SUBJECT_RESPONSE_JSON_SCHEMA)',
  },
  reasonPolicy: { none: 'Classification only.' },
  context: 'The poll question text.',
  batching: 'interactive',
  spend: {
    caller: 'poll.infer_subject',
    workClass: 'gemini.interactive_pipeline',
  },
  failure: { posture: 'fail_open' }, // dead LLM ⇒ discussion; the poll is never blocked
  certSuite: {
    script: 'scripts/prompt-gold.ts',
    fixtures: 'scripts/fixtures/poll-subject-gold-cases.json',
  },
};
