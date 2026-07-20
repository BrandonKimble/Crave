/**
 * §22 item 6 one-time backfill: pre-dual-write user acts from the dying event
 * tables into the signals ledger, then a from-scratch aggregate rebuild — so
 * the reader cut (recently-viewed, recent searches, popularity) serves the
 * SAME history the old tables did.
 *
 * Laws honored:
 * - The ledger records FACTS: each legacy row was a real act; the backfill
 *   writes it once with meta.legacyEventId (idempotent — re-runs skip rows
 *   already present) and meta.backfill = true.
 * - Only rows STRICTLY BEFORE the dual-write go-live (the earliest live
 *   signal of that kind; falls back to now on an empty ledger) backfill —
 *   dual-write-era acts already have their signal.
 * - meta.eventCount carries user_entity_view_events.event_count (the old
 *   pre-dedup counter) so viewCounts stay equivalent.
 * - Geo mirrors the live writers: entity views = the context restaurant's
 *   primary-location point bbox; searches = the primary market bbox (center
 *   point fallback). Rows with no resolvable geo are skipped and counted
 *   (same skip law as SignalsService).
 *
 * Usage: npx ts-node scripts/backfill-signals-from-legacy-events.ts [--dry-run]
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { join } from 'path';
import configuration from '../src/config/configuration';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SharedModule } from '../src/shared/shared.module';
import { SignalsModule } from '../src/modules/signals/signals.module';
import { SignalDemandAggregateService } from '../src/modules/signals/signal-demand-aggregate.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(__dirname, '..', '.env'),
        join(__dirname, '..', '..', '..', '.env'),
      ],
      load: [configuration],
    }),
    SharedModule,
    PrismaModule,
    SignalsModule,
  ],
})
class BackfillModule {}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const app = await NestFactory.createApplicationContext(BackfillModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const prisma = app.get(PrismaService);
    const aggregate = app.get(SignalDemandAggregateService);

    // 1. Actors for every legacy user (idempotent).
    const actorsCreated = await prisma.$executeRaw`
      INSERT INTO signal_actors (user_id)
      SELECT DISTINCT u.user_id
      FROM (
        SELECT user_id FROM user_entity_view_events
        UNION
        SELECT user_id FROM search_events WHERE user_id IS NOT NULL
      ) u
      WHERE NOT EXISTS (
        SELECT 1 FROM signal_actors a WHERE a.user_id = u.user_id
      )
    `;
    console.log(`signal_actors created: ${actorsCreated}`);

    if (dryRun) {
      const [counts] = await prisma.$queryRaw<
        { view_events: bigint; search_events: bigint }[]
      >`
        SELECT
          (SELECT COUNT(*) FROM user_entity_view_events) AS view_events,
          (SELECT COUNT(*) FROM search_events) AS search_events
      `;
      console.log('[dry-run] candidate rows:', counts);
      return;
    }

    // 2. entity_view acts. Cutoff = earliest live entity_view signal.
    const viewSignals = await prisma.$executeRaw`
      WITH cutoff AS (
        SELECT COALESCE(
          (SELECT MIN(occurred_at) FROM signals WHERE kind = 'entity_view' AND meta->>'backfill' IS NULL),
          NOW()
        ) AS at
      )
      INSERT INTO signals (
        kind, subject_type, subject_id, subject_text,
        geo_min_lat, geo_min_lng, geo_max_lat, geo_max_lng,
        actor_id, occurred_at, meta
      )
      SELECT
        'entity_view',
        'entity',
        ev.entity_id,
        NULL,
        rl.latitude, rl.longitude, rl.latitude, rl.longitude,
        a.actor_id,
        ev.viewed_at,
        jsonb_strip_nulls(jsonb_build_object(
          'backfill', true,
          'legacyEventId', ev.view_event_id,
          'eventCount', ev.event_count,
          'contextRestaurantId', ev.context_restaurant_id,
          'connectionId', ev.connection_id
        ))
      FROM user_entity_view_events ev
      JOIN signal_actors a ON a.user_id = ev.user_id
      JOIN LATERAL (
        SELECT l.latitude, l.longitude
        FROM core_restaurant_locations l
        WHERE l.restaurant_id = COALESCE(ev.context_restaurant_id, ev.entity_id)
          AND l.latitude IS NOT NULL
          AND l.longitude IS NOT NULL
        ORDER BY l.is_primary DESC
        LIMIT 1
      ) rl ON TRUE
      WHERE ev.viewed_at < (SELECT at FROM cutoff)
        AND NOT EXISTS (
          SELECT 1 FROM signals s
          WHERE s.kind = 'entity_view'
            AND s.meta->>'legacyEventId' = ev.view_event_id::text
        )
    `;
    console.log(`entity_view signals backfilled: ${viewSignals}`);

    // 3. search acts. Subject carries BOTH halves of the act (§3, matching
    // the live writer): the query term ALWAYS, plus the legacy event's
    // primary resolved entity when one exists — the submissionContext
    // selection first, else the newest attributed entity (the old
    // /search/recent endpoint's exact preference order; red-team 2a — the
    // recent-searches reader is unservable without it).
    // Geo = primary market bbox, center-point fallback (the live cache-reveal
    // writer's law).
    const searchSignals = await prisma.$executeRaw`
      WITH cutoff AS (
        SELECT COALESCE(
          (SELECT MIN(occurred_at) FROM signals WHERE kind = 'search' AND meta->>'backfill' IS NULL),
          NOW()
        ) AS at
      ),
      primary_entity AS (
        SELECT ev.event_id,
          (SELECT see.entity_id
           FROM search_event_entities see
           WHERE see.event_id = ev.event_id
           ORDER BY
             CASE
               WHEN ev.metadata#>>'{submissionContext,selectedEntityId}' = see.entity_id::text THEN 0
               ELSE 1
             END,
             see.logged_at DESC
           LIMIT 1) AS entity_id
        FROM search_events ev
      )
      INSERT INTO signals (
        kind, subject_type, subject_id, subject_text,
        geo_min_lat, geo_min_lng, geo_max_lat, geo_max_lng,
        actor_id, occurred_at, meta
      )
      SELECT
        'search',
        CASE WHEN pe.entity_id IS NOT NULL THEN 'entity' ELSE 'term' END,
        pe.entity_id,
        LEFT(LOWER(TRIM(ev.query_text)), 255),
        COALESCE(m.bbox_sw_latitude, m.center_latitude),
        COALESCE(m.bbox_sw_longitude, m.center_longitude),
        COALESCE(m.bbox_ne_latitude, m.center_latitude),
        COALESCE(m.bbox_ne_longitude, m.center_longitude),
        a.actor_id,
        ev.logged_at,
        jsonb_strip_nulls(jsonb_build_object(
          'backfill', true,
          'legacyEventId', ev.event_id,
          'searchRequestId', ev.search_request_id,
          'resultCount', ev.total_results,
          'restaurantCount', ev.total_restaurant_results,
          'cached', ev.event_kind = 'cache'
        ))
      FROM search_events ev
      JOIN signal_actors a ON a.user_id = ev.user_id
      LEFT JOIN primary_entity pe ON pe.event_id = ev.event_id
      JOIN core_markets m
        ON LOWER(m.market_key) = LOWER(TRIM(ev.primary_market_key))
       AND (m.center_latitude IS NOT NULL OR m.bbox_sw_latitude IS NOT NULL)
      WHERE ev.logged_at < (SELECT at FROM cutoff)
        AND NULLIF(LOWER(TRIM(ev.query_text)), '') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM signals s
          WHERE s.kind = 'search'
            AND s.meta->>'legacyEventId' = ev.event_id::text
        )
    `;
    console.log(`search signals backfilled: ${searchSignals}`);

    const [skips] = await prisma.$queryRaw<
      {
        view_rows: bigint;
        search_rows: bigint;
        view_signals: bigint;
        search_signals: bigint;
      }[]
    >`
      SELECT
        (SELECT COUNT(*) FROM user_entity_view_events) AS view_rows,
        (SELECT COUNT(*) FROM search_events) AS search_rows,
        (SELECT COUNT(*) FROM signals WHERE kind = 'entity_view' AND meta->>'backfill' = 'true') AS view_signals,
        (SELECT COUNT(*) FROM signals WHERE kind = 'search' AND meta->>'backfill' = 'true') AS search_signals
    `;
    console.log('coverage (skips = no geo / no user / empty query):', skips);

    // 4. Derive the aggregate from scratch — the rebuild path IS the
    // incremental path applied to every day (§22 item 6 equivalence law).
    const rebuild = await aggregate.rebuildAll();
    console.log('aggregate rebuild:', rebuild);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('backfill failed', error);
  process.exitCode = 1;
});
