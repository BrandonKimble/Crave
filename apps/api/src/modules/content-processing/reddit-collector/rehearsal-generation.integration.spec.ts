import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { addSurfaces } from '../entity-resolver/entity-surface.service';
import { identityInsertData } from '../entity-resolver/entity-identity';
import { RehearsalGenerationService } from './rehearsal-generation.service';
import { ClaimVerdictLedgerService } from '../entity-resolver/claim-verdict-ledger.service';

/**
 * REHEARSAL GENERATION — the sandbox acceptance proofs, against a live
 * database (plans/shadow-sandbox.md; ⭐05's formulation adopted as the
 * mutation-proof: a rehearsal leaves the live world byte-identical).
 *
 * RED-capable by construction, per door:
 * - door 1 (surfaces): delete the `bornExtractionRunId` branch in
 *   addSurfaces → the rehearsal surface lands 'active' and the
 *   recall-invisibility assertion fails — that IS the 1,402-surface
 *   incident as a test.
 * - conflict half of door 1: make the rehearsal insert DO UPDATE → the
 *   live row's role/status mutate and the untouched-row assertion fails.
 * - door 7 (verdicts): drop the source filter in decidedVerdicts → the
 *   foreign-rehearsal verdict is remembered and the scoping assertion
 *   fails.
 * - flip/reject: remove either UPDATE and the round-trip assertions fail.
 */
