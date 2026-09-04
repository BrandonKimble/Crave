/**
 * THE SHADOW IS THE FULL PIPELINE (shadow-grounding rederivation, 2026-09-04)
 * — against a REAL Postgres.
 *
 * THE DEFECT: a shadow armed DISABLE_RESTAURANT_ENRICHMENT and its banking
 * closed "door 12", so rehearsal mints were never Places-grounded: the v23
 * Austin shadow minted 1,375 places with no grounding, the place-id collision
 * merge that folds "Cuba Cafe" into the grounded "Cuba Bakery & Café" never
 * ran, and the diff reported 48 anchored places as lost.
 *
 * THE LAW: rehearsal mints are grounded like any mint. A collision with an
 * ACTIVE owner merges the rehearsal loser into it through the ledgered
 * place-merge door; a rejected shadow leaves that loser exactly as it is (a
 * merge loser is already archived, with a redirect); an activation flip
 * leaves it archived too (a merge loser must not be resurrected beside its
 * own redirect).
 *
 * PROOFS:
 *   1. a rehearsal mint whose chooser lands on a live-owned place merges
 *      into the owner WITHOUT a details call — ledgered (place_merge and
 *      place_grounding), redirected, archived;
 *   2. `RehearsalGenerationService.reject` of its run leaves the merge
 *      intact and throws nothing;
 *   3. `RehearsalGenerationService.flip` of a run that adopted the loser's
 *      surfaces leaves the loser ARCHIVED (RED without the entity_redirects
 *      exclusion in the adopted clause: the loser comes back active);
 *   4. a rehearsal mint on an UNOWNED place grounds normally (its own row);
 *   5. door 12 is open: the banking's enrichment scheduler enqueues for a
 *      rehearsal batch.
 *
 * Run: yarn test:db (needs DATABASE_URL — a dev database, never prod).
 */
// p-limit is ESM-only; jest's CJS transform chokes on it when the banking
// service's import chain pulls in llm-concurrent-processing. Stub it — this
// spec never runs concurrent LLM work.
jest.mock('p-limit', () => ({
  __esModule: true,
  default:
    () =>
    (fn: (...args: unknown[]) => unknown, ...args: unknown[]) =>
      Promise.resolve(fn(...args)),
}));

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  buildHarness,
  ChooserStub,
  cleanupTag,
  type EnrichDriveable,
  GoogleStub,
  groundAt,
  loadPlace,
  mintPlace,
  mintRun,
  noopLogger,
  redirectOf,
  verdict,
} from './grounding-integration.harness-spec';
import { RehearsalGenerationService } from '../content-processing/reddit-collector/rehearsal-generation.service';
import { UnifiedProcessingService } from '../content-processing/reddit-collector/unified-processing.service';

const TAG = `itest-shadow-${randomUUID().slice(0, 6)}`;
const prisma = new PrismaClient();
const rehearsal = new RehearsalGenerationService(
  prisma as never,
  noopLogger() as never,
);

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'shadow-grounding-collision.integration.spec requires DATABASE_URL (a dev database)',
    );
  }
});

afterAll(async () => {
  await cleanupTag(prisma, TAG);
  await prisma.$disconnect();
});

