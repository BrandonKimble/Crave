import { JudgeContract } from '../judge-contract';

/**
 * THE ATTRIBUTE ONTOLOGY'S THREE JUDGES — placement, name choice, merge.
 * The incident module (a whole LLM service undiscovered for weeks, which is
 * why the systems map exists). Sites verified:
 * attribute-ontology/attribute-ontology.service.ts (placeAttribute /
 * chooseAttributeName via llm.service.ts callers 'attribute.place' /
 * 'attribute.canonicalize_name'), attribute-dedupe-merge.service.ts +
 * attribute-merge-lane.adapter.ts (ATTRIBUTE_MERGE_LANE — built but
 * UNREACHABLE in prod: judge flag off AND runSweep unscheduled).
 */

/** NEW-TAG PLACEMENT JUDGE — sorts brand-new tags into the vocabulary. */
export const ATTRIBUTE_PLACEMENT_CONTRACT: JudgeContract = {
  plainName: 'New-Tag Placement Judge',
  lane: 'attribute_placement',
  site: 'modules/attribute-ontology/attribute-ontology.service.ts',
  promptKind: {
    unversioned:
      'attribute-placement-prompt.md — disk bytes outside llm_prompts (D6 residue).',
  },
  rule: {
    unversionedRule:
      'No *-rule.ts release file: a placement doctrine change re-judges nothing and re-opens nothing.',
  },
  claimKeySpec:
    'No canonical claim key exists — placement decides per pending term against the LIVE ontology, so the same term can be placed differently as the ontology moves.',
  foldParticipation: { noClaimKey: 'un-ledgered; no key was ever specified' },
  // Permanent BY ACCIDENT, not by declared policy: nothing re-opens a
  // placement when the prompt or the ontology changes. Declared as debt,
  // not laundered into { final }.
  reopenOn: {
    final:
      'Not policy: no reopen mechanism exists; a placed attribute is never re-judged even after a doctrine change.',
    debt: true,
  },
  // The 47-merge class, one module over: applyPlan merges without verdict
  // rows (map overlap #11) — an effect applied with no ledger row nobody
  // can audit. The migration plan gives placement a real lane (step 3).
  ledger: {
    unledgered:
      'applyPlan applies promote/merge/reject effects with NO claim_verdicts row; only llm_decision_records mirrors the raw decision.',
  },
  record: true, // llm_decision_records kind 'attribute_placement'
  effectSeparation: {
    violated:
      'Decision and effect land in one pass; there is no verdict-then-effect boundary with executedAt.',
  },
  responseSchema: {
    source:
      'modules/external-integrations/llm/prompts/llm-response-schemas.ts (placement schema)',
  },
  reasonPolicy: { required: true },
  context:
    'The pending term + embedding-nearest live ontology candidates; quarantine (PENDING status) means a stalled run only delays vocabulary, never dirties data.',
  batching: 'interactive',
  spend: {
    caller: 'attribute.place',
    workClass: 'gemini.interactive_pipeline',
  },
  failure: {
    posture: 'fail_closed',
    quarantine: 'pending attributes (status PENDING) hold until placed',
  },
  certSuite: {
    script: 'scripts/attribute-placement-gold.ts',
    fixtures: 'scripts/fixtures/attribute-placement-gold-cases.json',
  },
};

/** Display-name chooser for canonicals that absorbed synonyms. */
export const ATTRIBUTE_NAME_CONTRACT: JudgeContract = {
  plainName: 'New-Tag Placement Judge (name chooser)',
  lane: 'attribute_name_choice',
  site: 'modules/attribute-ontology/attribute-ontology.service.ts',
  promptKind: {
    unversioned:
      'attribute-name-prompt.md — disk bytes outside llm_prompts (D6 residue).',
  },
  rule: { unversionedRule: 'No release file; no reopen semantics.' },
  claimKeySpec: 'None — chooses per merge event, never re-asked.',
  foldParticipation: { noClaimKey: 'un-ledgered; no key was ever specified' },
  reopenOn: {
    final:
      'A chosen display name is permanent by accident — nothing re-opens it.',
    debt: true,
  },
  ledger: {
    unledgered: 'Name choices write no verdict rows; the name just changes.',
  },
  record: false,
  effectSeparation: { violated: 'Choice applies directly to the canonical.' },
  responseSchema: {
    source:
      'modules/external-integrations/llm/prompts/llm-response-schemas.ts (name-choice schema)',
  },
  reasonPolicy: { required: true },
  context: 'The canonical’s absorbed synonym set + usage counts.',
  batching: 'interactive',
  spend: {
    caller: 'attribute.canonicalize_name',
    workClass: 'gemini.interactive_pipeline',
  },
  failure: { posture: 'fail_open' }, // a failed choice keeps the incumbent name
  certSuite: { uncertified: 'No gold ×3 gate.' },
};

/** Attribute dedupe-merge — the lane that EXISTS but is unreachable. */
export const ATTRIBUTE_MERGE_CONTRACT: JudgeContract = {
  plainName: 'Attribute Duplicate Merger',
  lane: 'attribute_merge',
  site: 'modules/attribute-ontology/attribute-dedupe-merge.service.ts',
  promptKind: {
    unversioned: 'attribute-merge-prompt.md — disk bytes outside llm_prompts.',
  },
  rule: { releaseFile: 'modules/attribute-ontology/attribute-merge-rule.ts' },
  claimKeySpec:
    'Unordered pair of ACTIVE same-type attribute ids — see AttributeMergeLaneAdapter.canonicalClaimKey.',
  foldParticipation: 'UNFOLDED',
  reopenOn: 'rule_version',
  ledger: 'claim_verdicts',
  record: true, // llm_decision_records kind 'attribute_merge'
  effectSeparation: true,
  responseSchema: {
    source:
      'modules/external-integrations/llm/prompts/llm-response-schemas.ts (attribute-merge batch schema)',
  },
  reasonPolicy: { required: true },
  context:
    'The candidate synonym pair with evidence counts; survivor = higher mention-weight, shorter name breaks ties (D3: the spelling dictionary was deleted).',
  batching: 'interactive',
  spend: {
    caller: 'attribute.merge_batch',
    workClass: 'gemini.interactive_pipeline',
  },
  failure: { posture: 'fail_closed' },
  certSuite: {
    script: 'scripts/attribute-merge-gold.ts',
    fixtures: 'scripts/fixtures/attribute-merge-gold-cases.json',
  },
};