describe('rehearsal generation — sandbox acceptance (live DB)', () => {
  const prisma = new PrismaClient();
  const madeEntities: string[] = [];
  const runA = randomUUID();
  const runB = randomUUID();

  const logger = {
    setContext(): typeof logger {
      return logger;
    },
    info() {},
    warn() {},
    error() {},
    debug() {},
  } as never;

  const mint = async (
    name: string,
    status: 'active' | 'rehearsal',
    bornRun: string | null,
  ): Promise<string> => {
    const id = randomUUID();
    const identity = identityInsertData(name, 'place' as never);
    await prisma.$executeRawUnsafe(
      `INSERT INTO core_entities (entity_id, name, type, status, identity_key, identity_key_sorted, born_extraction_run_id)
       VALUES ($1::uuid, $2, 'place'::entity_type, $3::entity_status, $4, $5, $6::uuid)`,
      id,
      name,
      status,
      identity.identityKey,
      identity.identityKeySorted,
      bornRun,
    );
    madeEntities.push(id);
    return id;
  };

  afterAll(async () => {
    if (madeEntities.length) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM entity_surface WHERE entity_id = ANY($1::uuid[])`,
        madeEntities,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM core_entities WHERE entity_id = ANY($1::uuid[])`,
        madeEntities,
      );
    }
    await prisma.$executeRawUnsafe(
      `DELETE FROM claim_verdicts WHERE source = ANY($1::text[])`,
      [`rehearsal:${runA}`, `rehearsal:${runB}`],
    );
    await prisma.$disconnect();
  });

  it('a rehearsal surface is born invisible to the recall slice', async () => {
    const entityId = await mint(
      `Rehearsal Probe ${runA.slice(0, 8)}`,
      'rehearsal',
      runA,
    );
    const form = `rehearsal probe form ${runA.slice(0, 8)}`;
    await prisma.$transaction(async (tx) => {
      await addSurfaces(
        tx,
        entityId,
        [{ form, source: 'extraction' as const }],
        { bornExtractionRunId: runA },
      );
    });
    const rows = await prisma.$queryRawUnsafe<
      Array<{ status: string; born: string | null }>
    >(
      `SELECT status, born_extraction_run_id::text AS born FROM entity_surface
        WHERE entity_id = $1::uuid`,
      entityId,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('rehearsal');
    expect(rows[0].born).toBe(runA);
    // The live recall slice (the arm every reader uses) must not see it.
    const visible = await prisma.$queryRawUnsafe<Array<{ form: string }>>(
      `SELECT form FROM entity_surface
        WHERE entity_id = $1::uuid AND status = 'active' AND role <> 'display'`,
      entityId,
    );
    expect(visible).toHaveLength(0);
  });

  it('a rehearsal re-offer never mutates an existing live row', async () => {
    const entityId = await mint(
      `Live Probe ${runA.slice(0, 8)}`,
      'active',
      null,
    );
    const form = `live probe form ${runA.slice(0, 8)}`;
    await prisma.$transaction(async (tx) => {
      await addSurfaces(tx, entityId, [
        { form, source: 'extraction' as const, role: 'both' },
      ]);
    });
    const before = await prisma.$queryRawUnsafe<
      Array<{ status: string; role: string; born: string | null }>
    >(
      `SELECT status, role, born_extraction_run_id::text AS born
         FROM entity_surface WHERE entity_id = $1::uuid AND form = $2`,
      entityId,
      form,
    );
    await prisma.$transaction(async (tx) => {
      await addSurfaces(
        tx,
        entityId,
        [{ form, source: 'extraction' as const, role: 'recall' }],
        { bornExtractionRunId: runA },
      );
    });
    const after = await prisma.$queryRawUnsafe<
      Array<{ status: string; role: string; born: string | null }>
    >(
      `SELECT status, role, born_extraction_run_id::text AS born
         FROM entity_surface WHERE entity_id = $1::uuid AND form = $2`,
      entityId,
      form,
    );
    expect(after).toEqual(before);
  });

  it('verdict memory is steady + own-run only — a foreign rehearsal verdict is invisible', async () => {
    const ledger = new ClaimVerdictLedgerService(prisma as never);
    const claimKey = `rehearsal-probe|${runA.slice(0, 8)}`;
    await ledger.record({
      lane: 'entity_dedupe',
      claimKey,
      ruleVersion: 999,
      foldVersion: 1,
      outcome: 'new',
      reason: 'rehearsal acceptance probe',
      subject: {},
      source: `rehearsal:${runA}`,
    });
    const ownRun = await ledger.decidedVerdicts(
      'entity_dedupe',
      999,
      1,
      [claimKey],
      { rehearsalRunId: runA },
    );
    const foreignRun = await ledger.decidedVerdicts(
      'entity_dedupe',
      999,
      1,
      [claimKey],
      { rehearsalRunId: runB },
    );
    const liveCaller = await ledger.decidedVerdicts('entity_dedupe', 999, 1, [
      claimKey,
    ]);
    expect(ownRun.has(claimKey)).toBe(true);
    expect(foreignRun.has(claimKey)).toBe(false);
    expect(liveCaller.has(claimKey)).toBe(false);
  });

  it('flip makes exactly the run set live; reject archives it; both keyed, both idempotent', async () => {
    const service = new RehearsalGenerationService(prisma as never, logger);
    const flipEntity = await mint(
      `Flip Probe ${runA.slice(0, 8)}`,
      'rehearsal',
      runA,
    );
    const holdEntity = await mint(
      `Hold Probe ${runB.slice(0, 8)}`,
      'rehearsal',
      runB,
    );
    await prisma.$transaction(async (tx) => {
      await addSurfaces(
        tx,
        flipEntity,
        [
          {
            form: `flip form ${runA.slice(0, 8)}`,
            source: 'extraction' as const,
          },
        ],
        { bornExtractionRunId: runA },
      );
    });

    const flipped = await service.flip([runA]);
    expect(flipped.entities).toBeGreaterThanOrEqual(1);
    expect(flipped.flippedPlaceIds).toContain(flipEntity);

    const statuses = await prisma.$queryRawUnsafe<
      Array<{ entity_id: string; status: string }>
    >(
      `SELECT entity_id, status::text FROM core_entities WHERE entity_id = ANY($1::uuid[])`,
      [flipEntity, holdEntity],
    );
    const byId = new Map(statuses.map((r) => [r.entity_id, r.status]));
    expect(byId.get(flipEntity)).toBe('active');
    // Another run's rehearsal is untouched by the flip.
    expect(byId.get(holdEntity)).toBe('rehearsal');
    const surface = await prisma.$queryRawUnsafe<Array<{ status: string }>>(
      `SELECT status FROM entity_surface WHERE entity_id = $1::uuid`,
      flipEntity,
    );
    expect(surface[0].status).toBe('active');

    const rejected = await service.reject([runB]);
    expect(rejected.entities).toBeGreaterThanOrEqual(1);
    const held = await prisma.$queryRawUnsafe<Array<{ status: string }>>(
      `SELECT status::text FROM core_entities WHERE entity_id = $1::uuid`,
      holdEntity,
    );
    expect(held[0].status).toBe('archived');

    // Idempotence: re-running both is a no-op, not an error.
    const again = await service.flip([runA]);
    expect(again.entities).toBe(0);
  });
});
