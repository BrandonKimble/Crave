import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { activeCreditingCommunitiesSourceSql } from '../content-processing/reddit-collector/extraction-scope.service';
import { RescoreCoordinatorService } from '../content-processing/public-crave-score';

/**
 * MARKET MEMBERSHIP AT GROUNDING (v17 S4, ruled 2026-08-26).
 *
 * A grounded place outside the community's metro is excluded
 * DETERMINISTICALLY from that community's corpus. The prompt geo rule was
 * tried and failed certification 3x (the model treats a day-trip ask's town
 * as in-scope) and was deleted — geography belongs to the layer that has
 * coordinates, which is this one.
 *
 * THE VERDICT (pure function of stored state, recomputed idempotently):
 * a place entity is OUT of market when
 *   (a) at least one crediting community (a community whose ACTIVE events
 *       credit the place — both event ledgers, via the extraction-scope
 *       service's one definition) resolves to a territory with geometry, AND
 *   (b) the place has at least one geocoded location, AND
 *   (c) NO geocoded location of the place is inside ANY crediting
 *       community's territory geometry, nor within
 *       MARKET_MEMBERSHIP_RADIUS_MILES of that territory's centroid.
 *
 * The radius exists because engine territory today is the CITY polygon
 * (Austin ~556 sq mi): suburbs (Round Rock, Buda) are genuinely in-market
 * but outside the municipal boundary. 50 miles is the class-4 definition
 * the defect sizing measured the ~41 genuine out-of-market restaurants
 * with (plans/v16-defect-sizing-20260825.md — ">50 mi from Austin
 * 30.2672,-97.7431"), not an invented prior.
 *
 * FAIL-OPEN by construction: no crediting community, no geometry, or no
 * coordinates ⇒ in market (verdict NULL). Exclusion is a positive,
 * evidence-backed finding — never a default.
 *
 * NO DELETIONS, ever: place-grounded restaurants are expensive verified
 * knowledge (the ~$118 law). The verdict is a timestamp column readers
 * filter on, and a re-grounding that moves the place in-market clears it
 * on the same reconcile.
 *
 * Writers: the grounding write path (applyGroundingEffect) reconciles the
 * one entity it just moved; the nightly convergence cron reconciles the
 * whole corpus (cheap: one set-based UPDATE over ~places × ~2 territories).
 *
 * GRAIN RULING (redteam L3-F5, 2026-08-26; see plans/v17-program.md):
 * the verdict is deliberately GLOBAL — it answers "is this place inside
 * ANYONE'S market?" (union across crediting communities), and exclusion
 * genuinely means "nobody's market wants it". Do NOT patch a community_id
 * onto this column; that would change its meaning. What multi-community
 * (NY onboarding) actually needs is per-community IN-market attribution
 * for score-pool/demand-lane scoping — a separate table derivable on
 * demand from the same territory join, built AT onboarding, not before.
 */
export const MARKET_MEMBERSHIP_RADIUS_MILES = 50;
const RADIUS_METERS = Math.round(MARKET_MEMBERSHIP_RADIUS_MILES * 1609.344);

