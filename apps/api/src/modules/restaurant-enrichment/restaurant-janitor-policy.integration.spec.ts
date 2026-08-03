/**
 * THE ARCHIVE/RETRY POLICY — against a REAL Postgres (integration).
 *
 * Why this file exists (F370/D30): the only spec guarding who gets ARCHIVED
 * was a REGEX SCAN OF SOURCE TEXT. It pinned the column name and the increment
 * shape and asserted nothing about the comparison operator, the threshold, the
 * `status IN ('no_match','error')` filter, or the `google_place_id IS NULL`
 * predicate — the guard the $118 lesson bought. EXECUTED MUTATION: flipping
 * `enrichment_failure_count >= threshold` to `< threshold` makes the janitor
 * archive every HEALTHY placeholder and spare every genuinely failed one, i.e.
 * destroy exactly the entities it exists to preserve — and the old spec stayed
 * 4/4 GREEN. A scan of source is a spelling check; a policy that decides
 * whether an entity is destroyed is BEHAVIOUR, and behaviour is proven by
 * running it.
 *
 * Every case below is a policy STATE and every assertion is about WHICH ids
 * the arm SELECTED (`JanitorSummary.selected`, added for exactly this reason).
 * The mutations named in each case's comment are the fixtures: each turns at
 * least one case RED.
 *
 * The whole pass runs `dryRun: true` — the SELECTs are the policy, and a dry
 * pass neither archives, enriches, nor spends. The enrichment collaborator is
 * a stub that THROWS, which proves that.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev database, never prod)
 * It FAILS LOUDLY without one rather than skipping.
 */
import { PrismaClient } from '@prisma/client';
import { RestaurantJanitorService } from './restaurant-janitor.service';
import type { RestaurantLocationEnrichmentService } from './restaurant-location-enrichment.service';

const TEST_TAG = 'itest-janitor-policy';
const THRESHOLD = 3;
/** Larger than any realistic backlog, so the retry arm's LIMIT cannot decide
 *  the answer for us — this spec is about the PREDICATE; the cap is a separate
 *  (F366) question. */
const RETRY_LIMIT = 1_000_000;

const prisma = new PrismaClient();

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

const enrichment = {
  enrichRestaurantById: () => {
    throw new Error('a dry janitor pass must never enrich (Places spend)');
  },
  refreshStaleLocations: () => {
    throw new Error('a dry janitor pass must never refresh (Places spend)');
  },
} as unknown as RestaurantLocationEnrichmentService;

/** The lifecycle settings have ONE home now (F365); this spec passes explicit
 *  options for every knob, so the config layer only has to exist. */
const config = { get: () => undefined } as never;

const janitor = new RestaurantJanitorService(
  prisma as never,
  enrichment,
  config,
  logger,
);

type SeedOpts = {
  /** Case name; becomes the entity name, tag-prefixed. */
  label: string;
  failureCount: number;
  /** null = no lastEnrichmentAttempt blob at all. */
  attemptStatus: 'no_match' | 'error' | 'ok' | null;
  /** false = an ungrounded placeholder (a location row with a NULL place id). */
  grounded: boolean;
  /** false = no location rows at all. */
  hasLocations?: boolean;
  businessStatus?: string | null;
};

/** entity_id → label, so assertions read in labels. */
const labelById = new Map<string, string>();

