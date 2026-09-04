/**
 * REHEARSAL-COLLISION ADOPT — the v17 shadow-replay crash, proven against
 * Postgres (2026-08-27).
 *
 * The partial unique identity indexes (uq_ingredient_identity_key,
 * uq_attribute_identity_key) span EVERY non-archived status — including a
 * foreign shadow run's status='rehearsal' rows — while the rehearsal
 * quarantine scopes every lookup to "not rehearsal, unless born to MY run".
 * A mint whose key another run already holds therefore missed on lookup,
 * collided on create (P2002), and the old adopt probes (scoped like the
 * lookups, or byte-name + active-only) found nothing and rethrew: a
 * deterministic per-mention crash that failed 8 replay batches on staging.
 *
 * THE LAW UNDER TEST: the mint is find-or-adopt across the FULL uniqueness
 * scope. A row holding the (type, identity_key) slot IS the entity; a
 * shadow-born winner adopted by a LIVE mint is promoted to the status the
 * live create would have stamped (born-run marker cleared), and a shadow
 * run's cross-run adoption is made real at activation by flip()'s
 * reference arm.
 *
 * MUTATION PROOFS (each can go RED):
 *  - re-scope the ingredient adopt probe to active-only → 'adopts a
 *    foreign rehearsal ingredient' fails (rethrow);
 *  - drop the promotion → the same test's status assertion fails;
 *  - re-scope the cuisine winner probe to byte-name/active-pending →
 *    'adopts a fold-twin pending cuisine' fails (null return);
 *  - drop flip()'s reference arm → 'flip promotes cross-run adoptions'
 *    fails (entity stays rehearsal).
 *
 * Run: yarn test:db (needs DATABASE_URL — a dev database, never prod).
 */
import { PrismaClient, EntityType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DishKnowledgeSynthesisService } from './dish-knowledge-synthesis.service';
import { mintCuisineFacetRow } from './cuisine-attribute';
import { canonicalFold } from './entity-identity';
import { RehearsalGenerationService } from '../reddit-collector/rehearsal-generation.service';

const TEST_TAG = 'itest-rehearsal-adopt';

const prisma = new PrismaClient();

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

const synthesis = new DishKnowledgeSynthesisService(
  prisma as never,
  {} as never,
  {} as never,
  logger,
  { embedEntities: () => Promise.resolve(0) } as never,
);

const rehearsalGen = new RehearsalGenerationService(prisma as never, logger);

async function seedEntity(opts: {
  name: string;
  type: string;
  status: string;
  bornRunId?: string | null;
}): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<Array<{ entity_id: string }>>(
    `INSERT INTO core_entities
       (name, type, status, identity_key, identity_key_sorted, fold_version,
        born_extraction_run_id, created_at, last_updated)
     VALUES ($1, $2::entity_type, $3::entity_status, $4, $4, 1,
             $5::uuid, now(), now())
     RETURNING entity_id`,
    opts.name,
    opts.type,
    opts.status,
    canonicalFold(opts.name),
    opts.bornRunId ?? null,
  );
  return row.entity_id;
}

afterAll(async () => {
  await prisma.$executeRawUnsafe(
    `DELETE FROM entity_surface WHERE entity_id IN
       (SELECT entity_id FROM core_entities WHERE name LIKE '${TEST_TAG}%')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM core_entities WHERE name LIKE '${TEST_TAG}%'`,
  );
  await prisma.$disconnect();
});

