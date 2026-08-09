/**
 * LOCALIZED-SURFACE LANE RETURNS THE BEST MATCHES, NOT THE LOWEST UUIDs
 * (F3801) — against a REAL Postgres (integration).
 *
 * THE DEFECT: the query was a single-level
 *   `SELECT DISTINCT ON (e.entity_id) ... ORDER BY e.entity_id, exact DESC
 *    LIMIT n`.
 * `ORDER BY e.entity_id` first is REQUIRED by DISTINCT ON for dedup, so the
 * `exact DESC` key was subordinate to it and only ever chose the best ALIAS
 * ROW WITHIN one entity — it had no influence on WHICH ENTITIES the outer
 * LIMIT kept. The LIMIT therefore sliced a UUID-sorted set. Measured on the
 * local corpus before the fix (term 'taco', chain ['es','und'], type food,
 * limit 20): exact_available 1, exact_returned 0, 20 prefix-extensions
 * returned instead. Callers are told otherwise — the mapper tiers an exact
 * hit at similarity 1.0 / evidence 'exact' so the link decider treats it as
 * the strongest evidence, and UUID ordering was removing that row.
 *
 * WHY A DB SPEC: the bug is entirely in how Postgres resolves DISTINCT ON
 * against LIMIT. A mock cannot demonstrate it; only a real planner ordering
 * real rows can.
 *
 * THE SEED IS ADVERSARIAL BY CONSTRUCTION: the one EXACT-match entity gets a
 * UUID that sorts AFTER every prefix-match entity, and there are more prefix
 * matches than the limit. Under the old shape the exact match is guaranteed
 * to be sliced off; under the fix (dedup inner, relevance ORDER BY outer,
 * LIMIT last) it must come back FIRST.
 *
 * MUTATION: revert `searchLocalizedSurfaces` to the single-level shape (drop
 * the wrapper and the outer `ORDER BY deduped."exact" DESC, ...`) and this
 * spec goes RED. Verified in both directions.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 * It FAILS LOUDLY without one rather than skipping.
 */
import { PrismaClient } from '@prisma/client';
import { EntityTextSearchService } from './entity-text-search.service';
import { canonicalFold } from '../content-processing/entity-resolver/entity-identity';

const TEST_TAG = 'itest-localized-exact';
// A synthetic surface no real corpus row can collide with.
const TERM = 'zzqlocalized';
const PREFIX_COUNT = 6;
const LIMIT = 3;

const prisma = new PrismaClient();

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

// searchLocalizedSurfaces touches only `this.prisma` (and `this.logger` via
// the constructor); the embedding service is never reached on this lane.
const service = new EntityTextSearchService(
  prisma as never,
  {} as never,
  logger,
);

// The EXACT match sorts LAST by entity_id; every prefix match sorts before
// it. So a query that ranks by entity_id and then truncates CANNOT return
// the exact row — which is precisely the defect.
const EXACT_ENTITY_ID = 'ffffffff-ffff-4fff-8fff-fffffffffff1';
const prefixEntityIds = Array.from(
  { length: PREFIX_COUNT },
  (_, i) => `00000000-0000-4000-8000-00000000000${i + 1}`,
);
const allIds = [...prefixEntityIds, EXACT_ENTITY_ID];

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — this spec proves a SQL ORDER BY and must not be skipped',
    );
  }

  await prisma.entity.create({
    data: {
      entityId: EXACT_ENTITY_ID,
      name: `${TEST_TAG}-exact`,
      type: 'food',
    },
  });
  await prisma.entitySurface.create({
    data: {
      entityId: EXACT_ENTITY_ID,
      form: TERM,
      formFolded: canonicalFold(TERM),
      locale: 'es',
      source: 'seed',
      status: 'active',
    },
  });

  for (const [index, entityId] of prefixEntityIds.entries()) {
    const surface = `${TERM}extension${index}`;
    await prisma.entity.create({
      data: { entityId, name: `${TEST_TAG}-prefix-${index}`, type: 'food' },
    });
    await prisma.entitySurface.create({
      data: {
        entityId,
        form: surface,
        formFolded: canonicalFold(surface),
        locale: 'es',
        source: 'seed',
        status: 'active',
      },
    });
  }
});

