/**
 * writeLabels ELECTS is_default ATOMICALLY (F9342) — against a REAL Postgres
 * (integration).
 *
 * THE DEFECT: is_default was computed from a findFirst, then written via a
 * separate upsert. Across that gap two writers for the same (entity_id,
 * locale) could each read "no default yet" and both write is_default=true —
 * violating the partial unique `uq_entity_labels_one_default` and aborting the
 * whole sweep on the un-caught upsert. The election now happens INSIDE the
 * insert (`status='active' AND NOT EXISTS(another default)`), so the
 * read-then-write window is gone; the partial unique arbitrates the rare
 * simultaneous case and the loser lands as a non-default.
 *
 * WHY A DB SPEC: a true concurrency race is not unit-testable, so this proves
 * BY CONSTRUCTION against real rows and the real constraint: a SECOND
 * writeLabels for an entity that ALREADY has a default (a) does NOT create a
 * second default, and (b) does NOT throw the sweep.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 * It FAILS LOUDLY without one rather than skipping.
 */
import { PrismaClient } from '@prisma/client';
import { LabelSweepService } from './label-sweep.service';
import type { GeneratedLabel } from './label-generator';

const ENTITY_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddd9342';
const LOCALE = 'es';

const prisma = new PrismaClient();
// The adjudicator is only invoked on guard-blocked surfaces; this spec's
// fixtures never collide, so a throwing stub keeps the seam honest.
const service = new LabelSweepService(
  prisma as never,
  {
    adjudicate: () => {
      throw new Error('adjudicator not expected in this spec');
    },
  } as never,
);

function label(form: string): GeneratedLabel {
  return {
    entityId: ENTITY_ID,
    locale: LOCALE,
    form,
    description: null,
    status: 'active',
    aliases: [],
  };
}

async function defaultCount(): Promise<number> {
  const rows = await prisma.entityLabel.findMany({
    where: { entityId: ENTITY_ID, locale: LOCALE, isDefault: true },
    select: { form: true },
  });
  return rows.length;
}

async function cleanup(): Promise<void> {
  await prisma.entityLabel.deleteMany({ where: { entityId: ENTITY_ID } });
  await prisma.entity.deleteMany({ where: { entityId: ENTITY_ID } });
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — this spec proves a SQL default election and must not be skipped',
    );
  }
  await cleanup();
  await prisma.entity.create({
    data: {
      entityId: ENTITY_ID,
      name: 'zzq-f9342',
      type: 'food',
      status: 'active',
    },
  });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('LabelSweepService.writeLabels: at most one default per (entity, locale) (F9342)', () => {
  it('elects the first active label default, and a later write does not add a second default or throw', async () => {
    const first = await service.writeLabels([label('café con leche')], 'sweep');
    expect(first).toBe(1);
    expect(await defaultCount()).toBe(1);

    // A SECOND, distinct form for the same entity/locale. Under the old
    // read-then-write it could elect a second default (or, concurrently, throw
    // the partial-unique violation up through the sweep).
    const second = await service.writeLabels([label('cortado')], 'sweep');
    expect(second).toBe(1);

    // Still exactly one default, and the FIRST writer kept it.
    expect(await defaultCount()).toBe(1);
    const theDefault = await prisma.entityLabel.findFirst({
      where: { entityId: ENTITY_ID, locale: LOCALE, isDefault: true },
      select: { form: true },
    });
    expect(theDefault?.form).toBe('café con leche');
  });

  it('two CONCURRENT active writes for the same pair land exactly one default and neither throws', async () => {
    // Clear the prior test's rows so both racers start from "no default" — the
    // adversarial case the partial unique must arbitrate. Under the old
    // findFirst+upsert this could either land two defaults or abort a sweep
    // with an uncaught unique violation.
    await prisma.entityLabel.deleteMany({ where: { entityId: ENTITY_ID } });

    await expect(
      Promise.all([
        service.writeLabels([label('flat white')], 'sweep'),
        service.writeLabels([label('macchiato')], 'sweep'),
      ]),
    ).resolves.toEqual([1, 1]);

    expect(await defaultCount()).toBe(1);
  });
});
