import { JudgeContract } from '../judge-contract';

/**
 * DISH INFO BUILDER — once per new dish: canonical ingredients, established
 * aliases, cuisine facet, knowledge categories (world knowledge the
 * pure-testimony collection prompt must not invent).
 * Site verified: entity-resolver/dish-knowledge-synthesis.service.ts. THE
 * ORPHAN LANE: 'dish.knowledge_synthesize' is a bare string in the service
 * (three literal occurrences), no *_LANE constant, no adapter, no prober —
 * lane-enumeration tools miss it (map "orphan lane" flag). Declared here so
 * it stops being invisible; the adapter comes in the migration pass.
 */
export const DISH_KNOWLEDGE_CONTRACT: JudgeContract = {
  plainName: 'Dish Info Builder',
  lane: 'dish.knowledge_synthesize',
  site: 'modules/content-processing/entity-resolver/dish-knowledge-synthesis.service.ts',
  promptKind: {
    unversioned:
      'dish-knowledge-prompt.md — disk bytes outside llm_prompts; the prompt is still under iteration (flip-list: arm the 5AM flag only after it settles, because the watermark re-pays per bump).',
  },
  rule: {
    releaseFile:
      'modules/content-processing/entity-resolver/dish-knowledge-rule.ts',
  },
  claimKeySpec:
    'Dish entity id (bare-string lane OUTSIDE the adapter contract — no canonicalClaimKey implementation exists; the key discipline is hand-rolled in the service).',
  foldParticipation: 'UNFOLDED',
  reopenOn: 'rule_version',
  ledger: 'claim_verdicts',
  record: false,
  effectSeparation: true,
  responseSchema: {
    source:
      'modules/external-integrations/llm/prompts/llm-response-schemas.ts (dish-knowledge schema)',
  },
  reasonPolicy: { required: true },
  context:
    'The dish name + its restaurant/mention evidence; output populates knowledge_categories / knowledge_cuisines / aliases — the facet the category edge builder full-replaces from (R6).',
  batching: 'either',
  spend: {
    caller: 'dish.knowledge_synthesize',
    workClass: 'gemini.interactive_pipeline',
  },
  failure: { posture: 'fail_closed' }, // knowledgeSynthesizedAt watermark stays unset
  certSuite: {
    script: 'scripts/prompt-gold.ts',
    fixtures: 'scripts/fixtures/dish-knowledge-gold-cases.json',
  },
};
