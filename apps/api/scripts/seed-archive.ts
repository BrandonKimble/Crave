import 'dotenv/config';
process.env.PROCESS_ROLE = 'all';
// SINGLE-WRITER (audit §6): the batch lifecycle (submit/poll/ingest) is owned
// by the APP runtime's poller, never by this script — during the stage-2 load
// three processes with different code versions raced the same claims. This
// script is an enqueue-and-OBSERVE wrapper: it waits on job counts and prints
// the report. Ensure the API (dev server or deployed app) is running.
process.env.LLM_BATCH_POLL_ENABLED = 'false';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import type { Queue } from 'bull';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { printCostReport } from './lib/cost-report';
import type {
  ArchiveCollectionJobData,
  ArchiveCollectionJobResult,
} from '../src/modules/content-processing/reddit-collector/archive/archive-collection.worker';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

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

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const logDir = path.join(__dirname, '..', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(
    logDir,
    `seed-market-${new Date().toISOString().replace(/[:.]/g, '-')}.log`,
  );
  // Tee to a logfile so a killed wrapper/pipe can never eat the report
  // (audit §9 — it happened).
  const out = (m: string) => {
    process.stdout.write(`${m}\n`);
    fs.appendFileSync(logFile, `${m}\n`);
  };
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

    // Batch-mode LLM work sits at Google until the APP runtime's 5-min poll
    // cron moves it (single-writer, audit §6) — this script only OBSERVES.
    // Lease-based claims mean a dead worker's job self-releases; if counts
    // stop moving for a long time, check that the API process is running.
    for (;;) {
      const openBatchJobs = await prisma.llmBatchJob.count({
        where: {
          status: {
            in: [
              'persisting',
              'pending',
              'submitting',
              'submitted',
              'succeeded',
              'ingesting',
            ],
          },
        },
      });
      if (openBatchJobs === 0) break;
      out(
        `  waiting on ${openBatchJobs} Gemini batch job(s) (lifecycle owned by the app runtime — ensure the API is running)...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 60000));
    }

    // ---- COST REPORT (shared, rerunnable, post-sequence attributed) ----
    // Also re-runnable any time after the fact:
    //   yarn ts-node scripts/cost-report.ts --since <ISO> --market <subreddit>
    for (const subreddit of options.subreddits) {
      await printCostReport({
        prisma,
        out,
        since: startedAt,
        market: subreddit,
      });
    }
    const after = {
      entities: await prisma.entity.count({ where: { status: 'active' } }),
      restaurants: await prisma.restaurantLocation.count({
        where: { googlePlaceId: { not: null } },
      }),
    };
    out(
      `\nentities +${after.entities - baseline.entities}; place-backed locations +${after.restaurants - baseline.restaurants} (wall-clock, ALL markets — the per-market truth is the post-sequence section above)`,
    );
    out(`report also written to ${logFile}`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
