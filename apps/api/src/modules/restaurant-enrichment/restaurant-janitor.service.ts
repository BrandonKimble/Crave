import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  /**
   * The retry arm's OWN predicate, uncapped — how many ungrounded
   * placeholders this lane still owes, before `retryLimit` truncates it
   * (F366). Without it, "we are sampling, not converging" is derivable only
   * by querying by hand: MEASURED on the local mirror 2026-08-03, 1,552
   * active restaurants have location rows and no google_place_id (1,554 of
   * them under the archive threshold, i.e. this lane's), against a lane that
   * retries 25 per WEEKLY pass — ~62 weeks for one sweep of a backlog that
   * grows with collection. A convergent sweep and a rate limit are different
   * things, and a rate limit applied to a fixed backlog is a decision never
   * to finish. Raising the cap is NEW PLACES SPEND and therefore the owner's
   * P2.6 backfill-campaign decision, not a janitor edit — so the lane reports
   * the gap instead of closing it.
   */
  ungroundedBacklog: number;
  /**
   * The entity ids each arm SELECTED, before any action was taken on them.
   * This is what makes the policy testable: the counts say how many, and only
   * the ids say WHICH — and "which" is the whole question when the thing being
   * decided is whether an entity is destroyed. (F370: the previous guard was a
   * regex scan of this file's source text and stayed green when the archive
   * comparison was inverted.)
   */
  selected: {
    unmatched: string[];
    retryable: string[];
    closed: string[];
    moved: string[];
  };
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
    private readonly config: ConfigService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('RestaurantJanitorService');
  }

  /**
   * F365: these four settings have ONE declaration, in config/configuration.ts,
   * validated at boot. They used to be read off `process.env` inside the cron
   * body and coerced with a bare `Number(...)`, so a typo'd TTL became NaN —
   * which `olderThanDays ?? 90` does not catch (NaN is not nullish) — and
   * silently disabled the DETECT half of the lifecycle forever, with no error.
   */
  private lifecycleSettings(): {
    cronEnabled: boolean;
    refreshTtlDays: number;
    refreshLimit: number;
    noMatchAttemptThreshold: number;
    retryLimit: number;
  } {
    return {
      cronEnabled:
        this.config.get<boolean>('locationLifecycle.cronEnabled') ?? false,
      refreshTtlDays: this.config.get<number>(
        'locationLifecycle.refreshTtlDays',
      )!,
      refreshLimit: this.config.get<number>('locationLifecycle.refreshLimit')!,
      noMatchAttemptThreshold: this.config.get<number>(
        'locationLifecycle.noMatchAttemptThreshold',
      )!,
      retryLimit: this.config.get<number>('locationLifecycle.retryLimit')!,
    };
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
    const settings = this.lifecycleSettings();
    if (!settings.cronEnabled) return;
    if (this.lifecycleCronInFlight) return;
    this.lifecycleCronInFlight = true;
    try {
      const refresh = await this.enrichmentService.refreshStaleLocations({
        olderThanDays: settings.refreshTtlDays,
        limit: settings.refreshLimit,
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
    const settings = this.lifecycleSettings();
    const threshold =
      options.noMatchAttemptThreshold ?? settings.noMatchAttemptThreshold;
    const retryLimit = options.retryLimit ?? settings.retryLimit;
    const dryRun = options.dryRun ?? false;
    const summary: JanitorSummary = {
      archivedUnmatched: 0,
      retriedPlaceholders: 0,
      archivedClosed: 0,
      reEnrichedMoved: 0,
      ungroundedBacklog: 0,
      selected: { unmatched: [], retryable: [], closed: [], moved: [] },
    };

    // 1. Terminal no-match placeholders → archive.
    //
    // THE COUNTER IS A REAL COLUMN NOW (red team 2026-08-02). This policy read
    // `restaurant_metadata->'lastEnrichmentAttempt'->>'count'`, whose only
    // writer set it to `ranked.length` — the number of Google CANDIDATES
    // returned, not attempts. Two live consequences: a restaurant was archived
    // because Google returned the MOST evidence for it, and every
    // `error`-status attempt (which wrote no count) stayed at 0 forever and
    // was re-enriched every week at real Places spend. A policy contract
    // expressed as a JSON path in a raw SQL string in another file has no way
    // to notice when its writer means something else.
    const unmatched = await this.prisma.$queryRaw<{ entity_id: string }[]>`
      SELECT entity_id FROM core_entities
      WHERE type = 'restaurant' AND status = 'active'
        AND restaurant_metadata::jsonb -> 'lastEnrichmentAttempt' ->> 'status'
              IN ('no_match', 'error')
        AND enrichment_failure_count >= ${threshold}
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
    summary.selected.unmatched = unmatched.map((row) => row.entity_id);

    // 2. Placeholders under the threshold → retry enrichment (capped).
    const retryable = await this.prisma.$queryRaw<{ entity_id: string }[]>`
      SELECT entity_id FROM core_entities
      WHERE type = 'restaurant' AND status = 'active'
        AND enrichment_failure_count < ${threshold}
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
    summary.selected.retryable = retryable.map((row) => row.entity_id);
    // THE LANE'S OWN HONESTY (F366). The same predicate, uncapped, counted —
    // so the log line says whether this pass converges or merely samples.
    // This is a COUNT, never a Places call: the retry cap itself is untouched
    // here because raising it is new Places spend, which is the owner's P2.6
    // backfill-campaign decision, not a janitor edit.
    const [backlog] = await this.prisma.$queryRaw<{ depth: bigint }[]>`
      SELECT count(*) AS depth FROM core_entities
      WHERE type = 'restaurant' AND status = 'active'
        AND enrichment_failure_count < ${threshold}
        AND NOT EXISTS (
          SELECT 1 FROM core_restaurant_locations l
          WHERE l.restaurant_id = core_entities.entity_id
            AND l.google_place_id IS NOT NULL
        )
        AND EXISTS (
          SELECT 1 FROM core_restaurant_locations l
          WHERE l.restaurant_id = core_entities.entity_id
        )
    `;
    summary.ungroundedBacklog = Number(backlog?.depth ?? 0);
    if (retryLimit > 0 && summary.ungroundedBacklog > retryLimit) {
      this.logger.warn(
        'Placeholder retry lane is SAMPLING, not converging — the backlog exceeds one pass',
        {
          ungroundedBacklog: summary.ungroundedBacklog,
          retryLimit,
          passesToSweepBacklog: Math.ceil(
            summary.ungroundedBacklog / retryLimit,
          ),
        },
      );
    }
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
    summary.selected.closed = closed.map((row) => row.entity_id);

    // 3b. Moved → re-enrich through the redirect target (force: the identity
    // changed; enrichRestaurantById follows movedPlaceId internally).
    const moved = await this.prisma.restaurantLocation.findMany({
      where: { movedPlaceId: { not: null } },
      select: { locationId: true, restaurantId: true },
      distinct: ['restaurantId'],
      // Rotate under the cap: oldest-attempted first, and we stamp the row
      // below after EVERY attempt (success rewrites the location; failure
      // paths never touch it — without the stamp the same failing rows
      // re-pin the window weekly and later rows starve).
      orderBy: { updatedAt: 'asc' },
      take: retryLimit,
    });
    summary.selected.moved = moved.map((row) => row.restaurantId);
    if (!dryRun) {
      for (const row of moved) {
        const result = await this.enrichmentService.enrichRestaurantById(
          row.restaurantId,
          { force: true },
        );
        if (result.status === 'updated') {
          summary.reEnrichedMoved += 1;
        } else {
          await this.prisma.restaurantLocation.update({
            where: { locationId: row.locationId },
            data: { updatedAt: new Date() },
          });
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
