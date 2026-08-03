/**
 * @script-class: probe
 * @finding: NOT YET BANKED — record what this probe answered, or delete it.
 *
 * A banked probe's value is the RECORDED RESULT, kept so the finding stays
 * reproducible. This one has no runner and no written-down finding: the
 * F414 sweep (2026-08-02) could establish the first fact mechanically but
 * not the second, and inventing one would be worse than leaving it visible.
 * Until a finding is written here, this file is a deletion candidate.
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AutocompleteService } from '../src/modules/autocomplete/autocomplete.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

async function main(): Promise<void> {
  const queries = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const probes = queries.length
    ? queries
    : ['bacon egg and cheese', 'pizza', 'shake shack'];

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m = '') => process.stdout.write(`${m}\n`);

  try {
    const svc = app.get(AutocompleteService);
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
