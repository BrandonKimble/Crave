import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';
process.env.AUTOCOMPLETE_ENABLE_HYBRID_RECALL = process.argv.includes('--off')
  ? 'false'
  : 'true';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AutocompleteService } from '../src/modules/autocomplete/autocomplete.service';

async function main(): Promise<void> {
  const queries = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const probes = queries.length
    ? queries
    : ['bacon egg and cheese', 'pizza', 'shake shack'];

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const out = (m = '') => process.stdout.write(`${m}\n`);

  try {
    const svc = app.get(AutocompleteService);
    out(`hybrid recall: ${process.env.AUTOCOMPLETE_ENABLE_HYBRID_RECALL}`);
    for (const q of probes) {
      const res = await svc.autocompleteEntities({
        query: q,
        entityTypes: [EntityType.food, EntityType.restaurant],
        limit: 8,
      });
      out('');
      out(`════ "${q}" → ${res.matches.length} matches ════`);
      for (const m of res.matches) {
        out(`  ${m.name} [${m.entityType[0]}] ${m.matchType} ${m.confidence}`);
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
