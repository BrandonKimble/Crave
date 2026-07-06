import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EntityStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { RestaurantLocationEnrichmentService } from './restaurant-location-enrichment.service';

export interface JanitorSummary {
  archivedUnmatched: number;
  retriedPlaceholders: number;
  archivedClosed: number;
  reEnrichedMoved: number;
}

/**
 * Restaurant lifecycle janitor — the ACT half of the decay lifecycle
 * (refreshStaleLocations is the DETECT half). One pass, three jobs:
 *
 * 1. Archive restaurants whose enrichment has terminally failed: the last
 *    attempt was no_match/error and it has been retried at least
 *    `noMatchAttemptThreshold` times. These are the on-demand placeholder
 *    leftovers that will never resolve to a real place.
 * 2. Retry enrichment for placeholders still under the threshold (a fresh
 *    attempt may succeed as Google's index or our context improves).
 * 3. Act on decay flags the refresh wrote: archive restaurants whose every
 *    location is CLOSED_PERMANENTLY; force re-enrichment through the moved
 *    target when a location carries movedPlaceId.
 *
 * Everything archives (status flip) rather than deletes — reversible, and
 * consistent with how cuisine hubs and leaked entities are retired.
 */
@Injectable()
export class RestaurantJanitorService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly enrichmentService: RestaurantLocationEnrichmentService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('RestaurantJanitorService');
  }

  private lifecycleCronInFlight = false;

  /**
   * Weekly detect→act lifecycle pass: refresh a slice of stale locations
   * (DETECT — writes business_status/moved_place_id at the cheap SKU), then
   * run the janitor on whatever got flagged (ACT). Weekly over monthly:
   * identical total cost (the 90-day TTL sets poll volume, the cron only sets
   * burst size), but smaller batches and a failure only delays a week.
   * Enable at launch: LOCATION_LIFECYCLE_CRON_ENABLED=true (pre-launch
   * checklist) — a dev corpus has nothing worth keeping fresh.
   */
  @Cron(CronExpression.EVERY_WEEK)
  async weeklyLifecyclePass(): Promise<void> {
    if (process.env.LOCATION_LIFECYCLE_CRON_ENABLED !== 'true') return;
    if (this.lifecycleCronInFlight) return;
    this.lifecycleCronInFlight = true;
    try {
      const refresh = await this.enrichmentService.refreshStaleLocations({
        olderThanDays: Number(process.env.LOCATION_REFRESH_TTL_DAYS ?? 90),
        limit: Number(process.env.LOCATION_REFRESH_LIMIT ?? 250),
      });
      const janitor = await this.run();
      this.logger.info('Weekly location lifecycle pass complete', {
        refresh: refresh as unknown as Record<string, unknown>,
        janitor: janitor as unknown as Record<string, unknown>,
      });
    } catch (error) {
      this.logger.error('Weekly location lifecycle pass failed', {
        error:
          error instanceof Error
            ? { message: error.message }
            : { message: String(error) },
      });
    } finally {
      this.lifecycleCronInFlight = false;
    }
  }

  async run(
    options: {
      noMatchAttemptThreshold?: number;
      retryLimit?: number;
      dryRun?: boolean;
    } = {},
  ): Promise<JanitorSummary> {
    const threshold = options.noMatchAttemptThreshold ?? 3;
    const retryLimit = options.retryLimit ?? 25;
    const dryRun = options.dryRun ?? false;
    const summary: JanitorSummary = {
      archivedUnmatched: 0,
      retriedPlaceholders: 0,
      archivedClosed: 0,
      reEnrichedMoved: 0,
    };

    // 1. Terminal no-match placeholders → archive.
    const unmatched = await this.prisma.$queryRaw<{ entity_id: string }[]>`
      SELECT entity_id FROM core_entities
      WHERE type = 'restaurant' AND status = 'active'
        AND restaurant_metadata::jsonb -> 'lastEnrichmentAttempt' ->> 'status'
              IN ('no_match', 'error')
        AND COALESCE((restaurant_metadata::jsonb -> 'lastEnrichmentAttempt' ->> 'count')::int, 0)
              >= ${threshold}
        AND NOT EXISTS (
          SELECT 1 FROM core_restaurant_locations l
          WHERE l.restaurant_id = core_entities.entity_id
            AND l.google_place_id IS NOT NULL
        )
    `;
    if (!dryRun && unmatched.length) {
      await this.prisma.entity.updateMany({
        where: { entityId: { in: unmatched.map((row) => row.entity_id) } },
        data: { status: EntityStatus.archived },
      });
    }
    summary.archivedUnmatched = unmatched.length;

    // 2. Placeholders under the threshold → retry enrichment (capped).
    const retryable = await this.prisma.$queryRaw<{ entity_id: string }[]>`
      SELECT entity_id FROM core_entities
      WHERE type = 'restaurant' AND status = 'active'
        AND COALESCE((restaurant_metadata::jsonb -> 'lastEnrichmentAttempt' ->> 'count')::int, 0)
              < ${threshold}
        AND NOT EXISTS (
          SELECT 1 FROM core_restaurant_locations l
          WHERE l.restaurant_id = core_entities.entity_id
            AND l.google_place_id IS NOT NULL
        )
        AND EXISTS (
          SELECT 1 FROM core_restaurant_locations l
          WHERE l.restaurant_id = core_entities.entity_id
        )
      LIMIT ${retryLimit}
    `;
    if (!dryRun) {
      for (const row of retryable) {
        const result = await this.enrichmentService.enrichRestaurantById(
          row.entity_id,
        );
        if (result.status === 'updated') {
          summary.retriedPlaceholders += 1;
        }
      }
    } else {
      summary.retriedPlaceholders = retryable.length;
    }

    // 3a. Every location closed permanently → archive the restaurant.
    const closed = await this.prisma.$queryRaw<{ entity_id: string }[]>`
      SELECT e.entity_id FROM core_entities e
      WHERE e.type = 'restaurant' AND e.status = 'active'
        AND EXISTS (
          SELECT 1 FROM core_restaurant_locations l
          WHERE l.restaurant_id = e.entity_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM core_restaurant_locations l
          WHERE l.restaurant_id = e.entity_id
            AND (l.business_status IS NULL
                 OR l.business_status <> 'CLOSED_PERMANENTLY')
        )
    `;
    if (!dryRun && closed.length) {
      await this.prisma.entity.updateMany({
        where: { entityId: { in: closed.map((row) => row.entity_id) } },
        data: { status: EntityStatus.archived },
      });
    }
    summary.archivedClosed = closed.length;

    // 3b. Moved → re-enrich through the redirect target (force: the identity
    // changed; enrichRestaurantById follows movedPlaceId internally).
    const moved = await this.prisma.restaurantLocation.findMany({
      where: { movedPlaceId: { not: null } },
      select: { restaurantId: true },
      distinct: ['restaurantId'],
      take: retryLimit,
    });
    if (!dryRun) {
      for (const row of moved) {
        const result = await this.enrichmentService.enrichRestaurantById(
          row.restaurantId,
          { force: true },
        );
        if (result.status === 'updated') {
          summary.reEnrichedMoved += 1;
        }
      }
    } else {
      summary.reEnrichedMoved = moved.length;
    }

    this.logger.info('Restaurant janitor pass complete', {
      dryRun,
      ...(summary as unknown as Record<string, unknown>),
    });
    return summary;
  }
}
