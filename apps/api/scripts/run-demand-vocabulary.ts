/**
 * @script-class: operational
 *
 * DEMAND -> VOCABULARY sweep (concept-graph plan, build step 6), run by hand.
 *
 * Reads the `on_demand_ask` signals ledger — every search term the app could
 * not ground — and asks the existing identity judge whether each is simply a
 * word we lack for a concept we already hold. On a confident match the term is
 * banked as an alias tagged with the ask's own language (`query_banking`) and
 * stops being demand.
 * On anything else it stays demand, which is where collection reads it.
 *
 * NO CRON, deliberately: crons are off here and a pass that spends money
 * should not start itself.
 *
 * Run:
 *   npx ts-node -T scripts/run-demand-vocabulary.ts --limit 50            # dry run
 *   npx ts-node -T scripts/run-demand-vocabulary.ts --limit 50 --apply
 *
 * There is no --locale flag: each term is banked in the language its ASK was
 * made in (signals.detected_locale), which the ledger already records. An
 * operator cannot know what language other people typed in.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DemandVocabularyService } from '../src/modules/search/demand-vocabulary.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const limitIndex = argv.indexOf('--limit');
  const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : 50;
  const apply = argv.includes('--apply');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (message: string) => process.stdout.write(`${message}\n`);
  try {
    const service = app.get(DemandVocabularyService);
    if (!apply) {
      out('DRY RUN — judging but banking nothing. Add --apply.');
    }
    out(JSON.stringify(await service.run({ limit, dryRun: !apply })));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
