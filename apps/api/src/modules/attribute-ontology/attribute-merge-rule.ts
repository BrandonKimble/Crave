import { readFileSync } from 'fs';
import { join } from 'path';
import {
  resolvePromptRule,
  RuleRelease,
} from '../content-processing/entity-resolver/prompt-rule-release';

/**
 * THE ATTRIBUTE-MERGE JUDGE'S RULE, AND ITS VERSION — derived from the rule
 * TEXT, never declared beside it (prompt-rule-release.ts is the law;
 * entity-dedupe-rule.ts is the sibling instance this mirrors).
 *
 * The judge is `LLMService.judgeAttributeMergesBatch`, and its rule is
 * prompts/attribute-merge-prompt.md — the ONE-INTENTION test. A merge
 * verdict is only re-openable if the ledger can tell WHICH rule decided it:
 * edit the prompt without a bump and every 'hold' the OLD text ruled goes on
 * being skipped by re-scans forever, indistinguishable from a ruling of the
 * new rule.
 *
 * TO CHANGE THE RULE: edit prompts/attribute-merge-prompt.md, run any test,
 * read the fingerprint the failure prints, and append a release with the
 * next version and a note saying what changed. That entry IS the bump — and
 * it re-opens every judged pair, so estimate the population before a drain.
 */
/* __dirname-relative like every prompt load — resolves under both src
 * (ts-jest) and dist (nest-cli copies prompts/*.md as assets). NOT
 * readPromptAsset: that helper's relative hop is written for the
 * entity-resolver directory depth, one level deeper than this module. */
export const ATTRIBUTE_MERGE_RULE_TEXT = readFileSync(
  join(
    __dirname,
    '../external-integrations/llm/prompts/attribute-merge-prompt.md',
  ),
  'utf8',
);

/**
 * Append-only, oldest first. An old fingerprint stays listed because
 * verdicts stamped with its version are still in the corpus and their
 * ground has to remain legible.
 */
const RULE_RELEASES: readonly RuleRelease[] = [
  {
    version: 1,
    fingerprint: '5e79585de61c',
    note: 'first attribute-merge rule — the ONE-INTENTION test (both-directions interchangeability), praise-strength tiers fold, value canon (affordable absorbs cheap/good value), polarity absolute, doubt keeps',
  },
  {
    version: 2,
    fingerprint: '714d73df7fec',
    note: 'Sameness-court alignment (2026-08-30): renamed to THE INTERCHANGEABILITY TEST (one doctrine with the placement bench), narrower-want-never-folds pinned (piano bar/live music, pizza truck/food truck), a_used_by/b_used_by carrier evidence added (D2), evidence-style reasons required',
  },
  {
    version: 3,
    fingerprint: '3f350f3de7cc',
    note: "Owner rulings 2026-08-30, coordinator-amended same day — searcher-tolerance basis adopted as the stated doctrine (merge when each side's searcher would be happy with the other's results; attributes widen options, not taxonomize; precision reserved for hard constraints: dietary/safety, measured steps, polarity — doubt keeps only there). Cross-word pair verdicts UNCHANGED pending the owner's storage-merge-vs-search-arm decision: piano bar/live music, pizza truck/food truck, bar/pub, deli/sandwich shop etc. stay keep, with the prompt naming search-layer widening as the mechanism that may serve those searchers instead of a storage fold; raw-vegan hard-constraint pin added",
  },
  {
    version: 4,
    fingerprint: 'f9305ebbdc33',
    note: 'Owner ruling 2026-08-30 (supersedes searcher-tolerance basis): THE SAME-CLAIM TEST — merge only when no discernible factual difference ("could the difference ever change what arrives or what the place is like?"); search-time widening (satisfies arms) owns generosity, so every keep on a close pair is a widening handoff. Spelling/wording/intensity canons stand; cold/iced, soft/tender, bakery/pastry shop pinned keep; the nine cross-word pairs definitively keep; doubt says keep everywhere',
  },
  {
    version: 5,
    fingerprint: 'f5416506d060',
    note: 'Acceptance fix 2026-08-30: an unversioned edit landed on the prompt AFTER the v4 certification (file was untracked; no baseline survives, so WHAT changed vs f9305ebbdc33 is unrecoverable — the on-disk text still states the full SAME-CLAIM doctrine the v4 report describes, so the delta is presumed editorial). Versioned as v5 and RE-CERTIFIED on these exact bytes: attribute-merge-gold 31/31 x3. No doctrinal change intended.',
  },
];

const resolved = resolvePromptRule(
  'attribute-merge-prompt.md',
  'attribute-merge-rule.ts',
  ATTRIBUTE_MERGE_RULE_TEXT,
  RULE_RELEASES,
);

export const ATTRIBUTE_MERGE_RULE_FINGERPRINT = resolved.fingerprint;

/** The rule version stamped on every attribute-merge verdict, and the
 *  version the judged-pair skip compares against. */
export const ATTRIBUTE_MERGE_RULE_VERSION = resolved.version;
