import {
  readPromptAsset,
  resolvePromptRule,
  type RuleRelease,
} from './prompt-rule-release';

/**
 * THE JUDGE'S RULE, AND ITS VERSION — derived from the rule TEXT, never
 * declared beside it (H5, 2026-08-12).
 *
 * The mechanism itself now lives in `prompt-rule-release.ts`, extracted when
 * the judged-vocabulary lanes became its second and third adopters; the law it
 * enforces, and why, is stated there. This file holds what is specific to the
 * word-ownership judge: its prompt asset and its release history.
 */

export const CLAIM_JUDGE_PROMPT = readPromptAsset(
  __dirname,
  'claim-judge-prompt.md',
);

/**
 * THE VERSION LEDGER — every rule text that has ever judged a claim, oldest
 * first. Entries are append-only: an old fingerprint stays listed because
 * verdicts stamped with its version are still in the corpus and their ground
 * has to remain legible.
 *
 * Versions 1 and 2 predate fingerprinting; their texts are not recoverable
 * from this repo's working tree (v3 replaced them in place), so they carry no
 * fingerprint and exist here only as the history the numbers refer to.
 */
const RULE_RELEASES: readonly RuleRelease[] = [
  {
    version: 1,
    fingerprint: '',
    note: 'bare name+type pairs — mis-voted picante/café on the launch gate',
  },
  {
    version: 2,
    fingerprint: '',
    note: 'every incumbent listed, per-claimant context; one flat question with a fail-closed unsure→false',
  },
  {
    version: 3,
    fingerprint: 'c14004f4a5c0',
    note: 'THE RULE, not the formatting: evict only what is factually wrong, uphold culinary near-synonyms, asymmetric doubt, graph adjacency as evidence',
  },
];

const claimJudgeRule = resolvePromptRule(
  'claim-judge-prompt.md',
  'claim-judge-rule.ts',
  CLAIM_JUDGE_PROMPT,
  RULE_RELEASES,
);

export const CLAIM_JUDGE_RULE_FINGERPRINT = claimJudgeRule.fingerprint;

/**
 * The rule version stamped on every verdict this judge reaches, and the
 * version the due-predicate compares against.
 */
export const CLAIM_JUDGE_PROMPT_VERSION = claimJudgeRule.version;
