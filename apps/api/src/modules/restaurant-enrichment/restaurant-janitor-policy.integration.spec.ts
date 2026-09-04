/**
 * THE GROUNDED-LIFECYCLE POLICY — against a REAL Postgres (integration).
 *
 * Why this file exists (F370/D30): the only spec guarding who gets ARCHIVED
 * was a REGEX SCAN OF SOURCE TEXT that stayed green when the archive
 * comparison was inverted. A policy that decides whether an entity is
 * destroyed is BEHAVIOUR, and behaviour is proven by running it: every
 * assertion below is about WHICH ids an arm SELECTED
 * (`JanitorSummary.selected`).
 *
 * SLIM JANITOR (owner ruling 2026-08-08): the ungrounded retry/archive arms
 * are DELETED — retry is mention-driven and the money guard lives in the
 * enrichment service (tested in terminal-failure-guard.spec.ts). What
 * remains, and what this file proves, is the grounded-place lifecycle:
 *   - archive ONLY on Google's own verdict — every location
 *     CLOSED_PERMANENTLY — never a restaurant with any open/unknown
 *     location, and NEVER an ungrounded placeholder however bad its history
 *     (ungrounded entities are cheap to keep and carry real evidence; only a
 *     confirmed corpse is retired);
 *   - select moved locations for forced re-enrichment.
 *
 * The whole pass runs `dryRun: true` — the SELECTs are the policy, and a dry
 * pass neither archives, enriches, nor spends. The enrichment collaborator is
 * a stub that THROWS, which proves that.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev database, never prod)
 * It FAILS LOUDLY without one rather than skipping.
 */
import { PrismaClient } from '@prisma/client';
import { PlaceJanitorService } from './restaurant-janitor.service';
import type { PlaceLocationEnrichmentService } from './restaurant-location-enrichment.service';

const TEST_TAG = 'itest-janitor-policy';

const prisma = new PrismaClient();

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

const enrichment = {
  enrichPlaceById: () => {
    throw new Error('a dry janitor pass must never enrich (Places spend)');
  },
  refreshStaleLocations: () => {
    throw new Error('a dry janitor pass must never refresh (Places spend)');
  },
} as unknown as PlaceLocationEnrichmentService;

/** The lifecycle settings have ONE home now (F365); this spec passes explicit
 *  options for every knob, so the config layer only has to exist. */
const config = {
  // The gate reads the boot-validated threshold; everything else stays
  // undefined so run() keeps proving it takes explicit options for every
  // other knob.
  get: (key: string) =>
    key === 'locationLifecycle.noMatchAttemptThreshold' ? 3 : undefined,
} as never;

const janitor = new PlaceJanitorService(
  prisma as never,
  enrichment,
  config,
  logger,
  { emit: jest.fn() } as never, // ops alerts — the failed-pass scream
);

type SeedOpts = {
  /** Case name; becomes the entity name, tag-prefixed. */
  label: string;
  failureCount?: number;
  /** One entry per location row: its business_status (null = unknown) and
   *  whether it is grounded (has a google_place_id). */
  locations: Array<{ businessStatus: string | null; grounded: boolean }>;
  movedPlaceId?: string;
  /** Seed a real user→list→item anchor chain pointing at the entity. */
  userAnchored?: boolean;
};

/** entity_id → label, so assertions read in labels. */
const labelById = new Map<string, string>();

async function seedPlace(opts: SeedOpts): Promise<void> {
  const [row] = await prisma.$queryRawUnsafe<Array<{ entity_id: string }>>(
    `INSERT INTO core_entities (name, type, status, enrichment_failure_count)
     VALUES ($1, 'place', 'active', $2)
     RETURNING entity_id`,
    `${TEST_TAG}:${opts.label}`,
    opts.failureCount ?? 0,
  );
  for (const [index, location] of opts.locations.entries()) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO core_restaurant_locations
         (restaurant_id, google_place_id, business_status, moved_place_id)
       VALUES ($1::uuid, $2, $3, $4)`,
      row.entity_id,
      location.grounded ? `${TEST_TAG}-place-${opts.label}-${index}` : null,
      location.businessStatus,
      opts.movedPlaceId ?? null,
    );
  }
  if (opts.userAnchored) {
    const [user] = await prisma.$queryRawUnsafe<Array<{ user_id: string }>>(
      `INSERT INTO users (email, updated_at)
       VALUES ($1, now()) RETURNING user_id`,
      `${TEST_TAG}-${opts.label}@janitor.spec`,
    );
    const [list] = await prisma.$queryRawUnsafe<Array<{ list_id: string }>>(
      `INSERT INTO user_lists (owner_user_id, name, list_type, updated_at)
       VALUES ($1::uuid, $2, 'restaurant', now()) RETURNING list_id`,
      user.user_id,
      `${TEST_TAG}:${opts.label}`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO user_list_items (list_id, restaurant_id, updated_at)
       VALUES ($1::uuid, $2::uuid, now())`,
      list.list_id,
      row.entity_id,
    );
  }
  labelById.set(row.entity_id, opts.label);
}

/** The arm's selection, narrowed to THIS spec's fixtures. Other rows in the
 *  dev database are none of this test's business. */
