import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { OpsAlertsService } from '../external-integrations/shared/ops-alerts.service';
import { DerivedIndexJob } from '../../shared/derived-index-job';
import { LoggerService } from '../../shared';
import { find as findTimeZone } from 'geo-tz';
import {
  buildOperatingMetadataFromLocation,
  buildStructuredWeeklyHours,
} from './utils/restaurant-status';

/**
 * B1 (round-5 ideal): openness becomes stored, SQL-evaluable data.
 *
 * derived_location_open_intervals is produced through the SAME exported JS
 * chain the executor used to evaluate per-request
 * (buildOperatingMetadataFromLocation → buildStructuredWeeklyHours), so the
 * intervals are parity-identical by construction — including the
 * midnight-crossing rule (close ≤ open spills into the next day, split
 * here into two rows) and the unparseable-sentinel drop.
 *
 * Query-time predicate (see the builder): local now = timezone(time_zone,
 * now()); open ⇔ an interval row covers (dow, minutes). DST-correct via
 * the IANA zone (backfilled from lat/lng; utc_offset_minutes was
 * DST-naive by construction).
 */
@Injectable()
export class OpenIntervalsBuilderService extends DerivedIndexJob {
  protected readonly logger: LoggerService;
  protected readonly derivedTable = 'derived_location_open_intervals';
  protected readonly disableFlagEnv = '';
  protected readonly alert = {
    kind: 'open_intervals_empty',
    title: 'Open-now filtering is silently disabled',
    consequence:
      'Every "Open now" search is returning UNFILTERED results — closed restaurants included.',
  };
  private lastCounts = { input: 0, output: 0 };

  constructor(
    prisma: PrismaService,
    opsAlerts: OpsAlertsService,
    loggerService: LoggerService,
  ) {
    super(prisma, opsAlerts);
    this.logger = loggerService.setContext('OpenIntervalsBuilderService');
  }

  @Cron('50 8 * * *')
  async nightly(): Promise<void> {
    await this.runGuarded();
  }

  protected async rebuild(): Promise<{ input: number; output: number }> {
    await this.doRebuild();
    return this.lastCounts;
  }

  private async doRebuild(): Promise<void> {
    const started = Date.now();
    {
      // TZ BACKFILL first (self-healing): utc_offset_minutes is DST-naive
      // by construction; the IANA zone derives from coordinates once.
      const missingTz = await this.prisma.$queryRaw<
        { location_id: string; latitude: number; longitude: number }[]
      >`SELECT location_id, latitude::float8 AS latitude, longitude::float8 AS longitude
        FROM core_restaurant_locations
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND time_zone IS NULL`;
      const byTz = new Map<string, string[]>();
      for (const row of missingTz) {
        const tz = findTimeZone(row.latitude, row.longitude)[0];
        if (!tz) continue;
        const bucket = byTz.get(tz) ?? [];
        bucket.push(row.location_id);
        byTz.set(tz, bucket);
      }
      for (const [tz, ids] of byTz) {
        for (let i = 0; i < ids.length; i += 2000) {
          await this.prisma
            .$executeRaw`UPDATE core_restaurant_locations SET time_zone = ${tz} WHERE location_id = ANY(${ids.slice(i, i + 2000)}::uuid[])`;
        }
      }
      if (missingTz.length) {
        this.logger.info('Backfilled IANA time zones', {
          locations: missingTz.length,
          zones: byTz.size,
        });
      }

      const locations = await this.prisma.$queryRaw<
        {
          location_id: string;
          hours: unknown;
          utc_offset_minutes: number | null;
          time_zone: string | null;
        }[]
      >`SELECT location_id, hours, utc_offset_minutes, time_zone
        FROM core_restaurant_locations WHERE hours IS NOT NULL`;

      type Row = {
        locationId: string;
        dow: number;
        startMin: number;
        endMin: number;
      };
      const rows: Row[] = [];
      for (const location of locations) {
        const metadata = buildOperatingMetadataFromLocation(
          location.hours,
          location.utc_offset_minutes,
          location.time_zone,
        );
        if (!metadata) continue;
        const weekly = buildStructuredWeeklyHours(metadata, null);
        if (!weekly) continue;
        weekly.days.forEach((day, dayIndex) => {
          for (const interval of day.intervals) {
            if (interval.end <= interval.start) continue;
            if (interval.end <= 1440) {
              rows.push({
                locationId: location.location_id,
                dow: dayIndex,
                startMin: interval.start,
                endMin: interval.end,
              });
            } else {
              // Midnight-crossing: split across the day boundary.
              rows.push({
                locationId: location.location_id,
                dow: dayIndex,
                startMin: interval.start,
                endMin: 1440,
              });
              rows.push({
                locationId: location.location_id,
                dow: (dayIndex + 1) % 7,
                startMin: 0,
                endMin: interval.end - 1440,
              });
            }
          }
        });
      }

      // Same (location, dow, start) can arise from a split colliding with a
      // real early interval — keep the wider end.
      const byKey = new Map<string, Row>();
      for (const row of rows) {
        const key = `${row.locationId}:${row.dow}:${row.startMin}`;
        const existing = byKey.get(key);
        if (!existing || existing.endMin < row.endMin) byKey.set(key, row);
      }

      await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`TRUNCATE derived_location_open_intervals`;
          const all = Array.from(byKey.values());
          for (let i = 0; i < all.length; i += 5000) {
            await tx.locationOpenInterval.createMany({
              data: all.slice(i, i + 5000),
              skipDuplicates: true,
            });
          }
        },
        { timeout: 300_000 },
      );
      this.lastCounts = { input: locations.length, output: byKey.size };
      this.logger.info('Location open-intervals rebuilt', {
        locations: locations.length,
        rows: byKey.size,
        tookMs: Date.now() - started,
      });
    }
  }
}
