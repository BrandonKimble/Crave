/**
 * A MERGED-AWAY ID STILL FINDS ITS HISTORY — asked of Postgres.
 *
 * F202: `lastEntityViewAt` is the repeat-view dedupe valve, and it filtered
 * `s.subject_id = $1` raw. After an entity merge the loser id's view history
 * became invisible to it, so it re-recorded a view it had already seen — every
 * time, forever, for every merged entity.
 *
 * WHAT THIS REPLACED. A spec sliced the service's source text and asserted the
 * method body contained `redirectJoinSql('s')` and `subjectMatchesSql(`. That
 * is the shape of the fix, not the fix: it passes on a method that builds the
 * right SQL and never runs it, on one that resolves identity in a dead branch,
 * and on any refactor that keeps the tokens while changing what they compose
 * into. A sibling ESLint rule (see eslint.config.mjs) now makes hand-rolling
 * the join impossible, which leaves exactly one thing worth asserting and only
 * one way to assert it: merge two entities and ask whether the history follows.
 *
 * Run: yarn test:db  (needs DATABASE_URL — a dev database, never prod)
 */
import { PrismaClient } from '@prisma/client';
import { SignalDemandReadService } from './signal-demand-read.service';

const LOG = {
  setContext: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
} as never;

const USER = '00000000-0000-4000-8000-00000000f202';
const ACTOR = '00000000-0000-4000-8000-00000000a202';
const LOSER = '00000000-0000-4000-8000-00000000105e';
const SURVIVOR = '00000000-0000-4000-8000-000000005099';
const VIEWED_AT = new Date('2026-07-20T10:00:00Z');

const prisma = new PrismaClient();
const reads = new SignalDemandReadService(prisma as never, LOG);

async function cleanup() {
  await prisma.$executeRaw`DELETE FROM signals WHERE actor_id = ${ACTOR}::uuid`;
  await prisma.$executeRaw`DELETE FROM entity_redirects WHERE from_entity_id = ${LOSER}::uuid`;
  await prisma.$executeRaw`DELETE FROM signal_actors WHERE actor_id = ${ACTOR}::uuid`;
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — a skipped merge test proves nothing.',
    );
  }
  await prisma.$connect();
  await cleanup();

  await prisma.$executeRaw`
    INSERT INTO signal_actors (actor_id, user_id) VALUES (${ACTOR}::uuid, ${USER}::uuid)
  `;
  // A view recorded against the id that later LOSES a merge.
  await prisma.$executeRaw`
    INSERT INTO signals (signal_id, kind, subject_type, subject_id, actor_id,
                         occurred_at, place_id)
    VALUES (gen_random_uuid(), 'entity_view', 'entity', ${LOSER}::uuid,
            ${ACTOR}::uuid, ${VIEWED_AT}, gen_random_uuid())
  `;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('lastEntityViewAt resolves subject identity at read', () => {
  it('finds the view under its ORIGINAL id before any merge', async () => {
    // Establishes the fixture is visible at all, so the post-merge assertion
    // below cannot pass vacuously by finding nothing either way.
    await expect(
      reads.lastEntityViewAt(USER, { entityId: LOSER }),
    ).resolves.toEqual(VIEWED_AT);
  });

  it('THE F202 CASE: after a merge, the SURVIVOR inherits the history', async () => {
    await prisma.$executeRaw`
      INSERT INTO entity_redirects (from_entity_id, to_entity_id)
      VALUES (${LOSER}::uuid, ${SURVIVOR}::uuid)
    `;
    // The valve asks about the survivor; the act was recorded against the
    // loser. Raw `subject_id = $1` returns null here, and the caller then
    // re-records a view it has already seen.
    await expect(
      reads.lastEntityViewAt(USER, { entityId: SURVIVOR }),
    ).resolves.toEqual(VIEWED_AT);
  });

  it('an unrelated entity still finds nothing — the fold-back is not a wildcard', async () => {
    await expect(
      reads.lastEntityViewAt(USER, {
        entityId: '00000000-0000-4000-8000-0000000000ff',
      }),
    ).resolves.toBeNull();
  });
});
