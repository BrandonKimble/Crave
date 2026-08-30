import { createHash } from 'crypto';

/**
 * THE WIDENING COURT'S RULES — attribute and ingredient satisfies doctrine
 * (owner ruling 2026-08-30: MERGING is same-claim identity only; WIDENING
 * owns generosity, as judged, ledgered, reversible one-hop edges).
 *
 * Same construction as concept-satisfies-rule.ts (H5): the rule IS the
 * template, the version is DERIVED from the rendered rule text against an
 * append-only release ledger, and an unversioned edit throws at import.
 *
 * ONE VERSION NUMBER SPACE across every satisfies rule. `entity_satisfies.
 * prompt_version` and the `concept_satisfies` ledger lane compare `=` on the
 * version with no kind column beside it, so per-kind numbering restarting at
 * 1 would make an attribute verdict indistinguishable from the item rule's
 * v1. The item rule owns version 1 (concept-satisfies-rule.ts); the
 * attribute rule is version 2; the ingredient rule is version 3. A future
 * release of ANY rule takes the next unused integer.
 *
 * WHY THE SAME LANE (`concept_satisfies`): the claim is literally the same
 * claim — one DIRECTED (from, to) pair of entity ids, "if the user asked for
 * A and we showed them B, would they be satisfied?". The kind is derivable
 * from the ids, the claim key is unfolded (no fold to version), and the
 * ledger's uniqueness is (lane, claim_key, rule_version, fold_version) — so
 * per-kind rule regimes coexist without collision. A second lane would mint
 * a second definition of one claim.
 */

export interface WideningPairContext {
  /** The searcher's word — the FROM side of the directed question. */
  fromName: string;
  /** What we would show them — the TO side. */
  toName: string;
  /** Real carriers of the FROM concept (places/dishes), for grounding. */
  fromCarriers: readonly string[];
  /** Real carriers of the TO concept. */
  toCarriers: readonly string[];
}

const carrierLine = (label: string, carriers: readonly string[]): string =>
  carriers.length
    ? `   (${label} in the corpus: ${carriers.slice(0, 3).join('; ')})`
    : '';

/**
 * THE ATTRIBUTE RULE — the SEARCHER-TOLERANCE TEST. This question used to
 * live inside the merge doctrine as the reason to fold near-twins; the owner
 * ruling moved it HERE: the merge court asks only "same claim?", and this
 * court owns "would the broader searcher tolerate the neighbor?".
 *
 * DIRECTED, per-direction verdicts: "asked pub, shown a place tagged only
 * bar" may answer differently from the reverse — the searcher's own word
 * sets the promise the shown thing must deliver. Extra specificity tends to
 * satisfy (asked live music → a piano bar delivers live music); LOST
 * specificity fails when the word's distinctive promise is missing (asked
 * piano bar → a venue known only for live music may have no piano).
 */
