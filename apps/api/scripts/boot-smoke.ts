/**
 * @script-class: gate
 * @finding: standing — the cheapest fact nothing else asserted.
 *
 * THE APP BOOTS (acceptance red team 2026-08-30, finding 0): an unversioned
 * prompt edit made a rule-release ledger throw at import, so AppModule could
 * not boot ANYWHERE — while tsc stayed clean (exit 0) and `yarn invariants`
 * stayed green (it never instantiates AppModule). Two wave reports watched
 * the tree be unbootable and each assumed another agent would notice.
 *
 * This is the standing noticer: it does exactly what every operational
 * script and the real API do first — createApplicationContext(AppModule) —
 * then closes and exits 0. Any import-time throw (rule ledgers, prompt
 * assets, DI miswiring, config validation) fails HERE, cheaply, instead of
 * at deploy. (A jest spec cannot host this: importing AppModule pulls
 * ESM-only p-limit through ts-jest's CJS transform.)
 *
 *   yarn workspace api ts-node scripts/boot-smoke.ts
 *   # or, standing: yarn workspace api boot:smoke
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  await app.close();
  process.stdout.write('BOOT OK — AppModule context created and closed\n');
}

main().catch((e) => {
  process.stderr.write(
    `BOOT FAILED:\n${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`,
  );
  process.exit(1);
});