describe('mint adopts across the full uniqueness scope', () => {
  it('adopts a foreign rehearsal ingredient blocking the unique index and promotes it', async () => {
    const foreignRun = randomUUID();
    const name = `${TEST_TAG} vegan broth ${Date.now()}`;
    // The exact staging shape: another shadow run's quarantined mint holds
    // the (ingredient, identity_key) slot in uq_ingredient_identity_key.
    const blockerId = await seedEntity({
      name,
      type: 'ingredient',
      status: 'rehearsal',
      bornRunId: foreignRun,
    });

    // The active-only lookup misses it; the create hits P2002; the adopt
    // probe must find and adopt it instead of rethrowing (the old
    // deterministic batch crash).
    const result = await (
      synthesis as unknown as {
        ensureIngredientEntity(
          n: string,
        ): Promise<{ entityId: string; created: boolean }>;
      }
    ).ensureIngredientEntity(name);

    expect(result.entityId).toBe(blockerId);
    expect(result.created).toBe(false);

    // Promotion: a live mint colliding with a shadow row means the entity
    // is being born live — the row leaves quarantine with the status the
    // live create would have stamped, unreachable by the shadow's
    // flip/reject.
    const row = await prisma.entity.findUnique({
      where: { entityId: blockerId },
      select: { status: true, bornExtractionRunId: true },
    });
    expect(row?.status).toBe('active');
    expect(row?.bornExtractionRunId).toBeNull();
  });

  it('race arm: concurrent ingredient mints converge on one row', async () => {
    const name = `${TEST_TAG} race seasoning ${Date.now()}`;
    const svc = synthesis as unknown as {
      ensureIngredientEntity(
        n: string,
      ): Promise<{ entityId: string; created: boolean }>;
    };
    const [a, b] = await Promise.all([
      svc.ensureIngredientEntity(name),
      svc.ensureIngredientEntity(name),
    ]);
    expect(a.entityId).toBe(b.entityId);
    expect([a.created, b.created].filter(Boolean).length).toBeLessThanOrEqual(
      1,
    );
    const twins = await prisma.entity.count({
      where: { type: EntityType.ingredient, name },
    });
    expect(twins).toBe(1);
  });

  it('adopts a fold-twin pending cuisine (identity-key collision the byte-name probe missed)', async () => {
    const stamp = Date.now();
    // Fold twin: same canonicalFold, different byte name — the unique
    // index fires on the KEY; the old winner probe matched byte name only
    // and returned null forever.
    const seededName = `${TEST_TAG} Créme-${stamp} cuisine`;
    const mintName = `${TEST_TAG} creme-${stamp} cuisine`;
    expect(canonicalFold(seededName)).toBe(canonicalFold(mintName));
    const blockerId = await seedEntity({
      name: seededName,
      type: 'place_attribute',
      status: 'pending',
    });

    const result = await mintCuisineFacetRow(prisma, mintName, {
      forms: [mintName],
      source: 'cuisine',
    });
    expect(result).not.toBeNull();
    expect(result?.entityId).toBe(blockerId);
    expect(result?.created).toBe(false);
  });

  it('adopts a foreign rehearsal cuisine and promotes it with the facet', async () => {
    const foreignRun = randomUUID();
    const name = `${TEST_TAG} coastal seafood ${Date.now()}`;
    const blockerId = await seedEntity({
      name,
      type: 'place_attribute',
      status: 'rehearsal',
      bornRunId: foreignRun,
    });

    const result = await mintCuisineFacetRow(prisma, name, {
      forms: [name],
      source: 'cuisine',
    });
    expect(result?.entityId).toBe(blockerId);

    const row = await prisma.entity.findUnique({
      where: { entityId: blockerId },
      select: { status: true, facet: true, bornExtractionRunId: true },
    });
    expect(row?.status).toBe('active');
    expect(row?.facet).toBe('cuisine');
    expect(row?.bornExtractionRunId).toBeNull();
  });
});

describe('flip() reference arm — cross-run adoptions become real', () => {
  it('promotes a foreign rehearsal entity referenced by the activating run', async () => {
    const runA = randomUUID();
    const runB = randomUUID();
    const name = `${TEST_TAG} adopted attr ${Date.now()}`;
    // Run A minted the row; run B adopted it (its reference recorded as a
    // surface born to B, exactly what the P2002 adopt path banks).
    const entityId = await seedEntity({
      name,
      type: 'item_attribute',
      status: 'rehearsal',
      bornRunId: runA,
    });
    await prisma.$executeRawUnsafe(
      `INSERT INTO entity_surface
         (entity_id, form, form_folded, locale, source, status,
          born_extraction_run_id, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, 'und', 'extraction', 'rehearsal',
               $4::uuid, now(), now())`,
      entityId,
      name,
      canonicalFold(name),
      runB,
    );

    // Activating B (not A) must make the adopted entity real — attributes
    // land in 'pending' (adjudication quarantine), same as born-to-B rows.
    await rehearsalGen.flip([runB]);

    const row = await prisma.entity.findUnique({
      where: { entityId },
      select: { status: true },
    });
    expect(row?.status).toBe('pending');
  });

  it('does not touch a foreign rehearsal row the activating run never referenced', async () => {
    const runA = randomUUID();
    const runB = randomUUID();
    const name = `${TEST_TAG} untouched attr ${Date.now()}`;
    const entityId = await seedEntity({
      name,
      type: 'item_attribute',
      status: 'rehearsal',
      bornRunId: runA,
    });

    await rehearsalGen.flip([runB]);

    const row = await prisma.entity.findUnique({
      where: { entityId },
      select: { status: true },
    });
    expect(row?.status).toBe('rehearsal');
  });
});
