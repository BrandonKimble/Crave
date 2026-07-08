import 'dotenv/config';
process.env.PROCESS_ROLE = 'all';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import type { Queue } from 'bull';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GeminiBatchService } from '../src/modules/external-integrations/llm/gemini-batch.service';
import type {
  ArchiveCollectionJobData,
  ArchiveCollectionJobResult,
} from '../src/modules/content-processing/reddit-collector/archive/archive-collection.worker';

/**
 * THE archive seeding command (supersedes test-pipeline.ts, which truncated
 * paid-for data — this loader NEVER deletes anything; see
 * plans/collection-freeze-audit.md "never truncate" table).
 *
 * One command, identical everywhere: the ONLY difference between a local dev
 * seed and a LIVE PRODUCTION load is which DATABASE_URL this process points
 * at. The deployed app just sees new rows — no deploy, no restart.
 *
 *   yarn ts-node scripts/seed-market.ts \
 *     --subreddit austinfood [--subreddit foodnyc ...] \
 *     [--window-years 3] [--max-posts 1000] [--batch-size 250]
 *
 * Prereq per subreddit: onboard-market.ts already ran (market + community
 * exist) — this script verifies and refuses otherwise.
 *
 * Everything is INCREMENTAL and idempotent: source docs dedupe by id,
 * relevance verdicts are cached, enriched restaurants are skip-guarded, and
 * re-runs only pay for genuinely new LLM work. Staged loads (e.g.
 * --max-posts 250, then 1000, then full) waste nothing.
 *
 * Ends with a COST REPORT: entity/restaurant deltas + api_usage_ledger spend
 * for the run window priced at official rates (Cloud Billing catalog,
 * 2026-07-08) — including the projected per-restaurant rate.
 */

