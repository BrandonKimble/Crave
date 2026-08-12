/**
 * @script-class: probe
 *   (probe, not 'gate': 'gate' is the repo-root shell-script vocabulary; in
 *   apps/api/scripts the F414 taxonomy is operational/probe/scratch, and this
 *   is the same species as run-launch-gate and autocomplete-flow-gate — a
 *   re-runnable measurement instrument whose value is the recorded verdict.)
 *
 * ENTITY RESOLUTION GATE — the falsifiability engine for the grounding tiers
 * (exact / alias) of `EntityResolutionService`.
 *
 * WHY IT EXISTS. The alias tier is the ONE place a mention becomes an entity
 * at confidence 0.95, and until now it had no behavioural gate at all: its
 * only coverage was unit specs over mocked Prisma, which cannot see the
 * difference between `aliases: { hasSome: [...] }` (a CASE-SENSITIVE Postgres
 * array overlap) and a fold-symmetric surface lookup. That difference is a
 * real recall cliff — "santo taco" typed in a review does not match the banked
 * surface "Santo Taco" today — and the `core_entities.aliases[]` retirement
 * (plans/concept-graph.md §11 item 4 / I-2) moves the tier onto
 * `entity_surface.form_folded`, which fixes it. A behaviour change with no
 * instrument is a guess, so the instrument lands FIRST, green against the
 * pre-surgery code, with every expected flip declared in advance.
 *
 * HOW IT DRIVES. Each fixture is a (type, mention) pair pushed through the
 * LIVE `EntityResolutionService.resolveBatch` with
 * `{ allowEntityCreation: false, enableFuzzyMatching: false, useLlmMatcher: false }`
 * — the exact+alias tiers only. That configuration is READ-ONLY (nothing is
 * created) and LLM-FREE (deterministic, no spend). The resolution cache is
 * bypassed by minting a per-run `ENTITY_RESOLUTION_CACHE_VERSION` before the
 * Nest context boots — otherwise a 900s Redis entry from the previous run
 * would answer for the code under test.
 *
 * HOW IT ASSERTS. Every fixture declares `expect` — `{ entity, tier }`, or
 * `{ entity: null, tier: 'unmatched' }` for a mention that must ground
 * nothing. Anything else is RED.
 *
 * THE RECORDED FLIP. This file first landed against the PRE-surgery code, with
 * the ten `fold-*` fixtures declared as known-different, and it read
 * `green=37 red=0 pre-surgery=10`. After the surgery the same file read
 * `green=47 red=0` — all ten flipped to the right entity, and NOT ONE other
 * fixture moved, which is exactly the claim "the fold widens matching and
 * loosens nothing". That two-run diff is the evidence; the temporary
 * declaration that produced it is gone, because a mechanism kept for a change
 * that already happened is residue.
 *
 * WHAT THE FIXTURES COVER (47 of the 49 verified against the live dev corpus in
 * SQL before being written down — names, surfaces, locales and statuses; the
 * other two are seeded, see below):
 *   - exact tier: canonical names, case-insensitive names, number variants,
 *     and two strings that are BOTH an entity name and another entity's
 *     surface (the exact tier must win);
 *   - alias tier, byte-identical surface: works today, must keep working;
 *   - alias tier, CASE/PUNCTUATION/ACCENT variant of a banked surface: the
 *     fold-only wins, unreachable before the surgery;
 *   - near misses (one character short of a real surface, a proper prefix of
 *     one, pure gibberish): must resolve to NOTHING, before and after — the
 *     fold must widen matching, never loosen it;
 *   - LOCALE SCOPE: `es`-tagged surfaces must NOT ground an untagged mention.
 *     The array this tier reads today is und-only BY CONSTRUCTION
 *     (`projectAliases`), and the replacement read must keep that scope — a
 *     locale-tagged form grounding an untagged request is the F2 bug the
 *     gazetteer already removed its legacy-array arm to fix. Includes a
 *     `deprecated` es row, which must be inert on both axes.
 *
 * THE TWO FIXTURES THIS GATE SEEDS, AND WHY (2026-08-09). Two predicates the
 * tier depends on were UNFALSIFIABLE against the corpus as it stands, and an
 * assertion nothing can break is not coverage:
 *
 *   - `role <> 'display'`. The und slice is 100% `role='recall'` today, so no
 *     und mention could reach a display row: deleting the predicate from the
 *     SQL left this file 47/47 GREEN. (The docstring used to claim the es
 *     fixtures covered it. They cannot — this tier is und-only, so an es row
 *     is refused on LOCALE before role is ever consulted, and the fixture
 *     passes for the wrong reason.)
 *   - THE FOLD ITSELF. Every fold-* fixture types the DE-accented spelling, so
 *     `toLowerCase()` and `canonicalFold()` agree on the probe and the
 *     mutation is invisible. The fold exists for the mention that CARRIES the
 *     accent.
 *
 * Neither had a corpus row that could show RED, so the gate creates them:
 * ONE clearly-namespaced scratch food (`zzgate scratch concept`) carrying an
 * und/active/role='display' surface and an und/active/role='recall' surface
 * whose folded key differs from its verbatim form. The seed is idempotent and
 * the rows are LEFT in place — they are inspectable in SQL like every other
 * fixture here, and `zzgate` collides with nothing a user can type. This is
 * the one thing this probe writes; everything else is read-only.
 *
 * Run: npx ts-node -T scripts/search-harness/entity-resolution-gate.ts
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';
// Bypass the 900s entity-resolution cache: a per-run version namespaces this
// gate's keys away from every other reader AND from its own previous run, so
// the assertions always describe the CODE, never a cached verdict.
process.env.ENTITY_RESOLUTION_CACHE_VERSION = `gate-${Date.now()}`;

import { EntityType } from '@prisma/client';
import { bootstrap, out } from './_shared';
import { EntityResolutionService } from '../../src/modules/content-processing/entity-resolver/entity-resolution.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { canonicalFold } from '../../src/modules/content-processing/entity-resolver/entity-identity';

type Tier = 'exact' | 'alias' | 'fuzzy' | 'dense' | 'new' | 'unmatched';

interface Outcome {
  /** Canonical entity NAME the mention must ground to; null = grounds nothing. */
  entity: string | null;
  tier: Tier;
}

