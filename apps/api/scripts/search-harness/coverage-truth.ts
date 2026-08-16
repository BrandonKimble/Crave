/**
 * @script-class: gate
 * @finding: COVERAGE TRUTH — the only non-fake search test: serve a query to
 * EXHAUSTION through the real pipeline, derive what the DATA says should have
 * matched (independently of the serving SQL), diff the two sets, and attribute
 * every difference to a named arm.
 *
 * WHY IT IS NOT FAKE. Re-deriving expectation through the same query proves
 * nothing — it can only ever agree with itself. So the ground truth here walks
 * the DATA relationships directly (`derived_food_category_edges`,
 * `derived_name_containment_edges`, `entity_satisfies`,
 * `derived_entity_sibling_edges`, `core_restaurant_items`,
 * `core_restaurant_locations`) and never calls the builder, the executor, or
 * the sibling-expansion reader. The two sides can therefore disagree, which is
 * the entire point: every disagreement is either a coverage failure (the DATA
 * says match, the API never served it on any page) or an admission leak (the
 * API served a row the DATA does not relate to the ask).
 *
 * WHAT IT IS CONDITIONED ON. Ground truth starts from the INTERPRETATION's
 * grounded concepts — the same anchors the search got. A bad Understand
 * (compound query shattered into unigrams) is therefore NOT counted as a leak;
 * it is reported separately as a grounding-fidelity diagnostic, because the
 * rows it drags in are faithfully served for the concepts that were grounded.
 *
 * SELF-VERIFICATION (mutation test, `--mutate=`):
 *   bounds   drop the bbox arm from the ground-truth derivation -> out-of-view
 *            rows enter MUST-APPEAR -> coverage failures must appear.
 *   tier0    drop the category/variant/satisfies arms -> the served rows built
 *            on them must show up as admission leaks.
 *   pages=N  serve only N pages -> MUST-APPEAR rows past the cut must appear
 *            as coverage failures attributed to `not-paginated`.
 * A run with a mutation that produces NO new diff is a broken instrument.
 *
 * Usage:
 *   yarn workspace api ts-node scripts/search-harness/coverage-truth.ts
 *   ... --only=chili --pageSize=25 --maxPages=40 --json=<path>
 *   ... --mutate=bounds|tier0|pages=1
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import { bootstrap, out } from './_shared';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  redirectJoinSql,
  resolvedSubjectSql,
} from '../../src/modules/signals/subject-identity';
import { SearchService } from '../../src/modules/search/search.service';
import { SearchQueryInterpretationService } from '../../src/modules/search/search-query-interpretation.service';
import type {
  NaturalSearchRequestDto,
  SearchQueryRequestDto,
} from '../../src/modules/search/dto/search-query.dto';

/* ------------------------------------------------------------------ config */

type Bounds = {
  northEast: { lat: number; lng: number };
  southWest: { lat: number; lng: number };
};

/** The two real corpora in the local DB (locations: Manhattan/Brooklyn/Queens
 *  ~4.2k, Austin metro ~2.3k). A viewport is REQUIRED by runQuery. */
const VIEWPORTS: Record<string, Bounds> = {
  nyc: {
    northEast: { lat: 40.88, lng: -73.85 },
    southWest: { lat: 40.6, lng: -74.05 },
  },
  austin: {
    northEast: { lat: 30.52, lng: -97.55 },
    southWest: { lat: 30.15, lng: -97.95 },
  },
};

type Case = {
  q: string;
  view: keyof typeof VIEWPORTS;
  /** why this case is in the battery — printed with its row. */
  why: string;
  /** extra request fields (filters/toggles) merged onto the structured request. */
  req?: Partial<SearchQueryRequestDto>;
  /** the case asserts an honest-empty answer. */
  expectEmpty?: boolean;
};

const BATTERY: Case[] = [
  { q: 'chili cheese dog', view: 'nyc', why: 'owner flagship / thin compound' },
  { q: 'best chili cheese dog', view: 'nyc', why: 'superlative prefix' },
  { q: 'beef noodle soup', view: 'nyc', why: 'multiword head-final' },
  { q: 'birria tacos', view: 'austin', why: 'variant-of a rich category' },
  { q: 'vegan ramen', view: 'nyc', why: 'DIETARY WALL + food' },
  {
    q: 'cheap sushi open late',
    view: 'nyc',
    why: 'attribute-heavy + filters',
    req: { openNow: false, priceLevels: [1, 2] },
  },
  { q: 'breakfast burrito', view: 'austin', why: 'compound, austin corpus' },
  { q: 'pho', view: 'nyc', why: 'single-token rich category' },
  { q: 'bún bò huế', view: 'nyc', why: 'vi, full diacritics' },
  { q: 'cơm tấm', view: 'nyc', why: 'vi, full diacritics' },
  { q: 'phở bo', view: 'nyc', why: 'vi, PARTIAL accent (fold path)' },
  { q: 'camarones', view: 'austin', why: 'es single token' },
  { q: 'tacos al pastor', view: 'austin', why: 'KNOWN part-flood class' },
  { q: 'pastel de arroz', view: 'austin', why: 'es multiword, likely thin' },
  { q: 'gluten free pizza', view: 'nyc', why: 'DIETARY WALL + rich category' },
  { q: 'wings', view: 'nyc', why: 'rich category, high fan-out' },
  { q: 'omakase', view: 'nyc', why: 'format word / venue-ish' },
  { q: 'matcha latte', view: 'nyc', why: 'drink compound' },
  { q: 'shrimp', view: 'nyc', why: 'INGREDIENT TWIN (food + ingredient)' },
  {
    q: 'chicken over rice',
    view: 'nyc',
    why: 'compound decomposed to ingredients',
  },
  {
    q: 'zorblatt quinlex pudding',
    view: 'nyc',
    why: 'nonsense CONTROL — must be honest-empty',
    expectEmpty: true,
  },
  // --- admission-edge stressors (harness author's choice) ---
  {
    q: 'burrata',
    view: 'nyc',
    why: 'thin compound / twin-ingredient discovery',
  },
  { q: 'pizza', view: 'nyc', why: 'richest category — ring + gate pressure' },
  {
    q: 'spicy crispy chicken sandwich',
    view: 'nyc',
    why: 'attribute-heavy stack',
  },
  { q: 'tortas ahogadas', view: 'austin', why: 'multiword es, thin' },
  { q: 'birria', view: 'austin', why: 'bare head of a compound' },
  { q: 'ramen', view: 'nyc', why: 'category vs the vegan-ramen wall case' },
  { q: 'tacos', view: 'austin', why: 'category head of the part-flood class' },
  {
    q: 'halal',
    view: 'nyc',
    why: 'dietary word ALONE (subject-is-sacred path)',
  },
];

