import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PublicCraveScoreService } from '../src/modules/content-processing/public-crave-score/public-crave-score.service';
import { LoggerService } from '../src/shared/logging/logger.interface';

const noopLogger = {
  setContext() {
    return this;
  },
  debug() {},
  info() {},
  warn() {},
  error() {},
} as unknown as LoggerService;

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    const service = new PublicCraveScoreService(prisma as never, noopLogger);
    const result = await service.rebuildAllScores();
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
