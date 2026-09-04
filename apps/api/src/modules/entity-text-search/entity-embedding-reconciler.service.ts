import { isEnvFlagExplicitlyDisabled } from '../../shared/config/env-flag';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { recallScope } from '../../shared/locale/surface-scope';
import { LoggerService } from '../../shared';
import { isSchedulerRuntime } from '../../shared/utils/process-role';
import { OpsAlertsService } from '../external-integrations/shared/ops-alerts.service';
import { EmbeddingService } from '../external-integrations/llm/embedding.service';
import { buildEntityDoc } from './entity-doc';

const EMBED_BATCH = 100;
// One scheduled tick embeds at most this many rows so a mass-stale event (e.g. a
// bulk rename) can't run unbounded; the next tick continues the remainder.
const SCHEDULED_MAX_ROWS = 2000;

interface EntityEmbedRow {
  entity_id: string;
  name: string;
  type: EntityType;
  /** The entity's surface forms for the doc — see the SELECT below. */
  surfaces: string[] | null;
}

function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

/**
 * Keeps `core_entities.name_embedding` (the dense recall lane) current. It is the
 * SINGLE writer of that column: every writer's post-commit `embedEntities`,
 * the scheduled repair sweep below, and the manual
 * `scripts/backfill-entity-embeddings.ts` all land here.
 *
 * THE LAW IS WRITE-TIME (recall-scope rederivation, 2026-09-04): an entity
 * is embedded by the WRITER that created or renamed it, immediately after
 * its transaction commits and before the batch that created it reports
 * done — never inside the transaction (an embed is an external call), and
 * never left to a cron. The 5-minute sweep used to be the ONLY path, and it
 * does not run where crons are off: on staging every one of 1,375
 * rehearsal places and 794 rehearsal items had a NULL vector, 3,699 of
 * 8,448 active places were stale, and the judge's dense lane was blind to
 * all of them. Worse, the sweep embedded `status = 'active'` only, so a
 * shadow run's own mints could never be recalled by it even with crons on.
 *
 * The sweep remains as a REPAIR backstop (a crash between commit and
 * embed) and now covers every recallable status: active, pending, and
 * rehearsal — the exact set the adoption-scoped recall reads.
 *
 * Two markers name the work, both set by the writers in their own tx:
 *  - CREATE: a new row is born with a NULL vector — `name_embedding IS NULL`.
 *  - RENAME / surface change: a NON-null vector reflecting the OLD doc —
 *    `name_embedding_stale = true`.
 *
 * Idempotent: the vector is deterministic for a fixed doc + model, so re-embedding
 * is harmless — no doc-hash/skip bookkeeping needed (an embed costs ~1 microdollar).
 */