interface Fixture {
  id: string;
  type: EntityType;
  /** The mention as it would arrive from extraction (already normalized). */
  mention: string;
  /**
   * The language of the SOURCE DOCUMENT the mention was read out of
   * (`collection_source_documents.language`). Omit for the locale-less
   * caller: the scope is then `['und']`, which is the und-only slice these
   * fixtures were written against and must keep describing.
   */
  documentLocale?: string;
  /** The ideal — and post-surgery — outcome. */
  expect: Outcome;
  note: string;
}

const UNMATCHED: Outcome = { entity: null, tier: 'unmatched' };

/** The seeded scratch concept (see the header). */
const SCRATCH_ENTITY_ID = '2222220a-0000-4000-8000-00000000d15b';
const SCRATCH_NAME = 'zzgate scratch concept';
/** und + active + role='display' — a label, refused for recall. */
const SCRATCH_DISPLAY_FORM = 'zzgate refused word';
/** und + active + role='recall', banked WITHOUT the accent the user types. */
const SCRATCH_FOLD_FORM = 'zzgate creme brulee';
const SCRATCH_FOLD_MENTION = 'zzgate crème brûlée';
/**
 * en + active + role='recall' — a form banked EXACTLY as the VOCABULARY
 * GENERATOR banks one: the answer to a per-language question ("what is this
 * called in English?"), which is the only kind of writer allowed to put a
 * language on a row. It must be visible to an English document's grounding
 * and invisible to a Vietnamese one — that is the locale-chain READ, and the
 * read is what these two fixtures certify.
 *
 * IT WAS SEEDED source='extraction' FOR ONE DAY, and that was the write flip
 * this gate briefly certified: extraction observes a string without knowing
 * its language, so it tags nothing (see the three banking sites in
 * unified-processing.service.ts). The fixture keeps its job — an 'en' row is
 * reachable by en and not by vi — under a writer that can actually mint one.
 */
const SCRATCH_EN_FORM = 'zzgate freshly banked word';

