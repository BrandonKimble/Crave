import { JudgeContract } from '../judge-contract';

/**
 * GOOGLE LISTING MATCHER — matches our restaurant to the right Google
 * listing. Site verified: restaurant-enrichment/
 * restaurant-location-enrichment.service.ts (chooser), adapter
 * place-grounding-lane.ts (PLACE_GROUNDING_LANE), rule
 * place-grounding-rule.ts (v2 `87b7c24515d7` auto-reopened the 716 v1
 * rejections). A `select` GROUNDS a restaurant; place-grounded restaurants
 * are never deleted (the ~$118 law) — this is the most expensive verdict
 * per row in the fleet.
 */
export const PLACE_GROUNDING_CONTRACT: JudgeContract = {
  plainName: 'Google Listing Matcher',
  lane: 'place_grounding',
  site: 'modules/restaurant-enrichment/restaurant-location-enrichment.service.ts',
  promptKind: {
    inline:
      'restaurant-place-chooser.prompt.ts — a TS template, not an .md, not in llm_prompts.',
  },
  rule: {
    releaseFile: 'modules/restaurant-enrichment/place-grounding-rule.ts',
  },
  claimKeySpec:
    'UNFOLDED restaurant entity id (grounding keys on the unfolded id deliberately — the spec’s own example of legitimate lane difference).',
  foldParticipation: 'UNFOLDED',
  reopenOn: 'rule_version',
  ledger: 'claim_verdicts',
  record: true, // llm_decision_records kind 'place_choice' — the candidate set came from live Places retrieval and is gone by the time anyone asks why
  effectSeparation: true,
  responseSchema: {
    source:
      'modules/restaurant-enrichment/restaurant-place-chooser.prompt.ts (schema paired with the chooser prompt)',
  },
  reasonPolicy: { required: true },
  // THE 716-DECLINE SWEEP was context starvation: the v1 chooser saw too
  // little to say yes, declined 716 times, and each decline burned a strike
  // toward terminal ungroundability. Declaring the context is what makes the
  // starvation reviewable before it spends.
  context:
    'The restaurant’s mention evidence + the Google Places candidate list (names, addresses, types); v2 widened the context after the 716-decline starvation.',
  batching: 'either',
  spend: {
    caller: 'places.choose_candidate',
    workClass: 'gemini.interactive_pipeline',
  },
  failure: {
    posture: 'fail_closed',
    declineAlarm: {
      threshold: 0.9,
      minAttempts: 20,
      mechanism:
        'modules/restaurant-enrichment/worker-lane-decline-alarm.ts — trailing-2h window, fail-closed hold + critical ops alert, no strike spend',
    },
  },
  certSuite: {
    script: 'scripts/prompt-gold.ts',
    fixtures: 'scripts/fixtures/chooser-gold-cases.json',
  },
  dependsOn: [
    {
      // SEQUENCED GROUNDING (austin-launch-load Phase 3 step 9, red team
      // W1): chooser v2 had ZERO live verdicts — the tripwired batch sweep
      // runs FIRST, its live acceptance rate is OBSERVED, and only then do
      // mention-driven worker retries arm. The mention firehose must never
      // meet an unmeasured judge.
      on: 'consumer:grounding_batch_sweep',
      why: 'Mention-driven retries arm only after the enrichMissingPlaces batch sweep has produced observed live verdicts at a sane acceptance rate (austin-launch-load step 9a–c).',
      emptinessProbeSql:
        "SELECT count(*) FROM claim_verdicts WHERE lane = 'place_grounding' AND rule_version = 2",
    },
  ],
};