const seededLabels = (ids: string[]): string[] =>
  ids
    .map((id) => labelById.get(id))
    .filter((label): label is string => label !== undefined)
    .sort();

async function cleanup(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM user_list_items
      WHERE list_id IN (SELECT list_id FROM user_lists
                         WHERE name LIKE '${TEST_TAG}:%')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM user_lists WHERE name LIKE '${TEST_TAG}:%'`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM users WHERE email LIKE '${TEST_TAG}-%@janitor.spec'`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM core_restaurant_locations
      WHERE restaurant_id IN (SELECT entity_id FROM core_entities
                               WHERE name LIKE '${TEST_TAG}:%')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM core_entities WHERE name LIKE '${TEST_TAG}:%'`,
  );
}

let summary: Awaited<ReturnType<PlaceJanitorService['run']>>;
let selected: Awaited<ReturnType<PlaceJanitorService['run']>>['selected'];

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'restaurant-janitor-policy.integration.spec requires DATABASE_URL (a dev database)',
    );
  }
  await cleanup();

  // ── The closed arm's axes ──────────────────────────────────────────────
  // ALL locations confirmed closed → the only archivable shape.
  await seedPlace({
    label: 'all-closed',
    locations: [
      { businessStatus: 'CLOSED_PERMANENTLY', grounded: true },
      { businessStatus: 'CLOSED_PERMANENTLY', grounded: true },
    ],
  });
  // One branch still open → the restaurant lives.
  await seedPlace({
    label: 'one-branch-open',
    locations: [
      { businessStatus: 'CLOSED_PERMANENTLY', grounded: true },
      { businessStatus: 'OPERATIONAL', grounded: true },
    ],
  });
  // Unknown status is NOT closed — never archive on absence of evidence.
  await seedPlace({
    label: 'status-unknown',
    locations: [{ businessStatus: null, grounded: true }],
  });
  // ── The ungroundable-survival gate's axes (2026-08-12 ruling + SD-3) ──
  // Terminal definitive-failure history, ungrounded, unanchored: the gate's
  // ONE archivable shape.
  await seedPlace({
    label: 'ungrounded-many-failures',
    failureCount: 99,
    locations: [{ businessStatus: null, grounded: false }],
  });
  // Below the threshold: attempts remain; the gate must wait.
  await seedPlace({
    label: 'ungrounded-below-threshold',
    failureCount: 1,
    locations: [{ businessStatus: null, grounded: false }],
  });
  // Terminal AND user-anchored: the anchor law outranks the gate, always.
  await seedPlace({
    label: 'ungrounded-terminal-anchored',
    failureCount: 99,
    locations: [{ businessStatus: null, grounded: false }],
    userAnchored: true,
  });
  // Every location closed AND user-anchored: the anchor law outranks the
  // closed arm too (red team 2026-09-04 E-5) — the saved place stays.
  await seedPlace({
    label: 'all-closed-anchored',
    locations: [{ businessStatus: 'CLOSED_PERMANENTLY', grounded: true }],
    userAnchored: true,
  });
  await seedPlace({
    label: 'open',
    locations: [{ businessStatus: 'OPERATIONAL', grounded: true }],
  });

  // ── The moved arm ──────────────────────────────────────────────────────
  await seedPlace({
    label: 'moved',
    locations: [{ businessStatus: 'OPERATIONAL', grounded: true }],
    movedPlaceId: `${TEST_TAG}-moved-target`,
  });

  summary = await janitor.run({
    movedRetryLimit: 1_000_000,
    dryRun: true,
  });
  selected = summary.selected;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('grounded-lifecycle policy, proven against Postgres', () => {
  it('archives ONLY restaurants whose every location Google confirmed closed', () => {
    // MUTATION FIXTURES in one assertion:
    //   drop the NOT EXISTS open-location clause : one-branch-open appears
    //   treat NULL status as closed              : status-unknown appears
    expect(seededLabels(selected.closed)).toEqual(['all-closed']);
  });

  it('the ungroundable gate archives EXACTLY the terminal, unanchored ghost', () => {
    // MUTATION FIXTURES in one assertion:
    //   drop the threshold clause      : ungrounded-below-threshold appears
    //   drop the anchor NOT EXISTS     : ungrounded-terminal-anchored appears
    //   drop the ungrounded predicate  : grounded terminals would appear
    expect(seededLabels(selected.ungroundable)).toEqual([
      'ungrounded-many-failures',
    ]);
  });

  it('the closed and moved arms still never touch ungrounded placeholders', () => {
    expect(seededLabels(selected.closed)).not.toContain(
      'ungrounded-many-failures',
    );
    expect(seededLabels(selected.moved)).not.toContain(
      'ungrounded-many-failures',
    );
  });

  it('selects moved locations for forced re-enrichment, and only those', () => {
    expect(seededLabels(selected.moved)).toEqual(['moved']);
  });

  it('a dry pass reports counts consistent with its selections', () => {
    expect(summary.archivedClosed).toBe(selected.closed.length);
    expect(summary.archivedUngroundable).toBe(selected.ungroundable.length);
    expect(summary.reEnrichedMoved).toBe(selected.moved.length);
  });
});