interface Options {
  subreddits: string[];
  windowYears?: number;
  maxPosts?: number;
  batchSize?: number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { subreddits: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${token} needs a value`);
      return value;
    };
    if (token === '--subreddit') options.subreddits.push(next().toLowerCase());
    else if (token === '--window-years') options.windowYears = Number(next());
    else if (token === '--max-posts') options.maxPosts = Number(next());
    else if (token === '--batch-size') options.batchSize = Number(next());
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!options.subreddits.length) {
    throw new Error('At least one --subreddit is required');
  }
  return options;
}

/** Official per-request rates (Cloud Billing catalog, 2026-07-08), post-free-
 *  tier. Free monthly tiers (1k enterprise/atmosphere, 5k pro, 10k essentials
 *  & autocomplete) make real bills LOWER than this report. */
const PLACES_RATES: Record<string, number> = {
  'placeDetails:enterprise_atmosphere': 0.025,
  'placeDetails:enterprise': 0.02,
  'placeDetails:pro': 0.017,
  'placeDetails:essentials': 0.005,
  'textSearch:enterprise_atmosphere': 0.04,
  'textSearch:enterprise': 0.035,
  'textSearch:pro': 0.032,
  'autocomplete:essentials': 0.0028,
};
/** Public Gemini rates per 1M tokens (approximate; batch = half). */
const GEMINI_RATES: Record<string, { in: number; out: number }> = {
  'gemini-3.5-flash': { in: 0.3, out: 2.5 },
  'gemini-3-flash-preview': { in: 0.3, out: 2.5 },
  'gemini-3.1-flash-lite-preview': { in: 0.1, out: 0.4 },
  'gemini-embedding-001': { in: 0.15, out: 0 },
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const out = (m: string) => process.stdout.write(`${m}\n`);
  try {
    const prisma = app.get(PrismaService);
    const queue = app.get<Queue<ArchiveCollectionJobData>>(
      getQueueToken('archive-collection'),
    );

    // Prereq check: every subreddit must be onboarded (never silently create).
    for (const subreddit of options.subreddits) {
      const community = await prisma.collectionCommunity.findUnique({
        where: { communityName: subreddit },
        select: { marketKey: true, isActive: true },
      });
      if (!community) {
        throw new Error(
          `r/${subreddit} is not onboarded — run scripts/onboard-market.ts first`,
        );
      }
      out(`r/${subreddit} -> ${community.marketKey}`);
    }

    const startedAt = new Date();
    const baseline = {
      entities: await prisma.entity.count({ where: { status: 'active' } }),
      restaurants: await prisma.restaurantLocation.count({
        where: { googlePlaceId: { not: null } },
      }),
    };

    for (const subreddit of options.subreddits) {
      out(`\n=== seeding r/${subreddit} ===`);
      const job = await queue.add('execute-archive-collection', {
        jobId: `seed-${subreddit}-${Date.now()}`,
        subreddit,
        triggeredBy: 'manual',
        options: {
          batchSize: options.batchSize,
          maxPosts: options.maxPosts,
          windowYears: options.windowYears,
        },
      });
      const result = (await job.finished()) as ArchiveCollectionJobResult;
      out(
        `  batches enqueued: ${result.batchesEnqueued}; waiting for batch queue to drain...`,
      );
      const batchQueue = app.get<Queue>(
        getQueueToken('archive-batch-processing-queue'),
      );
      for (;;) {
        const counts = await batchQueue.getJobCounts();
        if (counts.waiting + counts.active + counts.delayed === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      out('  batch queue drained.');
    }

    // Batch-mode LLM work sits at Google until polled. In a deployed app the
    // 5-min cron owns this; a seeding run owns it itself so the command is
    // complete when it exits (and the cost report is final).
    const geminiBatch = app.get(GeminiBatchService);
    for (;;) {
      const openBatchJobs = await prisma.llmBatchJob.count({
        where: { status: { in: ['pending', 'submitted', 'ingesting'] } },
      });
      if (openBatchJobs === 0) break;
      out(`  waiting on ${openBatchJobs} Gemini batch job(s)...`);
      await new Promise((resolve) => setTimeout(resolve, 60000));
      await geminiBatch.poll();
    }

    // ---- COST REPORT (run window, official rates) ----
    const usage = await prisma.apiUsageEvent.groupBy({
      by: ['service', 'operation', 'skuTier', 'model', 'mode'],
      where: { createdAt: { gte: startedAt } },
      _sum: { requestCount: true, inputTokens: true, outputTokens: true },
    });
    let placesUsd = 0;
    let geminiUsd = 0;
    out('\n=== COST REPORT (this run) ===');
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
        const rates = GEMINI_RATES[row.model ?? ''] ?? { in: 0.3, out: 2.5 };
        const discount = row.mode === 'batch' ? 0.5 : 1;
        const usd =
          (((row._sum.inputTokens ?? 0) / 1e6) * rates.in +
            ((row._sum.outputTokens ?? 0) / 1e6) * rates.out) *
          discount;
        geminiUsd += usd;
        out(
          `  gemini ${row.model}/${row.mode}: ${requests} req, ${row._sum.inputTokens ?? 0} in / ${row._sum.outputTokens ?? 0} out -> $${usd.toFixed(2)}`,
        );
      }
    }
    const after = {
      entities: await prisma.entity.count({ where: { status: 'active' } }),
      restaurants: await prisma.restaurantLocation.count({
        where: { googlePlaceId: { not: null } },
      }),
    };
    const newRestaurants = after.restaurants - baseline.restaurants;
    out(
      `\nentities +${after.entities - baseline.entities}; place-backed restaurants +${newRestaurants}`,
    );
    out(
      `TOTAL: places $${placesUsd.toFixed(2)} + gemini $${geminiUsd.toFixed(2)} = $${(placesUsd + geminiUsd).toFixed(2)}` +
        (newRestaurants > 0
          ? ` (places $${(placesUsd / newRestaurants).toFixed(3)}/new restaurant)`
          : ''),
    );
    out(
      'Free monthly SKU tiers are NOT subtracted above — real bills are lower.',
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
