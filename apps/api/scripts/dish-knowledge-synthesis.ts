import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { DishKnowledgeSynthesisService } from '../src/modules/content-processing/entity-resolver/dish-knowledge-synthesis.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/**
 * Knowledge-tier dish synthesis (canonical ingredients + established aliases).
 *
 *   KNOWLEDGE_DRY_RUN=1 KNOWLEDGE_LIMIT=30 yarn ts-node scripts/dish-knowledge-synthesis.ts
 *   yarn ts-node scripts/dish-knowledge-synthesis.ts   # act (default limit 500)
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  try {
    const service = app.get(DishKnowledgeSynthesisService);
    const summary = await service.run({
      dryRun: process.env.KNOWLEDGE_DRY_RUN === '1',
      limit: Number(process.env.KNOWLEDGE_LIMIT ?? 500),
    });
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
