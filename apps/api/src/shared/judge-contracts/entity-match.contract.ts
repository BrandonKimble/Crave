import { JudgeContract } from '../judge-contract';

/**
 * EXTRACTION NAME MATCHER — "is this new name an existing thing?"
 * Site verified: entity-resolver/entity-resolution.service.ts (three-tier
 * resolution; ambiguous tail → matchEntitiesBatch, fail-closed to `new`),
 * lane adapter entity-resolver/entity-match-lane.ts (ENTITY_MATCH_LANE).
 * The same lane also backs the demand-vocabulary sweep and the unknown-
 * search intake's alias match (one matcher since the 2026-08-30 one-intake
 * merge) — one lane, several dockets, one prompt.
 */
export const ENTITY_MATCH_CONTRACT: JudgeContract = {
  plainName: 'Extraction Name Matcher',
  lane: 'entity_match',
  site: 'modules/content-processing/entity-resolver/entity-resolution.service.ts',
  // D6 residue: entity-match-prompt.md loads eagerly from disk, NOT from the
  // llm_prompts registry — bytes change silently on deploy. One prompt backs
  // TWO lanes (entity_match + entity_dedupe): a byte change must be reasoned
  // about for both (llm-systems-map overlap #9).
  promptKind: {
    unversioned:
      'entity-match-prompt.md loads via readFileSync, outside llm_prompts; a deploy changes the bytes with no version bump. Shared with entity_dedupe.',
  },
  rule: {
    releaseFile:
      'modules/content-processing/entity-resolver/entity-match-lane.ts',
  },
  claimKeySpec:
    'canonical fold of (extracted name, candidate shortlist identity) — see EntityMatchLaneAdapter.canonicalClaimKey; folded text, so fold-versioned. ' +
    'The SAME hearing also writes the term-keyed entity_reject lane (entity-reject-lane.ts, claim_key = kind|canonicalFold(term), same rule version + fingerprint) when the verdict is reject — the resolver tombstone sink reads that lane, never the archived row alone (2026-09-04).',
  foldParticipation: 2,
  // The fold v2 bump (2026-08-30) re-stamped identity_key thinking and forgot
  // the LEDGER read filter — 152k verdicts went invisible, every match
  // re-bought silently until the 08-31 audit. rule_version + fold_version
  // TOGETHER are this lane's reopen identity.
  reopenOn: 'rule_version',
  ledger: 'claim_verdicts',
  record: true, // llm_decision_records kind 'entity_match' (llm.service.ts)
  effectSeparation: true,
  responseSchema: {
    source:
      'modules/external-integrations/llm/prompts/llm-response-schemas.ts (entity-match batch schema, decode-enforced)',
  },
  reasonPolicy: { required: true },
  context:
    'Extracted name + per-candidate shortlist (folded forms, surfaces, community anchors) assembled by three-tier resolution; the judge sees only the ambiguous tail.',
  batching: 'either',
  spend: {
    caller: 'entity-resolution.match_batch',
    extraCallers: ['entity-resolution.match'],
    workClass: 'gemini.interactive_pipeline',
  },
  failure: {
    posture: 'fail_closed', // errors resolve to `new`, never to a merge
  },
  certSuite: {
    script: 'scripts/entity-match-gold.ts',
    fixtures: 'scripts/fixtures/entity-match-gold-cases.json',
  },
};
