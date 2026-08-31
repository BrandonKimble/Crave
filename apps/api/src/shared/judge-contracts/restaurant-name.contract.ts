import { JudgeContract } from '../judge-contract';

/**
 * JUNK-NAME CLEANER — "is this surface genuinely a NAME of this restaurant?"
 * Site verified: entity-resolver/restaurant-name-hearing.service.ts
 * (PlaceNameHearingService; kills ghost recall surfaces — the "Best"
 * incident: an active `best` surface on a restaurant named "Best" hard-ANDed
 * every "best X" search to zero results). Docket fed by the name census
 * (restaurant-name-census.service.ts, step 3 of the knowledge rail, behind
 * RESTAURANT_NAME_CENSUS_ENABLED — default off until post-reload).
 */
export const RESTAURANT_NAME_CONTRACT: JudgeContract = {
  plainName: 'Junk-Name Cleaner',
  lane: 'restaurant_name',
  site: 'modules/content-processing/entity-resolver/restaurant-name-hearing.service.ts',
  promptKind: {
    unversioned:
      'restaurant-name-judge-prompt.md — disk bytes outside llm_prompts.',
  },
  rule: {
    releaseFile:
      'modules/content-processing/entity-resolver/restaurant-name-rule.ts',
  },
  claimKeySpec:
    'restaurant entity id + folded surface form — see PlaceNameLaneAdapter.canonicalClaimKey.',
  foldParticipation: 2,
  reopenOn: 'rule_version',
  ledger: 'claim_verdicts',
  record: false,
  effectSeparation: true, // verdict row, then surface role demotion
  responseSchema: {
    source:
      'modules/external-integrations/llm/prompts/llm-response-schemas.ts (place-name judge schema)',
  },
  reasonPolicy: { required: true },
  context:
    'The surface form, the restaurant’s grounded name/place identity, and mention evidence — a proper noun that never faced a judge at any earlier stage (C4a).',
  batching: 'interactive',
  spend: {
    caller: 'aliases.place_name_judge',
    workClass: 'gemini.interactive_pipeline',
  },
  failure: { posture: 'fail_closed' }, // unjudged surfaces keep their status
  certSuite: {
    uncertified:
      'Manual hearing script only (scripts/hear-restaurant-name-claims.ts); no gold ×3 gate.',
  },
  dependsOn: [
    {
      // The census IS this court's docket feeder: hearing before the census
      // has scanned is hearing an empty docket; and per the flip-list,
      // court-without-janitor does not kill upheld-name ghosts — see the
      // consumer:restaurant_janitor node, which depends on THIS lane.
      on: 'consumer:restaurant_name_census',
      why: 'The generic-word census (knowledge rail step 3) mints the docket this court hears (flip-list RESTAURANT_NAME_CENSUS_ENABLED row).',
      emptinessProbeSql:
        "SELECT count(*) FROM claim_verdicts WHERE lane = 'restaurant_name'", // post-census: docket produced hearings; 0 after an armed census = feeder broken
    },
  ],
};
