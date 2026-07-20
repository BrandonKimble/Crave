import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PublicCraveScoreService } from '../src/modules/content-processing/public-crave-score/public-crave-score.service';
import { RescoreCoordinatorService } from '../src/modules/content-processing/public-crave-score/rescore-coordinator.service';
import { LoggerService } from '../src/shared/logging/logger.interface';

const consoleLogger = {
  setContext() {
    return this;
  },
  debug(...args: unknown[]) {
    console.log(...args);
  },
  info(...args: unknown[]) {
    console.log(...args);
  },
  warn(...args: unknown[]) {
    console.warn(...args);
  },
  error(...args: unknown[]) {
    console.error(...args);
  },
} as unknown as LoggerService;

/**
 * §12.6: global rebuilds happen ONLY through the singleton rescorer — this
 * script marks the durable dirty flag and drives one coordinator tick
 * (advisory-locked, flag cleared before the rebuild, re-dirtied on failure),
 * exactly the path the hourly cron takes.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    const scorer = new PublicCraveScoreService(prisma as never, consoleLogger);
    const coordinator = new RescoreCoordinatorService(
      prisma as never,
      consoleLogger as never,
      scorer,
    );
    coordinator.onModuleInit();
    await coordinator.markDirty('manual rebuild-crave-scores script');
    const outcome = await coordinator.tick();
    console.log(JSON.stringify({ outcome }, null, 2));
    if (outcome !== 'rebuilt') {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
