import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { RestaurantEnrichmentModule } from '../src/modules/restaurant-enrichment';
import { RestaurantLocationEnrichmentService } from '../src/modules/restaurant-enrichment';

interface CliOptions {
  limit: number;
  dryRun: boolean;
  force: boolean;
  entityId?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    limit: 25,
    dryRun: false,
    force: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg.startsWith('--limit=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value) && value > 0) {
        options.limit = Math.min(Math.trunc(value), 100);
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
    RestaurantEnrichmentModule,
    {
      logger: ['error', 'warn'],
    },
  );

  try {
    const service = app.get(RestaurantLocationEnrichmentService);

    Logger.log(
      `Starting restaurant enrichment (limit=${cliOptions.limit}${
        cliOptions.dryRun ? ', dry-run' : ''
      }${cliOptions.force ? ', force' : ''}${
        cliOptions.entityId ? `, entity=${cliOptions.entityId}` : ''
      })`,
      'RestaurantEnrichmentCLI',
    );

    const summary = await service.enrichMissingRestaurants({
      limit: cliOptions.limit,
      dryRun: cliOptions.dryRun,
      force: cliOptions.force,
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
