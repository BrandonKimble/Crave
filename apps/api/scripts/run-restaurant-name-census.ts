/**
 * @script-class: operational
 *
 * THE GENERIC-WORD CENSUS, run by hand — the restaurant-name court's docket
 * feeder (flywheel arming 2026-08-30). The standing rail is step 3 of the
 * knowledge-maintenance nightly (RESTAURANT_NAME_CENSUS_ENABLED, default
 * OFF — a launch flip-list item); this script is the same feeder driven
 * manually.
 *
 * Modes, safest first:
 *   npx ts-node -T scripts/run-restaurant-name-census.ts --docket-only
 *       SQL census only — prints counts + the docket head. NO LLM, no writes.
 *   npx ts-node -T scripts/run-restaurant-name-census.ts
 *       Dry run: judge consulted on the docket, nothing written.
 *   npx ts-node -T scripts/run-restaurant-name-census.ts --apply
 *       Full run: verdicts recorded, notAName recall claims taken.
 *   --cap N bounds the docket (default 400).
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RestaurantNameCensusService } from '../src/modules/content-processing/entity-resolver/restaurant-name-census.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const docketOnly = argv.includes('--docket-only');
  const capIndex = argv.indexOf('--cap');
  const cap = capIndex >= 0 ? Number(argv[capIndex + 1]) : undefined;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (message: string) => process.stdout.write(`${message}\n`);
  try {
    const census = app.get(RestaurantNameCensusService);
    if (docketOnly) {
      const { docket, scanned, alreadyDecided } = await census.buildDocket(cap);
      out(
        `scanned=${scanned} alreadyDecided=${alreadyDecided} docket=${docket.length} (NO LLM consulted)`,
      );
      for (const row of docket.slice(0, 50)) {
        out(
          `  ${row.form.padEnd(20)} grounded=${row.grounded} ` +
            `wordElsewhere=${row.wordElsewhere} numeric=${row.numericOnly} ${row.entityId}`,
        );
      }
      if (docket.length > 50) out(`  … and ${docket.length - 50} more`);
      return;
    }
    if (!apply) out('DRY RUN — judge consulted, nothing written. Add --apply.');
    const summary = await census.run({ dryRun: !apply, cap });
    out(
      JSON.stringify({
        ...summary,
        hearing: summary.hearing
          ? { ...summary.hearing, cases: summary.hearing.cases.length }
          : null,
      }),
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
