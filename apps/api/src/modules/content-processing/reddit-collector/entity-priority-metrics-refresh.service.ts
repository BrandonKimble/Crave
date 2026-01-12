import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 30;

@Injectable()
export class EntityPriorityMetricsRefreshService implements OnModuleInit {
  private readonly logger: LoggerService;
  private readonly windowDays = DEFAULT_WINDOW_DAYS;
  private refreshInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext(
      'EntityPriorityMetricsRefreshService',
    );
  }

  onModuleInit(): void {
    void this.refreshDemandMetrics().catch((error) => {
      this.logger.error('Initial entity priority metrics refresh failed', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    });
  }

  @Cron('0 3 * * *')
  async refreshDemandMetrics(): Promise<void> {
    if (this.refreshInFlight) {
      this.logger.warn('Entity priority metrics refresh already running');
      return;
    }
    this.refreshInFlight = true;

    const start = Date.now();
    const since = new Date(Date.now() - this.windowDays * MS_PER_DAY);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`
            UPDATE collection_entity_priority_metrics
            SET query_impressions = 0,
                last_query_at = NULL,
                view_impressions = 0,
                last_view_at = NULL,
                favorite_count = 0,
                autocomplete_selections = 0
          `,
        );

        await tx.$executeRaw(
          Prisma.sql`
            INSERT INTO collection_entity_priority_metrics (
              entity_id,
              entity_type,
              query_impressions,
              last_query_at
            )
            SELECT
              entity_id,
              entity_type,
              COUNT(DISTINCT user_id)::int AS query_impressions,
              MAX(logged_at) AS last_query_at
            FROM user_search_logs
            WHERE logged_at >= ${since}
              AND source = 'search'
              AND user_id IS NOT NULL
            GROUP BY entity_id, entity_type
            ON CONFLICT (entity_id) DO UPDATE
            SET entity_type = EXCLUDED.entity_type,
                query_impressions = EXCLUDED.query_impressions,
                last_query_at = EXCLUDED.last_query_at
          `,
        );

        await tx.$executeRaw(
          Prisma.sql`
            INSERT INTO collection_entity_priority_metrics (
              entity_id,
              entity_type,
              autocomplete_selections
            )
            SELECT
              entity_id,
              entity_type,
              COUNT(DISTINCT user_id)::int AS autocomplete_selections
            FROM user_search_logs
            WHERE logged_at >= ${since}
              AND source = 'search'
              AND user_id IS NOT NULL
              AND metadata->>'submissionSource' = 'autocomplete'
              AND metadata->'submissionContext'->>'selectedEntityType' IS NOT NULL
              AND (metadata->'submissionContext'->>'selectedEntityId')::uuid = entity_id
              AND metadata->'submissionContext'->>'selectedEntityType' = entity_type::text
            GROUP BY entity_id, entity_type
            ON CONFLICT (entity_id) DO UPDATE
            SET entity_type = EXCLUDED.entity_type,
                autocomplete_selections = EXCLUDED.autocomplete_selections
          `,
        );

        await tx.$executeRaw(
          Prisma.sql`
            INSERT INTO collection_entity_priority_metrics (
              entity_id,
              entity_type,
              view_impressions,
              last_view_at
            )
            SELECT
              restaurant_id AS entity_id,
              'restaurant' AS entity_type,
              COUNT(*)::int AS view_impressions,
              MAX(last_viewed_at) AS last_view_at
            FROM user_restaurant_views
            WHERE last_viewed_at >= ${since}
            GROUP BY restaurant_id
            ON CONFLICT (entity_id) DO UPDATE
            SET entity_type = EXCLUDED.entity_type,
                view_impressions = EXCLUDED.view_impressions,
                last_view_at = EXCLUDED.last_view_at
          `,
        );

        await tx.$executeRaw(
          Prisma.sql`
	            INSERT INTO collection_entity_priority_metrics (
	              entity_id,
	              entity_type,
	              view_impressions,
	              last_view_at
	            )
	            SELECT
	              food_id AS entity_id,
	              'food' AS entity_type,
	              COUNT(DISTINCT user_id)::int AS view_impressions,
	              MAX(last_viewed_at) AS last_view_at
	            FROM user_food_views
	            WHERE last_viewed_at >= ${since}
	            GROUP BY food_id
            ON CONFLICT (entity_id) DO UPDATE
            SET entity_type = EXCLUDED.entity_type,
                view_impressions = EXCLUDED.view_impressions,
                last_view_at = EXCLUDED.last_view_at
          `,
        );

        await tx.$executeRaw(
          Prisma.sql`
            INSERT INTO collection_entity_priority_metrics (
              entity_id,
              entity_type,
              favorite_count
            )
            SELECT
              entity_id,
              entity_type,
              COUNT(*)::int AS favorite_count
            FROM user_favorites
            GROUP BY entity_id, entity_type
            ON CONFLICT (entity_id) DO UPDATE
            SET entity_type = EXCLUDED.entity_type,
                favorite_count = EXCLUDED.favorite_count
          `,
        );
      });

      this.logger.info('Refreshed entity priority demand metrics', {
        windowDays: this.windowDays,
        since: since.toISOString(),
        durationMs: Date.now() - start,
      });
    } catch (error) {
      this.logger.error('Failed to refresh entity priority demand metrics', {
        windowDays: this.windowDays,
        since: since.toISOString(),
        durationMs: Date.now() - start,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    } finally {
      this.refreshInFlight = false;
    }
  }
}
