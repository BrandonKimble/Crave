import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EntityStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { PlaceLocationEnrichmentService } from './restaurant-location-enrichment.service';

export interface JanitorSummary {
  archivedClosed: number;
  reEnrichedMoved: number;
  /**
   * The entity ids each arm SELECTED, before any action was taken on them.
   * This is what makes the policy testable: the counts say how many, and only
   * the ids say WHICH — and "which" is the whole question when the thing being
   * decided is whether an entity is destroyed. (F370: the previous guard was a
   * regex scan of this file's source text and stayed green when the archive
   * comparison was inverted.)
   */
  selected: {
    closed: string[];
    moved: string[];
  };
}

/**
 * GROUNDED-PLACE LIFECYCLE — the ACT half of the decay cycle
 * (refreshStaleLocations is the DETECT half). Weekly: refresh a slice of
 * stale grounded locations (business_status, moved_place_id, hours, at the
 * lean SKU), then act on what the refresh flagged — archive restaurants whose
 * every location is CLOSED_PERMANENTLY; re-enrich through the redirect when a
 * location carries movedPlaceId.
 *
 * THE UNGROUNDED ARMS ARE GONE (owner ruling 2026-08-08, ghost campaign
 * close-out). This service used to also retry ungrounded placeholders weekly
 * and archive the hopeless ones past a strike threshold. Both jobs had better
 * homes, so both arms were deleted rather than switched on:
 *   - RETRY is mention-driven: every processing batch enqueues enrichment for
 *     every restaurant it mentions, and the worker skips already-grounded
 *     ones — so an ungrounded restaurant re-attempts the next time anyone
 *     talks about it, with fresher context than a cron could supply, and one
 *     nobody mentions again is by definition not worth a weekly Places bill.
 *   - THE MONEY GUARD lives at the spend chokepoint: enrichment refuses
 *     (status: skipped) once enrichment_failure_count reaches the threshold,
 *     so a much-discussed but ungroundable food truck stops buying lookups
 *     while staying ACTIVE, name-searchable, and evidence-bearing — archiving
 *     it was always the wrong verb for a real place Google merely can't pin.
 *
 * Everything that still archives here does so on GOOGLE'S OWN verdict
 * (CLOSED_PERMANENTLY on every location), status-flip only — reversible, and
 * consistent with how cuisine hubs and leaked entities are retired.
 */
@Injectable()
export class PlaceJanitorService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly enrichmentService: PlaceLocationEnrichmentService,
    private readonly config: ConfigService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('RestaurantJanitorService');
  }

  /**
   * F365: these settings have ONE declaration, in config/configuration.ts,
   * validated at boot. They used to be read off `process.env` inside the cron
   * body and coerced with a bare `Number(...)`, so a typo'd TTL became NaN —
   * which `olderThanDays ?? 90` does not catch (NaN is not nullish) — and
   * silently disabled the DETECT half of the lifecycle forever, with no error.
   */
  private lifecycleSettings(): {
    cronEnabled: boolean;
    refreshTtlDays: number;
    refreshLimit: number;
    movedRetryLimit: number;
  } {
    return {
      cronEnabled:
        this.config.get<boolean>('locationLifecycle.cronEnabled') ?? false,
      refreshTtlDays: this.config.get<number>(
        'locationLifecycle.refreshTtlDays',
      )!,
      refreshLimit: this.config.get<number>('locationLifecycle.refreshLimit')!,
      movedRetryLimit: this.config.get<number>('locationLifecycle.retryLimit')!,
    };
  }

  private lifecycleCronInFlight = false;

  /**
   * Weekly detect→act lifecycle pass: refresh a slice of stale locations
   * (DETECT — writes business_status/moved_place_id at the cheap SKU), then
   * act on whatever got flagged. Weekly over monthly: identical total cost
   * (the 90-day TTL sets poll volume, the cron only sets burst size), but
   * smaller batches and a failure only delays a week.
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
      movedRetryLimit?: number;
      dryRun?: boolean;
    } = {},
  ): Promise<JanitorSummary> {
    const settings = this.lifecycleSettings();
    const movedRetryLimit = options.movedRetryLimit ?? settings.movedRetryLimit;
    const dryRun = options.dryRun ?? false;
    const summary: JanitorSummary = {
      archivedClosed: 0,
      reEnrichedMoved: 0,
      selected: { closed: [], moved: [] },
    };

    // 1. Every location closed permanently → archive the restaurant.
    const closed = await this.prisma.$queryRaw<{ entity_id: string }[]>`
      SELECT e.entity_id FROM core_entities e
      WHERE e.type = 'place' AND e.status = 'active'
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

    // 2. Moved → re-enrich through the redirect target (force: the identity
    // changed; enrichRestaurantById follows movedPlaceId internally).
    const moved = await this.prisma.placeLocation.findMany({
      where: { movedPlaceId: { not: null } },
      select: { locationId: true, placeId: true },
      distinct: ['placeId'],
      // Rotate under the cap: oldest-attempted first, and we stamp the row
      // below after EVERY attempt (success rewrites the location; failure
      // paths never touch it — without the stamp the same failing rows
      // re-pin the window weekly and later rows starve).
      orderBy: { updatedAt: 'asc' },
      take: movedRetryLimit,
    });
    summary.selected.moved = moved.map((row) => row.placeId);
    if (!dryRun) {
      for (const row of moved) {
        const result = await this.enrichmentService.enrichPlaceById(
          row.placeId,
          { force: true },
        );
        if (result.status === 'updated') {
          summary.reEnrichedMoved += 1;
        } else {
          await this.prisma.placeLocation.update({
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