describe('grounding inside the shadow', () => {
  it('folds a rehearsal mint into the live owner of its place, and neither reject nor flip disturbs the fold', async () => {
    const placeId = `${TAG}-cuba-place`;
    const google = new GoogleStub({
      [placeId]: { name: `${TAG} Cuba Bakery & Cafe` },
    });
    const chooser = new ChooserStub();
    const { service, prisma: db } = buildHarness({ prisma, google, chooser });

    const runId = await mintRun(db, `${TAG}-a`);
    const ownerId = await mintPlace(db, {
      name: `${TAG} Cuba Bakery & Cafe`,
      status: 'active',
    });
    await groundAt(db, ownerId, placeId);
    const mintId = await mintPlace(db, {
      name: `${TAG} Cuba Cafe`,
      status: 'rehearsal',
      bornRunId: runId,
    });
    // The mint's name surface, born to the run (what banking writes).
    await db.$executeRawUnsafe(
      `INSERT INTO entity_surface (entity_id, form, form_folded, status, born_extraction_run_id, source)
       VALUES ($1::uuid, $2, lower($2), 'rehearsal', $3::uuid, 'extraction')`,
      mintId,
      `${TAG} Cuba Cafe`,
      runId,
    );

    // 1. Grounded through the collision: merged for free.
    const result = await (service as unknown as EnrichDriveable).enrichPlace(
      await loadPlace(db, mintId),
      { sourceText: 'cuba cafe on burnet has the best cubano' },
    );
    expect(result.status).toBe('updated');
    expect(result.entityId).toBe(ownerId);
    expect(google.detailsCalls).toEqual([]);
    expect((await loadPlace(db, mintId)).status).toBe('archived');
    expect(await redirectOf(db, mintId)).toBe(ownerId);
    expect(
      (await verdict(db, 'place_merge', `place|${mintId}|${ownerId}`))
        ?.executed_at,
    ).not.toBeNull();

    // 2. Rejecting the shadow: the fold stands, nothing throws.
    await expect(rehearsal.reject([runId])).resolves.toEqual(
      expect.objectContaining({ entities: 0 }),
    );
    expect((await loadPlace(db, mintId)).status).toBe('archived');
    expect(await redirectOf(db, mintId)).toBe(ownerId);
    expect((await loadPlace(db, ownerId)).status).toBe('active');

    // 3. Activating a run that references the loser: it stays a loser.
    //    (The loser is archived WITH a born run id and carries a surface
    //    born to this run — exactly the adopted-promotion shape.)
    const adoptingRunId = await mintRun(db, `${TAG}-b`);
    await db.$executeRawUnsafe(
      `INSERT INTO entity_surface (entity_id, form, form_folded, status, born_extraction_run_id, source)
       VALUES ($1::uuid, $2, lower($2), 'rehearsal', $3::uuid, 'extraction')`,
      mintId,
      `${TAG} Cuba Cafe Adopted`,
      adoptingRunId,
    );
    await rehearsal.flip([adoptingRunId]);
    expect((await loadPlace(db, mintId)).status).toBe('archived');
    expect(await redirectOf(db, mintId)).toBe(ownerId);
  });

  it('grounds a rehearsal mint on an unowned place onto its own row', async () => {
    const placeId = `${TAG}-fresh-place`;
    const google = new GoogleStub({
      [placeId]: { name: `${TAG} Fresh Rehearsal Grill` },
    });
    const { service, prisma: db } = buildHarness({
      prisma,
      google,
      chooser: new ChooserStub(),
    });
    const runId = await mintRun(db, `${TAG}-c`);
    const mintId = await mintPlace(db, {
      name: `${TAG} Fresh Rehearsal Grill`,
      status: 'rehearsal',
      bornRunId: runId,
    });
    const result = await (service as unknown as EnrichDriveable).enrichPlace(
      await loadPlace(db, mintId),
      { sourceText: 'grill' },
    );
    expect(result.status).toBe('updated');
    expect(google.detailsCalls).toEqual([placeId]);
    const mint = await loadPlace(db, mintId);
    expect(mint.status).toBe('rehearsal');
    expect(mint.locations.map((row) => row.googlePlaceId)).toEqual([placeId]);
  });

  it('door 12 is open: the banking scheduler enqueues enrichment under a rehearsal run', async () => {
    const enqueued: string[] = [];
    const scheduler = Object.create(
      UnifiedProcessingService.prototype,
    ) as Record<string, unknown>;
    scheduler.configService = { get: () => undefined };
    scheduler.logger = noopLogger();
    scheduler.placeEnrichmentQueue = {
      queueEnrichment: (placeId: string) => {
        enqueued.push(placeId);
        return Promise.resolve();
      },
    };
    scheduler.resolvePlaceEnrichmentDispatchContext = () => Promise.resolve({});
    await (
      scheduler as unknown as {
        schedulePlaceEnrichment(
          summaries: Array<{ entityId: string; entityType: string }>,
          sourceMetadata: unknown,
        ): Promise<void>;
      }
    ).schedulePlaceEnrichment(
      [{ entityId: 'rehearsal-mint', entityType: 'place' }],
      {
        subreddit: 'austinfood',
        extractionTrace: { rehearsal: true, extractionRunId: randomUUID() },
      },
    );
    expect(enqueued).toEqual(['rehearsal-mint']);
  });
});
