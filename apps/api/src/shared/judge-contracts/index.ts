/**
 * THE JUDGE CONTRACT REGISTRY — every LLM decision site, declared AS IT IS
 * TODAY (plans/llm-lane-primitive.md). Static and code-declared: no DB, no
 * config. A new LLM caller belongs here before its first test run passes
 * (gateway warn-mode today; throw after the post-load migration flips it).
 *
 * EXCLUDED, with reasons (so absence is a decision, not a silence — the
 * DerivedIndexJob "acknowledged non-member" idiom):
 * - Search query understanding: zero-LLM since the 2026-08-02 gazetteer
 *   cutover (ladder + sync-LLM deleted). Its only LLM contact is the
 *   judged-vocabulary door, which is the word-vocabulary contracts.
 * - embedding.embed: paid, ledgered, but an EMBEDDING — no judgment, no
 *   prompt semantics to version. Governed by the spend suite, not this
 *   registry.
 * - llm.systemInstructionCache / llm.queryInstructionCache /
 *   llm.batchSystemCache: internal cache mints inside the gateway itself.
 * - Vision SafeSearch (photo safety): not a Gemini/LLM call.
 */
import {
  DependentConsumer,
  JudgeContractRegistry,
  assertUniqueLanes,
} from '../judge-contract';
import { ENTITY_MATCH_CONTRACT } from './entity-match.contract';
import { ENTITY_DEDUPE_CONTRACT } from './entity-dedupe.contract';
import { RESTAURANT_NAME_CONTRACT } from './restaurant-name.contract';
import { WORD_CLAIM_CONTRACT } from './word-claim.contract';
import {
  WORD_GENERICNESS_CONTRACT,
  WORD_NEGATION_CONTRACT,
  WORD_ROLE_CONTRACT,
} from './word-vocabulary.contracts';
import { CONCEPT_SATISFIES_CONTRACT } from './concept-satisfies.contract';
import { PLACE_GROUNDING_CONTRACT } from './place-grounding.contract';
import {
  ATTRIBUTE_MERGE_CONTRACT,
  ATTRIBUTE_NAME_CONTRACT,
  ATTRIBUTE_PLACEMENT_CONTRACT,
} from './attribute-ontology.contracts';
import { DISH_KNOWLEDGE_CONTRACT } from './dish-knowledge.contract';
import {
  CUISINE_HUB_CONTRACT,
  VENUE_CUISINE_CONTRACT,
} from './venue-cuisine.contracts';
import { RELEVANCE_GATE_CONTRACT } from './relevance-gate.contract';
import { COLLECTION_EXTRACTOR_CONTRACT } from './collection-extractor.contract';
import { MODERATION_CONTRACT } from './moderation.contract';
import { POLL_SUBJECT_CONTRACT } from './poll-subject.contract';
import { PHOTO_IS_FOOD_CONTRACT } from './photo-is-food.contract';
import { UNKNOWN_INTAKE_CONTRACT } from './unknown-intake.contract';
import { VOCABULARY_LABELS_CONTRACT } from './vocabulary-labels.contract';

/**
 * NON-JUDGE CONSUMERS in the sequencing DAG — deterministic systems whose
 * ORDERING relative to the judge lanes is what the flip-list and the
 * launch-load runbook state in prose. Encoding them here is what turns the
 * runbook order into a generated artifact (the R6 lesson: 4,839 standing
 * category edges vs 0 populated facets, and the builder's zero-input scream
 * had been silenced).
 */
export const DEPENDENT_CONSUMERS: readonly DependentConsumer[] = [
  {
    id: 'consumer:food_category_edge_builder',
    plainName: 'Food-category edge builder (DerivedIndexJob)',
    site: 'modules (derived food-category edges job; FOOD_CATEGORY_EDGE_BUILDER_ENABLED)',
    dependsOn: [
      {
        on: 'dish.knowledge_synthesize',
        why: 'HARD ORDER (flip-list, audit 2026-08-31): the builder full-replaces from knowledge_categories; arming it against an empty facet silently WIPES every standing category edge (R6 class).',
        emptinessProbeSql:
          "SELECT count(*) FROM core_entities WHERE knowledge_categories <> '{}'",
      },
    ],
  },
  {
    id: 'consumer:restaurant_name_census',
    plainName: 'Restaurant-name census (knowledge rail step 3)',
    site: 'modules/content-processing/entity-resolver/restaurant-name-census.service.ts',
    dependsOn: [
      {
        on: 'labels.vocabulary',
        why: 'The census is STEP 3 of the knowledge rail, after the label/vocabulary sweeps (RESTAURANT_NAME_CENSUS_ENABLED requires KNOWLEDGE_MAINTENANCE_ENABLED).',
        emptinessProbeSql:
          "SELECT count(*) FROM knowledge_pass_runs WHERE pass = 'vocabulary'",
      },
      {
        on: 'content_extraction',
        why: 'Hear AFTER the reload: reload churn wastes verdicts on surfaces the reload replaces (flip-list census row).',
        emptinessProbeSql:
          "SELECT count(*) FROM entity_surface WHERE status = 'active'",
      },
    ],
  },
  {
    id: 'consumer:restaurant_janitor',
    plainName: 'Restaurant janitor (weekly lifecycle)',
    site: 'modules/restaurant-enrichment/restaurant-janitor.service.ts',
    dependsOn: [
      {
        on: 'restaurant_name',
        why: 'Court-without-janitor does not kill upheld-name ghosts ("Best", SD-3): the janitor archive arm is what makes the court’s verdicts real. Flip TOGETHER (flip-list).',
        emptinessProbeSql:
          "SELECT count(*) FROM claim_verdicts WHERE lane = 'restaurant_name'",
      },
    ],
  },
  {
    id: 'consumer:grounding_batch_sweep',
    plainName: 'enrichMissingPlaces batch sweep (tripwired)',
    site: 'modules/restaurant-enrichment (enrichMissingPlaces; per-run >90%-decline tripwire)',
    // A source node: it is the FIRST grounding step by design (austin-launch
    // step 9a) and the place_grounding contract depends on it, not vice versa.
    dependsOn: [],
  },
];

export const JUDGE_CONTRACT_REGISTRY: JudgeContractRegistry = {
  contracts: [
    // The 9(+1) claim-verdict lanes
    ENTITY_MATCH_CONTRACT,
    ENTITY_DEDUPE_CONTRACT,
    RESTAURANT_NAME_CONTRACT,
    WORD_CLAIM_CONTRACT,
    WORD_GENERICNESS_CONTRACT,
    WORD_NEGATION_CONTRACT,
    WORD_ROLE_CONTRACT,
    CONCEPT_SATISFIES_CONTRACT,
    PLACE_GROUNDING_CONTRACT,
    ATTRIBUTE_MERGE_CONTRACT,
    DISH_KNOWLEDGE_CONTRACT, // the orphan bare-string lane
    // Un-ledgered / own-ledger sites
    ATTRIBUTE_PLACEMENT_CONTRACT,
    ATTRIBUTE_NAME_CONTRACT,
    VENUE_CUISINE_CONTRACT,
    CUISINE_HUB_CONTRACT,
    RELEVANCE_GATE_CONTRACT,
    COLLECTION_EXTRACTOR_CONTRACT,
    MODERATION_CONTRACT,
    POLL_SUBJECT_CONTRACT,
    PHOTO_IS_FOOD_CONTRACT,
    UNKNOWN_INTAKE_CONTRACT,
    VOCABULARY_LABELS_CONTRACT,
  ],
  consumers: DEPENDENT_CONSUMERS,
};

assertUniqueLanes(JUDGE_CONTRACT_REGISTRY);
