import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * THE DEDUPE JUDGE'S RULE, AND ITS VERSION — derived from the rule TEXT,
 * never declared beside it (H5, claim-judge-rule.ts is the pattern; this file
 * is the dedupe lane's instance, 2026-08-12).
 *
 * The dedupe judge is `matchEntitiesBatch`, and its rule is the entity-match
 * prompt asset — the ONE canonical text both the single and batch transports
 * render (entity-match-prompt.ts). A dedupe verdict is only re-openable if
 * the ledger can tell WHICH rule decided it: edit the prompt without a bump
 * and every 'hold' the OLD text ruled would go on being skipped by nightly
 * re-scans forever, indistinguishable from a ruling of the new rule.
 *
 * So the text is the source. Its fingerprint is computed at load and looked
 * up in the ledger below; an UNLISTED fingerprint fails loudly here rather
 * than quietly mis-stamping verdicts.
 *
 * TO CHANGE THE RULE: edit prompts/entity-match-prompt.md, run any test, read
 * the fingerprint the failure prints, and append a release with the next
 * version and a note saying what changed. That entry IS the bump — and it
 * re-opens every judged pair (both merges-already-executed, which are inert,
 * and holds, which become due a re-hearing), so expect the population to need
 * estimating before a drain.
 *
 * NOTE the transport envelopes (entity-match-prompt.ts) are deliberately NOT
 * in the fingerprint: they state request/response plumbing, not the judgment,
 * and the file's own contract forbids them from carrying a rule.
 */

/** The rule, as the canonical .md asset. __dirname-relative like every
 *  prompt load — resolves under both src (ts-jest) and dist (nest-cli
 *  copies prompts/*.md as assets). */
export const ENTITY_DEDUPE_RULE_TEXT = readFileSync(
  join(
    __dirname,
    '../../external-integrations/llm/prompts/entity-match-prompt.md',
  ),
  'utf8',
);

export const ENTITY_DEDUPE_RULE_FINGERPRINT = createHash('sha256')
  .update(ENTITY_DEDUPE_RULE_TEXT)
  .digest('hex')
  .slice(0, 12);

interface RuleRelease {
  version: number;
  fingerprint: string;
  /** What this version of the rule decided differently, in one line. */
  note: string;
}

/**
 * THE VERSION LEDGER — append-only, oldest first. An old fingerprint stays
 * listed because verdicts stamped with its version are still in the corpus
 * and their ground has to remain legible.
 */
const RULE_RELEASES: readonly RuleRelease[] = [
  {
    version: 1,
    fingerprint: 'c80052ba5a9e',
    note: 'first ledgered dedupe rule — the canonical entity-match text (cost-asymmetry framing, alias evidence, fail-closed to new) as it stood when the dedupe lane adopted the hearing ledger',
  },
];

function resolveRuleVersion(): number {
  const release = RULE_RELEASES.find(
    (entry) => entry.fingerprint === ENTITY_DEDUPE_RULE_FINGERPRINT,
  );
  if (release) return release.version;
  const latest = RULE_RELEASES[RULE_RELEASES.length - 1];
  throw new Error(
    `entity-match-prompt.md has fingerprint ${ENTITY_DEDUPE_RULE_FINGERPRINT}, ` +
      `which no entry in RULE_RELEASES (entity-dedupe-rule.ts) claims. The rule ` +
      `text was edited without being versioned, so every dedupe verdict it ` +
      `reaches would be stamped v${latest.version} alongside verdicts a ` +
      `DIFFERENT rule decided. Add a release { version: ${latest.version + 1}, ` +
      `fingerprint: '${ENTITY_DEDUPE_RULE_FINGERPRINT}', note: '<what changed>' } ` +
      `— and expect the bump to make every judged pair due a re-hearing, which ` +
      `must be estimated before it drains.`,
  );
}

/**
 * The rule version stamped on every dedupe verdict, and the version the
 * judged-pair skip compares against.
 */
export const ENTITY_DEDUPE_RULE_VERSION = resolveRuleVersion();
