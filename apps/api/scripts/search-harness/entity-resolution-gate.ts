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
 * HOW IT ASSERTS. Every fixture declares `expect` — the IDEAL outcome, which
 * is also the post-surgery outcome — as `{ entity, tier }` (or
 * `{ entity: null, tier: 'unmatched' }`). A fixture whose CURRENT behaviour
 * differs also declares `preSurgery`; observing that value counts as
 * "pre-surgery" (printed, not failed), and observing `expect` while
 * `preSurgery` is still declared prints "FIXED — remove preSurgery". Anything
 * else is RED. So the same file is green before AND after the surgery, and the
 * diff between the two runs is mechanically the list of `preSurgery` lines
 * that turn into FIXED lines.
 *
 * WHAT THE FIXTURES COVER (all 47 verified against the live dev corpus in SQL
 * before being written down — names, surfaces, locales and statuses):
 *   - exact tier: canonical names, case-insensitive names, number variants,
 *     and two strings that are BOTH an entity name and another entity's
 *     surface (the exact tier must win);
 *   - alias tier, byte-identical surface: works today, must keep working;
 *   - alias tier, CASE/PUNCTUATION/ACCENT variant of a banked surface: the
 *     fold-only wins — `preSurgery: unmatched`, `expect: alias`;
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
 * ROLE NOTE. Every recall arm must carry `role <> 'display'`. The und slice of
 * `entity_surface` is 100% `role='recall'` today (21,839 rows, measured
 * 2026-08-09), so no und fixture can exercise the role filter — the filter is
 * still written, because "no display rows exist right now" is a data
 * coincidence and not a law. The locale fixtures below DO cover `role='both'`
 * and `role='display'` rows, via the es slice.
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
  /** The ideal — and post-surgery — outcome. */
  expect: Outcome;
  /** Declared only where CURRENT (pre-surgery) behaviour differs from ideal. */
  preSurgery?: Outcome;
  note: string;
}

