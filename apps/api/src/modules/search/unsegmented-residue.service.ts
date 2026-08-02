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
 * Producer: the flag-gated gazetteer cutover records residue here; nothing
 * writes rows while the cutover is off, so the cron idles at one indexed
 * SELECT per pass.
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
    // Dedup (red team ⑨): a trending unknown term must not multiply into
    // one LLM segmentation call per search. One pending row per residue
    // text is enough — the demand side already counts per-term interest.
    const existing = await this.prisma.onDemandUnsegmentedResidue.findFirst({
      where: { residueText: text, status: 'pending' },
      select: { residueId: true },
    });
    if (existing) return;
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
        take: 25,
      });
      for (const row of pending) {
        await this.segmentOne(row.residueId, row.residueText, {
          engineIds: row.engineIds,
          userId: row.userId,
          searchRequestId: row.searchRequestId,
        });
      }
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

  private async segmentOne(
    residueId: string,
    residueText: string,
    meta: {
      engineIds: string[];
      userId: string | null;
      searchRequestId: string | null;
    },
  ): Promise<void> {
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
        await this.onDemandRequestService.recordRequests(
          typed.map((entry) => ({
            term: entry.term.trim(),
            entityType: entry.entityType,
            reason: 'unresolved',
            engineIds: meta.engineIds,
            metadata: {
              source: 'residue_segmenter',
              residueText,
              searchRequestId: meta.searchRequestId ?? undefined,
            },
          })),
          { userId: meta.userId },
          {
            source: 'residue_segmenter',
            searchRequestId: meta.searchRequestId,
          },
        );
      }
      // Junk needs no judgment: a residue that segments to nothing is
      // discarded — it failed to name anything collectible.
      await this.prisma.onDemandUnsegmentedResidue.update({
        where: { residueId },
        data: {
          status: typed.length ? 'segmented' : 'discarded',
          processedAt: new Date(),
          attempts: { increment: 1 },
        },
      });
    } catch (error) {
      // Terminal state (red team ⑩): the third failure moves the row to
      // 'failed' — visible, countable, and out of the drain's way; a row
      // must never sit invisible at pending/attempts=3 forever.
      const row = await this.prisma.onDemandUnsegmentedResidue.update({
        where: { residueId },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      if (row.attempts >= 3) {
        await this.prisma.onDemandUnsegmentedResidue.update({
          where: { residueId },
          data: { status: 'failed', processedAt: new Date() },
        });
      }
      this.logger.warn('Residue segmentation failed (will retry)', {
        residueId,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
