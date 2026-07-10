import 'dotenv/config';
process.env.PROCESS_ROLE = 'all';
// Report-only process: it must never compete for the batch lifecycle
// (single-writer, audit §6).
process.env.LLM_BATCH_POLL_ENABLED = 'false';
process.env.COLLECTION_JOBS_ENABLED = 'false';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { printCostReport } from './lib/cost-report';

/**
 * Standalone, rerunnable cost + discovery report (archive-load audit §9).
 *
 *   yarn ts-node scripts/cost-report.ts [--since 2026-07-08T10:50:00Z] \
 *     [--days 7] [--market austinfood]
 *
 * --market adds POST-SEQUENCE discovery attribution (the saturation curve)
 * for that community. Spend is priced at official list rates; free tiers and
 * cached-read discounts make real bills lower.
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let since: Date | null = null;
  let market: string | undefined;
  let days = 7;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${token} needs a value`);
      return value;
    };
    if (token === '--since') since = new Date(next());
    else if (token === '--days') days = Number(next());
    else if (token === '--market') market = next().toLowerCase();
    else throw new Error(`Unknown argument: ${token}`);
  }
  const windowStart = since ?? new Date(Date.now() - days * 24 * 3600 * 1000);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const prisma = app.get(PrismaService);
    await printCostReport({
      prisma,
      out: (line) => process.stdout.write(`${line}\n`),
      since: windowStart,
      market,
    });
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
