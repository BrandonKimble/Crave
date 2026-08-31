import { JudgeContract } from '../judge-contract';

/**
 * RESTAURANT INFO BUILDER — venue cuisine facts + venue attributes from the
 * Google editorial summary and place types.
 * Site verified: restaurant-enrichment/restaurant-cuisine-extraction.service.ts
 * — the INPUT-FINGERPRINT lane: place_metadata.cuisineExtraction stores a
 * hash of (summary, types, prompt) and recomputes only when one changes.
 * That bespoke mechanism IS `reopenOn: 'input_fingerprint'`, named instead
 * of local (the spec: post_id+prompt_hash and place+input_fingerprint are
 * just claim key recipes).
 */
export const VENUE_CUISINE_CONTRACT: JudgeContract = {
  plainName: 'Restaurant Info Builder',
  lane: 'venue_cuisine_facts',
  site: 'modules/restaurant-enrichment/restaurant-cuisine-extraction.service.ts',
  promptKind: {
    unversioned: 'cuisine-prompt.md — disk bytes outside llm_prompts.',
  },
  rule: { releaseFile: 'modules/restaurant-enrichment/venue-cuisine-rule.ts' },
  claimKeySpec:
    'place id + input fingerprint (hash over editorial summary + place types + prompt) stored in place_metadata.cuisineExtraction.',
  foldParticipation: 'UNFOLDED',
  reopenOn: 'input_fingerprint',
  ledger: {
    ownTable:
      'place_metadata.cuisineExtraction (per-place JSON record, not a verdict table)',
    why: 'The fingerprint record is the memory — one row per place, superseded in place; no claim_verdicts rows.',
  },
  record: false,
  effectSeparation: true, // record written, then attributes applied
  responseSchema: {
    source:
      'modules/external-integrations/llm/prompts/llm-response-schemas.ts (cuisine schema)',
  },
  reasonPolicy: {
    none: 'Cuisine extraction returns facts, not adjudications — no per-verdict reason is stored. Declared, since absence of reasons means a wrong cuisine cannot be audited from the record alone.',
  },
  context:
    'Google editorial summary + place types for one grounded place; no mention testimony.',
  batching: 'interactive',
  spend: {
    caller: 'cuisine.extract',
    workClass: 'gemini.interactive_pipeline',
  },
  failure: { posture: 'fail_closed' }, // no record written on failure; retried on next enqueue
  certSuite: {
    script: 'scripts/prompt-gold.ts',
    fixtures: 'scripts/fixtures/cuisine-gold-cases.json',
  },
};

/**
 * Cuisine HUB classifier (classifyCuisineHubs, cuisine-hub-prompt.md) —
 * the second call the same site makes; declared separately because its
 * prompt file and caller tag differ, and the D6 residue list names
 * cuisine-hub explicitly.
 */
export const CUISINE_HUB_CONTRACT: JudgeContract = {
  plainName: 'Restaurant Info Builder (cuisine hubs)',
  lane: 'cuisine_hub_classification',
  site: 'modules/restaurant-enrichment/restaurant-cuisine-extraction.service.ts (classifyCuisineHubs via llm.service.ts)',
  promptKind: {
    unversioned:
      'cuisine-hub-prompt.md — disk bytes outside llm_prompts (D6 residue).',
  },
  rule: { unversionedRule: 'No release file; rides the cuisine fingerprint.' },
  claimKeySpec: 'None of its own — folded into the cuisine extraction record.',
  foldParticipation: { noClaimKey: 'rides venue_cuisine_facts’ fingerprint' },
  reopenOn: 'input_fingerprint',
  ledger: {
    unledgered:
      'No verdict rows of its own; output lands inside the cuisine extraction result.',
  },
  record: false,
  effectSeparation: true,
  responseSchema: {
    source:
      'modules/external-integrations/llm/prompts/llm-response-schemas.ts (cuisine-hub schema)',
  },
  reasonPolicy: { none: 'Classification output only.' },
  context: 'Candidate cuisine terms needing hub/leaf classification.',
  batching: 'interactive',
  spend: {
    caller: 'cuisine.classify_hubs',
    workClass: 'gemini.interactive_pipeline',
  },
  failure: { posture: 'fail_closed' },
  certSuite: { uncertified: 'No gold ×3 gate.' },
};