const UNMATCHED: Outcome = { entity: null, tier: 'unmatched' };

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
  {
    id: 'al-10',
    type: EntityType.restaurant,
    mention: 'miladys',
    expect: { entity: "Milady's", tier: 'alias' },
    note: 'possessive apostrophe dropped',
  },
  {
    id: 'al-11',
    type: EntityType.restaurant,
    mention: 'despana',
    expect: { entity: 'Despaña', tier: 'alias' },
    note: 'de-accented spelling ALREADY banked verbatim as an und surface',
  },
  {
    id: 'al-12',
    type: EntityType.restaurant,
    mention: 'lysee',
    expect: { entity: 'Lysée', tier: 'alias' },
    note: 'as al-11',
  },
  {
    id: 'al-13',
    type: EntityType.restaurant,
    mention: 'cesar',
    expect: { entity: 'César', tier: 'alias' },
    note: 'as al-11',
  },
  {
    id: 'al-14',
    type: EntityType.restaurant,
    mention: 'rezdora',
    expect: { entity: 'Rezdôra', tier: 'alias' },
    note: 'as al-11 (circumflex)',
  },

  // ── Tier 2: FOLD-ONLY wins — the surgery's behaviour change ─────────────
  // Each of these has a banked und surface that differs from the mention ONLY
  // by case, punctuation or accent. `aliases && ARRAY[...]` is byte-exact, so
  // today they ground NOTHING; `form_folded` equality grounds them correctly.
  {
    id: 'fold-01',
    type: EntityType.restaurant,
    mention: 'santo taco',
    expect: { entity: 'Santo Taco SoHo', tier: 'alias' },
    preSurgery: UNMATCHED,
    note: 'banked surface "Santo Taco" — case only',
  },
  {
    id: 'fold-02',
    type: EntityType.restaurant,
    mention: 'lugers',
    expect: { entity: 'Peter Luger Steak House', tier: 'alias' },
    preSurgery: UNMATCHED,
    note: 'banked surface "Lugers" — case only',
  },
  {
    id: 'fold-03',
    type: EntityType.restaurant,
    mention: 'cannelle',
    expect: { entity: 'Cannelle Patisserie', tier: 'alias' },
    preSurgery: UNMATCHED,
    note: 'banked surface "Cannelle" — case only',
  },
  {
    id: 'fold-04',
    type: EntityType.restaurant,
    mention: 'villabate',
    expect: { entity: 'Villabate Alba', tier: 'alias' },
    preSurgery: UNMATCHED,
    note: 'banked surface "Villabate" — case only',
  },
  {
    id: 'fold-05',
    type: EntityType.restaurant,
    mention: 'joes shanghai',
    expect: { entity: "Joe's Shanghai", tier: 'alias' },
    preSurgery: UNMATCHED,
    note: 'banked surface "Joes Shanghai" — case only',
  },
  {
    id: 'fold-06',
    type: EntityType.restaurant,
    mention: 'lloyds',
    expect: { entity: "Lloyd's Carrot Cake", tier: 'alias' },
    preSurgery: UNMATCHED,
    note: 'banked surface "Lloyds" — case only',
  },
  {
    id: 'fold-07',
    type: EntityType.restaurant,
    mention: 'jean georges',
    expect: { entity: 'Jean-Georges', tier: 'alias' },
    preSurgery: UNMATCHED,
    note: 'banked surface "Jean Georges" — case only (the hyphenated NAME is not reachable by the exact tier)',
  },
  {
    id: 'fold-08',
    type: EntityType.restaurant,
    mention: 'sarges deli',
    expect: { entity: 'Sarge’s Delicatessen & Diner', tier: 'alias' },
    preSurgery: UNMATCHED,
    note: 'banked surface "Sarges Deli" — case only',
  },
  {
    id: 'fold-09',
    type: EntityType.restaurant,
    mention: 'chefs table',
    expect: { entity: "The Chef's Table at Brooklyn Fare", tier: 'alias' },
    preSurgery: UNMATCHED,
    note: 'banked surface "Chefs Table" — case only',
  },
  {
    id: 'fold-10',
    type: EntityType.restaurant,
    mention: 'cathedrale restaurant',
    expect: { entity: 'Cathédrale Restaurant', tier: 'alias' },
    preSurgery: UNMATCHED,
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

async function main(): Promise<void> {
  const app = await bootstrap();
  try {
    const resolver = app.get(EntityResolutionService);
    const prisma = app.get(PrismaService);

    const batch = await resolver.resolveBatch(
      FIXTURES.map((fixture) => ({
        tempId: fixture.id,
        normalizedName: fixture.mention,
        originalText: fixture.mention,
        entityType: fixture.type,
        engineId: null,
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
    let preSurgery = 0;
    let fixed = 0;

    for (const fixture of FIXTURES) {
      const result = byTempId.get(fixture.id);
      const observed: Outcome = {
        entity: result?.entityId ? (names.get(result.entityId) ?? '?') : null,
        tier: (result?.resolutionTier as Tier) ?? 'unmatched',
      };

      if (sameOutcome(observed, fixture.expect)) {
        if (fixture.preSurgery) {
          fixed += 1;
          out(
            `FIXED ${fixture.id} "${fixture.mention}" -> ${render(observed)} — remove preSurgery`,
          );
        } else {
          green += 1;
        }
        continue;
      }
      if (fixture.preSurgery && sameOutcome(observed, fixture.preSurgery)) {
        preSurgery += 1;
        out(
          `pre-surgery ${fixture.id} "${fixture.mention}" -> ${render(observed)} (ideal ${render(fixture.expect)})`,
        );
        continue;
      }
      red += 1;
      out(
        `RED ${fixture.id} "${fixture.mention}" got ${render(observed)} want ${render(fixture.expect)}${
          fixture.preSurgery ? ` or ${render(fixture.preSurgery)}` : ''
        } — ${fixture.note}`,
      );
    }

    out(
      `\nRESOLUTION GATE: green=${green} red=${red} pre-surgery=${preSurgery} fixed=${fixed} of ${FIXTURES.length}`,
    );
    if (red > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
