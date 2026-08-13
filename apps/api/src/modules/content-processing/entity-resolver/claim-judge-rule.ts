import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * THE JUDGE'S RULE, AND ITS VERSION — derived from the rule TEXT, never
 * declared beside it (H5, 2026-08-12).
 *
 * A verdict is only re-openable if the corpus can tell WHICH rule decided it,
 * and the version number is the lever that re-opens a whole population at
 * once. While that number was a hand-maintained constant sitting in a service
 * file, it could disagree with the rule it claimed to name in the one
 * direction that silently corrupts the memory: edit the prompt, forget the
 * bump, and every verdict decided under the OLD text is now indistinguishable
 * from one decided under the new — permanently, because the due-predicate
 * reads the version and sees nothing owed.
 *
 * So the text is the source. Its fingerprint is computed at load and looked up
 * in the ledger below; an UNLISTED fingerprint is a rule nobody versioned, and
 * it fails loudly here rather than quietly mis-stamping verdicts. The human
 * number survives — a version is a thing people talk about, and a bare hash
 * makes "bump the rule" unspeakable — but it is now a claim the ledger has to
 * back, not a number anyone can drift.
 *
 * TO CHANGE THE RULE: edit the .md, run any test, read the fingerprint the
 * failure prints, and add a ledger entry with the next version and a note
 * saying what changed and why. That entry IS the bump — and per H5 amendment
 * (b) it re-opens a population whose re-hearing must then be estimated and
 * approved before it drains (ClaimRehearingBudget).
 */

/** The rule, as a versioned .md asset. __dirname-relative like every prompt
 *  load — resolves under both src (ts-jest) and dist (nest-cli copies
 *  prompts/*.md as assets). */
export const CLAIM_JUDGE_PROMPT = readFileSync(
  join(
    __dirname,
    '../../external-integrations/llm/prompts/claim-judge-prompt.md',
  ),
  'utf8',
);

export const CLAIM_JUDGE_RULE_FINGERPRINT = createHash('sha256')
  .update(CLAIM_JUDGE_PROMPT)
  .digest('hex')
  .slice(0, 12);

interface RuleRelease {
  version: number;
  fingerprint: string;
  /** What this version of the rule decided differently, in one line. */
  note: string;
}

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

function resolveRuleVersion(): number {
  const release = RULE_RELEASES.find(
    (entry) => entry.fingerprint === CLAIM_JUDGE_RULE_FINGERPRINT,
  );
  if (release) return release.version;
  const latest = RULE_RELEASES[RULE_RELEASES.length - 1];
  throw new Error(
    `claim-judge-prompt.md has fingerprint ${CLAIM_JUDGE_RULE_FINGERPRINT}, ` +
      `which no entry in RULE_RELEASES claims. The rule text was edited ` +
      `without being versioned, so every verdict it reaches would be stamped ` +
      `v${latest.version} alongside verdicts a DIFFERENT rule decided. Add a ` +
      `release { version: ${latest.version + 1}, fingerprint: ` +
      `'${CLAIM_JUDGE_RULE_FINGERPRINT}', note: '<what changed>' } in ` +
      `claim-judge-rule.ts — and expect the bump to make a population of past ` +
      `verdicts due a re-hearing, which must be estimated and approved.`,
  );
}

/**
 * The rule version stamped on every verdict this judge reaches, and the
 * version the due-predicate compares against.
 */
export const CLAIM_JUDGE_PROMPT_VERSION = resolveRuleVersion();