const FIXTURES: Fixture[] = [
  // ── Tier 1: exact name ──────────────────────────────────────────────────
  {
    id: 'ex-01',
    type: EntityType.food,
    mention: 'taco',
    expect: { entity: 'taco', tier: 'exact' },
    note: 'canonical food name',
  },
  {
    id: 'ex-02',
    type: EntityType.food,
    mention: 'tacos',
    expect: { entity: 'tacos', tier: 'exact' },
    note: 'the plural is its own entity here; exact spelling wins over the number variant',
  },
  {
    id: 'ex-03',
    type: EntityType.food,
    mention: 'crudos',
    expect: { entity: 'crudo', tier: 'exact' },
    note: 'NUMBER VARIANT: no "crudos" entity, so the exact tier probes foodNameVariants and lands on the singular. Also a live counter-example to the locale block below — "crudos" IS an es surface of the same concept, and the exact tier reaches it FIRST by morphology, not by locale leak',
  },
  {
    id: 'ex-04',
    type: EntityType.restaurant,
    mention: 'peter luger steak house',
    expect: { entity: 'Peter Luger Steak House', tier: 'exact' },
    note: 'restaurant name, case-insensitive (the name arm is already fold-blind to case)',
  },
  {
    id: 'ex-05',
    type: EntityType.food,
    mention: 'cheong fun',
    expect: { entity: 'cheong fun', tier: 'exact' },
    note: 'string is BOTH an entity name and a surface of "bbq pork rice roll" — the exact tier must win',
  },
  {
    id: 'ex-06',
    type: EntityType.food,
    mention: 'ankimo',
    expect: { entity: 'ankimo', tier: 'exact' },
    note: 'same collision shape as ex-05 ("monkfish liver" banks "ankimo" as a surface)',
  },

  // ── Tier 2: alias, byte-identical banked surface (green today) ──────────
  {
    id: 'al-01',
    type: EntityType.food,
    mention: 'char siu',
    expect: { entity: 'bbq pork', tier: 'alias' },
    note: 'cross-language culinary co-name banked as an und surface',
  },
  {
    id: 'al-02',
    type: EntityType.food,
    mention: 'latke',
    expect: { entity: 'latka', tier: 'alias' },
    note: 'spelling variant banked as a surface',
  },
  {
    id: 'al-03',
    type: EntityType.food,
    mention: 'buffalo wings',
    expect: { entity: 'wings', tier: 'alias' },
    note: 'qualified form grounds the bare concept',
  },
  {
    id: 'al-04',
    type: EntityType.food,
    mention: 'hong shao rou',
    expect: { entity: 'red braised pork', tier: 'alias' },
    note: 'romanized co-name',
  },
  {
    id: 'al-05',
    type: EntityType.food,
    mention: 'danbauk',
    expect: { entity: 'burmese biryani', tier: 'alias' },
    note: 'romanized co-name, single token',
  },
  {
    id: 'al-06',
    type: EntityType.food,
    mention: 'tacos al pastor',
    expect: { entity: 'al pastor tacos', tier: 'alias' },
    note: 'word-order variant banked as a surface',
  },
  {
    id: 'al-07',
    type: EntityType.restaurant,
    mention: 'coopers',
    expect: { entity: "Cooper's Old Time Pit Bar-B-Que", tier: 'alias' },
    note: 'short colloquial restaurant name',
  },
  {
    id: 'al-08',
    type: EntityType.restaurant,
    mention: 'russ and daughters',
    expect: { entity: 'Russ & Daughters', tier: 'alias' },
    note: 'ampersand spelled out',
  },
  {
    id: 'al-09',
    type: EntityType.restaurant,
    mention: 'bonjuk',
    expect: { entity: 'Bonjuk New York', tier: 'alias' },
    note: 'city suffix dropped',
  },
  // al-10..al-14 and fold-05/07/10 expect tier 'exact' since f1e1770d4:
  // the deterministic identity-key tier claims fold-equal names BEFORE the
  // surface/alias tier — same entity, earlier (cheaper, deterministic) tier.
  {
    id: 'al-10',
    type: EntityType.restaurant,
    mention: 'miladys',
    expect: { entity: "Milady's", tier: 'exact' },
    note: 'possessive apostrophe dropped',
  },
  {
    id: 'al-11',
    type: EntityType.restaurant,
    mention: 'despana',
    expect: { entity: 'Despaña', tier: 'exact' },
    note: 'de-accented spelling ALREADY banked verbatim as an und surface',
  },
  {
    id: 'al-12',
    type: EntityType.restaurant,
    mention: 'lysee',
    expect: { entity: 'Lysée', tier: 'exact' },
    note: 'as al-11',
  },
  {
    id: 'al-13',
    type: EntityType.restaurant,
    mention: 'cesar',
    expect: { entity: 'César', tier: 'exact' },
    note: 'as al-11',
  },
  {
    id: 'al-14',
    type: EntityType.restaurant,
    mention: 'rezdora',
    expect: { entity: 'Rezdôra', tier: 'exact' },
    note: 'as al-11 (circumflex)',
  },

  // ── Tier 2: FOLD-ONLY wins — the surgery's behaviour change ─────────────
  // Each of these has a banked und surface that differs from the mention ONLY
  // by case, punctuation or accent. Under the retired `aliases && ARRAY[...]`
  // overlap (byte-exact) they ground NOTHING; on `form_folded` equality they
  // ground correctly. All ten flipped from unmatched to the right entity when
  // the surgery landed, and every other fixture in this file held — that run
  // IS the evidence for the change, and these ten are now plain assertions.
  {
    id: 'fold-01',
    type: EntityType.restaurant,
    mention: 'santo taco',
    expect: { entity: 'Santo Taco SoHo', tier: 'alias' },
    note: 'banked surface "Santo Taco" — case only',
  },
  {
    id: 'fold-02',
    type: EntityType.restaurant,
    mention: 'lugers',
    expect: { entity: 'Peter Luger Steak House', tier: 'alias' },
    note: 'banked surface "Lugers" — case only',
  },
  {
    id: 'fold-03',
    type: EntityType.restaurant,
    mention: 'cannelle',
    expect: { entity: 'Cannelle Patisserie', tier: 'alias' },
    note: 'banked surface "Cannelle" — case only',
  },
  {
    id: 'fold-04',
    type: EntityType.restaurant,
    mention: 'villabate',
    expect: { entity: 'Villabate Alba', tier: 'alias' },
    note: 'banked surface "Villabate" — case only',
  },
  {
    id: 'fold-05',
    type: EntityType.restaurant,
    mention: 'joes shanghai',
    expect: { entity: "Joe's Shanghai", tier: 'exact' },
    note: 'banked surface "Joes Shanghai" — case only',
  },
  {
    id: 'fold-06',
    type: EntityType.restaurant,
    mention: 'lloyds',
    expect: { entity: "Lloyd's Carrot Cake", tier: 'alias' },
    note: 'banked surface "Lloyds" — case only',
  },
  {
    id: 'fold-07',
    type: EntityType.restaurant,
    mention: 'jean georges',
    expect: { entity: 'Jean-Georges', tier: 'exact' },
    note: 'banked surface "Jean Georges" — case only (the hyphenated NAME is not reachable by the exact tier)',
  },
  {
    id: 'fold-08',
    type: EntityType.restaurant,
    mention: 'sarges deli',
    expect: { entity: 'Sarge’s Delicatessen & Diner', tier: 'alias' },
    note: 'banked surface "Sarges Deli" — case only',
  },
  {
    id: 'fold-09',
    type: EntityType.restaurant,
    mention: 'chefs table',
    expect: { entity: "The Chef's Table at Brooklyn Fare", tier: 'alias' },
    note: 'banked surface "Chefs Table" — case only',
  },
  {
    id: 'fold-10',
    type: EntityType.restaurant,
    mention: 'cathedrale restaurant',
    expect: { entity: 'Cathédrale Restaurant', tier: 'exact' },
    note: 'banked surface "Cathédrale Restaurant" — ACCENT, the case the fold exists for',
  },

  // ── Near misses: must ground NOTHING, before and after ──────────────────
  {
    id: 'miss-01',
    type: EntityType.food,
    mention: 'zzqxfoodthing',
    expect: UNMATCHED,
    note: 'gibberish',
  },
  {
    id: 'miss-02',
    type: EntityType.restaurant,
    mention: 'totally fake diner xyz',
    expect: UNMATCHED,
    note: 'plausible-shaped but absent restaurant',
  },
  {
    id: 'miss-03',
    type: EntityType.food,
    mention: 'char si',
    expect: UNMATCHED,
    note: 'one character short of the al-01 surface — the fold is equality, not fuzz',
  },
  {
    id: 'miss-04',
    type: EntityType.restaurant,
    mention: 'cooper',
    expect: UNMATCHED,
    note: 'proper prefix of the al-07 surface — containment must not ground',
  },
  {
    id: 'miss-05',
    type: EntityType.food,
    mention: 'latk',
    expect: UNMATCHED,
    note: 'truncation of the al-02 surface',
  },
  {
    id: 'miss-06',
    type: EntityType.restaurant,
    mention: 'villabat',
    expect: UNMATCHED,
    note: 'truncation of the fold-04 surface — the fold-only win must not spill onto prefixes',
  },
  {
    id: 'miss-07',
    type: EntityType.food,
    mention: 'ankim',
    expect: UNMATCHED,
    note: 'truncation of an ex-06 name/surface collision',
  },

  // ── The two seeded predicates (see header) ──────────────────────────────
  {
    id: 'role-01',
    type: EntityType.food,
    mention: SCRATCH_DISPLAY_FORM,
    expect: UNMATCHED,
    note: "an und + ACTIVE + role=display surface: a label, or a recall claim the guard refused. Grounding it would resurrect exactly the claim that lost — this fixture is RED the moment `role <> 'display'` leaves the SQL",
  },
  {
    id: 'fold-11',
    type: EntityType.food,
    mention: SCRATCH_FOLD_MENTION,
    expect: { entity: SCRATCH_NAME, tier: 'alias' },
    note: 'the user TYPES the accents, the surface is banked without them — the fold is the only thing that matches them, so lower()-ing the probe REDs this',
  },

  // ── Locale scope: es surfaces must not ground an untagged mention ───────
  {
    id: 'loc-01',
    type: EntityType.food,
    mention: 'makis',
    expect: UNMATCHED,
    note: 'es surface of "sushi roll" (role=recall) — untagged tier must not see it',
  },
  {
    id: 'loc-02',
    type: EntityType.food,
    mention: 'tacos de panceta',
    expect: UNMATCHED,
    note: 'es surface of "pork belly taco" (role=recall), multiword',
  },
  {
    id: 'loc-08',
    type: EntityType.food,
    mention: 'burrito de carne',
    expect: UNMATCHED,
    note: 'es surface of "beef burrito" with role=BOTH — a row that DOES claim recall, refused here purely on locale',
  },
  {
    id: 'loc-09',
    type: EntityType.food,
    mention: 'papas fritas',
    expect: UNMATCHED,
    note: 'es surface of "fries" with role=DISPLAY — refused on locale AND on role; the only role=display coverage the corpus can offer (the und slice has none)',
  },
  {
    id: 'loc-10',
    type: EntityType.food_attribute,
    mention: 'mantecosa',
    expect: UNMATCHED,
    note: 'es surface of the "buttery" attribute — attributes travel the same tier',
  },
  {
    id: 'loc-03',
    type: EntityType.food,
    mention: 'chuletones',
    expect: UNMATCHED,
    note: 'es surface of "steak"',
  },
  {
    id: 'loc-04',
    type: EntityType.food_attribute,
    mention: 'locales',
    expect: UNMATCHED,
    note: 'es surface of the "local" attribute',
  },
  {
    id: 'loc-05',
    type: EntityType.food,
    mention: 'picante',
    expect: UNMATCHED,
    note: 'es surface of "hot sauce", status=deprecated — inert on BOTH axes',
  },
  {
    id: 'loc-06',
    type: EntityType.food,
    mention: 'pasteles',
    expect: UNMATCHED,
    note: 'es surface of "cake" (deprecated) AND of "show-cakes" (active) — locale scope decides, not status alone',
  },
  {
    id: 'loc-07',
    type: EntityType.food,
    mention: 'fideos soba',
    expect: UNMATCHED,
    note: 'es surface of "soba noodles" — multiword',
  },

  // ── THE DOCUMENT'S LANGUAGE (step 5): ingestion resolution takes the
  //    locale chain, so the slice a mention may ground through is decided by
  //    the language of the document it was said in. Every fixture above has
  //    NO documentLocale and therefore still reads the und-only slice — that
  //    they did not move is half the evidence for this change.
  // THESE THREE WERE 'camarones', AND THE CORPUS TOOK THE WORD AWAY
  // (re-grounded 2026-08-11, per this gate's own authoring law: every
  // expectation is READ OUT OF THE DATABASE before it is written down). On
  // 2026-08-10 extraction created a food entity literally NAMED 'camarones'
  // — a Spanish word that became its own concept beside `shrimp`, which is a
  // real duplicate and is flagged for the resolver-convergence lane, not
  // repaired here. Once an entity is named X, tier 1 answers X[exact] before
  // any locale-scoped alias tier is consulted, so all three fixtures became
  // unfalsifiable: they can no longer show RED when the locale scope breaks,
  // which is the only thing that makes a fixture worth having.
  //
  // 'acedera' is the same shape, re-read from the corpus today: an es surface
  // of the English-named FOOD concept `sorrel`, role='both' (so it makes a
  // real recall claim, exactly as the camarones row did), held by ONE entity,
  // with no und or en row sharing its fold and no entity of that name. The
  // TYPE matters and cost a round trip: `acelga` -> `swiss chard` looked
  // identical but is an INGREDIENT, and a food-typed mention never sees it.
  {
    id: 'doc-01',
    type: EntityType.food,
    mention: 'acedera',
    documentLocale: 'es',
    expect: { entity: 'sorrel', tier: 'alias' },
    note: 'es surface of "sorrel" (role=both), read out of an ES document — the whole point: a Spanish document grounds through Spanish words. RED under the und-only scope',
  },
  {
    id: 'doc-02',
    type: EntityType.food,
    mention: 'acedera',
    expect: UNMATCHED,
    note: 'THE SAME WORD with no document language — the chain is a closed set the document names, not a widening: an untagged mention still sees und only (loc-01..07 say this for every other es word)',
  },
  {
    id: 'doc-03',
    type: EntityType.food,
    mention: 'acedera',
    documentLocale: 'en',
    expect: UNMATCHED,
    note: 'an EN document may not ground through es surfaces — localeLookupChain(en) is [en,und], and es is not in it',
  },
  {
    id: 'doc-04',
    type: EntityType.food,
    mention: 'khoai lang',
    documentLocale: 'en',
    expect: UNMATCHED,
    note: 'vi-ONLY surface of "sweet potato" (no und/es row shares its fold): an English document must not reach it — the cross-language leak this scope exists to refuse',
  },
  {
    id: 'doc-05',
    type: EntityType.food,
    mention: 'khoai lang',
    documentLocale: 'vi',
    expect: { entity: 'sweet potato', tier: 'alias' },
    note: 'the same word out of a VI document does ground — the refusal above is about language, not about the row being unreachable',
  },
  {
    id: 'doc-06',
    type: EntityType.food,
    mention: 'taco',
    documentLocale: 'es',
    expect: { entity: 'taco', tier: 'exact' },
    note: 'the und corpus stays reachable from every language: the chain always ends in und, so an es document keeps grounding the shared vocabulary',
  },
  {
    id: 'doc-07',
    type: EntityType.food,
    mention: 'char siu',
    documentLocale: 'es',
    expect: { entity: 'bbq pork', tier: 'alias' },
    note: 'the und ALIAS slice too (al-01 with a document language) — the chain widens, it never narrows what und callers could see',
  },
  {
    id: 'doc-08',
    type: EntityType.food,
    mention: SCRATCH_EN_FORM,
    documentLocale: 'en',
    expect: { entity: SCRATCH_NAME, tier: 'alias' },
    note: "THE LOCALE-CHAIN READ, AS A FIXTURE: a form the vocabulary generator banked 'en' must be visible to an English document's grounding. Under the old und-only scope this is RED — the chain is what makes a language-tagged row reachable at all",
  },
  {
    id: 'doc-09',
    type: EntityType.food,
    mention: SCRATCH_EN_FORM,
    documentLocale: 'vi',
    expect: UNMATCHED,
    note: "and the generator's 'en' form is NOT global: a vi document does not see it (chain [vi,und]) — the tag means something, which is precisely why only a writer that KNOWS the language may write one",
  },
];

