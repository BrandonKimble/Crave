import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { ProjectionRebuildService } from './projection-rebuild.service';

/**
 * ONE-SHOT LEDGER REPAIR (async-integrity plan, step 1), PROD-NATIVE.
 *
 * The evidence ledger admitted the same claim more than once because event
 * uniqueness was RUN-scoped (delivery identity) instead of DOCUMENT-scoped
 * (content identity): overlapping extraction runs re-filed each other's
 * claims (23,358 duplicate-lineage events measured 2026-08-01, score
 * inflation 2-4x on 2,509 docs), and within a run the mention key hashed a
 * model-assigned temp_id, so re-parses double-filed too (688 duplicate
 * mention rows). This runner:
 *
 *  1. deletes SUPERSEDED events — rows whose run is not their document's
 *     active run AND whose document the active run demonstrably extracted
 *     (guard: an extraction-input row links doc to active run; measured:
 *     100% of dark events satisfy it — zero activation-overreach victims);
 *  2. dedupes remaining events to ONE per content identity —
 *     (document, restaurant, entity, evidence_type) for entity events,
 *     (document, restaurant, evidence_type) for praise — keeping the
 *     lowest event_id;
 *  3. rebuilds projections (connections, mentions, counters, signals,
 *     category edges) for every affected restaurant.
 *
 * Arm with RUN_LEDGER_REPAIR=1 on the worker; remove after the DONE log.
 * Step 2 of the plan then makes this class impossible with
 * document-scoped unique indexes.
 */
@Injectable()
export class LedgerRepairRunner implements OnApplicationBootstrap {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectionRebuild: ProjectionRebuildService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('LedgerRepairRunner');
  }

  onApplicationBootstrap(): void {
    if (process.env.RUN_LEDGER_REPAIR !== '1') {
      return;
    }
    if ((process.env.PROCESS_ROLE || 'api') !== 'worker') {
      this.logger.warn('RUN_LEDGER_REPAIR set on a non-worker role — ignoring');
      return;
    }
    void this.run().catch((error: unknown) => {
      this.logger.error('Ledger repair CRASHED', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    });
  }

  private async run(): Promise<void> {
    // Affected restaurants collected BEFORE deletion so the rebuild set is
    // complete even though the evidence that implicates them is removed.
    const affected = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT DISTINCT restaurant_id AS id FROM (
        SELECT ev.restaurant_id
        FROM core_restaurant_entity_events ev
        JOIN collection_source_documents d ON d.document_id = ev.source_document_id
        WHERE d.active_extraction_run_id IS DISTINCT FROM ev.extraction_run_id
        UNION
        SELECT ev.restaurant_id
        FROM core_restaurant_events ev
        JOIN collection_source_documents d ON d.document_id = ev.source_document_id
        WHERE d.active_extraction_run_id IS DISTINCT FROM ev.extraction_run_id
        UNION
        SELECT restaurant_id FROM core_restaurant_entity_events
        GROUP BY restaurant_id, source_document_id, entity_id, evidence_type
        HAVING count(*) > 1
        UNION
        SELECT restaurant_id FROM core_restaurant_events
        GROUP BY restaurant_id, source_document_id, evidence_type
        HAVING count(*) > 1
      ) r
    `;

    const supersededEntity = await this.prisma.$executeRaw`
      DELETE FROM core_restaurant_entity_events ev
      USING collection_source_documents d
      WHERE d.document_id = ev.source_document_id
        AND d.active_extraction_run_id IS DISTINCT FROM ev.extraction_run_id
        AND EXISTS (
          SELECT 1 FROM collection_extraction_input_documents eid
          JOIN collection_extraction_inputs ei ON ei.input_id = eid.input_id
          WHERE ei.extraction_run_id = d.active_extraction_run_id
            AND eid.document_id = ev.source_document_id)
    `;
    const supersededPraise = await this.prisma.$executeRaw`
      DELETE FROM core_restaurant_events ev
      USING collection_source_documents d
      WHERE d.document_id = ev.source_document_id
        AND d.active_extraction_run_id IS DISTINCT FROM ev.extraction_run_id
        AND EXISTS (
          SELECT 1 FROM collection_extraction_input_documents eid
          JOIN collection_extraction_inputs ei ON ei.input_id = eid.input_id
          WHERE ei.extraction_run_id = d.active_extraction_run_id
            AND eid.document_id = ev.source_document_id)
    `;

    // Same-run content dedupe: one claim per (doc, restaurant, entity,
    // type). Lowest event_id survives (deterministic, matches "first
    // filed"); NULL-doc events (none exist today) are left untouched.
    const dedupedEntity = await this.prisma.$executeRaw`
      DELETE FROM core_restaurant_entity_events ev
      USING core_restaurant_entity_events keeper
      WHERE keeper.source_document_id = ev.source_document_id
        AND keeper.restaurant_id = ev.restaurant_id
        AND keeper.entity_id = ev.entity_id
        AND keeper.evidence_type = ev.evidence_type
        AND keeper.event_id < ev.event_id
        AND ev.source_document_id IS NOT NULL
    `;
    const dedupedPraise = await this.prisma.$executeRaw`
      DELETE FROM core_restaurant_events ev
      USING core_restaurant_events keeper
      WHERE keeper.source_document_id = ev.source_document_id
        AND keeper.restaurant_id = ev.restaurant_id
        AND keeper.evidence_type = ev.evidence_type
        AND keeper.event_id < ev.event_id
    `;

    this.logger.info('Ledger repair: deletions complete, rebuilding', {
      supersededEntity,
      supersededPraise,
      dedupedEntity,
      dedupedPraise,
      affectedRestaurants: affected.length,
    });

    const ids = affected.map((row) => row.id);
    const BATCH = 50;
    for (let i = 0; i < ids.length; i += BATCH) {
      await this.projectionRebuild.rebuildForRestaurants(
        ids.slice(i, i + BATCH),
      );
      if ((i / BATCH) % 10 === 0) {
        this.logger.info('Ledger repair: rebuild progress', {
          done: Math.min(i + BATCH, ids.length),
          total: ids.length,
        });
      }
    }

    // Verification: both detectors must read zero.
    const residualDark = await this.prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n
      FROM core_restaurant_entity_events ev
      JOIN collection_source_documents d ON d.document_id = ev.source_document_id
      WHERE d.active_extraction_run_id IS DISTINCT FROM ev.extraction_run_id
    `;
    const residualDupes = await this.prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM (
        SELECT 1 FROM core_restaurant_entity_events
        WHERE source_document_id IS NOT NULL
        GROUP BY restaurant_id, source_document_id, entity_id, evidence_type
        HAVING count(*) > 1
      ) d
    `;

    this.logger.info('LEDGER REPAIR DONE', {
      supersededEntity,
      supersededPraise,
      dedupedEntity,
      dedupedPraise,
      rebuiltRestaurants: ids.length,
      residualDark: residualDark[0]?.n ?? -1,
      residualDupes: residualDupes[0]?.n ?? -1,
      note: 'Both residuals must be 0. Remove RUN_LEDGER_REPAIR now.',
    });
  }
}
