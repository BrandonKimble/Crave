import { pricedGeminiRow } from '../../src/modules/external-integrations/shared/gemini-pricing';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * THE cost report (archive-load audit §9): standalone, rerunnable, and
 * subreddit-scoped — never again lost to a killed wrapper process, and never
 * again attributing discovery by wall clock (wall-clock createdAt deltas mix
 * every subreddit loaded in the window and produced a false "no saturation"
 * reading during the stage-2 load; post-sequence attribution is the truth).
 *
 * Used by scripts/cost-report.ts (CLI) and scripts/seed-archive.ts (end of a
 * seeding run).
 */

/** Official per-request rates (Cloud Billing catalog, verified 2026-07-08),
 *  post-free-tier. Free monthly tiers (1k enterprise/atmosphere, 5k pro, 10k
 *  essentials & autocomplete) make real bills LOWER than this report. */
export const PLACES_RATES: Record<string, number> = {
  'placeDetails:enterprise_atmosphere': 0.025,
  'placeDetails:enterprise': 0.02,
  'placeDetails:pro': 0.017,
  'placeDetails:essentials': 0.005,
  'textSearch:enterprise_atmosphere': 0.04,
  'textSearch:enterprise': 0.035,
  'textSearch:pro': 0.032,
  'autocomplete:essentials': 0.0028,
};

export interface CostReportOptions {
  prisma: PrismaService;
  out: (line: string) => void;
  /** Ledger window start. */
  since: Date;
  /** Community name (e.g. 'austinfood'): adds POST-SEQUENCE discovery
   *  attribution for that subreddit. Omit for spend-only. */
  subreddit?: string;
}

export async function printCostReport(opts: CostReportOptions): Promise<void> {
  const { prisma, out, since, subreddit } = opts;

  // ---- Spend (ledger window, official list rates) ----
  const usage = await prisma.apiUsageEvent.groupBy({
    // durationHours is part of the GROUPING, not just a sum: cache-STORAGE
    // rows price by token-hours, and without it they fell through to the
    // cached-READ rate — 13 cents reported as 0.2 cents, the exact spend the
    // cache metering was built to expose.
    by: ['service', 'operation', 'skuTier', 'model', 'mode', 'durationHours'],
    where: { createdAt: { gte: since } },
    _sum: {
      requestCount: true,
      inputTokens: true,
      outputTokens: true,
      // CACHED TOKENS ARE THE WHOLE STORY on this corpus: content.extract
      // runs ~89% cached, so a report that ignores them overstated that line
      // by ~5x. They were not even summed before.
      cachedTokens: true,
    },
  });
  let placesUsd = 0;
  let geminiUsd = 0;
  out(`\n=== COST REPORT (ledger since ${since.toISOString()}) ===`);
  for (const row of usage) {
    const requests = row._sum.requestCount ?? 0;
    if (row.service === 'google_places') {
      const rate = PLACES_RATES[`${row.operation}:${row.skuTier}`] ?? 0;
      const usd = requests * rate;
      placesUsd += usd;
      out(
        `  places ${row.operation}/${row.skuTier}: ${requests} req -> $${usd.toFixed(2)}`,
      );
    } else if (row.service === 'gemini') {
      // ONE rate table for the whole codebase (gemini-pricing.ts). This
      // script used to keep its own {in,out} copy with NO cached rate, which
      // had already drifted (it never learned gemini-3.1-flash-lite) and
      // could only ever print a ceiling. Same lesson as the thinking
      // resolver: a second source of truth is a bug with a delay fuse.
      const usd =
        pricedGeminiRow({
          model: row.model,
          mode: row.mode,
          inputTokens: row._sum.inputTokens,
          outputTokens: row._sum.outputTokens,
          cachedTokens: row._sum.cachedTokens,
          durationHours: row.durationHours,
        }) / 1_000_000;
      geminiUsd += usd;
      out(
        `  gemini ${row.model}/${row.mode}: ${requests} req, ${row._sum.inputTokens ?? 0} in (${row._sum.cachedTokens ?? 0} cached) / ${row._sum.outputTokens ?? 0} out -> $${usd.toFixed(2)}`,
      );
    }
  }
  out(
    `  TOTAL: places $${placesUsd.toFixed(2)} + gemini $${geminiUsd.toFixed(2)} = $${(placesUsd + geminiUsd).toFixed(2)} (list rates, cached reads priced at the cached rate)`,
  );

  if (!subreddit) return;

  // ---- Discovery, POST-SEQUENCE attributed ----
  // Every source document resolves to its thread-root post (recursive parent
  // walk — comments can nest); a restaurant's discovery position is the
  // sequence number of the FIRST post whose thread first mentioned it.
  const buckets = (await prisma.$queryRawUnsafe(
    `
    WITH RECURSIVE posts AS (
      SELECT document_id, source_id,
             row_number() OVER (ORDER BY source_created_at) AS seq
      FROM collection_source_documents
      WHERE community = $1 AND source_type = 'post'
    ),
    chain AS (
      SELECT d.document_id,
             CASE WHEN d.source_type = 'post' THEN d.source_id
                  WHEN d.parent_source_id LIKE 't3\\_%' THEN d.parent_source_id
                  ELSE NULL END AS root_id,
             d.parent_source_id AS cursor,
             0 AS depth
      FROM collection_source_documents d
      WHERE d.community = $1
      UNION ALL
      SELECT c.document_id,
             CASE WHEN p.parent_source_id LIKE 't3\\_%' THEN p.parent_source_id
                  ELSE NULL END,
             p.parent_source_id,
             c.depth + 1
      FROM chain c
      JOIN collection_source_documents p
        ON p.source_id = c.cursor AND p.community = $1
      WHERE c.root_id IS NULL AND c.depth < 60
    ),
    doc_seq AS (
      SELECT c.document_id, p.seq
      FROM chain c
      JOIN posts p ON p.source_id = c.root_id
      WHERE c.root_id IS NOT NULL
    ),
    first_seen AS (
      SELECT e.restaurant_id, MIN(ds.seq) AS first_seq
      FROM core_restaurant_entity_events e
      JOIN doc_seq ds ON ds.document_id = e.source_document_id
      WHERE EXISTS (
        SELECT 1 FROM core_restaurant_locations l
        WHERE l.restaurant_id = e.restaurant_id
          AND l.google_place_id IS NOT NULL
      )
      GROUP BY e.restaurant_id
    )
    SELECT ((first_seq - 1) / 100)::int AS bucket, COUNT(*)::int AS discovered
    FROM first_seen
    GROUP BY 1
    ORDER BY 1
    `,
    subreddit,
  )) satisfies unknown as { bucket: number; discovered: number }[];

  const totalPosts = (await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS n FROM collection_source_documents WHERE community = $1 AND source_type = 'post'`,
    subreddit,
  )) satisfies unknown as { n: number }[];

  out(`\n=== DISCOVERY (r/${subreddit}, post-sequence attributed) ===`);
  out(`  posts loaded: ${totalPosts[0]?.n ?? 0}`);
  let cumulative = 0;
  for (const b of buckets) {
    cumulative += b.discovered;
    out(
      `  posts ${b.bucket * 100 + 1}-${(b.bucket + 1) * 100}: +${b.discovered} place-backed restaurants (cumulative ${cumulative})`,
    );
  }
  const last = buckets[buckets.length - 1];
  const first = buckets[0];
  if (first && last && buckets.length > 2) {
    out(
      `  saturation: ${first.discovered}/100 posts early -> ${last.discovered}/100 posts latest`,
    );
  }
}
