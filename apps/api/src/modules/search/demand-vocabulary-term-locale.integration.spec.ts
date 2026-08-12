import { PrismaClient } from '@prisma/client';
import { AdvisoryLockService } from '../../shared/advisory-lock/advisory-lock.service';
import { DemandVocabularyService } from './demand-vocabulary.service';
import { canonicalFold } from '../content-processing/entity-resolver/entity-identity';

/**
 * THE DEMAND SWEEP ASKS ITS QUESTION IN THE LANGUAGE THE ASK WAS MADE IN.
 *
 * Two behaviours, neither of which the corpus can currently exercise (the
 * local ledger holds ZERO `on_demand_ask` signals, so the sweep considers
 * nothing and every claim about it would be vacuous):
 *
 *  1. "Do we already know this word?" is a question about a LANGUAGE. The gate
 *     used to compare the term against EVERY locale's surfaces at once, so a
 *     word we hold only in Vietnamese made an English ask look already-known
 *     and it was never learned — silently, forever, because a suppressed term
 *     produces no judge call and no log line.
 *  2. The banked alias carries the ASK's own locale (signals.detected_locale),
 *     not a run-wide flag an operator typed. A sweep cannot know what language
 *     other people searched in; the ledger already recorded it.
 *
 * The judge and the recall core are stubbed — this file is about which terms
 * REACH them and what gets written, not about the judge's verdicts (and a
 * spec must never spend LLM money to say so).
 */
const prisma = new PrismaClient();

const ENTITY = '00000000-0000-4000-8000-0000006a0000';
const ACTORS = [
  '00000000-0000-4000-8000-0000006a0001',
  '00000000-0000-4000-8000-0000006a0002',
  '00000000-0000-4000-8000-0000006a0003',
];
const ENTITY_NAME = 'zzdemand scratch concept';
/** The asked word. Nothing a user can type collides with it. */
const TERM = 'zzdemandword';

const LOG = {
  setContext: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
} as never;

/** Judge says MATCH on the single stubbed candidate; no network, no spend. */
function buildService(): DemandVocabularyService {
  const entityTextSearch = {
    retrieveCandidates: jest.fn(() =>
      Promise.resolve([{ entityId: ENTITY, name: ENTITY_NAME }]),
    ),
  } as never;
  const llm = {
    matchEntity: jest.fn(() =>
      Promise.resolve({ decision: 'match', candidateId: 0 }),
    ),
  } as never;
  return new DemandVocabularyService(
    prisma as never,
    llm,
    entityTextSearch,
    new AdvisoryLockService(),
    LOG,
  );
}

async function seedEntity(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO core_entities (entity_id, name, type, status, identity_key, identity_key_sorted)
     VALUES ($1::uuid, $2, 'food'::entity_type, 'active'::entity_status, $3, $3)
     ON CONFLICT (entity_id) DO NOTHING`,
    ENTITY,
    ENTITY_NAME,
    canonicalFold(ENTITY_NAME),
  );
}

/** The ask, recorded the way the search path records it: one row per actor
 *  (the k-floor view counts DISTINCT actors) plus the daily rollup the view
 *  actually reads. */
async function seedAsks(detectedLocale: string | null): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  for (const actor of ACTORS) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO signals
         (signal_id, kind, subject_type, subject_text, actor_id, occurred_at,
          geo_min_lat, geo_min_lng, geo_max_lat, geo_max_lng, meta, detected_locale)
       VALUES (gen_random_uuid(), 'on_demand_ask', 'term', $1, $2::uuid, now(),
               30.2, -97.8, 30.4, -97.6, '{"reason":"unresolved"}'::jsonb, $3)`,
      TERM,
      actor,
      detectedLocale,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO signal_demand_daily
         (row_id, day, place_id, actor_id, kind, subject_type, subject_text,
          signal_count, last_occurred_at)
       VALUES (gen_random_uuid(), $1::date, NULL, $2::uuid, 'on_demand_ask',
               'term', $3, 1, now())`,
      day,
      actor,
      TERM,
    );
  }
}

/** A surface holding the asked word IN ONE LOCALE — the thing that decides
 *  whether the term counts as already known. */
async function seedKnownSurface(locale: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO entity_surface
       (entity_id, form, form_folded, locale, role, source, confidence, status)
     VALUES ($1::uuid, $2, $3, $4, 'recall', 'seed', 1, 'active')
     ON CONFLICT (entity_id, locale, form) DO NOTHING`,
    ENTITY,
    TERM,
    canonicalFold(TERM),
    locale,
  );
}

async function cleanup(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM signals WHERE actor_id = ANY($1::uuid[])`,
    ACTORS,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM signal_demand_daily WHERE actor_id = ANY($1::uuid[])`,
    ACTORS,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM entity_surface WHERE entity_id = $1::uuid`,
    ENTITY,
  );
}

async function bankedLocales(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ locale: string }>>(
    `SELECT locale FROM entity_surface
      WHERE entity_id = $1::uuid AND source = 'query_banking' ORDER BY locale`,
    ENTITY,
  );
  return rows.map((row) => row.locale);
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — a skipped demand-locale test proves nothing.',
    );
  }
  await prisma.$connect();
  await seedEntity();
});

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await prisma.$executeRawUnsafe(
    `DELETE FROM core_entities WHERE entity_id = $1::uuid`,
    ENTITY,
  );
  await prisma.$disconnect();
});

describe('demand vocabulary — the term carries its own language', () => {
  it('a word known ONLY IN ANOTHER LANGUAGE does not suppress the ask, and banks in the ASK’s locale', async () => {
    await seedAsks('es');
    await seedKnownSurface('vi');

    const summary = await buildService().run({ limit: 20 });

    // Considered and learned: holding this word in Vietnamese says nothing
    // about whether we know it in Spanish. The all-locales gate skipped it.
    expect(summary.termsConsidered).toBe(1);
    expect(summary.learned).toBe(1);
    // And the row is tagged with the language the ASK was made in.
    expect(await bankedLocales()).toEqual(['es']);
  });

  it('a word known IN THE ASK’S OWN LANGUAGE is already vocabulary — nothing is judged', async () => {
    await seedAsks('es');
    await seedKnownSurface('es');

    const summary = await buildService().run({ limit: 20 });

    expect(summary.termsConsidered).toBe(0);
    expect(summary.judged).toBe(0);
    expect(await bankedLocales()).toEqual([]);
  });

  it('a word known UNTAGGED (und) is known to every language — the chain always ends there', async () => {
    await seedAsks('vi');
    await seedKnownSurface('und');

    const summary = await buildService().run({ limit: 20 });

    expect(summary.termsConsidered).toBe(0);
  });

  it('an ask whose language is UNDECIDABLE banks und — the honest answer, never a guess', async () => {
    await seedAsks(null);

    const summary = await buildService().run({ limit: 20 });

    expect(summary.learned).toBe(1);
    expect(await bankedLocales()).toEqual(['und']);
  });
});
