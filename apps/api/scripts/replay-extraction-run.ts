import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { ReplayService } from '../src/modules/content-processing/reddit-collector/replay.service';

type CliOptions = {
  sourceRunId?: string;
  sourceCollectionRunId?: string;
  platform?: string;
  community?: string;
  start?: string;
  end?: string;
  pipeline?: 'chronological' | 'keyword' | 'archive' | 'on-demand';
  activate: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    activate: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--source-run') {
      options.sourceRunId = argv[index + 1];
      index += 1;
      continue;
    }
    if (token.startsWith('--source-run=')) {
      options.sourceRunId = token.split('=', 2)[1];
      continue;
    }
    if (token === '--source-collection-run') {
      options.sourceCollectionRunId = argv[index + 1];
      index += 1;
      continue;
    }
    if (token.startsWith('--source-collection-run=')) {
      options.sourceCollectionRunId = token.split('=', 2)[1];
      continue;
    }
    if (token === '--platform') {
      options.platform = argv[index + 1];
      index += 1;
      continue;
    }
    if (token.startsWith('--platform=')) {
      options.platform = token.split('=', 2)[1];
      continue;
    }
    if (token === '--community') {
      options.community = argv[index + 1];
      index += 1;
      continue;
    }
    if (token.startsWith('--community=')) {
      options.community = token.split('=', 2)[1];
      continue;
    }
    if (token === '--start') {
      options.start = argv[index + 1];
      index += 1;
      continue;
    }
    if (token.startsWith('--start=')) {
      options.start = token.split('=', 2)[1];
      continue;
    }
    if (token === '--end') {
      options.end = argv[index + 1];
      index += 1;
      continue;
    }
    if (token.startsWith('--end=')) {
      options.end = token.split('=', 2)[1];
      continue;
    }
    if (token === '--pipeline') {
      options.pipeline = normalizePipelineArg(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token.startsWith('--pipeline=')) {
      options.pipeline = normalizePipelineArg(token.split('=', 2)[1]);
      continue;
    }
    if (token === '--activate') {
      options.activate = true;
      continue;
    }
    if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  const hasSourceRun = typeof options.sourceRunId === 'string';
  const hasSourceCollectionRun =
    typeof options.sourceCollectionRunId === 'string';
  const hasDateRange =
    typeof options.platform === 'string' &&
    typeof options.start === 'string' &&
    typeof options.end === 'string';

  const selectedModeCount = [
    hasSourceRun,
    hasSourceCollectionRun,
    hasDateRange,
  ].filter(Boolean).length;

  if (selectedModeCount !== 1) {
    console.error(
      'Choose exactly one replay mode: --source-run <runId>, --source-collection-run <collectionRunId>, or --platform/--start/--end',
    );
    printHelp();
    process.exit(1);
  }

  return options;
}

function normalizePipelineArg(
  value?: string,
): 'chronological' | 'keyword' | 'archive' | 'on-demand' | undefined {
  if (
    value === 'chronological' ||
    value === 'keyword' ||
    value === 'archive' ||
    value === 'on-demand'
  ) {
    return value;
  }
  return undefined;
}

function parseDate(value: string | undefined, flagName: string): Date {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    console.error(`Invalid ${flagName}: ${value ?? '<missing>'}`);
    process.exit(1);
  }
  return parsed;
}

function printHelp(): void {
  console.log(`replay-extraction-run

Replay by extraction run:
  yarn workspace api ts-node scripts/replay-extraction-run.ts --source-run <runId> [--activate]

Replay by collection run:
  yarn workspace api ts-node scripts/replay-extraction-run.ts --source-collection-run <collectionRunId> [--activate]

Replay by source document date range:
  yarn workspace api ts-node scripts/replay-extraction-run.ts --platform reddit --community austinfood --start 2026-04-01 --end 2026-04-14 [--pipeline chronological] [--activate]

Flags:
  --source-run <runId>     Replay from stored extraction inputs for an existing extraction run
  --source-collection-run <collectionRunId> Replay all extraction runs in a collection run
  --platform <name>        Source platform for date-range replay
  --community <name>       Optional community/subreddit filter for date-range replay
  --start <iso-date>       Inclusive source-created start date for date-range replay
  --end <iso-date>         Inclusive source-created end date for date-range replay
  --pipeline <name>        Replay pipeline label for date-range mode
  --activate               Make the new extraction authoritative for the selected documents
  --help, -h               Show this help
`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const replayService = app.get(ReplayService);

    const summary = options.sourceRunId
      ? await replayService.replayExtractionRun({
          sourceExtractionRunId: options.sourceRunId,
          activate: options.activate,
        })
      : options.sourceCollectionRunId
        ? await replayService.replayCollectionRun({
            sourceCollectionRunId: options.sourceCollectionRunId,
            activate: options.activate,
          })
        : await replayService.replayDateRange({
            platform: options.platform!,
            community: options.community,
            start: parseDate(options.start, '--start'),
            end: parseDate(options.end, '--end'),
            pipeline: options.pipeline,
            activate: options.activate,
          });

    Logger.log(JSON.stringify(summary, null, 2), 'ReplayExtractionCLI');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  Logger.error(
    error instanceof Error ? error.message : String(error),
    error instanceof Error ? error.stack : undefined,
    'ReplayExtractionCLI',
  );
  process.exitCode = 1;
});
