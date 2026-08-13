/**
 * @script-class: operational
 * @runner: scripts/rig/reextract.sh (verb: report)
 *
 * QUOTE-vs-ACTUAL for one campaign (owner ruling 2026-08-10, estimator ideal
 * shape): the estimator's honesty is MEASURED every run, not assumed. Prints
 * the approved quote + envelope from the campaign row, the metered actual,
 * the delta, and the per-caller ledger breakdown so a drifting rate is
 * visible the day it drifts — the prod-facing DX for the live workflow.
 *
 *   yarn workspace api ts-node scripts/reextract-report.ts <campaignId>
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { campaignAttributableRates } from '../src/modules/external-integrations/shared/gemini-pricing';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

async function main(): Promise<void> {
  const campaignId = process.argv[2];
  if (!campaignId) {
    console.error('Usage: reextract-report.ts <campaignId>');
    process.exit(1);
  }
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  stopCronsForScript(app);
  try {
    const prisma = app.get(PrismaService);
    const campaign = await prisma.spendCampaign.findUnique({
      where: { campaignId },
    });
    if (!campaign) throw new Error(`no campaign ${campaignId}`);

    // ONE RATE AUTHORITY (campaignAttributableRates, beside pricedGeminiRow):
    // same priced-row projection as the estimator's call plan and replay
    // prior — `mode` always in the grouping, non-gemini rows counted and
    // labeled UNPRICED (the $118 lesson: an unpriced line must never read
    // as a free line; BigQuery reconcile is its truth).
    const rates = await campaignAttributableRates(prisma, {
      kind: 'campaign',
      campaignId,
    });
    const actualMicros = rates.geminiMicros;
    const unpricedCalls = rates.unpricedCalls;
    const byCaller = new Map<
      string,
      { micros: number; calls: number; priced: boolean }
    >();
    for (const row of rates.rows) {
      const prev = byCaller.get(row.caller) ?? {
        micros: 0,
        calls: 0,
        priced: row.priced,
      };
      byCaller.set(row.caller, {
        micros: prev.micros + row.micros,
        calls: prev.calls + row.calls,
        priced: prev.priced && row.priced,
      });
    }

    const usd = (micros: number | bigint | null) =>
      `$${(Number(micros ?? 0) / 1e6).toFixed(2)}`;
    const quote = Number(campaign.estimateMicros ?? 0);
    const envelope = Math.round(
      quote * (1 + (campaign.toleranceFraction ?? 0)),
    );
    console.log(`Campaign ${campaign.name} (${campaign.state})`);
    console.log(`  quote     ${usd(quote)}`);
    console.log(`  envelope  ${usd(envelope)}`);
    console.log(
      `  metered   ${usd(campaign.spentMicros)} (campaign meter: spent_micros)`,
    );
    console.log(
      `  ledger    ${usd(actualMicros)} (ledger-priced by caller, gemini only${
        unpricedCalls
          ? `; ${unpricedCalls} non-gemini calls UNPRICED — reconcile via BigQuery (cost-reconcile.sh)`
          : ''
      })`,
    );
    const delta = actualMicros - quote;
    const pct = quote > 0 ? ((100 * delta) / quote).toFixed(1) : 'n/a';
    console.log(
      `  DELTA     ${usd(delta)} (${pct}% of quote) — the estimator's measured honesty`,
    );
    console.log('  by caller:');
    for (const [caller, agg] of Array.from(byCaller.entries()).sort(
      (a, b) => b[1].micros - a[1].micros,
    )) {
      console.log(
        `    ${caller.padEnd(36)} ${(agg.priced ? usd(agg.micros) : 'UNPRICED').padStart(9)}  (${agg.calls} calls)`,
      );
    }
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