function sameOutcome(observed: Outcome, expected: Outcome): boolean {
  if (expected.entity === null) {
    return observed.entity === null;
  }
  return (
    observed.entity !== null &&
    canonicalFold(observed.entity) === canonicalFold(expected.entity) &&
    observed.tier === expected.tier
  );
}

function render(outcome: Outcome): string {
  return `${outcome.entity ?? '<none>'}[${outcome.tier}]`;
}

/**
 * Idempotent seed for the two predicates the corpus cannot exercise. Written
 * with the app's own fold (the fold law: `form_folded` is app-written, never
 * a SQL expression), so the row is exactly what `addSurfaces` would have made.
 */
async function seedScratchFixtures(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO core_entities (entity_id, name, type, status, identity_key, identity_key_sorted)
     VALUES ($1::uuid, $2, 'food'::entity_type, 'active'::entity_status, $3, $3)
     ON CONFLICT (entity_id) DO NOTHING`,
    SCRATCH_ENTITY_ID,
    SCRATCH_NAME,
    canonicalFold(SCRATCH_NAME),
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO entity_surface
       (entity_id, form, form_folded, locale, role, source, confidence, status)
     VALUES ($1::uuid, $2, $3, 'und', 'display', 'sweep', 1, 'active'),
            ($1::uuid, $4, $5, 'und', 'recall',  'sweep', 1, 'active'),
            ($1::uuid, $6, $7, 'en',  'recall',  'vocabulary', 1, 'active')
     ON CONFLICT (entity_id, locale, form) DO UPDATE
       SET role = EXCLUDED.role, status = EXCLUDED.status`,
    SCRATCH_ENTITY_ID,
    SCRATCH_DISPLAY_FORM,
    canonicalFold(SCRATCH_DISPLAY_FORM),
    SCRATCH_FOLD_FORM,
    canonicalFold(SCRATCH_FOLD_FORM),
    SCRATCH_EN_FORM,
    canonicalFold(SCRATCH_EN_FORM),
  );
  // THE SEED OWNS THE SCRATCH ENTITY'S ROWS, ALL OF THEM (2026-08-11).
  // `ON CONFLICT (entity_id, locale, form)` can only ever ADD — it cannot see
  // a row of the same form under a DIFFERENT locale, and such a row makes the
  // locale fixtures lie. It happened: the seed used to write its 'en' form
  // with source='extraction', the extraction locale repair then correctly
  // re-tagged that row to 'und', and the next seed inserted a fresh 'en' row
  // beside it — so the "a vi document cannot see an en form" fixture went RED
  // against a universal und twin the gate itself had left behind. A fixture
  // whose premise is "this form exists ONLY in this locale" has to enforce
  // that, not assume it.
  await prismaExecute(
    prisma,
    `DELETE FROM entity_surface
      WHERE entity_id = $1::uuid
        AND (form, locale) NOT IN (($2, 'und'), ($3, 'und'), ($4, 'en'))`,
    SCRATCH_ENTITY_ID,
    SCRATCH_DISPLAY_FORM,
    SCRATCH_FOLD_FORM,
    SCRATCH_EN_FORM,
  );
}

