import { Injectable, Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  identitySlotFreeSql,
  parkedNameSql,
} from '../entity-resolver/entity-reject-lane';
import { LoggerService } from '../../../shared';

/**
 * REHEARSAL GENERATION — the activation/rejection half
 * (plans/shadow-sandbox.md §design points 5 and the SD docket's retro sweep).
 *
 * Banking under a non-activated run births entities/surfaces as
 * status='rehearsal' + born_extraction_run_id, and records entity-match
 * verdicts under source='rehearsal:<runId>'. This service is the ONLY thing
 * that makes those rows real or removes them:
 *
 * - flip(runIds): rehearsal → active (verdicts → steady), keyed strictly by
 *   born run id. Runs inside the activation choreography, before the
 *   document-pointer flips, so by the time readers see the new generation's
 *   events its entities already resolve.
 * - reject(runIds): rehearsal → archived; the run's verdicts are DELETED —
 *   a rejected rehearsal's judgments must never seed live memory.
 * - Nothing else needs cleanup on rejection BY CONSTRUCTION: the side-effect
 *   doors (adjudication, metro probes, projections, embedding touches)
 *   never fired for a rehearsal. Places GROUNDING does fire (shadow-grounding
 *   rederivation 2026-09-04 — the shadow is the full pipeline): a rejected
 *   mint keeps its paid location row as an archived, redirect-free owner,
 *   which the grounding owner law revives the next time the business is
 *   mentioned, so the spend is never re-bought; a mint that collided with a
 *   live owner is already a merge loser (archived + redirect) and the
 *   reject/flip keys never touch it.
 */
