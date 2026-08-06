/**
 * @script-class: operational
 *
 * THE SUBSTITUTABILITY PASS, run by hand (concept-graph plan, build step 4).
 *
 * NO CRON, deliberately — crons are off in this environment and a pass that
 * spends money should not start itself. Wiring it to a schedule is a separate,
 * explicit decision.
 *
 * It judges only the RESIDUAL: candidate pairs that head-final grammar
 * (rung 2) and the category graph (rung 3) could not already decide, and that
 * have not been judged at the current prompt version. Re-running is therefore
 * cheap and idempotent — rejects are stored precisely so nothing is judged
 * twice.
 *
 * Run:
 *   npx ts-node -T scripts/run-concept-satisfies.ts --limit 50            # dry run
 *   npx ts-node -T scripts/run-concept-satisfies.ts --limit 50 --apply
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ConceptSatisfiesService } from '../src/modules/content-processing/entity-resolver/concept-satisfies.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const limitIndex = argv.indexOf('--limit');
  const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : 100;
  const apply = argv.includes('--apply');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (message: string) => process.stdout.write(`${message}\n`);
  try {
    const service = app.get(ConceptSatisfiesService);
    if (!apply) {
      out('DRY RUN — judging but writing nothing. Add --apply.');
    }
    const summary = await service.run({ limit, dryRun: !apply });
    out(JSON.stringify(summary));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