/* ------------------------------------------------------------------- args */

const argv = process.argv.slice(2);
function arg(name: string, fallback?: string): string | undefined {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
const ONLY = arg('only');
const PAGE_SIZE = Number(arg('pageSize', '25'));
const MUTATE = arg('mutate', '');
const MAX_PAGES = MUTATE?.startsWith('pages=')
  ? Number(MUTATE.slice('pages='.length))
  : Number(arg('maxPages', '60'));
const JSON_PATH =
  arg('json') ?? path.join(__dirname, 'coverage-truth.result.json');
const MUT_BOUNDS = MUTATE === 'bounds';
const MUT_TIER0 = MUTATE === 'tier0';

/* --------------------------------------------------------------- helpers */

type Ids = string[];
const uniq = (xs: Ids) => Array.from(new Set(xs.filter(Boolean)));

/** Cut thresholds mirroring the shipped defaults (search.service.ts). Read
 *  from env exactly as the service does, so a tuned deployment stays honest. */
const SIB = {
  minCosine: Number(process.env.SEARCH_DENSE_SIBLINGS_COSINE_FLOOR ?? 0.75),
  forwardK: Number(process.env.SEARCH_DENSE_SIBLINGS_FORWARD_K ?? 25),
  mutualR: Number(process.env.SEARCH_DENSE_SIBLINGS_MUTUAL_R ?? 20),
  maxAnchors: 3,
};

type Row = Record<string, unknown>;

/* -------------------------------------------------------- ground truth */

type GroundSets = {
  anchors: Ids;
  tier0: Ids;
  ring: Ids;
  rejects: Ids;
  twinIngredients: Ids;
  askIngredients: Ids;
  softFoodAttrs: Ids;
  softRestAttrs: Ids;
  dietaryFoodAttrs: Ids;
  dietaryRestAttrs: Ids;
};

async function deriveConceptSets(
  prisma: PrismaService,
  req: SearchQueryRequestDto,
): Promise<GroundSets> {
  const anchors = uniq(
    (req.entities.food ?? []).flatMap((e) => e.entityIds ?? []),
  );
  const askIngredients = uniq(
    (req.entities.ingredients ?? []).flatMap((e) => e.entityIds ?? []),
  );
  const foodAttrs = uniq(
    (req.entities.foodAttributes ?? []).flatMap((e) => e.entityIds ?? []),
  );
  const restAttrs = uniq(
    (req.entities.restaurantAttributes ?? []).flatMap((e) => e.entityIds ?? []),
  );

  // Dietary vocabulary is a curated flag on the attribute entities themselves.
  const dietaryRows = await prisma.$queryRaw<
    { entity_id: string; type: string }[]
  >(
    Prisma.sql`SELECT entity_id, type::text AS type FROM core_entities
               WHERE constraint_class = 'dietary' AND status = 'active'::entity_status`,
  );
  const dietarySet = new Set(dietaryRows.map((r) => r.entity_id));
  const dietaryFoodAttrs = foodAttrs.filter((id) => dietarySet.has(id));
  const dietaryRestAttrs = restAttrs.filter((id) => dietarySet.has(id));

  if (!anchors.length) {
    return {
      anchors,
      tier0: [],
      ring: [],
      rejects: [],
      twinIngredients: [],
      askIngredients,
      softFoodAttrs: foodAttrs.filter((id) => !dietarySet.has(id)),
      softRestAttrs: restAttrs.filter((id) => !dietarySet.has(id)),
      dietaryFoodAttrs,
      dietaryRestAttrs,
    };
  }

  // THE MOST SPECIFIC ANCHOR IS THE SUBJECT (measured 2026-08-12). The
  // gazetteer grounds "birria tacos" AND "taco" from the same span, so a naive
  // union made ground truth demand every taco in Austin — 521 must-appear rows
  // for a query about one of them. When one grounded anchor's words are all
  // contained in another's, the shorter one is a PART of the subject, not a
  // second subject, and is dropped from the truth anchors. Token-level and
  // plural-insensitive on purpose: the materialized containment edges are
  // whole-word and exact, so they miss taco/tacos, which is precisely the
  // pair the gazetteer produces.
  const anchorNames = await prisma.$queryRaw<{ id: string; name: string }[]>(
    Prisma.sql`SELECT entity_id AS id, name FROM core_entities
               WHERE entity_id = ANY(${anchors}::uuid[])`,
  );
  const singular = (t: string) =>
    t.endsWith('s') && t.length > 3 ? t.slice(0, -1) : t;
  const tokens = new Map(
    anchorNames.map((r) => [
      r.id,
      new Set(r.name.toLowerCase().split(/\s+/).map(singular).filter(Boolean)),
    ]),
  );
  const subsumed = new Set<string>();
  for (const [idA, tokA] of tokens)
    for (const [idB, tokB] of tokens) {
      if (idA === idB || tokA.size >= tokB.size) continue;
      if (Array.from(tokA).every((t) => tokB.has(t))) subsumed.add(idA);
    }
  const a = anchors.filter((id) => !subsumed.has(id));
  // The dropped part-anchor is still a MEMBER of the served query (the builder
  // ORs every grounded food id), so its dishes are legitimately admissible —
  // they are simply not what the user asked for. They ride the MAY-APPEAR ring
  // instead of inflating MUST-APPEAR, which keeps both columns honest.
  const partAnchors = anchors.filter((id) => subsumed.has(id));
  // The sibling read is anchored on what the SERVICE anchors on: every grounded
  // food id (part anchors included), capped the same way.
  const anchorsCut = anchors.slice(0, SIB.maxAnchors);

  const [categoryMembers, containment, judged, siblings, twins] =
    await Promise.all([
      // 3. category members: member -> bucket, so members of X = category_id = X
      prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT DISTINCT e.food_id AS id
        FROM derived_food_category_edges e
        JOIN core_entities f ON f.entity_id = e.food_id
          AND f.type = 'food'::entity_type AND f.status = 'active'::entity_status
        WHERE e.category_id = ANY(${a}::uuid[])`),
      // 3b. name containment: head_final = IS-A (tier 0), else mentions (ring)
      prisma.$queryRaw<{ id: string; head_final: boolean }[]>(Prisma.sql`
        SELECT n.variant_id AS id, bool_or(n.head_final) AS head_final
        FROM derived_name_containment_edges n
        JOIN core_entities v ON v.entity_id = n.variant_id
          AND v.type = 'food'::entity_type AND v.status = 'active'::entity_status
        WHERE n.base_id = ANY(${a}::uuid[])
        GROUP BY n.variant_id`),
      // 4. judged satisfies / cousin / reject, redirect-followed
      prisma.$queryRaw<{ id: string; relation: string }[]>(Prisma.sql`
        SELECT ${resolvedSubjectSql('s', 'rd', 'to_entity_id')} AS id, s.relation
        FROM entity_satisfies s
        ${redirectJoinSql('s', 'rd', 'to_entity_id')}
        JOIN core_entities t ON t.entity_id = ${resolvedSubjectSql('s', 'rd', 'to_entity_id')}
          AND t.type = 'food'::entity_type AND t.status = 'active'::entity_status
        WHERE s.from_entity_id = ANY(${a}::uuid[])`),
      // 5. dense sibling ring, at the shipped cut (part anchors included below)
      prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT DISTINCT e.sibling_entity_id AS id
        FROM derived_entity_sibling_edges e
        JOIN core_entities s ON s.entity_id = e.sibling_entity_id
          AND s.type = 'food'::entity_type AND s.status = 'active'::entity_status
        WHERE e.anchor_entity_id = ANY(${anchorsCut}::uuid[])
          AND e.cosine >= ${SIB.minCosine}
          AND e.forward_rank <= ${SIB.forwardK}
          AND e.mutual_rank IS NOT NULL AND e.mutual_rank <= ${SIB.mutualR}`),
      // 6. twin ingredients of the anchors ("burrata" the food is also an ingredient)
      prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT DISTINCT i.entity_id AS id
        FROM core_entities i, core_entities b
        WHERE b.entity_id = ANY(${a}::uuid[])
          AND i.type = 'ingredient'::entity_type AND i.status = 'active'::entity_status
          AND ( i.identity_key = b.identity_key
             OR EXISTS (SELECT 1 FROM entity_surface s WHERE s.entity_id = i.entity_id
                          AND s.status = 'active' AND s.locale = 'und' AND s.role <> 'display'
                          AND s.form_folded = b.identity_key)
             OR EXISTS (SELECT 1 FROM entity_surface s WHERE s.entity_id = b.entity_id
                          AND s.status = 'active' AND s.locale = 'und' AND s.role <> 'display'
                          AND s.form_folded = i.identity_key))`),
    ]);

  const satisfies = judged
    .filter((r) => r.relation === 'satisfies')
    .map((r) => r.id);
  const cousins = judged
    .filter((r) => r.relation === 'cousin')
    .map((r) => r.id);
  const rejects = judged
    .filter((r) => r.relation === 'reject')
    .map((r) => r.id);

  // MUTATION `tier0`: strip the derived arms so the served rows built on them
  // must surface as leaks. A run where this changes nothing is a dead harness.
  const tier0 = MUT_TIER0
    ? uniq(a)
    : uniq([
        ...a,
        ...categoryMembers.map((r) => r.id),
        ...containment.filter((r) => r.head_final).map((r) => r.id),
        ...satisfies,
      ]);
  const tier0Set = new Set(tier0);
  const partRing = partAnchors.length
    ? await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT DISTINCT id FROM (
          SELECT e.food_id AS id FROM derived_food_category_edges e
           WHERE e.category_id = ANY(${partAnchors}::uuid[])
          UNION ALL
          SELECT n.variant_id FROM derived_name_containment_edges n
           WHERE n.base_id = ANY(${partAnchors}::uuid[])
          UNION ALL
          SELECT unnest(${partAnchors}::uuid[])
        ) x
        JOIN core_entities f ON f.entity_id = x.id
          AND f.type = 'food'::entity_type AND f.status = 'active'::entity_status`)
    : [];
  const ring = uniq([
    ...partRing.map((r) => r.id),
    ...siblings.map((r) => r.id),
    ...containment.filter((r) => !r.head_final).map((r) => r.id),
    ...cousins,
  ]).filter((id) => !tier0Set.has(id));

  return {
    anchors: a,
    tier0,
    ring,
    rejects: uniq(rejects).filter((id) => !tier0Set.has(id)),
    twinIngredients: uniq(twins.map((r) => r.id)),
    askIngredients,
    softFoodAttrs: foodAttrs.filter((id) => !dietarySet.has(id)),
    softRestAttrs: restAttrs.filter((id) => !dietarySet.has(id)),
    dietaryFoodAttrs,
    dietaryRestAttrs,
  };
}

type TruthRow = {
  connectionId: string;
  foodId: string;
  foodName: string;
  restaurantId: string;
  restaurantName: string;
  viaTier0: boolean;
  /** the tier-0 CONCEPT arm alone, without the twin-ingredient union — the two
   *  differ exactly on rows admitted only because the dish carries an
   *  ingredient that is the anchor's twin (the burrata ruling). */
  viaTier0Concept: boolean;
  viaRing: boolean;
  viaIngredient: boolean;
  viaTwin: boolean;
  hasConnScore: boolean;
  hasRestScore: boolean;
  locOk: boolean;
  dietaryOk: boolean;
  softAllMet: boolean;
  /** the VENUE side of the pooled gate: does this row's restaurant carry every
   *  soft restaurant-attribute the ask grounded? (`softAllMet` is the dish
   *  side.) Both must hold for the row to be tier-0 — see `chaseMiss`. */
  restSoftMet: boolean;
  mentionCount: number;
  priceLevel: number | null;
};

/**
 * THE GROUND TRUTH. Every candidate connection the DATA relates to the ask,
 * inside the viewport, with the diagnostic columns the chase needs. It
 * deliberately does NOT apply the serving joins (public score rows, the
 * pooled gate, the inventory EXISTS) — those are the arms under test.
 */
async function deriveTruthRows(
  prisma: PrismaService,
  sets: GroundSets,
  bounds: Bounds,
): Promise<TruthRow[]> {
  const memberIds = uniq([...sets.tier0, ...sets.ring]);
  const ingredientIds = uniq(sets.askIngredients);
  const twinIds = uniq(sets.twinIngredients);
  if (
    !memberIds.length &&
    !ingredientIds.length &&
    !sets.softFoodAttrs.length &&
    !sets.dietaryFoodAttrs.length
  ) {
    return [];
  }
  // THE ASK IS A CONJUNCTION ACROSS CLASSES, A UNION WITHIN ONE (measured
  // 2026-08-12). "birria tacos" decomposes to food=[birria tacos, tacos] +
  // ingredient=[birria]: the parts REFINE the subject, they do not widen it.
  // A first cut of this harness unioned the ingredient arm into the candidate
  // universe and reported 426 must-appear rows for "chicken over rice" — every
  // dish in Manhattan containing chicken or rice. That is the harness lying,
  // not the search failing. The concept sets (tier-0 / ring) are the universe;
  // the ask's ingredient and attribute arms are recorded PER ROW and become
  // chase reasons, so a subject that loses its own dishes to a decomposed part
  // is still visible as a named failure rather than hidden in an inflated
  // denominator. When the ask grounds NO food anchor, the ingredient arm is
  // the subject and does form the universe.
  const boundsSql = MUT_BOUNDS
    ? Prisma.sql`TRUE`
    : Prisma.sql`rl.latitude BETWEEN ${bounds.southWest.lat} AND ${bounds.northEast.lat}
                 AND rl.longitude BETWEEN ${bounds.southWest.lng} AND ${bounds.northEast.lng}`;
  const twinArm = twinIds.length
    ? Prisma.sql`(c.ingredients && ${twinIds}::uuid[]
                  OR f.canonical_ingredients && ${twinIds}::uuid[])`
    : Prisma.sql`FALSE`;
  const ingArm = ingredientIds.length
    ? Prisma.sql`(c.ingredients && ${ingredientIds}::uuid[]
                  OR f.canonical_ingredients && ${ingredientIds}::uuid[])`
    : Prisma.sql`TRUE`;
  /** the candidate universe: concepts when the ask grounded a food, otherwise
   *  the ingredient/attribute subject. */
  // TWIN-INGREDIENT UNION IS TIER-0 MEMBERSHIP (owner ruling 2026-07-25,
  // "burrata"): when the asked food's name is also an ingredient, dishes
  // CONTAINING it are the thing asked for, so they belong to the truth
  // universe — not to the leak column.
  const universeSql = memberIds.length
    ? twinIds.length
      ? Prisma.sql`(c.food_id = ANY(${memberIds}::uuid[]) OR ${twinArm})`
      : Prisma.sql`c.food_id = ANY(${memberIds}::uuid[])`
    : ingredientIds.length
      ? ingArm
      : // SUBJECT-IS-SACRED asks ("halal", "spicy"): the attribute IS the
        // subject, dietary or not, so the attribute arm forms the universe.
        Prisma.sql`c.food_attributes && ${uniq([...sets.softFoodAttrs, ...sets.dietaryFoodAttrs])}::uuid[]`;
  const dietaryOkSql = sets.dietaryFoodAttrs.length
    ? Prisma.sql`c.food_attributes @> ${sets.dietaryFoodAttrs}::uuid[]`
    : Prisma.sql`TRUE`;
  const softAllSql = sets.softFoodAttrs.length
    ? Prisma.sql`c.food_attributes @> ${sets.softFoodAttrs}::uuid[]`
    : Prisma.sql`TRUE`;
  // THE POOLED GATE HAS TWO SIDES AND THE HARNESS ONLY EVER MEASURED ONE.
  // `search-query.builder.ts`'s `pooledRestFullExpr` makes tier-0 membership
  // the conjunction `restaurant_attributes @> softRest AND EXISTS(dish with
  // softFood)`. This column is the venue half, read off the restaurant entity
  // exactly as the builder reads it.
  const restSoftSql = sets.softRestAttrs.length
    ? Prisma.sql`r.restaurant_attributes @> ${sets.softRestAttrs}::uuid[]`
    : Prisma.sql`TRUE`;
  const tier0Arm = sets.tier0.length
    ? Prisma.sql`c.food_id = ANY(${sets.tier0}::uuid[])`
    : Prisma.sql`FALSE`;
  const ringArm = sets.ring.length
    ? Prisma.sql`c.food_id = ANY(${sets.ring}::uuid[])`
    : Prisma.sql`FALSE`;

  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT DISTINCT ON (c.connection_id)
      c.connection_id                              AS "connectionId",
      c.food_id                                    AS "foodId",
      f.name                                       AS "foodName",
      c.restaurant_id                              AS "restaurantId",
      r.name                                       AS "restaurantName",
      (${tier0Arm} OR ${twinArm})                  AS "viaTier0",
      (${tier0Arm})                                AS "viaTier0Concept",
      (${ringArm})                                 AS "viaRing",
      (${ingArm})                                  AS "viaIngredient",
      (${twinArm})                                 AS "viaTwin",
      EXISTS (SELECT 1 FROM core_public_entity_scores s
               WHERE s.subject_type = 'connection' AND s.subject_id = c.connection_id)
                                                   AS "hasConnScore",
      EXISTS (SELECT 1 FROM core_public_entity_scores s
               WHERE s.subject_type = 'restaurant' AND s.subject_id = r.entity_id)
                                                   AS "hasRestScore",
      (rl.google_place_id IS NOT NULL AND rl.address IS NOT NULL)
                                                   AS "locOk",
      (${dietaryOkSql})                            AS "dietaryOk",
      (${softAllSql})                              AS "softAllMet",
      (${restSoftSql})                             AS "restSoftMet",
      c.mention_count                              AS "mentionCount",
      r.price_level                                AS "priceLevel"
    FROM core_restaurant_items c
    JOIN core_entities f ON f.entity_id = c.food_id
      AND f.type = 'food'::entity_type AND f.status = 'active'::entity_status
    JOIN core_entities r ON r.entity_id = c.restaurant_id
      AND r.type = 'restaurant'::entity_type AND r.status = 'active'::entity_status
    JOIN core_restaurant_locations rl ON rl.restaurant_id = r.entity_id
      AND rl.latitude IS NOT NULL AND rl.longitude IS NOT NULL
    WHERE NOT c.is_category_item
      AND c.mention_count > 0
      AND ${boundsSql}
      AND (${universeSql})
    ORDER BY c.connection_id, rl.google_place_id NULLS LAST`);

  return rows.map((r) => ({
    connectionId: String(r.connectionId),
    foodId: String(r.foodId),
    foodName: String(r.foodName),
    restaurantId: String(r.restaurantId),
    restaurantName: String(r.restaurantName),
    viaTier0: Boolean(r.viaTier0),
    viaTier0Concept: Boolean(r.viaTier0Concept),
    viaRing: Boolean(r.viaRing),
    viaIngredient: Boolean(r.viaIngredient),
    viaTwin: Boolean(r.viaTwin),
    hasConnScore: Boolean(r.hasConnScore),
    hasRestScore: Boolean(r.hasRestScore),
    locOk: Boolean(r.locOk),
    dietaryOk: Boolean(r.dietaryOk),
    softAllMet: Boolean(r.softAllMet),
    restSoftMet: Boolean(r.restSoftMet),
    mentionCount: Number(r.mentionCount ?? 0),
    priceLevel:
      r.priceLevel === null || r.priceLevel === undefined
        ? null
        : Number(r.priceLevel),
  }));
}

/* ------------------------------------------------------------- the serve */

type Served = {
  /** page-1 analysis metadata — records whether PLAN EXPANSION fired, which is
   *  the arm that admits lexical/attribute widening beyond the concept graph. */
  expansionFired: boolean;
  dishes: Map<
    string,
    { foodId: string; foodName: string; restaurantId: string }
  >;
  restaurants: Set<string>;
  pages: number;
  exhausted: boolean;
  totals: { dishes: number; restaurants: number };
};

async function serveToExhaustion(
  search: SearchService,
  base: SearchQueryRequestDto,
): Promise<Served> {
  const dishes: Served['dishes'] = new Map();
  const restaurants = new Set<string>();
  let page = 1;
  let exhausted = false;
  let totals = { dishes: 0, restaurants: 0 };
  let expansionFired = false;
  for (; page <= MAX_PAGES; page += 1) {
    const res = await search.runQuery({
      ...base,
      pagination: { page, pageSize: PAGE_SIZE },
    } as SearchQueryRequestDto);
    totals = {
      dishes: res.metadata.totalFoodResults ?? 0,
      restaurants: res.metadata.totalRestaurantResults ?? 0,
    };
    if (page === 1) {
      const am = res.metadata.analysisMetadata;
      expansionFired = Boolean(am?.idExpansion);
    }
    const d = res.dishes ?? [];
    const r = res.restaurants ?? [];
    for (const row of d) {
      dishes.set(row.connectionId, {
        foodId: row.foodId,
        foodName: row.foodName,
        restaurantId: row.restaurantId,
      });
    }
    for (const row of r) restaurants.add(row.restaurantId);
    if (d.length === 0 && r.length === 0) {
      exhausted = true;
      break;
    }
  }
  return {
    dishes,
    restaurants,
    pages: Math.min(page, MAX_PAGES),
    exhausted,
    totals,
    expansionFired,
  };
}

/* ------------------------------------------------------------- the chase */

/** Ordered attribution: the FIRST arm that explains the miss wins, and the
 *  order is the order the serving SQL applies them. `UNEXPLAINED` is the gold
 *  — a row the data says must match and no known arm removes. */
function chaseMiss(
  row: TruthRow,
  ctx: {
    tier0Count: number;
    threshold: number;
    served: Served;
    hasSoft: boolean;
    hasSoftRest: boolean;
    restaurantIds: string[];
    priceLevels: number[];
  },
): string {
  // A grounded RESTAURANT is a hard AND on the whole query — one junk venue
  // entity matching a common word annihilates the ask (see the "Best" finding).
  if (ctx.restaurantIds.length && !ctx.restaurantIds.includes(row.restaurantId))
    return `restaurant-entity conjunction (query grounded a venue)`;
  if (
    ctx.priceLevels.length &&
    (row.priceLevel === null || !ctx.priceLevels.includes(row.priceLevel))
  )
    return 'price-level filter (requested)';
  if (!row.locOk) return 'location-incomplete (no google_place_id/address)';
  if (!row.dietaryOk) return 'dietary-wall (correct)';
  if (!row.viaIngredient)
    return 'ask-ingredient conjunction (row lacks the decomposed part)';
  if (!row.hasRestScore) return 'no-restaurant-public-score (INNER JOIN prs)';
  if (!row.hasConnScore) return 'no-connection-public-score (INNER JOIN pcs)';
  // THE POOLED GATE, BOTH SIDES. Tier-0 is the CONJUNCTION of the dish-side
  // and venue-side soft-attribute tests (`pooledRestFullExpr`), so a row is
  // demoted to tier 1 by failing EITHER. The harness asked only the dish
  // question for a year, which is why "pastel de arroz" reported 334
  // UNEXPLAINED misses: its third token grounds the restaurant attribute
  // "serves dessert", carried by 692 of the 1,621 Austin venues in view, and
  // every must-appear row at the other 929 was suppressed by an arm the chase
  // could not name. Split into two reasons rather than one, because they fail
  // for different reasons and a merged count would hide which.
  if (ctx.tier0Count >= ctx.threshold) {
    if (ctx.hasSoftRest && !row.restSoftMet)
      return 'pooled-gate: tier-1 suppressed (venue lacks a soft restaurant attribute)';
    if (ctx.hasSoft && !row.softAllMet)
      return 'pooled-gate: tier-1 suppressed (tier-0 filled the page)';
  }
  if (!ctx.served.exhausted) return 'not-paginated (page cap reached)';
  // RING-ONLY MEMBERSHIP WITH EXPANSION COLD. The truth universe promotes a
  // row to MUST-APPEAR on the twin-ingredient arm (the burrata ruling), but
  // the SERVER's hard membership is the tier-0 CONCEPT set. A row whose food
  // concept is not in tier 0 is reachable only through the dense sibling ring,
  // and the ring is only consulted when PLAN EXPANSION fires. When it did not
  // fire, such a row is unreachable by construction rather than silently
  // dropped — so the arm is conditioned on `expansionFired`, and a ring-only
  // miss WITH expansion hot stays UNEXPLAINED, which is what keeps this arm
  // able to show red.
  //
  // The live instance is "camaron machete" for the ask "camarones". It is a
  // dense sibling (cosine 0.861, forward_rank 4, mutual_rank 1) and carries
  // ingredient shrimp — the anchor's twin — but no category, containment or
  // satisfies edge joins its food to either anchor. The reason is a corpus
  // fact worth recording: `name-containment-edge-builder` derives edges from
  // `core_entities.identity_key` ALONE and never consults `entity_surface`.
  // The dish banks the plural spelling "camarones machete" as an es recall
  // surface, but its identity_key is the singular "camaron machete", which
  // does not contain the whole word "camarones" — so the edge the ask needed
  // was never built. Named here, not force-fixed.
  if (!row.viaTier0Concept && !ctx.served.expansionFired)
    return 'ring-only membership (tier-0 concept miss; plan expansion did not fire)';
  return 'UNEXPLAINED';
}

/* ---------------------------------------------------------------- runner */

type CaseResult = Record<string, unknown>;

async function main(): Promise<void> {
  const app = await bootstrap();
  const started = new Date().toISOString();
  const results: CaseResult[] = [];
  try {
    const prisma = app.get(PrismaService);
    const search = app.get(SearchService);
    const interp = app.get(SearchQueryInterpretationService);

    const cases = ONLY ? BATTERY.filter((c) => c.q.includes(ONLY)) : BATTERY;

    out(
      `coverage-truth — ${cases.length} cases, pageSize=${PAGE_SIZE}, maxPages=${MAX_PAGES}` +
        (MUTATE ? `, MUTATION=${MUTATE}` : ''),
    );
    out('');

    for (const c of cases) {
      const bounds = VIEWPORTS[c.view];
      const natural: NaturalSearchRequestDto = {
        query: c.q,
        bounds,
      } as NaturalSearchRequestDto;
      const interpretation = await interp.interpret(natural);
      const req: SearchQueryRequestDto = {
        ...interpretation.structuredRequest,
        ...(c.req ?? {}),
      } as SearchQueryRequestDto;

      const groundedText = [
        ...(req.entities.food ?? []),
        ...(req.entities.foodAttributes ?? []),
        ...(req.entities.restaurantAttributes ?? []),
        ...(req.entities.ingredients ?? []),
        ...(req.entities.restaurants ?? []),
      ].map((e) => e.normalizedName);
      // GROUNDING FIDELITY: did the ask survive as ONE concept, or shatter?
      const shattered =
        (req.entities.food ?? []).length > 1 &&
        c.q.split(/\s+/).length === (req.entities.food ?? []).length;

      const hasTargets =
        groundedText.length > 0 || (interpretation.unresolved ?? []).length > 0;

      const served = hasTargets
        ? await serveToExhaustion(search, req)
        : {
            dishes: new Map(),
            restaurants: new Set<string>(),
            pages: 0,
            exhausted: true,
            expansionFired: false,
            totals: { dishes: 0, restaurants: 0 },
          };

      const sets = await deriveConceptSets(prisma, req);
      const truth = await deriveTruthRows(prisma, sets, bounds);

      // MUST-APPEAR = the ask's own concept, in view, wall-legal. When the ask
      // grounded no food, the ingredient/attribute subject IS the concept.
      const mustAppear = truth.filter(
        (t) => (sets.tier0.length ? t.viaTier0 : true) && t.dietaryOk,
      );
      const mayAppear = truth.filter((t) => !mustAppear.includes(t));
      const mustSet = new Set(mustAppear.map((t) => t.connectionId));
      const maySet = new Set(mayAppear.map((t) => t.connectionId));
      const truthFoods = new Set(truth.map((t) => t.foodId));

      const threshold = Math.max(25, PAGE_SIZE);
      // Tier-0 is the CONJUNCTION of both soft sides, matching the builder's
      // `pooledRestFullExpr`. Counting only the dish side overstated the pool
      // whenever the ask grounded a restaurant attribute.
      const tier0Count = mustAppear.filter(
        (t) => t.softAllMet && t.restSoftMet,
      ).length;
      const hasSoft = sets.softFoodAttrs.length > 0;
      const hasSoftRest = sets.softRestAttrs.length > 0;

      const missing = mustAppear.filter(
        (t) => !served.dishes.has(t.connectionId),
      );
      const missReasons = new Map<string, number>();
      const missSamples: Row[] = [];
      for (const m of missing) {
        const reason = chaseMiss(m, {
          tier0Count,
          threshold,
          served,
          hasSoft,
          hasSoftRest,
          restaurantIds: uniq(
            (req.entities.restaurants ?? []).flatMap((e) => e.entityIds ?? []),
          ),
          priceLevels: req.priceLevels ?? [],
        });
        missReasons.set(reason, (missReasons.get(reason) ?? 0) + 1);
        if (missSamples.length < 5 || reason === 'UNEXPLAINED')
          if (missSamples.length < 12)
            missSamples.push({
              connectionId: m.connectionId,
              food: m.foodName,
              restaurant: m.restaurantName,
              reason,
            });
      }

      // LEAK CHASE. A served row outside MUST∪MAY is explained by the arm
      // that admitted it, so the arms are probed directly: does the row's
      // VENUE carry a grounded restaurant attribute (the whole-menu arm), or
      // does the dish NAME merely share the query's letters (the lexical
      // expansion arm)? Anything left is the honest gold: a row with no
      // relation to the ask at all.
      // A JUDGED REJECT IS A LEAK EVEN IF SOME OTHER ARM WOULD ADMIT IT. The
      // judge was asked precisely whether this concept substitutes for the ask
      // and said no; if the sibling ring re-admits it, the ring has overruled
      // the one signal built to stop it. Counted separately from the MUST∪MAY
      // diff for exactly that reason.
      const rejectsServed = Array.from(served.dishes.values()).filter((d) =>
        sets.rejects.includes(d.foodId),
      );
      const leakIds: {
        connId: string;
        foodId: string;
        foodName: string;
        restaurantId: string;
      }[] = [];
      for (const [connId, d] of served.dishes) {
        if (mustSet.has(connId) || maySet.has(connId)) continue;
        leakIds.push({
          connId,
          foodId: d.foodId,
          foodName: d.foodName,
          restaurantId: d.restaurantId,
        });
      }
      const groundedRestAttrs = uniq([
        ...sets.softRestAttrs,
        ...sets.dietaryRestAttrs,
      ]);
      const venueArm = new Set<string>();
      if (groundedRestAttrs.length && leakIds.length) {
        const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT entity_id AS id FROM core_entities
          WHERE entity_id = ANY(${uniq(leakIds.map((l) => l.restaurantId))}::uuid[])
            AND restaurant_attributes && ${groundedRestAttrs}::uuid[]`);
        for (const r of rows) venueArm.add(r.id);
      }
      const queryTokens = c.q
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length >= 3);
      const leaks: Row[] = [];
      const leakReasons = new Map<string, number>();
      for (const l of leakIds) {
        let reason: string;
        if (sets.rejects.includes(l.foodId)) reason = 'JUDGED-REJECT SERVED';
        else if (venueArm.has(l.restaurantId))
          reason = 'venue-attribute arm (whole menu of a matching restaurant)';
        else if (
          queryTokens.some((t) =>
            l.foodName.toLowerCase().includes(t.slice(0, 4)),
          )
        )
          reason = 'lexical-expansion arm (name look-alike)';
        else if (sets.softFoodAttrs.length)
          reason = 'dish-attribute arm (no concept relation)';
        else if (served.expansionFired)
          reason =
            'plan-expansion arm (lexical/attribute widening past the graph)';
        else reason = 'UNRELATED-CONCEPT (no arm explains it)';
        leakReasons.set(reason, (leakReasons.get(reason) ?? 0) + 1);
        if (leaks.length < 12)
          leaks.push({ connectionId: l.connId, food: l.foodName, reason });
      }

      const coverage =
        mustAppear.length === 0
          ? 1
          : (mustAppear.length - missing.length) / mustAppear.length;

      const leakCount = served.dishes.size
        ? Array.from(leakReasons).reduce((n, [, v]) => n + v, 0)
        : 0;

      const row: CaseResult = {
        query: c.q,
        viewport: c.view,
        why: c.why,
        grounded: groundedText,
        groundingShattered: shattered,
        anchors: sets.anchors.length,
        tier0Concepts: sets.tier0.length,
        ringConcepts: sets.ring.length,
        dietaryWallActive:
          sets.dietaryFoodAttrs.length + sets.dietaryRestAttrs.length > 0,
        served: {
          expansionFired: served.expansionFired,
          pages: served.pages,
          exhausted: served.exhausted,
          dishes: served.dishes.size,
          restaurants: served.restaurants.size,
          reportedTotals: served.totals,
        },
        truth: {
          candidates: truth.length,
          mustAppear: mustAppear.length,
          mayAppear: mayAppear.length,
        },
        coverage: Number(coverage.toFixed(4)),
        missing: missing.length,
        missReasons: Object.fromEntries(missReasons),
        missSamples,
        leaks: leakCount,
        leakReasons: Object.fromEntries(leakReasons),
        leakSamples: leaks,
        judgedRejectsServed: rejectsServed.length,
        judgedRejectSamples: Array.from(
          new Set(rejectsServed.map((d) => d.foodName)),
        ).slice(0, 8),
        expectEmpty: c.expectEmpty ?? false,
        honestEmptyHeld: c.expectEmpty
          ? served.dishes.size === 0 && served.restaurants.size === 0
          : null,
      };
      results.push(row);

      out(
        `${c.q.padEnd(30)} [${c.view}] cov=${(coverage * 100).toFixed(1)}% ` +
          `must=${mustAppear.length} miss=${missing.length} served=${served.dishes.size} ` +
          `leak=${leakCount} ${shattered ? 'SHATTERED' : ''}`,
      );
      for (const [reason, n] of missReasons)
        out(`      miss  ${String(n).padStart(4)}  ${reason}`);
      for (const [reason, n] of leakReasons)
        out(`      leak  ${String(n).padStart(4)}  ${reason}`);
      if (rejectsServed.length)
        out(
          `      REJECT ${String(rejectsServed.length).padStart(3)}  judged-reject concepts served: ` +
            Array.from(new Set(rejectsServed.map((d) => d.foodName))).join(
              ', ',
            ),
        );
    }

    const totalMust = results.reduce(
      (n, r) => n + (r.truth as any).mustAppear,
      0,
    );
    const totalMiss = results.reduce((n, r) => n + (r.missing as number), 0);
    /** the gate's pass condition — see the assertion at the end of main(). */
    const totalUnexplained = results.reduce(
      (n, r) =>
        n +
        ((r.missReasons as Record<string, number> | undefined)?.UNEXPLAINED ??
          0),
      0,
    );
    const totalLeak = results.reduce((n, r) => n + (r.leaks as number), 0);
    const totalServed = results.reduce(
      (n, r) => n + (r.served as any).dishes,
      0,
    );
    const totalRejects = results.reduce(
      (n, r) => n + (r.judgedRejectsServed as number),
      0,
    );
    out('');
    out(
      `CORPUS: must-appear=${totalMust} missing=${totalMiss} ` +
        `coverage=${totalMust ? (((totalMust - totalMiss) / totalMust) * 100).toFixed(1) : '100.0'}% ` +
        `served=${totalServed} leaks=${totalLeak} judged-rejects-served=${totalRejects}`,
    );

    const artifact = {
      generatedAt: started,
      pageSize: PAGE_SIZE,
      maxPages: MAX_PAGES,
      mutation: MUTATE || null,
      siblingCut: SIB,
      corpus: {
        mustAppear: totalMust,
        missing: totalMiss,
        served: totalServed,
        leaks: totalLeak,
        judgedRejectsServed: totalRejects,
        coverage: totalMust ? (totalMust - totalMiss) / totalMust : 1,
        unexplainedMisses: totalUnexplained,
      },
      cases: results,
    };
    fs.writeFileSync(JSON_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
    out(`wrote ${JSON_PATH}`);

    // WHAT THIS GATE ASSERTS — and why it is not a row count (F9).
    //
    // This script carried `@script-class: gate` while always exiting 0: it
    // reported and never failed, which is the always-green disease the map
    // saga cost months to learn. Making it fail needs a pass condition that
    // survives a LIVE corpus, and the two obvious candidates both fail that:
    //
    //   - A FROZEN SNAPSHOT (pin the corpus, diff the numbers) makes the run
    //     reproducible by severing it from the data relationships it exists to
    //     walk. It would go green on a corpus that no longer resembles
    //     production, which is the one thing this harness was built not to do.
    //   - A TOLERANCE BAND on coverage% absorbs exactly the drift it cannot
    //     distinguish from a regression. Every count here moves for honest
    //     reasons — collection adds dishes, the judge settles claims, a
    //     concurrent writer banks surfaces (the 383-row write that reddened
    //     cp-29 mid-wave landed while this battery was being read). A band wide
    //     enough to be quiet is wide enough to hide a real loss.
    //
    // So the gate asserts the ATTRIBUTION INVARIANT instead: every must-appear
    // row the API did not serve is explained by a NAMED arm. That is a property
    // of the instrument, not of the corpus — it does not drift when dishes are
    // added, and it goes red the moment a miss appears that no known mechanism
    // accounts for, which is precisely the event worth waking up for. The
    // counts stay in the artifact as diagnosis; they are not the pass
    // condition. A mutation run is exempt: `--mutate=` deliberately breaks the
    // derivation to prove the instrument can show red, so unexplained misses
    // there are the POINT rather than the failure.
    if (totalUnexplained > 0 && !MUTATE) {
      out('');
      out(
        `FAIL: ${totalUnexplained} must-appear row(s) went unserved with no arm to explain them.`,
      );
      out(
        'Each is either a real coverage loss or an arm this chase is missing.',
      );
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