async function seedRestaurant(opts: SeedOpts): Promise<void> {
  const metadata =
    opts.attemptStatus === null
      ? null
      : JSON.stringify({
          lastEnrichmentAttempt: { status: opts.attemptStatus },
        });
  const [row] = await prisma.$queryRawUnsafe<Array<{ entity_id: string }>>(
    `INSERT INTO core_entities (name, type, status, enrichment_failure_count,
                                restaurant_metadata)
     VALUES ($1, 'restaurant', 'active', $2, $3::jsonb)
     RETURNING entity_id`,
    `${TEST_TAG}:${opts.label}`,
    opts.failureCount,
    metadata,
  );
  if (opts.hasLocations !== false) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO core_restaurant_locations
         (restaurant_id, google_place_id, business_status)
       VALUES ($1::uuid, $2, $3)`,
      row.entity_id,
      opts.grounded ? `${TEST_TAG}-place-${opts.label}` : null,
      opts.businessStatus ?? null,
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
    `DELETE FROM core_restaurant_locations
      WHERE restaurant_id IN (SELECT entity_id FROM core_entities
                               WHERE name LIKE '${TEST_TAG}:%')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM core_entities WHERE name LIKE '${TEST_TAG}:%'`,
  );
}

let summary: Awaited<ReturnType<RestaurantJanitorService['run']>>;
let selected: Awaited<ReturnType<RestaurantJanitorService['run']>>['selected'];

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'restaurant-janitor-policy.integration.spec requires DATABASE_URL (a dev database)',
    );
  }
  await cleanup();

  // ── The archive arm's four axes, one fixture per axis ──────────────────
  // TERMINAL: failed at/past the threshold, never grounded. The only shape
  // arm 1 may archive.
  await seedRestaurant({
    label: 'terminal-no-match',
    failureCount: THRESHOLD,
    attemptStatus: 'no_match',
    grounded: false,
  });
  await seedRestaurant({
    label: 'terminal-error',
    failureCount: THRESHOLD + 5,
    attemptStatus: 'error',
    grounded: false,
  });
  // BELOW THRESHOLD: the comparison-direction fixture.
  await seedRestaurant({
    label: 'below-threshold',
    failureCount: THRESHOLD - 1,
    attemptStatus: 'no_match',
    grounded: false,
  });
  await seedRestaurant({
    label: 'never-failed',
    failureCount: 0,
    attemptStatus: null,
    grounded: false,
  });
  // GROUNDED: the $118 guard — a place-grounded restaurant is expensive,
  // verified knowledge and is never archived here, however bad its history.
  await seedRestaurant({
    label: 'grounded-but-failing',
    failureCount: THRESHOLD + 9,
    attemptStatus: 'error',
    grounded: true,
  });
  // WRONG STATUS: high count, but the last attempt did not fail.
  await seedRestaurant({
    label: 'high-count-status-ok',
    failureCount: THRESHOLD + 2,
    attemptStatus: 'ok',
    grounded: false,
  });
  // NO LOCATION ROWS AT ALL: arm 2 requires an EXISTS, so this shape falls in
  // neither arm (the gap F366 checked for and found empty in production).
  await seedRestaurant({
    label: 'no-locations',
    failureCount: 0,
    attemptStatus: null,
    grounded: false,
    hasLocations: false,
  });

  // ── Arm 3a: every location closed permanently ─────────────────────────
  await seedRestaurant({
    label: 'all-closed',
    failureCount: 0,
    attemptStatus: null,
    grounded: true,
    businessStatus: 'CLOSED_PERMANENTLY',
  });
  await seedRestaurant({
    label: 'open',
    failureCount: 0,
    attemptStatus: null,
    grounded: true,
    businessStatus: 'OPERATIONAL',
  });

  summary = await janitor.run({
    noMatchAttemptThreshold: THRESHOLD,
    retryLimit: RETRY_LIMIT,
    dryRun: true,
  });
  selected = summary.selected;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('archive policy, proven against Postgres', () => {
  it('selects EXACTLY the ungrounded placeholders whose last attempt failed at or past the threshold', () => {
    // MUTATION FIXTURES, all four in one assertion:
    //   `>= threshold` → `< threshold`        : below-threshold/never-failed appear
    //   drop `google_place_id IS NULL`        : grounded-but-failing appears
    //   widen `status IN ('no_match','error')`: high-count-status-ok appears
    //   drop the threshold comparison         : everything ungrounded appears
    expect(seededLabels(selected.unmatched)).toEqual([
      'terminal-error',
      'terminal-no-match',
    ]);
  });

  it('spares a place-grounded restaurant however bad its history ($118 law)', () => {
    expect(seededLabels(selected.unmatched)).not.toContain(
      'grounded-but-failing',
    );
  });

  it('archives a restaurant whose every location is CLOSED_PERMANENTLY, and only that one', () => {
    expect(seededLabels(selected.closed)).toEqual(['all-closed']);
  });
});

describe('retry policy, proven against Postgres', () => {
  it('selects EXACTLY the ungrounded placeholders still under the threshold, and only those with location rows', () => {
    // `high-count-status-ok` is ungrounded with locations but sits PAST the
    // threshold, so it is in neither arm — the janitor's own stated split.
    expect(seededLabels(selected.retryable)).toEqual([
      'below-threshold',
      'never-failed',
    ]);
  });

  it('the two arms are disjoint — no fixture is both archived and retried', () => {
    const archive = new Set(seededLabels(selected.unmatched));
    for (const label of seededLabels(selected.retryable)) {
      expect(archive.has(label)).toBe(false);
    }
  });

  it('a restaurant with no location rows is in neither arm', () => {
    expect(seededLabels(selected.unmatched)).not.toContain('no-locations');
    expect(seededLabels(selected.retryable)).not.toContain('no-locations');
  });

  it('an already-grounded restaurant is never retried (that is Places money for nothing)', () => {
    expect(seededLabels(selected.retryable)).not.toContain('open');
    expect(seededLabels(selected.retryable)).not.toContain('all-closed');
    expect(seededLabels(selected.retryable)).not.toContain(
      'grounded-but-failing',
    );
  });
});

describe('the lane reports its own backlog (F366)', () => {
  it('counts every ungrounded placeholder the predicate matches, not just the capped slice', () => {
    // The retry arm selects under a LIMIT; the backlog is the same predicate
    // UNCAPPED. With RETRY_LIMIT far above the corpus the two agree — which is
    // exactly the case where the lane converges. When they diverge (1,552 on
    // the mirror vs 25 per WEEKLY pass, measured 2026-08-03) the janitor now
    // says so in its log, instead of leaving "we are sampling, not
    // converging" derivable only by querying by hand.
    expect(summary.ungroundedBacklog).toBe(selected.retryable.length);
    expect(summary.ungroundedBacklog).toBeGreaterThanOrEqual(2);
  });
});
