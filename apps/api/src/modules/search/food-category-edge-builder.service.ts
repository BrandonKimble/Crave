import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { OpsAlertsService } from '../external-integrations/shared/ops-alerts.service';
import { DerivedIndexJob } from '../../shared/derived-index-job';
import { LoggerService } from '../../shared';
import {
  ITEM_CATEGORY_EDGE_LOCK,
  itemCategoryEdgeDeleteSql,
  itemCategoryEdgeInsertSql,
} from '../content-processing/reddit-collector/food-category-edge-sql';

/**
 * THE FIFTH DERIVED TABLE FINALLY GETS THE LAW (D3, 2026-08-13).
 *
 * `derived_food_category_edges` is a hot-path derived table by every test the
 * derived-index law was written for, and it was the one table that had no
 * rebuild job:
 *
 *   - FOUR readers fail open on it — search's category expansion
 *     (search-query.builder, search-sibling-expansion), the teaser's category
 *     lists, and the satisfies judge's rung-2 arm. Not one of them errors on a
 *     missing edge; the category simply returns fewer dishes, forever, and
 *     nothing says so.
 *   - Its only writer was INCREMENTAL: the projection rebuild refreshes the
 *     edges of foods belonging to restaurants it happens to be rebuilding. A
 *     food whose inputs changed for any other reason — an entity archived, a
 *     merge landing, a category renamed — keeps a stale edge until some
 *     unrelated restaurant rebuild drags it along. And after a wipe, or on a
 *     fresh environment, nothing repopulates it AT ALL: the incremental writer
 *     can only refresh foods that a restaurant rebuild names, so an empty
 *     table stays empty and every category search stays quietly thin.
 *
 * That is precisely the outage shape the base class exists to prevent (the
 * containment table was found EMPTY IN PROD with rung-2 widening silently
 * off). Extending DerivedIndexJob buys all three parts of the law: the boot
 * self-heal that notices an empty table, the zero-output critical alert, and
 * the guarded cron.
 *
 * The membership SQL is NOT restated here — it is the incremental writer's own
 * text, scoped to everything instead of to a restaurant list. See
 * food-category-edge-sql.ts for why two writers of one table must share one
 * derivation.
 *
 * ─── WHAT THIS JOB FOUND ON ITS FIRST RUN (measured, local corpus) ───────
 *
 * Executed as a rolled-back transaction against the real table, which held
 * 7,888 edges built entirely by the incremental writer:
 *
 *   rows only in the OLD table (stale):  341
 *   rows only in the NEW table:            0
 *   same pair, drifted counts:             0
 *   ...of the 341, foods with NO live connection at all: 341
 *
 * Both halves of that matter. The zeros are the correctness proof: on every
 * food the corpus still supports, the full replace and the incremental writer
 * agree EXACTLY — not approximately — so the nightly run cannot flip-flop the
 * table against the day's rebuilds. And the 341 are the disease, named: they
 * are edges for foods whose connections have all gone away, which the
 * incremental writer structurally CANNOT clean up, because it only ever
 * revisits foods that some restaurant rebuild happens to name. Nothing named
 * them, so they sat there — a category claiming dishes the corpus no longer
 * says belong to it, in four fail-open readers, indefinitely.
 */
@Injectable()
export class ItemCategoryEdgeBuilderService extends DerivedIndexJob {
  protected readonly logger: LoggerService;
  protected readonly derivedTable = 'derived_food_category_edges';
  protected readonly disableFlagEnv = 'FOOD_CATEGORY_EDGE_BUILDER_ENABLED';
  protected readonly alert = {
    kind: 'food_category_edges_empty',
    title: 'Food-category membership is silently empty',
    consequence:
      'Category search ("tacos", "ramen") returns only foods named for the category — every dish that belongs to it by membership rather than by name is invisible, and so are the teaser and the satisfies judge\'s rung-2 exclusions.',
  };

