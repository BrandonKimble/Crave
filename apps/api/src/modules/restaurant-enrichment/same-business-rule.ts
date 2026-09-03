import { readFileSync } from 'fs';
import { join } from 'path';
import {
  resolvePromptRule,
  type RuleRelease,
} from '../content-processing/entity-resolver/prompt-rule-release';

/**
 * THE SAME-BUSINESS JUDGE'S RULE, AND ITS VERSION (plans/alias-clean-slate.md
 * item 3, hearing arm — owner-ordered 2026-09-03). The deterministic
 * owned-domain test decides the clear cases for free; a pair it cannot vouch
 * for goes to THIS court instead of holding forever. Same release law as
 * every other lane: the version is derived from the rule text, and a text
 * edit without a release entry fails loudly at load.
 */

export const SAME_BUSINESS_JUDGE_PROMPT = readFileSync(
  join(
    __dirname,
    '../external-integrations/llm/prompts/same-business-judge-prompt.md',
  ),
  'utf8',
);

const RULE_RELEASES: readonly RuleRelease[] = [
  {
    version: 1,
    fingerprint: 'b120f131471a',
    note: 'first rule: domain is context never proof; judge as a diner (brand-token branches vs different kitchens); merge identity never ownership (restaurant groups distinct — the Uchi/Uchiko class); asymmetric costs default distinct — the getsauce.com/Pho Van–Halal Taza class pinned as doctrine',
  },
];

const sameBusinessRule = resolvePromptRule(
  'same-business-judge-prompt.md',
  'same-business-rule.ts',
  SAME_BUSINESS_JUDGE_PROMPT,
  RULE_RELEASES,
);

export const SAME_BUSINESS_RULE_FINGERPRINT = sameBusinessRule.fingerprint;
export const SAME_BUSINESS_RULE_VERSION = sameBusinessRule.version;
