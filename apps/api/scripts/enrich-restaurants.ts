/**
 * @script-class: operational
 * @runner: .claude/SKILL.md
 *
 * Operational tooling: a runner invokes this. Classes assigned by the
 * F414 sweep (2026-08-02) from the actual reference census, not by guess.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { PlaceEnrichmentModule } from '../src/modules/restaurant-enrichment';
import { PlaceLocationEnrichmentService } from '../src/modules/restaurant-enrichment';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

interface CliOptions {
  limit: number;
  dryRun: boolean;
  /** Full re-enrichment of an already-grounded entity (identity changed). */
  force: boolean;
  /** Re-attempt entities past the terminal-failure money guard (F9965: this
   *  used to ride --force, conflating "refresh identity" with "disable the
   *  money guard" — two decisions, two flags). */
  retryTerminal: boolean;
  entityId?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    limit: 25,
    dryRun: false,
    force: false,
    retryTerminal: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--retry-terminal') {
      options.retryTerminal = true;
    } else if (arg.startsWith('--limit=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value) && value > 0) {
        // No hard cap (grounding red team 2026-08-31): the old min(…, 100)
        // silently clamped a runbook sweep to the head of the backlog, and
        // combined with createdAt-ordering it re-bought the same ~100
        // declined entities forever. The runbook sweep may pass the FULL
        // backlog size; the default stays a sane 25, and the shared
        // grounding decline hold (evaluated at enrichPlace, read from the
        // durable window) halts the sweep when the judge is broken.
        options.limit = Math.trunc(value);
      }
    } else if (arg.startsWith('--entity=')) {
      options.entityId = arg.split('=')[1];
    }
  }

  return options;
}

async function bootstrap(): Promise<void> {
  const cliOptions = parseArgs(process.argv.slice(2));

  const app = await NestFactory.createApplicationContext(
    PlaceEnrichmentModule,
    {
      logger: ['error', 'warn'],
    },
  );
  stopCronsForScript(app);

  try {
    const service = app.get(PlaceLocationEnrichmentService);

    Logger.log(
      `Starting restaurant enrichment (limit=${cliOptions.limit}${
        cliOptions.dryRun ? ', dry-run' : ''
      }${cliOptions.force ? ', force' : ''}${
        cliOptions.entityId ? `, entity=${cliOptions.entityId}` : ''
      })`,
      'RestaurantEnrichmentCLI',
    );

    const summary = await service.enrichMissingPlaces({
      limit: cliOptions.limit,
      dryRun: cliOptions.dryRun,
      force: cliOptions.force,
      retryTerminal: cliOptions.retryTerminal,
      entityId: cliOptions.entityId,
    });

    Logger.log(
      `Enrichment finished: updated=${summary.updated}, skipped=${summary.skipped}, failures=${summary.failures.length}`,
      'RestaurantEnrichmentCLI',
    );

    if (summary.failures.length > 0) {
      for (const failure of summary.failures) {
        Logger.error(
          `Entity ${failure.entityId} failed: ${failure.reason}`,
          undefined,
          'RestaurantEnrichmentCLI',
        );
      }
    }
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  Logger.error(
    error instanceof Error ? error.message : String(error),
    error instanceof Error ? error.stack : undefined,
    'RestaurantEnrichmentCLI',
  );
  process.exitCode = 1;
});
