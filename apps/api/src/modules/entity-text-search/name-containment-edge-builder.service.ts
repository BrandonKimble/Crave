import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { OpsAlertsService } from '../external-integrations/shared/ops-alerts.service';
import { DerivedIndexJob } from '../../shared/derived-index-job';
import { LoggerService } from '../../shared';

/**
 * RUNG 2 MATERIALIZED (audit KL-D). One nightly full-replace of head-final
 * name-containment edges on the FOLDED key (`identity_key` IS
 * canonicalFold(name), app-written) — the single definition of "this name
 * contains that name" for BOTH consumers:
 *
 *   - query-time widening (search-sibling-expansion) used lower(name) and an
 *     un-indexable word-boundary LIKE per search;
 *   - the satisfies judge's rung-2 exclusion used identity_key.
 *
 * Two fold semantics = the silent-divergence class: a folds-equal /
 * lowers-unequal pair (NFD spellings, ß/æ, apostrophes) was excluded by the
 * judge as "grammar decided it" yet never admitted by the query. The table
 * kills the divergence by construction and moves the O(foods²) scan to a
 * nightly job (~seconds offline) instead of O(foods × anchors) per search.
 *
 * Boot self-heal + zero-output alert come from DerivedIndexJob — this table
 * was found EMPTY IN PROD (red team 2026-08-09) with rung-2 widening
 * silently off; the law is structural now.
 */
@Injectable()
export class NameContainmentEdgeBuilderService extends DerivedIndexJob {
  protected readonly logger: LoggerService;
  protected readonly derivedTable = 'derived_name_containment_edges';
  protected readonly disableFlagEnv = 'NAME_CONTAINMENT_EDGE_BUILDER_ENABLED';
  protected readonly alert = {
    kind: 'name_containment_empty',
    title: 'Rung-2 name-containment widening is silently disabled',
    consequence:
      'Variant widening ("taco" → "al pastor taco") is OFF for every search and the satisfies judge is paying for exclusions it cannot see.',
  };

  constructor(
    prisma: PrismaService,
    opsAlerts: OpsAlertsService,
    loggerService: LoggerService,
  ) {
    super(prisma, opsAlerts);
    this.logger = loggerService.setContext('NameContainmentEdgeBuilder');
  }

  /** Full replace: every active-food pair where base's folded name appears
   *  as whole word(s) inside variant's folded name. head_final = the base is
   *  the FINAL token(s) (the variant IS-A base); otherwise it merely
   *  mentions it. Minimum 4 folded chars on the base — same floor the live
   *  scan used ("sal" must not claim "salsa verde"). */
  async rebuildAll(): Promise<{ edges: number }> {
    const start = Date.now();
    const edges = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM derived_name_containment_edges`);
      const inserted = await tx.$executeRawUnsafe(`
        INSERT INTO derived_name_containment_edges (base_id, variant_id, head_final)
        SELECT b.entity_id,
               v.entity_id,
               (v.identity_key LIKE ('%' || ' ' || b.identity_key))
        FROM core_entities b
        JOIN core_entities v
          ON v.entity_id <> b.entity_id
         AND (' ' || v.identity_key || ' ') LIKE ('%' || ' ' || b.identity_key || ' ' || '%')
        WHERE b.type = 'food'::entity_type AND b.status = 'active'::entity_status
          AND v.type = 'food'::entity_type AND v.status = 'active'::entity_status
          AND b.identity_key IS NOT NULL AND v.identity_key IS NOT NULL
          AND length(b.identity_key) >= 4
      `);
      return inserted;
    });
    this.logger.info('Name-containment edges rebuilt', {
      edges,
      ms: Date.now() - start,
    });
    return { edges };
  }

  protected async rebuild(): Promise<{ input: number; output: number }> {
    const { edges } = await this.rebuildAll();
    const [foods] = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM core_entities
      WHERE type = 'food'::entity_type AND status = 'active'::entity_status`;
    return { input: foods?.n ?? 0, output: edges };
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async nightly(): Promise<void> {
    await this.runGuarded();
  }
}