const prismaExecute = (
  prisma: PrismaService,
  sql: string,
  ...params: unknown[]
): Promise<number> => prisma.$executeRawUnsafe(sql, ...params);

async function main(): Promise<void> {
  const app = await bootstrap();
  try {
    const resolver = app.get(EntityResolutionService);
    const prisma = app.get(PrismaService);
    await seedScratchFixtures(prisma);

    const batch = await resolver.resolveBatch(
      FIXTURES.map((fixture) => ({
        tempId: fixture.id,
        normalizedName: fixture.mention,
        originalText: fixture.mention,
        entityType: fixture.type,
        engineId: null,
        documentLocale: fixture.documentLocale ?? null,
      })),
      {
        // READ-ONLY + DETERMINISTIC: no creation, no recall/LLM tier. This
        // gate measures the two tiers the surgery touches and nothing else.
        allowEntityCreation: false,
        enableFuzzyMatching: false,
        useLlmMatcher: false,
      },
    );

    const byTempId = new Map(
      batch.resolutionResults.map((result) => [result.tempId, result]),
    );
    const entityIds = Array.from(
      new Set(
        batch.resolutionResults
          .map((result) => result.entityId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const names = new Map(
      (
        await prisma.entity.findMany({
          where: { entityId: { in: entityIds } },
          select: { entityId: true, name: true },
        })
      ).map((row) => [row.entityId, row.name]),
    );

    let green = 0;
    let red = 0;

    for (const fixture of FIXTURES) {
      const result = byTempId.get(fixture.id);
      const observed: Outcome = {
        entity: result?.entityId ? (names.get(result.entityId) ?? '?') : null,
        tier: (result?.resolutionTier as Tier) ?? 'unmatched',
      };

      if (sameOutcome(observed, fixture.expect)) {
        green += 1;
        continue;
      }
      red += 1;
      out(
        `RED ${fixture.id} "${fixture.mention}" got ${render(observed)} want ${render(fixture.expect)} — ${fixture.note}`,
      );
    }

    out(`\nRESOLUTION GATE: green=${green} red=${red} of ${FIXTURES.length}`);
    if (red > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
