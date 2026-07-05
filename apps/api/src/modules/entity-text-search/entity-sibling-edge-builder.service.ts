import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

// Neighbors fetched per anchor for rank math. Deeper than the persisted set so
// mutual ranks resolve with headroom (runtime R is clamped ≤ FETCH_N): an anchor
// outside a neighbor's top-FETCH_N stores mutual_rank NULL, which fails any R cut.
const FETCH_N = 60;
// Neighbors persisted per anchor — the SUPERSET the runtime K/R/floor cut reads
// from (retune via env, no rebuild). Runtime forward-K is clamped ≤ PERSIST_N.
const PERSIST_N = 30;
// Below this cosine a "neighbor" is unrelated for every dish we probed
// (pho's tail at 0.74 is water/latte/froyo); don't even persist it.
const PERSIST_COSINE_FLOOR = 0.7;
const INSERT_CHUNK = 1000;

interface AnchorRow {
  entity_id: string;
  emb: string;
}

interface NeighborRow {
  entityId: string;
  cosine: number;
}

/**
 * Builds `derived_entity_sibling_edges`: for every active food entity with an
 * embedding, its nearest dense neighbors (DOC↔DOC over `name_embedding`) with
 * forward rank AND mutual rank — the anchor's rank inside the NEIGHBOR's own
 * neighborhood. Mutual rank is the co-inclusion discriminator (junk that
 * interleaves by cosine separates cleanly by reciprocity: ramen→pasta cos .82
 * but mutual 54; the parm family reciprocates at 1–7), and it is why this is an
 * OFFLINE builder — reciprocity needs every neighbor's neighborhood, trivial in
 * one all-anchors pass, unpayable per search.
 *
 * Full-replace rebuild in ONE transaction (readers see old-or-new atomically),
 * deterministic from the vectors, hence idempotent. ~1.7k foods → ~50k edges in
 * seconds today; the incremental path at 50k-food scale is a stale-flag
 * piggyback on EntityEmbeddingReconcilerService (not built — YAGNI at this size).
 *
 * Each per-anchor neighbor query passes the anchor vector as a PLAN-TIME LITERAL
 * — a joined/CTE vector defeats the HNSW index (per-row distance → seq scan).
 */
@Injectable()
export class EntitySiblingEdgeBuilderService {
  private readonly logger: LoggerService;
  private rebuildInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('EntitySiblingEdgeBuilderService');
  }

  async rebuildAll(): Promise<{ anchors: number; edges: number }> {
    const started = Date.now();
    const anchors = await this.prisma.$queryRaw<AnchorRow[]>(Prisma.sql`
      SELECT entity_id, name_embedding::text AS emb
      FROM core_entities
      WHERE type = 'food'::entity_type
        AND status = 'active'::entity_status
        AND name_embedding IS NOT NULL
      ORDER BY entity_id
    `);

    // Pass 1: every anchor's ordered top-FETCH_N neighborhood.
    //
    // ef_search matters: pgvector HNSW defaults to 40 candidates, and the index
    // spans ALL entity types — the `type='food'` filter is applied AFTER the
    // candidate scan, so a default-ef LIMIT-60 query silently returns ~20 food
    // rows (proven: pho's neighborhood truncated at 20, mutual ranks went NULL).
    // SET LOCAL inside a transaction pins the setting to these statements only;
    // 400 candidates ≫ FETCH_N even after the ~55% cross-type filter loss.
    const neighborhoods = new Map<string, NeighborRow[]>();
    for (const anchor of anchors) {
      const [, rows] = await this.prisma.$transaction([
        this.prisma.$executeRawUnsafe(`SET LOCAL hnsw.ef_search = 400`),
        this.prisma.$queryRaw<{ entityId: string; cosine: number }[]>(
          Prisma.sql`
            SELECT e.entity_id AS "entityId",
                   1 - (e.name_embedding <=> ${anchor.emb}::vector) AS cosine
            FROM core_entities e
            WHERE e.type = 'food'::entity_type
              AND e.status = 'active'::entity_status
              AND e.name_embedding IS NOT NULL
              AND e.entity_id <> ${anchor.entity_id}::uuid
            ORDER BY e.name_embedding <=> ${anchor.emb}::vector
            LIMIT ${FETCH_N}
          `,
        ),
      ]);
      neighborhoods.set(
        anchor.entity_id,
        rows.map((r) => ({ entityId: r.entityId, cosine: Number(r.cosine) })),
      );
    }

    // Pass 2: invert ranks in memory — mutualRank(a→b) = index of a in b's list.
    const rankOf = new Map<string, Map<string, number>>();
    for (const [ownerId, list] of neighborhoods) {
      const m = new Map<string, number>();
      list.forEach((n, i) => m.set(n.entityId, i + 1));
      rankOf.set(ownerId, m);
    }

    // Pass 3: assemble the persisted superset.
    const values: Prisma.Sql[] = [];
    for (const [anchorId, list] of neighborhoods) {
      const cap = Math.min(PERSIST_N, list.length);
      for (let i = 0; i < cap; i++) {
        const n = list[i];
        if (n.cosine < PERSIST_COSINE_FLOOR) break; // list is cosine-descending
        const mutual = rankOf.get(n.entityId)?.get(anchorId) ?? null;
        values.push(
          Prisma.sql`(${anchorId}::uuid, ${n.entityId}::uuid, ${n.cosine}, ${i + 1}, ${mutual})`,
        );
      }
    }

    // Pass 4: atomic full replace.
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM derived_entity_sibling_edges`);
      for (let i = 0; i < values.length; i += INSERT_CHUNK) {
        const chunk = values.slice(i, i + INSERT_CHUNK);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO derived_entity_sibling_edges
            (anchor_entity_id, sibling_entity_id, cosine, forward_rank, mutual_rank)
          VALUES ${Prisma.join(chunk)}
        `);
      }
    });

    const result = { anchors: anchors.length, edges: values.length };
    this.logger.info('Sibling edge rebuild complete', {
      ...result,
      ms: Date.now() - started,
    });
    return result;
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async scheduledRebuild(): Promise<void> {
    if (process.env.ENTITY_SIBLING_EDGES_REBUILD_ENABLED === 'false') {
      return;
    }
    if (this.rebuildInFlight) {
      this.logger.warn('Sibling edge rebuild already running; skipping tick');
      return;
    }
    this.rebuildInFlight = true;
    try {
      await this.rebuildAll();
    } catch (error) {
      this.logger.error('Sibling edge rebuild failed', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    } finally {
      this.rebuildInFlight = false;
    }
  }
}
