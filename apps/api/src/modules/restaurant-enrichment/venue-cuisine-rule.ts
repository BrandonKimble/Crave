import { readFileSync } from 'fs';
import { join } from 'path';
import {
  RuleRelease,
  resolvePromptRule,
} from '../content-processing/entity-resolver/prompt-rule-release';

/**
 * THE CUISINE JUDGE'S RULE LEDGER (campaign red-team v3, R3).
 *
 * cuisine-prompt.md was rebuilt wholesale in wave2 (41/41 ×3 certified) and
 * shipped WITHOUT a release ledger — the exact fleet standard the campaign
 * set everywhere else (place-grounding-rule.ts, entity-dedupe-rule.ts,
 * claim-judge-rule.ts). The next unversioned edit would re-rule every
 * venue's cuisines silently: the input-fingerprint gate
 * (restaurant-cuisine-extraction.service.ts) already re-runs on a prompt
 * change, but nothing could say WHICH rule produced a stored extraction.
 *
 * TO CHANGE THE RULE: edit cuisine-prompt.md, run any test, read the
 * fingerprint the loud failure prints, and append a release with the next
 * version and a one-line note. The version is stamped into each venue's
 * cuisineExtraction metadata (`ruleVersion`).
 */
const RULE_RELEASES: readonly RuleRelease[] = [
  {
    version: 1,
    fingerprint: '8fdb8cb2cd26',
    note: 'the wave2 rebuilt cuisine judge (venue-facts extraction: cuisines + FILTER-TEST venue attributes from the editorial summary), 41/41 gold ×3 certified 2026-08-30 — first ledgered version',
  },
];

const CUISINE_PROMPT_TEXT = readFileSync(
  join(__dirname, '../external-integrations/llm/prompts/cuisine-prompt.md'),
  'utf8',
);

export const VENUE_CUISINE_RULE = resolvePromptRule(
  'cuisine-prompt.md',
  'venue-cuisine-rule.ts',
  CUISINE_PROMPT_TEXT,
  RULE_RELEASES,
);
