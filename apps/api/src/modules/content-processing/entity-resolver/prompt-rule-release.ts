import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * A RULE'S VERSION IS DERIVED FROM ITS TEXT, NEVER DECLARED BESIDE IT.
 *
 * This is `claim-judge-rule.ts`'s law, extracted the moment a SECOND lane
 * needed it (the judged-vocabulary lanes, 2026-08-13) — because the failure
 * it prevents is not specific to word ownership. A verdict is only re-openable
 * if the corpus can say WHICH rule decided it, and while that number is a
 * hand-maintained constant it can disagree with the rule it names in the one
 * direction that silently corrupts the memory: edit the prompt, forget the
 * bump, and every verdict decided under the OLD text becomes indistinguishable
 * from one decided under the new — permanently, because the due-predicate
 * reads the version and sees nothing owed.
 *
 * So the text is the source. Its fingerprint is computed at load and looked up
 * in the caller's append-only release ledger; an UNLISTED fingerprint is a rule
 * nobody versioned, and it fails loudly here rather than quietly mis-stamping
 * verdicts. The human number survives — a version is a thing people talk about,
 * and a bare hash makes "bump the rule" unspeakable — but it is a claim the
 * ledger has to back, not a number anyone can drift.
 *
 * TO CHANGE A RULE: edit the .md, run any test, read the fingerprint the
 * failure prints, and append a release with the next version and a note saying
 * what changed. That entry IS the bump — and per H5 amendment (b) it re-opens
 * a population whose re-hearing must be estimated and approved before it
 * drains (ClaimRehearingBudget).
 */
export interface RuleRelease {
  version: number;
  /** Empty for releases that predate fingerprinting and are unrecoverable. */
  fingerprint: string;
  /** What this version of the rule decided differently, in one line. */
  note: string;
}

export interface ResolvedPromptRule {
  /** The rule text itself, as loaded. */
  prompt: string;
  /** Its sha256 prefix — what the release ledger indexes. */
  fingerprint: string;
  /** The human version stamped on every verdict this rule reaches. */
  version: number;
}

/** Prompt assets live in one directory and are loaded __dirname-relative like
 *  every other prompt read, so the same code resolves under src (ts-jest) and
 *  dist (nest-cli copies prompts/*.md as build assets). */
export function readPromptAsset(fromDir: string, fileName: string): string {
  return readFileSync(
    join(fromDir, '../../external-integrations/llm/prompts', fileName),
    'utf8',
  );
}

export function fingerprintOf(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 12);
}

/**
 * Resolve a prompt's version from its own text. Throws — loudly, naming the
 * exact release entry to add — when the text is not one the ledger claims.
 */
export function resolvePromptRule(
  ruleName: string,
  sourceFile: string,
  prompt: string,
  releases: readonly RuleRelease[],
): ResolvedPromptRule {
  const fingerprint = fingerprintOf(prompt);
  const release = releases.find((entry) => entry.fingerprint === fingerprint);
  if (release) {
    return { prompt, fingerprint, version: release.version };
  }
  const latest = releases[releases.length - 1];
  throw new Error(
    `${ruleName} has fingerprint ${fingerprint}, which no entry in its ` +
      `release ledger claims. The rule text was edited without being ` +
      `versioned, so every verdict it reaches would be stamped ` +
      `v${latest.version} alongside verdicts a DIFFERENT rule decided. Add a ` +
      `release { version: ${latest.version + 1}, fingerprint: ` +
      `'${fingerprint}', note: '<what changed>' } in ${sourceFile} — and ` +
      `expect the bump to make a population of past verdicts due a ` +
      `re-hearing, which must be estimated and approved.`,
  );
}
