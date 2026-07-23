import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { EntityTextSearchService } from '../src/modules/entity-text-search/entity-text-search.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

const NYC = 'region-us-ny-new-york';
const COMMENTS = [
  'Honestly Noodle Village has the best duck larb, and Caffè Panna for dessert',
  'go to falafel pita, it slaps',
  'the breakfast sandwich there is unreal',
  'no real spots here just vibes',
];

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m = '') => process.stdout.write(`${m}\n`);
  try {
    const ets = app.get(EntityTextSearchService);
    for (const c of COMMENTS) {
      const spans = await ets.scanForKnownEntities(
        c,
        [EntityType.restaurant, EntityType.food],
        { engineId: null },
      );
      out('');
      out(`"${c}"`);
      out(
        `   ${spans.length} span(s): ${spans
          .map(
            (s) => `[${s.start}-${s.end} ${s.type[0]}] "${s.text}"→${s.name}`,
          )
          .join('  ')}`,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
