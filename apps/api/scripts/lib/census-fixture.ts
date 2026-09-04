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
 *  a non-Latin script — the shapes a fold mutation is most likely to move.
 *  The stored Google types are exactly the ones the classification
 *  invariant's mutations delete (taco_restaurant, establishment) — a census
 *  fixture must hold what the proof removes, or the proof stays vacuous. */
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
               '{"googlePlaces":{"types":["restaurant","taco_restaurant","establishment","point_of_interest"]}}'::jsonb)`,
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

/**
 * NAME-RECALL CENSUS (recall-scope rederivation, 2026-09-04). The scanner
 * asks every live entity to answer to its OWN name through the judge's
 * recall, so it needs (a) at least one live entity — the fold fixture's
 * surface-less places cover an empty database, and their lack of surfaces
 * is the point: the name arm is their ONLY recall path — and (b) at least
 * one PENDING row, because the adoption scope's status law ("active or
 * pending") is the second thing the census proves and a corpus with no
 * pending rows would let a mutation narrowing it to 'active' pass blind.
 */
export async function ensureNameRecallCensusFixture(
  prisma: PrismaClient,
): Promise<void> {
  await ensureFoldCensusFixture(prisma);
  const pending = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT count(*) AS n FROM core_entities
      WHERE status = 'pending'
        AND type IN ('place','item','ingredient','item_attribute','place_attribute')`,
  );
  if (Number(pending[0]?.n ?? 0) > 0) return;
  const name = `${CENSUS_FIXTURE_TAG}Pending Attribute`;
  const identity = identityInsertData(name, 'place_attribute' as never);
  await prisma.$executeRawUnsafe(
    `INSERT INTO core_entities
       (entity_id, name, type, status, identity_key, identity_key_sorted, fold_version)
     VALUES ($1::uuid, $2, 'place_attribute'::entity_type, 'pending'::entity_status, $3, $4, $5)`,
    randomUUID(),
    name,
    identity.identityKey,
    identity.identityKeySorted,
    identity.foldVersion,
  );
  console.log('census fixture: seeded 1 pending attribute — none existed');
}
