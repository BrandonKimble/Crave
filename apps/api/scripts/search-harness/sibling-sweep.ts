import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { bootstrap, out } from './_shared';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * sibling-sweep.ts — owner-eyeball + invariant gate for the dense sibling edges
 * (`derived_entity_sibling_edges`, built by EntitySiblingEdgeBuilderService).
 *
 * (a) SWEEP: for a fixed anchor set, prints KEPT and KILLED(reason) under the
 *     production cut `cos ≥ floor ∧ forward_rank ≤ K ∧ mutual_rank ≤ R`, across a
 *     K/R grid — reads the SAME table + predicate shape the runtime uses, so what
 *     you see here is what production selects.
 * (b) INVARIANTS: no self-edges; anchors+siblings all active foods; forward_rank
 *     dense+unique per anchor; mutual-rank spot-recompute against a live HNSW
 *     query for 20 random edges (proves the builder's rank inversion).
 *
 *   yarn workspace api ts-node scripts/search-harness/sibling-sweep.ts
 *   SWEEP_FULL=1 …            # print the full K/R grid (default: default cut only)
 */
const ANCHORS = [
  'ramen',
  'pho',
  'bun bo hue',
  'sushi',
  'dumpling',
  'taco',
  'chicken parm',
  'biryani',
  'poutine',
  'bibimbap',
  'birria',
  'falafel',
  'lasagna',
  'omakase',
  'croissant',
  'ceviche',
];
const DEFAULT = { k: 25, r: 20, floor: 0.75 };
const GRID_K = [15, 20, 25, 30];
const GRID_R = [10, 15, 20, 25];

interface EdgeRow {
  anchor: string;
  sibling: string;
  cosine: number;
  forward_rank: number;
  mutual_rank: number | null;
}

function verdict(
  e: EdgeRow,
  k: number,
  r: number,
  floor: number,
): string | null {
  if (e.cosine < floor) return `cos<${floor}`;
  if (e.forward_rank > k) return `fwd>${k}`;
  if (e.mutual_rank == null) return 'mutual=NULL';
  if (e.mutual_rank > r) return `mutual>${r}`;
  return null; // kept
}

async function main(): Promise<void> {
  const app = await bootstrap();
  const full = process.env.SWEEP_FULL === '1';
  try {
    const prisma = app.get(PrismaService);

    // ---------------- (a) SWEEP ----------------
    for (const name of ANCHORS) {
      const edges = await prisma.$queryRaw<EdgeRow[]>(Prisma.sql`
        SELECT a.name AS anchor, s.name AS sibling, e.cosine,
               e.forward_rank, e.mutual_rank
        FROM derived_entity_sibling_edges e
        JOIN core_entities a ON a.entity_id = e.anchor_entity_id
        JOIN core_entities s ON s.entity_id = e.sibling_entity_id
          AND s.type = 'food'::entity_type AND s.status = 'active'::entity_status
        WHERE lower(a.name) = lower(${name})
        ORDER BY e.forward_rank
      `);
      out('');
      out(
        `================ ANCHOR "${name}" (${edges.length} persisted edges) ================`,
      );
      if (!edges.length) {
        out('  (no edges — anchor missing or no embedding)');
        continue;
      }
      const { k, r, floor } = DEFAULT;
      for (const e of edges) {
        const v = verdict(e, k, r, floor);
        const mark = v === null ? 'KEEP' : `kill(${v})`;
        out(
          `  ${String(e.forward_rank).padStart(2)}  cos=${e.cosine.toFixed(4)}  mutual=${
            e.mutual_rank == null ? ' —' : String(e.mutual_rank).padStart(3)
          }  ${mark.padEnd(18)} ${e.sibling}`,
        );
      }
      if (full) {
        out(`  --- grid (kept counts) ---`);
        for (const k2 of GRID_K) {
          const row = GRID_R.map(
            (r2) =>
              `R${r2}:${edges.filter((e) => verdict(e, k2, r2, DEFAULT.floor) === null).length}`,
          ).join('  ');
          out(`    K${k2}  ${row}`);
        }
      }
    }

    // ---------------- (b) INVARIANTS ----------------
    out('');
    out('=== INVARIANTS ===');
    const [selfEdges] = await prisma.$queryRaw<{ n: bigint }[]>(
      Prisma.sql`SELECT count(*) AS n FROM derived_entity_sibling_edges WHERE anchor_entity_id = sibling_entity_id`,
    );
    out(`  self-edges: ${selfEdges.n} (want 0)`);

    const [badType] = await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      SELECT count(*) AS n FROM derived_entity_sibling_edges e
      JOIN core_entities x ON x.entity_id IN (e.anchor_entity_id, e.sibling_entity_id)
      WHERE x.type <> 'food'::entity_type
    `);
    out(`  non-food endpoints: ${badType.n} (want 0)`);

    const [dupRanks] = await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      SELECT count(*) AS n FROM (
        SELECT anchor_entity_id, forward_rank
        FROM derived_entity_sibling_edges
        GROUP BY anchor_entity_id, forward_rank HAVING count(*) > 1
      ) d
    `);
    out(`  duplicate forward_ranks per anchor: ${dupRanks.n} (want 0)`);

    // Mutual-rank spot recompute: 20 random edges with non-null mutual_rank —
    // recompute the anchor's rank in the sibling's live neighborhood via HNSW.
    const sample = await prisma.$queryRaw<
      {
        anchor_entity_id: string;
        sibling_entity_id: string;
        mutual_rank: number;
        emb: string;
      }[]
    >(Prisma.sql`
      SELECT e.anchor_entity_id, e.sibling_entity_id, e.mutual_rank,
             s.name_embedding::text AS emb
      FROM derived_entity_sibling_edges e
      JOIN core_entities s ON s.entity_id = e.sibling_entity_id
      WHERE e.mutual_rank IS NOT NULL AND s.name_embedding IS NOT NULL
      ORDER BY e.anchor_entity_id
      LIMIT 20
    `);
    let mismatches = 0;
    for (const row of sample) {
      // Same ef_search as the builder — the HNSW candidate pool must match or
      // the recompute measures a different (truncated) neighborhood.
      const [, neighbors] = await prisma.$transaction([
        prisma.$executeRawUnsafe(`SET LOCAL hnsw.ef_search = 400`),
        prisma.$queryRaw<{ entityId: string }[]>(Prisma.sql`
          SELECT e.entity_id AS "entityId"
          FROM core_entities e
          WHERE e.type = 'food'::entity_type
            AND e.status = 'active'::entity_status
            AND e.name_embedding IS NOT NULL
            AND e.entity_id <> ${row.sibling_entity_id}::uuid
          ORDER BY e.name_embedding <=> ${row.emb}::vector
          LIMIT 60
        `),
      ]);
      const liveRank =
        neighbors.findIndex((n) => n.entityId === row.anchor_entity_id) + 1;
      if (liveRank !== row.mutual_rank) {
        mismatches++;
        out(
          `  mutual-rank MISMATCH: stored=${row.mutual_rank} live=${liveRank || 'absent'}`,
        );
      }
    }
    out(
      `  mutual-rank spot recompute: ${mismatches} mismatches / ${sample.length} (want 0)`,
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