@Injectable()
export class MarketMembershipService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly rescore: RescoreCoordinatorService,
  ) {
    this.logger = loggerService.setContext('MarketMembershipService');
  }

  /** Reconcile one entity (grounding write path) or the whole corpus
   *  (nightly / sweep). Returns how many verdicts CHANGED.
   *
   *  VERDICT AND POOL ARE ONE TRANSACTION OF INTENT (red-team L3 F2):
   *  the score pool used to lag the verdict by up to a day (220 restaurant
   *  + 189 dish score rows sat live for excluded places until the next
   *  nightly rebuild's stale-prune). Now, atomically with the verdict
   *  write: newly-EXCLUDED places have their score rows (restaurant rows
   *  AND their connections' dish rows) DELETED in the same transaction;
   *  newly UN-excluded places mark the rescore dirty (the ONLY enqueue
   *  collection paths may use — §12.6 singleton rescorer) so the next
   *  hourly tick re-admits them to the pool. */
  async reconcile(entityId?: string): Promise<number> {
    const entityFilter = entityId
      ? Prisma.sql`r2.entity_id = ${entityId}::uuid`
      : Prisma.sql`TRUE`;
    const started = Date.now();
    try {
      const changedRows = await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{ entity_id: string; excluded: boolean }>
        >`
        WITH crediting AS (
          SELECT c.restaurant_id, s.engine_id, s.anchor_place_id
          FROM ${Prisma.raw(activeCreditingCommunitiesSourceSql())} c
          JOIN sources s
            ON s.platform = c.platform AND lower(s.handle) = c.community
        ),
        territory AS (
          SELECT c.restaurant_id, tp.place_id
          FROM crediting c
          LEFT JOIN engines eng ON eng.engine_id = c.engine_id
          JOIN LATERAL unnest(
            CASE WHEN eng.engine_id IS NOT NULL THEN eng.member_place_ids
                 ELSE ARRAY[c.anchor_place_id] END
          ) AS tp(place_id) ON tp.place_id IS NOT NULL
        )
        UPDATE core_entities r
        SET market_excluded_at = CASE
              WHEN v.excluded THEN COALESCE(r.market_excluded_at, now())
              ELSE NULL
            END
        FROM (
          SELECT r2.entity_id,
            (
              EXISTS (
                SELECT 1 FROM territory t
                JOIN place_geometries pg ON pg.place_id = t.place_id
                WHERE t.restaurant_id = r2.entity_id
              )
              AND EXISTS (
                SELECT 1 FROM core_restaurant_locations rl
                WHERE rl.restaurant_id = r2.entity_id
                  AND rl.latitude IS NOT NULL AND rl.longitude IS NOT NULL
              )
              AND NOT EXISTS (
                SELECT 1
                FROM core_restaurant_locations rl
                JOIN territory t ON t.restaurant_id = r2.entity_id
                JOIN place_geometries pg ON pg.place_id = t.place_id
                WHERE rl.restaurant_id = r2.entity_id
                  AND rl.latitude IS NOT NULL AND rl.longitude IS NOT NULL
                  AND (
                    ST_Covers(
                      pg.geometry,
                      ST_SetSRID(ST_MakePoint(rl.longitude::float8, rl.latitude::float8), 4326)
                    )
                    OR ST_DWithin(
                      ST_Centroid(pg.geometry)::geography,
                      ST_SetSRID(ST_MakePoint(rl.longitude::float8, rl.latitude::float8), 4326)::geography,
                      ${RADIUS_METERS}
                    )
                  )
              )
            ) AS excluded
          FROM core_entities r2
          WHERE r2.type = 'place' AND ${entityFilter}
        ) v
        WHERE v.entity_id = r.entity_id
          AND (r.market_excluded_at IS NOT NULL) IS DISTINCT FROM v.excluded
        RETURNING r.entity_id, v.excluded
      `;
        const newlyExcluded = rows
          .filter((row) => row.excluded)
          .map((row) => row.entity_id);
        if (newlyExcluded.length > 0) {
          // Prune the pool atomically with the verdict: the place's own
          // restaurant score row AND every dish (connection) score row tied
          // to it — the same keying the score writer's stale-prune uses
          // (subject_type/subject_id; connections key dish scores).
          await tx.$executeRaw`
            DELETE FROM core_public_entity_scores s
            WHERE (s.subject_type = 'restaurant'
                   AND s.subject_id = ANY(${newlyExcluded}::uuid[]))
               OR (s.subject_type = 'connection'
                   AND s.subject_id IN (
                     SELECT c.connection_id
                     FROM core_restaurant_items c
                     WHERE c.restaurant_id = ANY(${newlyExcluded}::uuid[])
                   ))
          `;
        }
        return rows;
      });
      const changed = changedRows.length;
      const unexcludedCount = changedRows.filter((row) => !row.excluded).length;
      if (unexcludedCount > 0) {
        // Re-admission needs a rebuild (percentiles are pool-wide, so a
        // scoped upsert can't price one place honestly); mark the durable
        // dirty flag the hourly coordinator owns. After the commit — a lost
        // mark is self-healing (the nightly reconcile is idempotent and the
        // score input filter already includes the place).
        await this.rescore.markDirty(
          `market re-inclusion: ${unexcludedCount} place(s) re-entered the market`,
        );
      }
      if (changed > 0 || !entityId) {
        this.logger.info('Market-membership verdicts reconciled', {
          scope: entityId ?? 'all',
          changedRows: changed,
          tookMs: Date.now() - started,
        });
      }
      return changed;
    } catch (error) {
      // .error is the Sentry seam: a reconciler that fails every night
      // leaves stale verdicts serving out-of-market places silently.
      this.logger.error(
        'Market-membership reconcile failed',
        error instanceof Error ? error : new Error(String(error)),
        { scope: entityId ?? 'all' },
      );
      return 0;
    }
  }
}