export function buildAttributeSatisfiesPrompt(
  pairs: readonly WideningPairContext[],
): string {
  return [
    `You judge search-filter tolerance for a restaurant app.`,
    `Users filter places or dishes by an attribute word. We are deciding,`,
    `once and durably, whether a place or dish tagged ONLY with a neighboring`,
    `attribute should be admitted into that filter's results.`,
    ``,
    `For EACH numbered case below, answer this DIRECTED question:`,
    `a user filtered by the ASKED attribute, and we showed them something`,
    `tagged only with the SHOWN attribute — would they feel the filter`,
    `worked, or would they feel misled?`,
    ``,
    `The asked word sets the promise; the shown thing must deliver it:`,
    `- "satisfies" — the shown tag delivers what the asked word promises.`,
    `  Extra specificity on the shown side usually delivers (asked "live`,
    `  music", shown a piano bar: live piano IS live music).`,
    `- "reject" — the asked word's distinctive promise may be missing from`,
    `  the shown thing (asked "piano bar", shown a venue tagged only "live`,
    `  music": there may be no piano; asked "iced", shown "cold": cold soup`,
    `  is not an iced drink). Also reject anything unrelated, contradictory,`,
    `  or so much broader that the filter stops meaning anything.`,
    ``,
    `Most cases settle on the promise test alone. When one genuinely does`,
    `not — the shown word neither clearly delivers nor clearly breaks the`,
    `asked promise — resolve it by asking WHAT KIND of difference separates`,
    `the two words, because the cost of a wrong answer is not symmetric:`,
    `- The words are adjacent shades of ONE quality — two textures of the`,
    `  same kind of food, two moods of a room, two vibes of a night out —`,
    `  "satisfies": someone filtering "fudgy" who gets a gooey brownie was`,
    `  handed a nearby shade of exactly the quality they asked about, and`,
    `  an adjacent extra row never reads as the filter breaking. The kind`,
    `  of difference is the same seen from either side, so BOTH directions`,
    `  of such a pair satisfy.`,
    `- The difference reaches the IDENTITY of what arrives — a different`,
    `  food or dish class, a different ingredient or preparation, a`,
    `  dietary boundary, or the temperature class of the food itself —`,
    `  "reject": "tender" is a promise about how meat turned out, while`,
    `  "soft" spans mousse, bread, and shave ice; admit either for the`,
    `  other and a wrong KIND of dish lands in the results. A wrong-food`,
    `  row poisons the filter where an adjacent-shade row merely pads it,`,
    `  so BOTH directions of such a pair reject.`,
    ``,
    `Judge THIS direction only — never assume the reverse also holds`,
    `(only the tie-break's KIND question is symmetric; the promise test is`,
    `not). Doubt that survives even the tie-break says "reject": a wrong`,
    `admission poisons the filter for every searcher; a miss only narrows`,
    `it. For each case give a one-clause reason grounded in what the`,
    `searcher would experience — never the bare verdict word restated.`,
    `Cover every input number exactly once.`,
    ``,
    `Cases:`,
    ...pairs.flatMap((pair, index) =>
      [
        `${index + 1}. asked: "${pair.fromName}" — shown: tagged only "${pair.toName}"`,
        carrierLine(`"${pair.fromName}"`, pair.fromCarriers),
        carrierLine(`"${pair.toName}"`, pair.toCarriers),
      ].filter(Boolean),
    ),
  ].join('\n');
}

/**
 * THE INGREDIENT RULE — culinary substitutability from the ASKER'S side.
 * "Asked bacon, shown a dish made with pancetta" is the type case: does the
 * shown ingredient fill the same culinary role well enough that the person
 * who asked would order the dish happily?
 */
export function buildIngredientSatisfiesPrompt(
  pairs: readonly WideningPairContext[],
): string {
  return [
    `You judge ingredient substitutability for a restaurant-search app.`,
    `Users search for dishes containing an ingredient. We are deciding, once`,
    `and durably, whether dishes made with a NEIGHBORING ingredient should be`,
    `admitted into that search's results.`,
    ``,
    `For EACH numbered case below, answer this DIRECTED question:`,
    `a user asked for dishes with the ASKED ingredient, and we showed them a`,
    `dish made with the SHOWN ingredient instead — would they order it`,
    `happily, or feel the search missed?`,
    ``,
    `- "satisfies" — the shown ingredient fills the same culinary role and`,
    `  craving (asked "bacon", shown a pancetta carbonara: cured pork belly`,
    `  either way — the craving is met).`,
    `- "reject" — a different craving, role, or flavor direction; an`,
    `  ingredient that merely belongs to the same broad family; a component`,
    `  or container relationship; or unrelated. When the asked word names a`,
    `  specific thing the shown one lacks (asked "pancetta" wanting the`,
    `  unsmoked Italian cure, shown smoked American bacon), judge from what`,
    `  the asker's word actually demands.`,
    ``,
    `Most cases settle on role-and-craving alone. When one genuinely does`,
    `not, resolve it by asking WHAT KIND of difference separates the two`,
    `ingredients — the cost of a wrong answer is not symmetric:`,
    `- A flavor or finish shade of the SAME ingredient — one smoke wood or`,
    `  cure seasoning apart, the ingredient itself unchanged (asked`,
    `  "applewood bacon", shown plain bacon: bacon either way) —`,
    `  "satisfies": the diner gets the ingredient they named, in a nearby`,
    `  shade, and an extra shade-apart dish never annoys.`,
    `- A DIFFERENT ingredient — a different animal part, cure, or`,
    `  preparation tradition, or a crossing of a dietary or temperature`,
    `  line (guanciale's cured jowl is not pancetta's belly) — "reject":`,
    `  the dish arrives made of something else, and a wrong-ingredient row`,
    `  annoys where a shade-apart row does not.`,
    ``,
    `Judge THIS direction only — never assume the reverse also holds.`,
    `Doubt that survives even the tie-break says "reject": a wrong`,
    `admission puts the wrong dish in front of`,
    `every searcher; a miss only narrows recall. For each case give a`,
    `one-clause reason grounded in the eating experience — never the bare`,
    `verdict word restated.`,
    `Cover every input number exactly once.`,
    ``,
    `Cases:`,
    ...pairs.flatMap((pair, index) =>
      [
        `${index + 1}. asked: "${pair.fromName}" — shown: a dish made with "${pair.toName}"`,
        carrierLine(`dishes with "${pair.fromName}"`, pair.fromCarriers),
        carrierLine(`dishes with "${pair.toName}"`, pair.toCarriers),
      ].filter(Boolean),
    ),
  ].join('\n');
}

