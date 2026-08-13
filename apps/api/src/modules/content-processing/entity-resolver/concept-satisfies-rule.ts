import { createHash } from 'crypto';

/**
 * THE SATISFIES JUDGE'S RULE, AND ITS VERSION — derived from the rule TEXT,
 * never declared beside it (H5, claim-judge-rule.ts is the pattern; this file
 * is the satisfies lane's instance, 2026-08-12).
 *
 * `SATISFIES_PROMPT_VERSION` was a hand-maintained constant in the service —
 * exactly the drift H5 names: edit the prompt, forget the bump, and every
 * verdict decided under the OLD text becomes indistinguishable from one the
 * new text decided, permanently, because both the `entity_satisfies`
 * exclusion and the `knowledge_pass_runs` watermark compare `=` on it.
 *
 * The rule here is not an .md asset — it is `buildSatisfiesPrompt`, a
 * template. What is fingerprinted is the template rendered with a fixed
 * placeholder anchor and no candidates: everything that states the RULE (the
 * directed question, the three verdict definitions, the direction and
 * protein/form doctrine) and nothing that is per-hearing DATA (the anchor's
 * name, the candidate list).
 *
 * TO CHANGE THE RULE: edit the template below, run any test, read the
 * fingerprint the failure prints, and append a release with the next version
 * and a note. That entry IS the bump — and it makes every judged (from, to)
 * pair due again, so expect the population to need estimating before a
 * drain.
 */

export interface SatisfiesCandidate {
  entityId: string;
  name: string;
}

/**
 * THE SUBSTITUTABILITY PROMPT. Directed, and strict on `satisfies` only where
 * strictness is cheap: a miss costs recall (recoverable), while a wrong
 * `satisfies` puts the wrong food in the FRONT section where the Crave Score
 * can rank it first.
 */
export function buildSatisfiesPrompt(
  anchorName: string,
  batch: readonly SatisfiesCandidate[],
): string {
  return [
    `A user searched for "${anchorName}" in a restaurant app.`,
    `For EACH numbered candidate below, answer this DIRECTED question:`,
    `if the user asked for "${anchorName}" and we showed them that candidate`,
    `instead, would they be satisfied?`,
    ``,
    `Answer with exactly one verdict per candidate:`,
    `- "satisfies" — yes. The same thing, a variant of it, or another name for it.`,
    `- "cousin" — no, but it is a reasonable "similar" suggestion: same family,`,
    `  different craving (a swapped protein, a changed form, a different flavour`,
    `  direction).`,
    `- "reject" — not a substitute at all: an INGREDIENT or component of it, a`,
    `  BROAD CATEGORY that merely contains it, or unrelated.`,
    ``,
    `Answer for THIS direction only — do not assume the reverse also holds.`,
    `A swapped protein or a changed form (pizza vs ramen vs pancake) is a`,
    `cousin, never "satisfies".`,
    `Cover every input number exactly once.`,
    ``,
    `Candidates:`,
    ...batch.map((candidate, index) => `${index + 1}. ${candidate.name}`),
  ].join('\n');
}

/** The rule as fingerprinted: the template with placeholder data. */
export const SATISFIES_RULE_TEXT = buildSatisfiesPrompt('<ANCHOR>', []);

export const SATISFIES_RULE_FINGERPRINT = createHash('sha256')
  .update(SATISFIES_RULE_TEXT)
  .digest('hex')
  .slice(0, 12);

interface RuleRelease {
  version: number;
  fingerprint: string;
  /** What this version of the rule decided differently, in one line. */
  note: string;
}

/**
 * THE VERSION LEDGER — append-only, oldest first. Version 1 is the text the
 * hand constant `SATISFIES_PROMPT_VERSION = 1` always named; listing its
 * fingerprint pins the number to the text so neither can drift alone. The
 * value is unchanged, so nothing already judged comes due from this move.
 */
const RULE_RELEASES: readonly RuleRelease[] = [
  {
    version: 1,
    fingerprint: '5b5114d22de9',
    note: 'the original directed-substitutability rule — satisfies/cousin/reject, swapped-protein-is-cousin, ingredient/category are rejects',
  },
];

function resolveRuleVersion(): number {
  const release = RULE_RELEASES.find(
    (entry) => entry.fingerprint === SATISFIES_RULE_FINGERPRINT,
  );
  if (release) return release.version;
  const latest = RULE_RELEASES[RULE_RELEASES.length - 1];
  throw new Error(
    `The satisfies rule template has fingerprint ${SATISFIES_RULE_FINGERPRINT}, ` +
      `which no entry in RULE_RELEASES (concept-satisfies-rule.ts) claims. The ` +
      `rule text was edited without being versioned, so every verdict it ` +
      `reaches would be stamped v${latest.version} alongside verdicts a ` +
      `DIFFERENT rule decided. Add a release { version: ${latest.version + 1}, ` +
      `fingerprint: '${SATISFIES_RULE_FINGERPRINT}', note: '<what changed>' } — ` +
      `and expect the bump to make every judged pair due a re-hearing, which ` +
      `must be estimated before it drains.`,
  );
}

/**
 * The version stamped on every satisfies verdict, run row and
 * `entity_satisfies` edge, and the version every watermark compares against.
 */
export const SATISFIES_PROMPT_VERSION = resolveRuleVersion();
