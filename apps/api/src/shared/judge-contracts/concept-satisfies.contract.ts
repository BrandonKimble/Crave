import { JudgeContract } from '../judge-contract';

/**
 * SEARCH SIMILAR-WORDS JUDGE — directed substitutability ("asked A, shown
 * B — satisfied?") on the residual pairs grounding, name containment and
 * category edges cannot decide. ONE lane, TWO rails: the sibling-edge
 * satisfies pass (concept-satisfies.service.ts, rule template inline in
 * concept-satisfies-rule.ts) and the cuisine-widening rail
 * (widening-satisfies.service.ts, rule widening-satisfies-rule.ts,
 * caller 'concepts.widening_satisfies') — widening's shared lane per the
 * sameness/widening ruling (merge = identity, widening = generosity).
 */
export const CONCEPT_SATISFIES_CONTRACT: JudgeContract = {
  plainName: 'Search Similar-Words Judge',
  lane: 'concept_satisfies',
  site: 'modules/content-processing/entity-resolver/concept-satisfies.service.ts + widening-satisfies.service.ts',
  promptKind: {
    inline:
      'Rule text is an inline fingerprinted template in concept-satisfies-rule.ts / widening-satisfies-rule.ts — no .md, and NOT in llm_prompts.',
  },
  rule: {
    releaseFile:
      'modules/content-processing/entity-resolver/concept-satisfies-rule.ts',
    note: 'Widening rail versions separately in widening-satisfies-rule.ts (releases v2–v5); both stamp this one lane.',
  },
  claimKeySpec:
    'DIRECTED pair (asked concept → shown concept) — direction matters (pub→bar is an open owner question, not symmetric).',
  foldParticipation: 'UNFOLDED',
  // The satisfies watermark historically used `=` where the label sweep used
  // `>=`, so one lane re-heard on rollback and the other did not — the
  // divergence the shared adapter was built to end.
  reopenOn: 'rule_version',
  ledger: 'claim_verdicts',
  record: false,
  effectSeparation: true, // verdict, then entity_satisfies edge
  responseSchema: {
    source:
      'modules/content-processing/entity-resolver/concept-satisfies-rule.ts (schema is part of the fingerprinted release)',
  },
  reasonPolicy: { required: true },
  context:
    'The asked/shown pair with names, surfaces, categories and (widening rail) venue cuisine facts; a satisfies YES on a lexically distant pair is a merge signal the dedupe pipeline cannot see (map overlap #12).',
  batching: 'either',
  spend: {
    caller: 'concepts.satisfies',
    extraCallers: ['concepts.widening_satisfies'],
    workClass: 'gemini.interactive_pipeline',
  },
  failure: { posture: 'fail_closed' }, // no edge without a verdict
  certSuite: {
    uncertified:
      'The widening rail was certified in the 2026-08-30 nine-stream wave; no STANDING re-runnable gold ×3 script is registered for the lane.',
  },
  dependsOn: [
    {
      // The knowledge rail runs "vocabulary sweep → satisfies" in declared
      // dependency order (knowledge-maintenance.service.ts) — encoded so the
      // rail's order and the registry's order can never silently diverge.
      on: 'labels.vocabulary',
      why: 'Knowledge rail dependency order: label/vocabulary sweeps run before the satisfies pass.',
      // No code ever writes pass = 'vocabulary' — the vocabulary/label
      // generator stamps per-locale label_sweep:<locale> rows
      // (label-sweep.service.ts sweepPass; verified on staging 2026-08-31:
      // label_sweep:{en,es,vi,zh} + satisfies are the only pass values).
      emptinessProbeSql:
        "SELECT count(*) FROM knowledge_pass_runs WHERE pass LIKE 'label_sweep:%'",
    },
    {
      // Cuisine widening reads venue cuisine facts: widening from a venue
      // whose cuisines were never extracted widens from nothing. Ordering
      // stated in plans/austin-launch-load.md Phase 2 (cuisine re-run →
      // cuisine widening v2 backfill) — encode, don't re-derive per load.
      on: 'venue_cuisine_facts',
      why: 'Cuisine widening derives candidate pairs from venue cuisine facts (austin-launch-load Phase 2 order: cuisine re-run BEFORE widening v2 backfill).',
      emptinessProbeSql:
        "SELECT count(*) FROM core_entities WHERE knowledge_cuisines <> '{}'",
    },
  ],
};
