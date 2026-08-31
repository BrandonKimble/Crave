import { JudgeContract } from '../judge-contract';

/**
 * SEARCH WORD CLASSIFIER — one co-batched hearing certifying three per-word
 * facets: genericness (strip for embedding?), negation, role.
 * Site verified: entity-resolver/word-vocabulary-judge.service.ts, lanes in
 * word-vocabulary-lanes.ts (WORD_GENERICNESS_LANE / WORD_NEGATION_LANE /
 * WORD_ROLE_LANE — note the naming drift: these three use HYPHENS where
 * every other lane uses underscores; declared here as they ARE, per the
 * truthfulness rule, not as they should be).
 * One physical LLM call ('vocabulary.word_judge' — the caller that ran ~32k
 * hearings UNPROFILED while the lockdown spec stayed green, ad52ab2e2),
 * three ledger lanes.
 */
const SHARED = {
  site: 'modules/content-processing/entity-resolver/word-vocabulary-judge.service.ts',
  rule: {
    releaseFile:
      'modules/content-processing/entity-resolver/word-vocabulary-lanes.ts',
  },
  foldParticipation: 2,
  reopenOn: 'rule_version' as const,
  ledger: 'claim_verdicts' as const,
  record: false,
  effectSeparation: true as const,
  responseSchema: {
    source:
      'modules/external-integrations/llm/prompts/llm-response-schemas.ts (word-vocabulary co-batched schema)',
  },
  reasonPolicy: { required: true as const },
  context:
    'The standalone token plus its observed usage contexts; co-batched so one word’s three facets are ruled in one sitting.',
  batching: 'either' as const,
  spend: {
    caller: 'vocabulary.word_judge',
    workClass: 'gemini.interactive_pipeline',
  },
  failure: { posture: 'fail_closed' as const }, // unheard words queue, never guess
  certSuite: {
    script: 'scripts/certify-vocabulary.ts',
  },
};

export const WORD_GENERICNESS_CONTRACT: JudgeContract = {
  ...SHARED,
  plainName: 'Search Word Classifier (genericness)',
  lane: 'word-genericness',
  promptKind: {
    unversioned: 'word-genericness-prompt.md — disk bytes outside llm_prompts.',
  },
  claimKeySpec: 'folded token + locale (genericness facet).',
};

export const WORD_NEGATION_CONTRACT: JudgeContract = {
  ...SHARED,
  plainName: 'Search Word Classifier (negation)',
  lane: 'word-negation',
  promptKind: {
    unversioned: 'word-negation-prompt.md — disk bytes outside llm_prompts.',
  },
  claimKeySpec: 'folded token + locale (negation facet).',
};

export const WORD_ROLE_CONTRACT: JudgeContract = {
  ...SHARED,
  plainName: 'Search Word Classifier (role)',
  lane: 'word-role',
  promptKind: {
    unversioned: 'word-role-prompt.md — disk bytes outside llm_prompts.',
  },
  claimKeySpec: 'folded token + locale (role facet).',
};
