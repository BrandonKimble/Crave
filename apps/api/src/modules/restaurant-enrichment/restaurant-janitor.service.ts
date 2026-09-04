import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EntityStatus, Prisma } from '@prisma/client';
import { OpsAlertsService } from '../external-integrations/shared/ops-alerts.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { PlaceLocationEnrichmentService } from './restaurant-location-enrichment.service';
import { userAnchoredEntitySql } from './user-anchor-scope';

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
 * every location is CLOSED_PERMANENTLY; follow Google's redirect once (one
 * details call, row rewritten in place) when a location carries movedPlaceId.
 *
 * THE UNGROUNDED RETRY ARM IS GONE (owner ruling 2026-08-08): retry is
 * mention-driven — an ungrounded restaurant re-attempts the next time anyone
 * talks about it; one nobody mentions again is not worth a weekly bill. THE
 * MONEY GUARD stays at the spend chokepoint (enrichment refuses once
 * enrichment_failure_count reaches the threshold).
 *
 * THE UNGROUNDABLE-SURVIVAL GATE IS GONE AGAIN (owner-approved
 * rederivation, 2026-09-04 — "the court's memory is the ledger"). It came
 * back on 2026-08-12 (+ SD-3) to make a terminally ungroundable place
 * unsearchable by ARCHIVING it, and that archive then wore a judge
 * reject's clothes: the resolver's tombstone sink read `archived + no
 * redirect` as "rejected", so the 134 places this arm archived on
 * 2026-09-03 swallowed 632 live place mentions in the v23 shadow
 * ("Arlo's", archived here, ate every vouch meant for the live, grounded
 * "Arlo's Junior"). Under the parked-names law an archive with no verdict
 * behind it is a name waiting to be revived by its next mention — so this
 * arm would have flip-flopped weekly against the resolver. Its two
 * purposes live where they belong now: the money guard at the spend
 * chokepoint (enrichment refuses at the threshold — unchanged), and the
 * 08-12 ruling's "must not be searchable" as a PREDICATE on the
 * servable-place visibility floor (servable-place-scope.ts: an ungrounded
 * place past the threshold is off every serving surface — search list,
 * map, autocomplete, teaser, curated feeder — while staying active as a
 * parked name). Hidden by predicate, never by archiving.
 *
 * Everything here archives by status-flip only — reversible, and consistent
 * with how cuisine hubs and leaked entities are retired; the closed arm
 * still acts on GOOGLE'S OWN verdict (CLOSED_PERMANENTLY everywhere), and
 * that same verdict is what the resolver's closed-place sink reads
 * (entity-reject-lane.ts `googleClosedSql`), never the status alone.
 */
@Injectable()
export class PlaceJanitorService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly enrichmentService: PlaceLocationEnrichmentService,
    private readonly config: ConfigService,
    loggerService: LoggerService,
    private readonly opsAlerts: OpsAlertsService,
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
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Weekly location lifecycle pass failed', {
        error: { message },
      });
      // A FAILED LIFECYCLE PASS SCREAMS (red team 2026-09-04, CI wave 0c):
      // this catch only logged while the ungroundable gate threw on every
      // run for days — closed-place archival and moved re-enrichment
      // silently stopped. A refusal that only logs is the silence class.
      this.opsAlerts.emit({
        severity: 'critical',
        kind: 'lifecycle-pass-failed',
        title: 'Weekly location lifecycle pass FAILED',
        body:
          `The janitor/refresh pass threw and did no work: ${message}. ` +
          `Closed-place archival and moved-place ` +
          `re-enrichment are not running until this is fixed.`,
        dedupeKey: `lifecycle-pass-failed:${new Date().toISOString().slice(0, 10)}`,
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
        -- USER ANCHORS ARE INVIOLABLE on THIS arm too (red team 2026-09-04
        -- E-5): the header states the anchor law and the ungroundable arm
        -- below applies it, but the closed arm archived a saved place the
        -- moment Google marked every location closed — the user's list
        -- entry went dark. A closed-but-saved place stays active and shows
        -- its business status; the same predicate governs both arms.
        AND NOT ${Prisma.raw(userAnchoredEntitySql('e'))}
    `;
    if (!dryRun && closed.length) {
      await this.prisma.entity.updateMany({
        where: { entityId: { in: closed.map((row) => row.entity_id) } },
        data: { status: EntityStatus.archived },
      });
    }
    summary.archivedClosed = closed.length;
    summary.selected.closed = closed.map((row) => row.entity_id);

    // (No 1b.) The ungroundable-survival gate lived here until 2026-09-04 —
    // see the header for where its two purposes went. An ungrounded place
    // past the money guard's threshold stays ACTIVE as a parked name and is
    // hidden by the visibility floor's predicate, never archived.

    // 2. Moved → follow Google's redirect ONCE (red team 2026-09-04 E-3):
    // one details call on the new place id, the row rewritten in place, the
    // moved flag cleared. This arm used to force a full re-enrichment (name
    // search + chooser + details) that minted a SECOND location row and
    // left the moved one standing, so the same redirect was re-bought every
    // week forever.
    const moved = await this.prisma.placeLocation.findMany({
      where: { movedPlaceId: { not: null } },
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
        const result = await this.enrichmentService.followMovedPlace(row);
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
