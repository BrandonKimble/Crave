import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
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
  aliases: string[];
}

function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

/**
 * Keeps `core_entities.name_embedding` (the dense recall lane) current. It is the
 * SINGLE writer of that column — both the scheduled sweep below and the manual
 * `scripts/backfill-entity-embeddings.ts` call `reconcilePending`.
 *
 * Two gaps it closes, both OUTSIDE the ingestion transaction (an embed is an
 * external API call and must never block a write):
 *  - CREATE: new entities are born with a NULL vector (creation writes no
 *    embedding) — caught by `name_embedding IS NULL`.
 *  - RENAME / alias change: leaves a NON-null vector reflecting the OLD doc —
 *    the mutation paths flag `name_embedding_stale = true` in their own tx, and
 *    this sweep re-embeds and clears the flag.
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
  }

  /**
   * Embed every active searchable entity whose vector is missing or stale, then
   * clear the stale flag. `reembedAll` re-embeds all active searchable entities
   * (use after the entity-doc format changes). `maxRows` caps a single invocation.
   */
  async reconcilePending(
    opts: { reembedAll?: boolean; maxRows?: number } = {},
  ): Promise<{ embedded: number; remaining: number }> {
    const { reembedAll = false, maxRows } = opts;
    const limitClause =
      typeof maxRows === 'number' && maxRows > 0
        ? `LIMIT ${Math.floor(maxRows)}`
        : '';

    const rows = await this.prisma.$queryRawUnsafe<EntityEmbedRow[]>(
      `SELECT entity_id, name, type, aliases FROM core_entities
       WHERE type IN ('restaurant','food','food_attribute','restaurant_attribute','ingredient')
         AND status = 'active'
         ${reembedAll ? '' : 'AND (name_embedding IS NULL OR name_embedding_stale = true)'}
       ORDER BY entity_id
       ${limitClause}`,
    );

    let embedded = 0;
    for (let i = 0; i < rows.length; i += EMBED_BATCH) {
      const batch = rows.slice(i, i + EMBED_BATCH);
      const vectors = await this.embedWithRetry(
        batch.map((r) => buildEntityDoc(r.name, r.aliases)),
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

    const [{ n }] = await this.prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM core_entities
       WHERE type IN ('restaurant','food','food_attribute','restaurant_attribute','ingredient')
         AND status = 'active'
         AND (name_embedding IS NULL OR name_embedding_stale = true)`,
    );
    return { embedded, remaining: Number(n) };
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledReconcile(): Promise<void> {
    if (process.env.ENTITY_EMBEDDING_RECONCILE_ENABLED === 'false') {
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
