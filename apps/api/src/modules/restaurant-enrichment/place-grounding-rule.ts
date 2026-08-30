import { createHash } from 'crypto';
import { buildPlaceChooserPrompt } from '../external-integrations/llm/prompts/restaurant-place-chooser.prompt';

/**
 * THE PLACE CHOOSER'S RULE, AND ITS VERSION — derived from the rule TEXT,
 * never declared beside it (H5, claim-judge-rule.ts is the pattern;
 * entity-dedupe-rule.ts and concept-satisfies-rule.ts are the sibling
 * instances; this file is the place-grounding lane's, 2026-08-13).
 *
 * The grounding judge is `choosePlaceCandidate`, and its rule is
 * `buildRestaurantPlaceChooserPrompt` — a template, like the satisfies rule.
 * What is fingerprinted is the template rendered with fixed placeholder
 * inputs and no candidates: everything that states the RULE (the error
 * economics, the identity and geography gates, stop-or-continue, brand
 * clusters, the what-the-place-is doctrine) and nothing that is per-hearing
 * DATA (the query, the source text, the candidate list).
 *
 * A grounding verdict is only re-openable if the ledger can tell WHICH rule
 * decided it: edit the chooser prompt without a bump and every remembered
 * rejection the OLD text ruled would go on suppressing re-hearings forever,
 * indistinguishable from a ruling of the new rule — on the one judgment in
 * this repo whose wrong 'select' is permanent (~$0.045 of Places spend and
 * every downstream photo/address/pin inherit it, on an entity that is never
 * deleted).
 *
 * TO CHANGE THE RULE: edit the template, run any test, read the fingerprint
 * the failure prints, and append a release with the next version and a note
 * saying what changed. That entry IS the bump — and it re-opens every
 * remembered rejection (groundings-already-executed are inert), so expect
 * re-enrichment to re-judge previously declined candidate sets.
 */

/** The rule as fingerprinted: the template with placeholder data. */
export const PLACE_GROUNDING_RULE_TEXT = buildPlaceChooserPrompt({
  query: '<QUERY>',
  sourceText: '<SOURCE_TEXT>',
  sourceLocale: { city: '<CITY>', region: '<REGION>' },
  candidates: [],
});

export const PLACE_GROUNDING_RULE_FINGERPRINT = createHash('sha256')
  .update(PLACE_GROUNDING_RULE_TEXT)
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
    fingerprint: '401cdeee6a1d',
    note: 'first ledgered grounding rule — the staged chooser (error economics, identity+geography gates, brand clusters, what-the-place-is) as it stood when the grounding lane adopted the hearing ledger',
  },
  {
    version: 2,
    fingerprint: '87b7c24515d7',
    note: 'snippets-are-samples geography doctrine (R1, the 08-20 716-decline sweep): the source market anchors, a single out-of-market snippet never vetoes a strong in-market identity match (Rudys: 1,315 Austin mentions vetoed by one NYC dive-bar snippet); named-branch-absent-but-brand-present now selects the in-market branch instead of rejecting (Easy Tiger); input grew multi-snippet source text + mention count. Re-opens every v1 remembered rejection deliberately.',
  },
];

function resolveRuleVersion(): number {
  const release = RULE_RELEASES.find(
    (entry) => entry.fingerprint === PLACE_GROUNDING_RULE_FINGERPRINT,
  );
  if (release) return release.version;
  const latest = RULE_RELEASES[RULE_RELEASES.length - 1];
  throw new Error(
    `restaurant-place-chooser.prompt.ts has fingerprint ` +
      `${PLACE_GROUNDING_RULE_FINGERPRINT}, which no entry in RULE_RELEASES ` +
      `(place-grounding-rule.ts) claims. The rule text was edited without ` +
      `being versioned, so every grounding verdict it reaches would be ` +
      `stamped v${latest.version} alongside verdicts a DIFFERENT rule ` +
      `decided. Add a release { version: ${latest.version + 1}, ` +
      `fingerprint: '${PLACE_GROUNDING_RULE_FINGERPRINT}', note: '<what changed>' } ` +
      `— and expect the bump to re-open every remembered rejection for ` +
      `re-judging on the next enrichment attempt.`,
  );
}

/**
 * The rule version stamped on every grounding verdict, and the version the
 * remembered-verdict skip compares against.
 */
export const PLACE_GROUNDING_RULE_VERSION = resolveRuleVersion();