  constructor(
    prisma: PrismaService,
    opsAlerts: OpsAlertsService,
    loggerService: LoggerService,
  ) {
    super(prisma, opsAlerts);
    this.logger = loggerService.setContext('FoodCategoryEdgeBuilder');
  }

  /** Full replace across every food, in one transaction. */
  protected async rebuildAll(): Promise<{ edges: number }> {
    const start = Date.now();
    const edges = await this.prisma.$transaction(
      async (tx) => {
        // Same advisory lock the incremental writer takes, so a nightly full
        // replace and a projection rebuild can never interleave on the rows
        // they both own.
        await tx.$executeRawUnsafe(ITEM_CATEGORY_EDGE_LOCK);
        // REFUSE-EMPTY-INPUT, BEFORE THE DELETE (audit 2026-08-31, R6
        // class). This builder is unique among the derived rebuilds: its
        // input is a BACKFILL-GATED facet (knowledge_categories, filled by
        // dish-knowledge synthesis), not the corpus itself — so "no input"
        // usually means the backfill hasn't run, not that the world is
        // empty. The old order deleted first and counted after, so arming
        // this job before synthesis silently wiped every standing edge and
        // the zero-input rationale excused it. A wrong ORDER must be a loud
        // no-op, never a wipe: standing edges survive until real input
        // exists to replace them.
        const [{ n: inputDishes }] = await tx.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n FROM core_entities e
          WHERE e.type = 'item'::entity_type
            AND e.status = 'active'::entity_status
            AND cardinality(e.knowledge_categories) > 0`;
        if (inputDishes === 0) {
          const [{ n: standing }] = await tx.$queryRaw<{ n: number }[]>`
            SELECT count(*)::int AS n FROM derived_food_category_edges`;
          if (standing > 0) {
            this.opsAlerts.emit({
              severity: 'critical',
              kind: 'derived_rebuild_refused_empty_input',
              title: 'Food-category edge rebuild REFUSED: empty input facet',
              body:
                `knowledge_categories is empty on every active dish but ` +
                `${standing} standing edges exist — the synthesis backfill ` +
                `has not run (or regressed). Refusing the full replace so ` +
                `the standing edges keep serving search. Run dish-knowledge ` +
                `synthesis, then this rebuild.`,
              dedupeKey: `category_edge_rebuild_refused:${new Date().toISOString().slice(0, 10)}`,
            });
            return standing;
          }
        }
        await tx.$executeRawUnsafe(itemCategoryEdgeDeleteSql(null));
        return tx.$executeRawUnsafe(itemCategoryEdgeInsertSql(null));
      },
      // Explicit budget — the "default 5s killed large rebuilds
      // permanently-but-silently" class; every full-replace rebuild in this
      // codebase carries one.
      { timeout: 15 * 60 * 1000, maxWait: 30_000 },
    );
    this.logger.info('Food-category edges rebuilt', {
      edges,
      ms: Date.now() - start,
    });
    return { edges };
  }

  protected async rebuild(): Promise<{ input: number; output: number }> {
    const { edges } = await this.rebuildAll();
    // INPUT is the population the edges are derived FROM (D4): active dishes
    // whose knowledge_categories facet is non-empty AND that still have a
    // live connection. Zero edges from zero such dishes is a corpus whose
    // knowledge backfill has not run yet (or an empty corpus), not a defect
    // — the base class only screams when real input produced nothing.
    const [dishes] = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM core_entities e
      WHERE e.type = 'item'::entity_type
        AND e.status = 'active'::entity_status
        AND cardinality(e.knowledge_categories) > 0
        AND EXISTS (
          SELECT 1 FROM core_restaurant_items c
          WHERE c.food_id = e.entity_id AND c.mention_count > 0
        )`;
    return { input: dishes?.n ?? 0, output: edges };
  }

  // 4:30am — between the name-containment rebuild (4am) and the rest, so the
  // nightly derived rebuilds stagger their load rather than stacking.
  @Cron('30 4 * * *')
  async nightly(): Promise<void> {
    await this.runGuarded();
  }
}