@Injectable()
export class RehearsalGenerationService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('RehearsalGenerationService');
  }

  /** rehearsal → active for the runs being activated. Returns the flipped
   *  restaurant entity ids so the caller can enqueue the deferred machinery
   *  (enrichment) for exactly the mints that just became real. */
  async flip(runIds: readonly string[]): Promise<{
    entities: number;
    surfaces: number;
    verdicts: number;
    flippedPlaceIds: string[];
  }> {
    if (!runIds.length) {
      return {
        entities: 0,
        surfaces: 0,
        verdicts: 0,
        flippedPlaceIds: [],
      };
    }
    const ids = [...runIds];
    return this.prisma.$transaction(async (tx) => {
      const flippedPlaces = await tx.$queryRaw<Array<{ entity_id: string }>>`
        SELECT entity_id FROM core_entities
         WHERE status = 'rehearsal'::entity_status
           AND born_extraction_run_id = ANY(${ids}::uuid[])
           AND type = 'place'::entity_type`;
      const entities = await tx.$executeRaw`
        UPDATE core_entities
           SET status = CASE WHEN type IN ('item_attribute'::entity_type,
                                           'place_attribute'::entity_type)
                             THEN 'pending'::entity_status
                             ELSE 'active'::entity_status END,
               last_updated = now()
         WHERE status = 'rehearsal'::entity_status
           AND born_extraction_run_id = ANY(${ids}::uuid[])`;
      // Cross-run adoptions (2026-08-27): the partial unique identity
      // indexes allow only ONE non-archived row per (type, identity_key),
      // so a run that meets a key another shadow minted first ADOPTS that
      // foreign rehearsal row and records its reference as surfaces born
      // to itself. Activation must make every entity this run references
      // real, not just the ones it was first to mint — promote shadow-born
      // rows (rehearsal, or archived-by-a-rejected-shadow: born run id
      // NOT NULL, so genuine live junk tombstones are untouchable) that
      // carry a surface born to the flipping runs.
      // A MERGE LOSER STAYS A MERGE LOSER (shadow-grounding rederivation,
      // 2026-09-04): rehearsal mints are grounded inside the shadow now, and
      // a mint whose Google place is already owned by a live entity is
      // merged into it — archived WITH a redirect, its surfaces folded onto
      // the winner. Such a row still carries surfaces born to this run, so
      // without the redirect exclusion this clause would resurrect it as a
      // second live entity beside its own redirect on activation.
      const adopted = await tx.$executeRaw`
        UPDATE core_entities e
           SET status = CASE WHEN e.type IN ('item_attribute'::entity_type,
                                             'place_attribute'::entity_type)
                             THEN 'pending'::entity_status
                             ELSE 'active'::entity_status END,
               last_updated = now()
         WHERE (e.status = 'rehearsal'::entity_status
                OR (e.status = 'archived'::entity_status
                    AND e.born_extraction_run_id IS NOT NULL))
           AND NOT (e.born_extraction_run_id = ANY(${ids}::uuid[]))
           AND NOT EXISTS (
             SELECT 1 FROM entity_redirects r WHERE r.from_entity_id = e.entity_id)
           AND EXISTS (
             SELECT 1 FROM entity_surface s
              WHERE s.entity_id = e.entity_id
                AND s.born_extraction_run_id = ANY(${ids}::uuid[]))`;
      // PARKED NAMES A SHADOW ADOPTED COME BACK AT ACTIVATION (parked-names
      // law, 2026-09-04). A live batch that meets an archived, redirect-
      // free, verdict-less row for a fold it would otherwise mint REVIVES
      // it on the spot (unified-processing's mint block); a rehearsal batch
      // may not change a row live readers share, so it adopts the parked
      // row as-is — its events quarantined by run id, its reference banked
      // as a surface born to the run — and the revival happens HERE, when
      // the run becomes real. Same law as the cross-run adoption arm above,
      // for rows born to nobody: no verdict against the name (a ledgered
      // reject in force or Google's closure would have sunk the mention
      // instead of adopting), and the identity slot free (a live twin that
      // appeared meanwhile owns the fold; the parked row stays parked).
      const revived = await tx.$executeRaw(Prisma.sql`
        UPDATE core_entities e
           SET status = 'active'::entity_status,
               last_updated = now()
         WHERE ${parkedNameSql('e', null)}
           AND ${identitySlotFreeSql('e')}
           AND EXISTS (
             SELECT 1 FROM entity_surface s
              WHERE s.entity_id = e.entity_id
                AND s.born_extraction_run_id = ANY(${ids}::uuid[]))`);
      const surfaces = await tx.$executeRaw`
        UPDATE entity_surface
           SET status = 'active', updated_at = now()
         WHERE status = 'rehearsal'
           AND born_extraction_run_id = ANY(${ids}::uuid[])`;
      const sources = ids.map((id) => `rehearsal:${id}`);
      const verdicts = await tx.$executeRaw`
        UPDATE claim_verdicts SET source = 'steady'
         WHERE source = ANY(${sources}::text[])`;
      this.logger.info('Rehearsal generation flipped', {
        runs: ids.length,
        entities,
        adoptedCrossRun: adopted,
        revivedParked: revived,
        surfaces,
        verdicts,
      });
      return {
        entities,
        surfaces,
        verdicts,
        flippedPlaceIds: flippedPlaces.map((r) => r.entity_id),
      };
    });
  }

  /** Rejection: the rehearsal never happened, minus the audit trail. */
  async reject(
    runIds: readonly string[],
  ): Promise<{ entities: number; surfaces: number; verdicts: number }> {
    if (!runIds.length) return { entities: 0, surfaces: 0, verdicts: 0 };
    const ids = [...runIds];
    return this.prisma.$transaction(async (tx) => {
      const entities = await tx.$executeRaw`
        UPDATE core_entities
           SET status = 'archived'::entity_status, last_updated = now()
         WHERE status = 'rehearsal'::entity_status
           AND born_extraction_run_id = ANY(${ids}::uuid[])`;
      // DELETE, never 'deprecated' (red team 2026-08-19 entity-D3):
      // 'deprecated' means "a recall claim that LOST a hearing", and the
      // surface writer honors it as remembered-wrong forever — but a
      // rejected rehearsal's surfaces (including ones proposed on LIVE
      // entities) were never judged; they simply never happened. Deleting
      // them leaves later, activated runs free to bank the same form.
      // Rehearsal rows are invisible-by-status and referenced by nothing,
      // so the delete is safe by construction.
      const surfaces = await tx.$executeRaw`
        DELETE FROM entity_surface
         WHERE status = 'rehearsal'
           AND born_extraction_run_id = ANY(${ids}::uuid[])`;
      const sources = ids.map((id) => `rehearsal:${id}`);
      const verdicts = await tx.$executeRaw`
        DELETE FROM claim_verdicts WHERE source = ANY(${sources}::text[])`;
      this.logger.info('Rehearsal generation rejected', {
        runs: ids.length,
        entities,
        surfaces,
        verdicts,
      });
      return { entities, surfaces, verdicts };
    });
  }
}
