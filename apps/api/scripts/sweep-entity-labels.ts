/**
 * @script-class: operational
 *
 * THE VOCABULARY SWEEP, run by hand — labels AND search surfaces, per locale.
 *
 * NO CRON, deliberately: crons are off in this environment, and a pass that
 * can spend money should not start itself. This is the driver an operator
 * runs; wiring it to a schedule is a separate, explicit decision.
 *
 * WITHOUT `--apply` the generator is the STUB: this MEASURES the backlog per
 * locale and writes nothing. WITH `--apply` it runs the real
 * VocabularyGenerator, which produces the display label AND the search
 * surfaces for each concept.
 *
 * Measured worth (concept-graph plan §8): one pass of this shape over the 110
 * concepts the Spanish gold corpus expects moved the launch gate from 77.3%
 * to 96.7%. The surfaces are the half that did it.
 *
 * Run:
 *   npx ts-node -T scripts/sweep-entity-labels.ts                    # backlog only
 *   npx ts-node -T scripts/sweep-entity-labels.ts --locale es --limit 50 --apply
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { LabelSweepService } from '../src/modules/entity-display/label-sweep.service';
import { VocabularyGenerator } from '../src/modules/entity-display/vocabulary-generator';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const limitIndex = argv.indexOf('--limit');
  const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : 200;
  const localeIndex = argv.indexOf('--locale');
  const onlyLocale = localeIndex >= 0 ? argv[localeIndex + 1] : null;
  const apply = argv.includes('--apply');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (message: string) => process.stdout.write(`${message}\n`);
  try {
    const sweep = app.get(LabelSweepService);
    const generator = apply ? app.get(VocabularyGenerator) : undefined;
    if (!apply) {
      out('DRY RUN (stub generator) — measuring backlog only. Add --apply.');
    }
    const locales = onlyLocale ? [onlyLocale] : sweep.sweepLocales();
    for (const locale of locales) {
      const result = await sweep.sweep(locale, { limit, generator });
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