afterAll(async () => {
  await prisma.entitySurface.deleteMany({
    where: { entityId: { in: allIds } },
  });
  await prisma.entity.deleteMany({ where: { entityId: { in: allIds } } });
  await prisma.$disconnect();
});

describe('searchLocalizedSurfaces: the exact match survives the LIMIT (F3801)', () => {
  it('returns the exact match FIRST even though its entity_id sorts after every prefix match', async () => {
    const matches = await service.searchLocalizedSurfaces(
      TERM,
      ['food'],
      LIMIT,
      'es',
    );

    expect(matches).toHaveLength(LIMIT);
    // The row's own acceptance criterion: exact_available 1 -> exact returned.
    expect(matches[0]).toMatchObject({
      entityId: EXACT_ENTITY_ID,
      similarity: 1,
      evidence: 'exact',
    });
    // And the tier really is distinguishable — the rest are prefix evidence.
    expect(matches.slice(1).map((m) => m.evidence)).toEqual(
      Array(LIMIT - 1).fill('prefix'),
    );
  });

  it('tiers by the MATCHED FORM, not the entity name (the alias IS the point)', async () => {
    // THE LAW, stated directly rather than caught in passing. Every arm of
    // this lane's WHERE tests `ea.form_folded`, so the tier must ask the same
    // column. The seeds above are the case that matters: the aliases are
    // `zzqlocalizedextension0..5` while the entity NAMES are
    // `itest-localized-prefix-N` — nothing in common. That is not contrived,
    // it is the whole reason the lane exists (a Spanish alias hanging off an
    // entity named in another language).
    //
    // Classifying with canonicalFold(row.name) made every such row fall
    // through to 'fuzzy', where the linker judges by fuzzy floors (~0.95
    // absolute) instead of the prefix band — a user typing a prefix in their
    // own language got their best suggestions rejected or outranked. It was
    // unreachable while the lane was exact+prefix and every non-exact row was
    // 'prefix' anyway; the AC-P2c trigram arm gave the misread a third tier
    // to land in.
    const matches = await service.searchLocalizedSurfaces(
      TERM,
      ['food'],
      LIMIT,
      'es',
    );
    const prefixRows = matches.filter((m) => m.evidence === 'prefix');

    expect(prefixRows.length).toBe(LIMIT - 1);
    for (const row of prefixRows) {
      // The name shares NOTHING with the term — if the tier consulted the
      // name, this row could not be 'prefix'.
      expect(canonicalFold(row.name).startsWith(canonicalFold(TERM))).toBe(
        false,
      );
      // And the score is coverage of the MATCHED SURFACE
      // (`zzqlocalized` of `zzqlocalizedextensionN`), never of the name.
      const expected =
        canonicalFold(TERM).length / canonicalFold(`${TERM}extension0`).length;
      expect(row.similarity).toBeCloseTo(expected, 5);
      expect(row.similarity).toBeLessThan(1);
    }
  });

  it('is deterministic across repeated executions (unique entity_id tiebreak, F1902)', async () => {
    const first = await service.searchLocalizedSurfaces(
      TERM,
      ['food'],
      LIMIT,
      'es',
    );
    const second = await service.searchLocalizedSurfaces(
      TERM,
      ['food'],
      LIMIT,
      'es',
    );
    expect(second.map((m) => m.entityId)).toEqual(first.map((m) => m.entityId));
  });

  it('deduplicates to one row per entity even when an entity has several matching aliases', async () => {
    // The dedup the DISTINCT ON exists for must survive being moved inward.
    await prisma.entitySurface.create({
      data: {
        entityId: EXACT_ENTITY_ID,
        form: `${TERM}alt`,
        formFolded: canonicalFold(`${TERM}alt`),
        locale: 'es',
        source: 'seed',
        status: 'active',
      },
    });
    try {
      const matches = await service.searchLocalizedSurfaces(
        TERM,
        ['food'],
        LIMIT,
        'es',
      );
      const ids = matches.map((m) => m.entityId);
      expect(new Set(ids).size).toBe(ids.length);
      // Still the exact tier: the best alias row within the entity wins.
      expect(matches[0].entityId).toBe(EXACT_ENTITY_ID);
      expect(matches[0].evidence).toBe('exact');
    } finally {
      await prisma.entitySurface.deleteMany({
        where: { entityId: EXACT_ENTITY_ID, form: `${TERM}alt` },
      });
    }
  });
});
