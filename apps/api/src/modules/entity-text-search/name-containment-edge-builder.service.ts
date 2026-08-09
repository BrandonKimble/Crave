import { isEnvFlagExplicitlyDisabled } from '../../shared/config/env-flag';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { OpsAlertsService } from '../external-integrations/shared/ops-alerts.service';
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
 * Follows the derived_entity_sibling_edges idiom exactly: full replace in a
 * transaction, read-time status re-check at the consumers, cron behind the
 * explicit-disable flag under the global CRONS_ENABLED kill-switch.
 *
 * BOOT SELF-HEAL (red team 2026-08-09, found LIVE in prod): the migration
 * creates the table EMPTY and the reader fails open to [] — so a deploy
 * landing after the 04:00 cron serves up to ~24h of searches with rung-2
 * widening silently OFF ("taco" stops pulling "al pastor taco"), and the
 * satisfies judge pays extra LLM spend for the exclusions it can't see.
 * Absent derived data is not a config choice, it is un-derived derivation:
 * boot detects the empty table and rebuilds immediately. The rebuild is a
 * transactional full-replace, so two replicas racing at boot do duplicate
 * seconds of SQL, never corruption. If the rebuild yields ZERO edges while
 * active foods exist, that is the invisible-degradation mode — scream on
 * the ops channel, exactly like the open-intervals builder.
 */
@Injectable()
export class NameContainmentEdgeBuilderService implements OnModuleInit {
  private readonly logger: LoggerService;
  private cronInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly opsAlerts: OpsAlertsService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('NameContainmentEdgeBuilder');
  }

  async onModuleInit(): Promise<void> {
    if (
      isEnvFlagExplicitlyDisabled(
        process.env.NAME_CONTAINMENT_EDGE_BUILDER_ENABLED,
      )
    ) {
      return;
    }
    try {
      const [row] = await this.prisma.$queryRaw<{ empty: boolean }[]>`
        SELECT NOT EXISTS (SELECT 1 FROM derived_name_containment_edges) AS empty`;
      if (row?.empty) {
        this.logger.info(
          'Name-containment table empty at boot — self-healing rebuild',
        );
        await this.rebuildAll();
      }
    } catch (error) {
      this.logger.error(
        'Name-containment boot self-heal failed',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
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
    if (edges === 0) {
      const [foods] = await this.prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM core_entities
        WHERE type = 'food'::entity_type AND status = 'active'::entity_status`;
      if ((foods?.n ?? 0) > 0) {
        this.opsAlerts.emit({
          severity: 'critical',
          kind: 'name_containment_empty',
          title: 'Rung-2 name-containment widening is silently disabled',
          body: [
            `The containment rebuild produced ZERO edges from ${foods.n} active food(s).`,
            'The query-time reader fails open to [], so variant widening ("taco" → "al pastor taco") is OFF for every search and the satisfies judge is paying for exclusions it cannot see. Nothing else will report this.',
            "Check this job's last error, then re-run it.",
          ].join('\n\n'),
          dedupeKey: 'name_containment_empty',
        });
      }
    }
    return { edges };
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async nightly(): Promise<void> {
    if (
      isEnvFlagExplicitlyDisabled(
        process.env.NAME_CONTAINMENT_EDGE_BUILDER_ENABLED,
      )
    ) {
      return;
    }
    if (this.cronInFlight) return;
    this.cronInFlight = true;
    try {
      await this.rebuildAll();
    } catch (error) {
      this.logger.error('Name-containment rebuild failed', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      this.cronInFlight = false;
    }
  }
}
