/**
 * ARCHIVED SUBJECTS ARE NOT RANKABLE POLL SUBJECTS (F542) — against a REAL
 * Postgres (integration).
 *
 * Why a DB spec: `subjectDemandMass` is one large raw CTE query, and the leak
 * was a MISSING PREDICATE on its final join (`e.type IN ('food','restaurant')`
 * filtered TYPE but not STATUS), so an archived food/restaurant with demand
 * mass could be SEEDED AS A POLL SUBJECT. The sibling unit spec asserts SQL
 * structure; only the database can answer "does the archived subject come
 * back". This spec seeds the condition: one place, three subjects with
 * identical demand — an active one, an archived one, and a REDIRECTED one
 * whose survivor is archived (the read resolves the redirect first, so the
 * status check must apply to the SURVIVOR, not the stale id).
 *
 * MUTATION-CAPABLE: delete `AND e.status <> 'archived'` from
 * demand-mass.reader.ts and both negative cases go RED (the archived subject
 * and the redirected-to-archived one appear). Verified by running exactly that.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 * It FAILS LOUDLY without one rather than skipping.
 */
import { PrismaClient } from '@prisma/client';
import { DemandMassReader } from './demand-mass.reader';

const TEST_TAG = 'itest-demand-archived';
const ACTOR = '00000000-0000-4000-8000-0000000000d5';

const prisma = new PrismaClient();

const reader = new DemandMassReader(prisma as never);

let placeId: string;
const entityIds: string[] = [];

async function seedSubject(opts: {
  label: string;
  status: 'active' | 'archived';
}): Promise<string> {
  const entity = await prisma.entity.create({
    data: {
      name: `${TEST_TAG}-${opts.label}`,
      type: 'item',
      status: opts.status,
    },
  });
  entityIds.push(entity.entityId);
  return entity.entityId;
}

/** One day of demand for a subject at this place — identical across subjects,
 *  so ONLY status can explain a difference in the result. */
async function seedDemand(subjectId: string): Promise<void> {
  await prisma.signalDemandDaily.create({
    data: {
      day: new Date('2026-08-01'),
      placeId,
      actorId: ACTOR,
      kind: 'search',
      subjectType: 'entity',
      subjectId,
      signalCount: 4,
      lastOccurredAt: new Date('2026-08-01T12:00:00Z'),
    },
  });
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — this spec proves a SQL predicate and must not be skipped',
    );
  }
  const place = await prisma.place.create({
    data: {
      name: `${TEST_TAG}-place`,
      providerLevelCode: 'municipality',
      countryCode: 'US',
    },
  });
  placeId = place.placeId;
});

afterAll(async () => {
  await prisma.signalDemandDaily.deleteMany({ where: { placeId } });
  await prisma.entityRedirect.deleteMany({
    where: { fromEntityId: { in: entityIds } },
  });
  await prisma.entity.deleteMany({ where: { entityId: { in: entityIds } } });
  await prisma.place.deleteMany({ where: { placeId } });
  await prisma.$disconnect();
});

describe('subjectDemandMass: archived subjects never seed a poll (F542)', () => {
  it('returns the active subject and drops the archived + redirected-to-archived ones', async () => {
    const activeId = await seedSubject({ label: 'active', status: 'active' });
    const archivedId = await seedSubject({
      label: 'archived',
      status: 'archived',
    });
    const staleId = await seedSubject({ label: 'stale', status: 'active' });
    const deadSurvivorId = await seedSubject({
      label: 'dead-survivor',
      status: 'archived',
    });
    // The stale id was MERGED into a survivor that has since been archived —
    // the read resolves the redirect, so the status check must land on the
    // survivor.
    await prisma.entityRedirect.create({
      data: { fromEntityId: staleId, toEntityId: deadSurvivorId },
    });

    await seedDemand(activeId);
    await seedDemand(archivedId);
    await seedDemand(staleId);

    const rows = await reader.subjectDemandMass(
      [placeId],
      new Date('2026-08-02T12:00:00Z'),
    );
    const subjects = rows.map((r) => r.subjectId);

    expect(subjects).toContain(activeId);
    expect(subjects).not.toContain(archivedId);
    // Neither the stale id nor its archived survivor may surface.
    expect(subjects).not.toContain(staleId);
    expect(subjects).not.toContain(deadSurvivorId);
  });
});
