import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { join } from 'path';
import configuration from '../src/config/configuration';
import { AnalyticsModule } from '../src/modules/analytics/analytics.module';
import { SearchDemandAggregationService } from '../src/modules/analytics/search-demand-aggregation.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(__dirname, '..', '.env'),
        join(__dirname, '..', '..', '..', '.env'),
      ],
      load: [configuration],
    }),
    AnalyticsModule,
  ],
})
class SearchDemandRebuildModule {}

function parseArg(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() || null : null;
}

function parseDateKey(value: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`${label} is not a valid date`);
  }
  return date;
}

async function main() {
  const app = await NestFactory.createApplicationContext(
    SearchDemandRebuildModule,
    { logger: ['error', 'warn', 'log'] },
  );
  try {
    const aggregation = app.get(SearchDemandAggregationService);
    const start = parseArg('start');
    const end = parseArg('end');
    const daysArg = parseArg('days');
    if ((start && !end) || (!start && end)) {
      throw new Error('Use --start=YYYY-MM-DD and --end=YYYY-MM-DD together');
    }
    let days: number | undefined;
    if (daysArg) {
      const parsedDays = Number(daysArg);
      if (!Number.isFinite(parsedDays) || parsedDays <= 0) {
        throw new Error('--days must be a positive number');
      }
      days = parsedDays;
    }

    const result =
      start || end
        ? await aggregation.rebuildDateRange({
            startDate: parseDateKey(start!, 'start'),
            endDateExclusive: parseDateKey(end!, 'end'),
          })
        : await aggregation.rebuildRecentDays(days);

    console.log(
      JSON.stringify(
        {
          ok: true,
          ...result,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
