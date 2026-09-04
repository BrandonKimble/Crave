/**
 * CENSUS SCANNERS MUST HAVE SOMETHING TO CENSUS (red team 2026-09-04, CI
 * invariants lane).
 *
 * Three invariants are proven by DB-census scanners: entity fold drift,
 * surface fold drift, and place-type classification. On this machine's
 * corpus a mutation to canonicalFold or the classifier makes them scream;
 * on CI's freshly-migrated EMPTY database they scanned zero rows, printed
 * "0 drifted", exited 0, and the harness recorded the mutation as ACCEPTED
 * — the proof could not show RED exactly where it runs unattended.
 *
 * So each scanner seeds a small deterministic fixture when its eligible set
 * is empty, written by the CURRENT (unmutated) code on the harness's
 * baseline run; the mutated run then recomputes over those rows and drifts.
 * The fixture is tagged so it never masquerades as corpus, and it is
 * idempotent (re-runs find the rows and seed nothing).
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  canonicalFold,
  identityInsertData,
} from '../../src/modules/content-processing/entity-resolver/entity-identity';

export const CENSUS_FIXTURE_TAG = 'census-fixture:';

/** Names chosen to exercise the fold: diacritics, apostrophes, case,
 *  a non-Latin script — the shapes a fold mutation is most likely to move. */
const FIXTURE_NAMES = [
  `${CENSUS_FIXTURE_TAG}Phở Lệ`,
  `${CENSUS_FIXTURE_TAG}Café Crème`,
  `${CENSUS_FIXTURE_TAG}Joe's Pizza`,
  `${CENSUS_FIXTURE_TAG}Ramen 一風堂`,
];

async function activePlaceCount(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT count(*) AS n FROM core_entities WHERE status = 'active'`,
  );
  return Number(rows[0]?.n ?? 0);
}

async function fixtureIds(prisma: PrismaClient): Promise<string[]> {
  const existing = await prisma.$queryRawUnsafe<Array<{ entity_id: string }>>(
    `SELECT entity_id FROM core_entities WHERE name LIKE $1 ORDER BY name`,
    `${CENSUS_FIXTURE_TAG}%`,
  );
  return existing.map((row) => row.entity_id);
}

async function seedFixturePlaces(prisma: PrismaClient): Promise<string[]> {
  const existing = await fixtureIds(prisma);
  if (existing.length) return existing;
  const ids: string[] = [];
  for (const name of FIXTURE_NAMES) {
    const id = randomUUID();
    const identity = identityInsertData(name, 'place' as never);
    await prisma.$executeRawUnsafe(
      `INSERT INTO core_entities
         (entity_id, name, type, status, identity_key, identity_key_sorted, fold_version, restaurant_metadata)
       VALUES ($1::uuid, $2, 'place'::entity_type, 'active'::entity_status, $3, $4, $5,
               '{"googlePlaces":{"types":["restaurant","cafe","meal_takeaway"]}}'::jsonb)`,
      id,
      name,
      identity.identityKey,
      identity.identityKeySorted,
      identity.foldVersion,
    );
    ids.push(id);
  }
  console.log(
    `census fixture: seeded ${ids.length} place(s) — the eligible set was empty`,
  );
  return ids;
}

/** Seeds fixture PLACE entities (identity keys computed now) when no active
 *  entity exists. Returns the fixture entity ids (existing or new). */
export async function ensureFoldCensusFixture(
  prisma: PrismaClient,
): Promise<string[]> {
  if ((await activePlaceCount(prisma)) > 0) return fixtureIds(prisma);
  return seedFixturePlaces(prisma);
}

/** Seeds one active surface per fixture entity (form_folded computed now)
 *  when no active surface exists. */
export async function ensureSurfaceCensusFixture(
  prisma: PrismaClient,
): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT count(*) AS n FROM entity_surface WHERE status = 'active'`,
  );
  if (Number(rows[0]?.n ?? 0) > 0) return;
  const ids = await seedFixturePlaces(prisma);
  const names = await prisma.$queryRawUnsafe<
    Array<{ entity_id: string; name: string }>
  >(
    `SELECT entity_id, name FROM core_entities WHERE entity_id = ANY($1::uuid[])`,
    ids,
  );
  for (const row of names) {
    const form = row.name.slice(CENSUS_FIXTURE_TAG.length);
    await prisma.$executeRawUnsafe(
      `INSERT INTO entity_surface
         (entity_id, form, form_folded, locale, role, source, confidence, status, claim_grade)
       VALUES ($1::uuid, $2, $3, 'und', 'recall', 'extraction', 1, 'active', 'observed')
       ON CONFLICT DO NOTHING`,
      row.entity_id,
      form,
      canonicalFold(form),
    );
  }
  console.log(
    `census fixture: seeded ${names.length} surface(s) — the table was empty`,
  );
}

/** Seeds fixture places carrying known Google types when no place stores
 *  any types. */
export async function ensurePlaceTypeCensusFixture(
  prisma: PrismaClient,
): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT count(*) AS n FROM core_entities e
      WHERE e.type = 'place'
        AND jsonb_typeof(e.restaurant_metadata->'googlePlaces'->'types') = 'array'`,
  );
  if (Number(rows[0]?.n ?? 0) > 0) return;
  await seedFixturePlaces(prisma);
}
