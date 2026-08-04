/**
 * @script-class: operational
 *
 * M2 — THE UNLABELED-CONCEPT SWEEP, run by hand.
 *
 * NO CRON, deliberately: crons are off in this environment, and a pass that
 * can spend money should not start itself. This is the driver an operator
 * runs; wiring it to a schedule is a separate, explicit decision.
 *
 * The generator is the STUB today (it produces nothing), so with no
 * `--generator` this run MEASURES the backlog and writes zero rows. That is
 * the honest state of M2's tail half: the mechanism exists, the producer does
 * not. The spine's real producer is scripts/seed-spine-labels.ts.
 *
 * Run:
 *   npx ts-node -T scripts/sweep-entity-labels.ts            # backlog per locale
 *   npx ts-node -T scripts/sweep-entity-labels.ts --limit 50
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { LabelSweepService } from '../src/modules/entity-display/label-sweep.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const limitIndex = argv.indexOf('--limit');
  const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : 200;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (message: string) => process.stdout.write(`${message}\n`);
  try {
    const sweep = app.get(LabelSweepService);
    for (const locale of sweep.sweepLocales()) {
      const result = await sweep.sweep(locale, { limit });
      out(JSON.stringify(result));
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