@Injectable()
export class EntityEmbeddingReconcilerService
  implements OnApplicationBootstrap
{
  private readonly logger: LoggerService;
  private reconcileInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
    private readonly opsAlerts: OpsAlertsService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('EntityEmbeddingReconcilerService');
  }

  /**
   * Self-heal the HNSW ANN index on `name_embedding` at boot. Prisma cannot model
   * an HNSW index in schema.prisma, so any `prisma migrate dev` diffs it as drift
   * and generates a DROP (exactly how it silently vanished once — see migration
   * 20260705003434). `CREATE INDEX IF NOT EXISTS` is a fast no-op when the index
   * exists; when it was dropped, this rebuilds it (~seconds at current scale) so
   * every dense query stays index-backed. A migration-scan spec is the second
   * guard (fails CI if a migration's net effect drops the index).
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "idx_entities_name_embedding_hnsw"
         ON "core_entities" USING hnsw ("name_embedding" vector_cosine_ops)`,
      );
    } catch (error) {
      this.logger.error('Failed to ensure name_embedding HNSW index', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    }
    await this.alarmIfBacklogAndCronsOff();
  }

  /**
   * THE KILL-SWITCH IS HONEST (2026-08-31 cron audit, same law as
   * derived-index-job.ts:110-127).
   *
   * This sweep genuinely SPENDS — every repair is a paid embedding call — so
   * it stays gated: with crons off it must not run, and that is correct.
   * What is NOT correct is silence. derived-index-job.ts explicitly names
   * this service as the acknowledged non-member of the derived-index law, so
   * it is the one repair job that is both unalarmed and uncovered: entities
   * born with a NULL vector or flagged stale by a rename simply drop out of
   * the dense recall lane, and the reader fails open, so nobody hears about
   * it. Repair is forbidden when the gate is off; VISIBILITY IS NOT.
   */
  private async alarmIfBacklogAndCronsOff(): Promise<void> {
    if (
      isEnvFlagExplicitlyDisabled(
        process.env.ENTITY_EMBEDDING_RECONCILE_ENABLED,
      )
    ) {
      return;
    }
    if (isSchedulerRuntime()) return;
    try {
      const [{ n }] = await this.prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM core_entities
         WHERE type IN ('place','item','item_attribute','place_attribute','ingredient')
           AND status IN ('active','pending','rehearsal')
           AND (name_embedding IS NULL OR name_embedding_stale = true)`,
      );
      const pending = Number(n);
      if (pending === 0) return;
      this.logger.warn(
        'Entity embeddings are stale/missing but crons are disabled — no repair',
        { pending },
      );
      this.opsAlerts.emit({
        severity: 'critical',
        kind: 'entity-embedding-backlog-uncollected',
        title: `${pending} entities have a missing or stale name_embedding and crons are OFF`,
        body: [
          `${pending} active searchable entities have no usable dense vector, and this process has crons disabled (CRONS_ENABLED / PROCESS_ROLE), so the reconciler did NOT run and will not.`,
          'Those entities are absent from the dense recall lane. The reader fails open, so searches simply return less and nothing else will report this.',
          'Run the reconcile deliberately (scripts/backfill-entity-embeddings.ts) or enable crons on a runtime that may spend on embeddings.',
        ].join('\n\n'),
        dedupeKey: 'entity-embedding-backlog-uncollected',
      });
    } catch (error) {
      this.logger.error('Entity embedding backlog check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * WRITE-TIME EMBEDDING — the writer's half of the law. Called by every
   * creator/renamer right after its transaction commits, with the ids it
   * touched; embeds those that are recallable (active/pending/rehearsal)
   * and missing or stale, and clears the flag. Unknown, archived, or
   * already-fresh ids are simply not work. Returns how many were embedded.
   */
  async embedEntities(entityIds: readonly string[]): Promise<number> {
    const ids = Array.from(new Set(entityIds)).filter(Boolean);
    if (!ids.length) return 0;
    const rows = await this.prisma.$queryRaw<EntityEmbedRow[]>(Prisma.sql`
      ${this.embedRowsSelect()}
       WHERE e.entity_id = ANY(${ids}::uuid[])
         AND ${EntityEmbeddingReconcilerService.recallableSql}
         AND (e.name_embedding IS NULL OR e.name_embedding_stale = true)
       ORDER BY e.entity_id`);
    return this.embedRows(rows);
  }

  /** The recallable statuses — the adoption-scoped recall's status law. */
  private static readonly recallableSql = Prisma.sql`e.type IN ('place','item','item_attribute','place_attribute','ingredient')
         AND e.status IN ('active','pending','rehearsal')`;

  /**
   * Embed every recallable entity whose vector is missing or stale, then
   * clear the stale flag — the REPAIR backstop. `reembedAll` re-embeds all
   * recallable entities (use after the entity-doc format changes).
   * `maxRows` caps a single invocation.
   */
  async reconcilePending(
    opts: { reembedAll?: boolean; maxRows?: number } = {},
  ): Promise<{ embedded: number; remaining: number }> {
    const { reembedAll = false, maxRows } = opts;
    const limitClause =
      typeof maxRows === 'number' && maxRows > 0
        ? `LIMIT ${Math.floor(maxRows)}`
        : '';

    // THE QUESTION THIS READ ASKS: "may an ENGLISH document ground through
    // this form?" — the dense doc is an English-corpus artefact, so the forms
    // that belong in it are exactly the recall slice an `en` request sees.
    // That is `recallScope('en')`, whose chain is ['en','und']: the same two
    // locales this arm used to hand-roll as `locale IN ('und','en')`, which
    // was a half-written lookup chain rather than a fifth semantics. Other
    // languages stay OUT for the reason they always did — a Spanish form in
    // an English document pulls the vector toward the wrong neighbourhood for
    // every English query — and now they stay out BY THE CHAIN.
    //
    // ADOPTING THE DOOR ALSO DROPS `display` ROWS, which this arm used to
    // keep on the grounds that similarity is not a grounding claim. The door's
    // law wins: a `display` row is either a pure label or a recall claim the
    // collision guard REFUSED, and feeding a refused claim into the vector
    // teaches the dense lane the thing the registry just rejected. Measured
    // cost on the live corpus: 1 row of 36,227, on 1 entity — there is not a
    // single `en` display row, and the `und` slice holds exactly one.
    const rows = await this.prisma.$queryRaw<EntityEmbedRow[]>(Prisma.sql`
      ${this.embedRowsSelect()}
       WHERE ${EntityEmbeddingReconcilerService.recallableSql}
         ${Prisma.raw(reembedAll ? '' : 'AND (e.name_embedding IS NULL OR e.name_embedding_stale = true)')}
       ORDER BY e.entity_id
       ${Prisma.raw(limitClause)}`);

    const embedded = await this.embedRows(rows);

    const [{ n }] = await this.prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM core_entities
       WHERE type IN ('place','item','item_attribute','place_attribute','ingredient')
         AND status IN ('active','pending','rehearsal')
         AND (name_embedding IS NULL OR name_embedding_stale = true)`,
    );
    return { embedded, remaining: Number(n) };
  }

  private embedRowsSelect(): Prisma.Sql {
    return Prisma.sql`
      SELECT e.entity_id, e.name, e.type,
              (SELECT array_agg(s.form ORDER BY s.seq)
                 FROM entity_surface s
                WHERE s.entity_id = e.entity_id
                  AND ${recallScope('en', 's')}
               ) AS surfaces
         FROM core_entities e`;
  }

  /** Embed in provider-sized batches; each batch's vectors land in one tx. */
  private async embedRows(rows: EntityEmbedRow[]): Promise<number> {
    let embedded = 0;
    for (let i = 0; i < rows.length; i += EMBED_BATCH) {
      const batch = rows.slice(i, i + EMBED_BATCH);
      const vectors = await this.embedWithRetry(
        batch.map((r) => buildEntityDoc(r.name, r.surfaces ?? [])),
      );
      await this.prisma.$transaction(
        batch.map((r, j) =>
          this.prisma.$executeRawUnsafe(
            `UPDATE core_entities
             SET name_embedding = $1::vector, name_embedding_stale = false
             WHERE entity_id = $2::uuid`,
            toVectorLiteral(vectors[j]),
            r.entity_id,
          ),
        ),
      );
      embedded += batch.length;
    }
    return embedded;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledReconcile(): Promise<void> {
    if (
      isEnvFlagExplicitlyDisabled(
        process.env.ENTITY_EMBEDDING_RECONCILE_ENABLED,
      )
    ) {
      return;
    }
    if (this.reconcileInFlight) {
      this.logger.warn(
        'Entity embedding reconcile already running; skipping tick',
      );
      return;
    }
    this.reconcileInFlight = true;
    try {
      const { embedded, remaining } = await this.reconcilePending({
        maxRows: SCHEDULED_MAX_ROWS,
      });
      if (embedded > 0 || remaining > 0) {
        this.logger.info('Entity embedding reconcile tick complete', {
          embedded,
          remaining,
        });
      }
    } catch (error) {
      this.logger.error('Entity embedding reconcile failed', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    } finally {
      this.reconcileInFlight = false;
    }
  }

  private async embedWithRetry(docs: string[]): Promise<number[][]> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.embeddings.embed(docs, 'RETRIEVAL_DOCUMENT');
      } catch (e) {
        if (attempt >= 5) throw e;
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
}
