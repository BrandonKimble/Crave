import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { LLMService } from '../external-integrations/llm/llm.service';
import { OnDemandRequestService } from './on-demand-request.service';

/**
 * ZERO-PER-SEARCH-LLM STAGING ZONE (search-from-scratch spec §1.1).
 *
 * Under the gazetteer-first Understand, unknown residue no longer passes
 * through a sync LLM — but on_demand_requests.entity_type is NOT NULL, so
 * raw residue cannot become a typed collection seed by itself. It lands in
 * collection_on_demand_unsegmented_residue, and this service's cron drains
 * the staging zone: the SAME segmentation job the sync path performs today,
 * relocated off the hot path (per-search LLM cost → zero; llmMs disappears).
 *
 * Batch shape today: one analyzeSearchQuery call per residue inside a
 * bounded drain pass — already async and amortized. Collapsing many
 * residues into ONE batch-priced call is a cost optimization that lands
 * with the cutover flip, not a precondition for the plumbing.
 *
 * Producer: the gazetteer Understand (the only Understand) records
 * unknown residue here on every search; the cron drains continuously.
 */
@Injectable()
export class UnsegmentedResidueService {
  private readonly logger: LoggerService;
  private drainInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LLMService,
    private readonly onDemandRequestService: OnDemandRequestService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('UnsegmentedResidueService');
  }

  async recordResidue(input: {
    residueText: string;
    searchRequestId?: string | null;
    engineIds?: string[];
    userId?: string | null;
    context?: Record<string, unknown>;
  }): Promise<void> {
    const text = input.residueText.trim().slice(0, 500);
    if (!text) return;
    // EVERY ask is recorded (red team R4-②): deduping rows collapsed 300
    // users' interest into distinctUserCount=1 — demand ranking off by
    // orders of magnitude. What must be deduped is the LLM CALL, and the
    // drain does that by segmenting once per DISTINCT text.
    await this.prisma.onDemandUnsegmentedResidue.create({
      data: {
        residueText: text,
        searchRequestId: input.searchRequestId ?? null,
        engineIds: input.engineIds ?? [],
        userId: input.userId ?? null,
        context: (input.context ?? {}) as never,
      },
    });
  }

  @Cron('*/10 * * * *')
  async drainBatch(): Promise<void> {
    // CUTOVER: the gazetteer Understand is the only producer and is always
    // on — the drain runs unconditionally (idles at one indexed SELECT
    // when the staging zone is empty).
    if (this.drainInFlight) return;
    this.drainInFlight = true;
    try {
      const pending = await this.prisma.onDemandUnsegmentedResidue.findMany({
        where: { status: 'pending', attempts: { lt: 3 } },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });
      // ONE LLM call per DISTINCT residue text; one recordRequests per ROW
      // (every ask keeps its user/engine/geo attribution).
      const byText = new Map<string, typeof pending>();
      for (const row of pending) {
        const bucket = byText.get(row.residueText) ?? [];
        bucket.push(row);
        byText.set(row.residueText, bucket);
      }
      for (const [text, rows] of byText) {
        await this.segmentGroup(text, rows);
      }
      // Retention (red team R4-P6): processed rows are audit crumbs, not
      // records — the typed queue + signals are the durable record. 30
      // days is plenty for debugging the segmenter.
      await this.prisma.onDemandUnsegmentedResidue.deleteMany({
        where: {
          status: { in: ['segmented', 'discarded', 'failed'] },
          processedAt: { lt: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
        },
      });
    } catch (error) {
      this.logger.warn('Residue drain pass failed', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      this.drainInFlight = false;
    }
  }

  private async segmentGroup(
    residueText: string,
    rows: Array<{
      residueId: string;
      engineIds: string[];
      userId: string | null;
      searchRequestId: string | null;
      context: unknown;
    }>,
  ): Promise<void> {
    const ids = rows.map((r) => r.residueId);
    try {
      const analysis = await this.llmService.analyzeSearchQuery(residueText);
      const typed: Array<{ term: string; entityType: EntityType }> = [
        ...analysis.restaurants.map((term) => ({
          term,
          entityType: 'restaurant' as EntityType,
        })),
        ...analysis.foods.map((term) => ({
          term,
          entityType: 'food' as EntityType,
        })),
        ...analysis.foodAttributes.map((term) => ({
          term,
          entityType: 'food_attribute' as EntityType,
        })),
        ...analysis.restaurantAttributes.map((term) => ({
          term,
          entityType: 'restaurant_attribute' as EntityType,
        })),
      ].filter((entry) => entry.term.trim().length > 0);

      if (typed.length) {
        // One recordRequests per staged ROW: each searcher's ask keeps its
        // own user, engines, searchRequestId, and — critically — its
        // BOUNDS (the signals layer drops geo-less asks).
        for (const row of rows) {
          const rowContext =
            row.context && typeof row.context === 'object'
              ? (row.context as Record<string, unknown>)
              : {};
          await this.onDemandRequestService.recordRequests(
            typed.map((entry) => ({
              term: entry.term.trim(),
              entityType: entry.entityType,
              reason: 'unresolved',
              engineIds: row.engineIds,
              metadata: {
                source: 'residue_segmenter',
                residueText,
                searchRequestId: row.searchRequestId ?? undefined,
              },
            })),
            { userId: row.userId },
            {
              source: 'residue_segmenter',
              searchRequestId: row.searchRequestId,
              ...(rowContext.bounds ? { bounds: rowContext.bounds } : {}),
            },
          );
        }
      }
      // Junk needs no judgment: a residue that segments to nothing is
      // discarded — it failed to name anything collectible.
      await this.prisma.onDemandUnsegmentedResidue.updateMany({
        where: { residueId: { in: ids } },
        data: {
          status: typed.length ? 'segmented' : 'discarded',
          processedAt: new Date(),
          attempts: { increment: 1 },
        },
      });
    } catch (error) {
      // Terminal state: the third failure moves the rows to 'failed' —
      // visible, countable, and out of the drain's way.
      await this.prisma.onDemandUnsegmentedResidue.updateMany({
        where: { residueId: { in: ids } },
        data: { attempts: { increment: 1 } },
      });
      await this.prisma.onDemandUnsegmentedResidue.updateMany({
        where: { residueId: { in: ids }, attempts: { gte: 3 } },
        data: { status: 'failed', processedAt: new Date() },
      });
      this.logger.warn('Residue segmentation failed (will retry)', {
        residueText,
        rows: ids.length,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
