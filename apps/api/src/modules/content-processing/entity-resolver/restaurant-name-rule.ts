import {
  readPromptAsset,
  resolvePromptRule,
  type RuleRelease,
} from './prompt-rule-release';

/**
 * THE RESTAURANT-NAME JUDGE'S RULE, AND ITS VERSION — derived from the rule
 * TEXT, never declared beside it (same law as claim-judge-rule.ts; mechanism
 * in prompt-rule-release.ts).
 *
 * This is the C4a lane's rule: "is this surface form genuinely a name of this
 * restaurant, or a generic word that landed as a name?" Its release history
 * starts here; every verdict the lane reaches is stamped with the version the
 * fingerprint resolves to, and a text edit without a new release entry fails
 * loudly at load.
 */

export const RESTAURANT_NAME_JUDGE_PROMPT = readPromptAsset(
  __dirname,
  'restaurant-name-judge-prompt.md',
);

const RULE_RELEASES: readonly RuleRelease[] = [
  {
    version: 1,
    fingerprint: '698b51e88588',
    note: 'first rule: names are facts about reference, decided from grounding + corroborating surfaces + provenance; Best-ghost / Chili’s / Favorite anchor cases pinned; underdetermined defaults to is-a-name except the ungrounded bare-generic pattern',
  },
];

const restaurantNameRule = resolvePromptRule(
  'restaurant-name-judge-prompt.md',
  'restaurant-name-rule.ts',
  RESTAURANT_NAME_JUDGE_PROMPT,
  RULE_RELEASES,
);

export const RESTAURANT_NAME_RULE_FINGERPRINT = restaurantNameRule.fingerprint;

/** The rule version stamped on every verdict this judge reaches, and the
 *  version the due-predicate compares against. */
export const RESTAURANT_NAME_RULE_VERSION = restaurantNameRule.version;
