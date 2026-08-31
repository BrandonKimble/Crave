import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EntityStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { PlaceLocationEnrichmentService } from './restaurant-location-enrichment.service';
import { userAnchoredEntitySql } from './user-anchor-scope';

export interface JanitorSummary {
  archivedClosed: number;
  archivedUngroundable: number;
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
    ungroundable: string[];
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
 * THE UNGROUNDED RETRY ARM IS GONE (owner ruling 2026-08-08): retry is
 * mention-driven — an ungrounded restaurant re-attempts the next time anyone
 * talks about it; one nobody mentions again is not worth a weekly bill. THE
 * MONEY GUARD stays at the spend chokepoint (enrichment refuses once
 * enrichment_failure_count reaches the threshold).
 *
 * THE UNGROUNDABLE-SURVIVAL GATE IS BACK, BY LATER RULING (2026-08-12
 * "don't create anything we can't hook to a real restaurant" + SD-3,
 * 2026-08-16, which ruled the ghost-'Best' case specifically: a name-court
 * UPHELD name still dies here — "ungrounded-after-attempt must not be
 * searchable; the defect is lifecycle, not name-hood"). The 08-08 posture
 * ("stays ACTIVE, name-searchable") is SUPERSEDED for the terminal case:
 * once the money guard's own threshold says a place has definitively failed
 * grounding, the same line now also says it stops being searchable — one
 * constant, one meaning, two consumers. USER-ANCHORED entities are never
 * touched (the standing anchor law), and archiving is a status flip —
 * events retained, revivable, and a future force/retryTerminal grounding
 * can resurrect it.
 *
 * Everything here archives by status-flip only — reversible, and consistent
 * with how cuisine hubs and leaked entities are retired; the closed arm
 * still acts on GOOGLE'S OWN verdict (CLOSED_PERMANENTLY everywhere).
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
      archivedUngroundable: 0,
      reEnrichedMoved: 0,
      selected: { closed: [], ungroundable: [], moved: [] },
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

    // 1b. THE UNGROUNDABLE-SURVIVAL GATE (2026-08-12 ruling + SD-3; see the
    // header). Terminal = the money guard's own threshold — the counter only
    // increments on DEFINITIVE no-match verdicts, so this is "Google said no,
    // N separate times", never a transient. User anchors are inviolable.
    const terminalThreshold = this.config.get<number>(
      'locationLifecycle.noMatchAttemptThreshold',
    )!;
    // USER ANCHORS ARE INVIOLABLE — and "user anchor" is the ONE shared
    // predicate in user-anchor-scope.ts (grounding red team 2026-08-31; it
    // mirrors preserved-anchors.sql's full entity-anchor roster, where this
    // guard used to hand-copy only 2 of the ~8 sources).
    const ungroundable = await this.prisma.$queryRaw<{ entity_id: string }[]>`
      SELECT e.entity_id FROM core_entities e
      WHERE e.type = 'place' AND e.status = 'active'
        AND e.enrichment_failure_count >= ${terminalThreshold}
        AND NOT EXISTS (
          SELECT 1 FROM core_restaurant_locations l
          WHERE l.restaurant_id = e.entity_id
            AND l.google_place_id IS NOT NULL
        )
        AND NOT ${Prisma.raw(userAnchoredEntitySql('e'))}
    `;
    if (!dryRun && ungroundable.length) {
      await this.prisma.entity.updateMany({
        where: { entityId: { in: ungroundable.map((row) => row.entity_id) } },
        data: { status: EntityStatus.archived },
      });
    }
    summary.archivedUngroundable = ungroundable.length;
    summary.selected.ungroundable = ungroundable.map((row) => row.entity_id);

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
