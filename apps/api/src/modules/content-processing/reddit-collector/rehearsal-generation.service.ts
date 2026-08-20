import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
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
 *   doors (adjudication, enrichment, metro probes, projections, embedding
 *   touches) never fired for a rehearsal.
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