/** The rules as fingerprinted: each template rendered with no cases. */
export const ATTRIBUTE_SATISFIES_RULE_TEXT = buildAttributeSatisfiesPrompt([]);
export const INGREDIENT_SATISFIES_RULE_TEXT = buildIngredientSatisfiesPrompt(
  [],
);

const fingerprintOf = (text: string): string =>
  createHash('sha256').update(text).digest('hex').slice(0, 12);

export const ATTRIBUTE_SATISFIES_RULE_FINGERPRINT = fingerprintOf(
  ATTRIBUTE_SATISFIES_RULE_TEXT,
);
export const INGREDIENT_SATISFIES_RULE_FINGERPRINT = fingerprintOf(
  INGREDIENT_SATISFIES_RULE_TEXT,
);

interface RuleRelease {
  version: number;
  fingerprint: string;
  kind: 'attribute' | 'ingredient';
  note: string;
}

/**
 * Append-only, oldest first. Versions 2 and 3 — version 1 is the item rule's
 * (concept-satisfies-rule.ts), and the one number space is deliberate (see
 * the file header).
 */
const RULE_RELEASES: readonly RuleRelease[] = [
  {
    version: 2,
    fingerprint: '52b7602d0396',
    kind: 'attribute',
    note: 'the searcher-tolerance test, moved out of the merge doctrine — directed, per-direction verdicts, doubt rejects, evidence reasons required',
  },
  {
    version: 3,
    fingerprint: '1ed240702576',
    kind: 'ingredient',
    note: 'culinary substitutability from the asker’s side — directed, same-role-same-craving satisfies, doubt rejects, evidence reasons required',
  },
  {
    version: 4,
    fingerprint: 'd63255f146bb',
    kind: 'attribute',
    note: 'the tie-break law (owner ruling 2026-08-30): genuine uncertainty resolves by the KIND of difference — same-domain adjacency (texture/mood/vibe shades) satisfies both ways, identity/cross-domain differences reject both ways',
  },
  {
    version: 5,
    fingerprint: '53c9ee96e664',
    kind: 'ingredient',
    note: 'the tie-break law (owner ruling 2026-08-30): genuine uncertainty resolves by the KIND of difference — a shade of the same ingredient satisfies, a different ingredient/cut/cure/tradition rejects',
  },
];

function resolveRuleVersion(
  kind: 'attribute' | 'ingredient',
  fingerprint: string,
): number {
  const release = RULE_RELEASES.find(
    (entry) => entry.kind === kind && entry.fingerprint === fingerprint,
  );
  if (release) return release.version;
  const latest = RULE_RELEASES[RULE_RELEASES.length - 1];
  throw new Error(
    `The ${kind} satisfies rule template has fingerprint ${fingerprint}, ` +
      `which no entry in RULE_RELEASES (widening-satisfies-rule.ts) claims. ` +
      `The rule text was edited without being versioned. Add a release ` +
      `{ version: ${latest.version + 1}, fingerprint: '${fingerprint}', ` +
      `kind: '${kind}', note: '<what changed>' } — and expect the bump to ` +
      `make every judged (from, to) pair of that kind due a re-hearing, ` +
      `which must be estimated before it drains.`,
  );
}

export const ATTRIBUTE_SATISFIES_PROMPT_VERSION = resolveRuleVersion(
  'attribute',
  ATTRIBUTE_SATISFIES_RULE_FINGERPRINT,
);
export const INGREDIENT_SATISFIES_PROMPT_VERSION = resolveRuleVersion(
  'ingredient',
  INGREDIENT_SATISFIES_RULE_FINGERPRINT,
);
