/**
 * THE BIGQUERY FEEDBACK EDGE (round-six cost ideal shape).
 *
 * Prices the ledger over a window with the SAME pricers the live meter uses
 * (no parallel pricing math — the one-gateway law), takes the BILLED totals
 * from the BigQuery export (passed in by cost-reconcile.sh --publish; this
 * script never invents them), and upserts the billed÷ledger multiplier per
 * vendor into spend_unit_costs as:
 *
 *   reconciliation.gemini        / multiplier
 *   reconciliation.google_places / multiplier
 *
 * ENCODING: microUsdPerUnit stores the RATIO directly (1.0 = honest meter),
 * NOT currency — same encoding rule as pipeline.entities_per_kilodoc.
 * prepareManifestEstimate multiplies every line by its vendor's multiplier,
 * so the manifest the owner approves is in BILLED dollars, and the estimate
 * self-corrects every time a reconciliation runs. Absent rows mean "never
 * reconciled" and the estimator honestly falls back to 1.0 (ledger-priced).
 *
 * Usage (normally via cost-reconcile.sh --publish):
 *   DATABASE_URL=<target> npx ts-node scripts/publish-reconciliation.ts \
 *     --days 30 --billed-gemini-usd 465.93 --billed-places-usd 565.80
 */
import { PrismaClient } from '@prisma/client';
import { pricedGeminiRow } from '../src/modules/external-integrations/shared/gemini-pricing';
import { placesCostMicrosPerCall } from '../src/modules/external-integrations/shared/vendor-pricing';

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requireNumber(flag: string): number {
  const raw = argValue(flag);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative number (got '${raw}')`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const days = requireNumber('--days');
  const billedGeminiUsd = requireNumber('--billed-gemini-usd');
  const billedPlacesUsd = requireNumber('--billed-places-usd');
  const prisma = new PrismaClient();
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - days * 24 * 3600 * 1000);

  const rows = await prisma.apiUsageEvent.findMany({
    where: { createdAt: { gte: windowStart, lt: windowEnd } },
    select: {
      service: true,
      operation: true,
      skuTier: true,
      model: true,
      mode: true,
      inputTokens: true,
      outputTokens: true,
      cachedTokens: true,
      requestCount: true,
      durationHours: true,
    },
  });
  let ledgerGeminiMicros = 0;
  let ledgerPlacesMicros = 0;
  for (const row of rows) {
    if (row.service === 'gemini') {
      ledgerGeminiMicros += pricedGeminiRow(row);
    } else if (row.service === 'google_places') {
      ledgerPlacesMicros +=
        placesCostMicrosPerCall(row.skuTier ?? null, row.operation) *
        (row.requestCount ?? 0);
    }
  }

  const publish = async (
    service: 'gemini' | 'google_places',
    billedUsd: number,
    ledgerMicros: number,
  ): Promise<void> => {
    if (ledgerMicros <= 0 || billedUsd <= 0) {
      // No sample on one side → nothing measurable; never write a guess.
      console.log(
        `reconciliation.${service}: SKIPPED (billed ${billedUsd}, ledger ${ledgerMicros / 1e6}) — need both sides > 0`,
      );
      return;
    }
    const multiplier = (billedUsd * 1e6) / ledgerMicros;
    const workClass = `reconciliation.${service}`;
    await prisma.spendUnitCost.upsert({
      where: { workClass_unit: { workClass, unit: 'multiplier' } },
      create: {
        workClass,
        unit: 'multiplier',
        microUsdPerUnit: multiplier,
        sampleUnits: Math.round(days),
        windowStart,
        windowEnd,
      },
      update: {
        microUsdPerUnit: multiplier,
        sampleUnits: Math.round(days),
        windowStart,
        windowEnd,
      },
    });
    console.log(
      `reconciliation.${service}: ledger $${(ledgerMicros / 1e6).toFixed(2)} vs billed $${billedUsd.toFixed(2)} → multiplier ${multiplier.toFixed(3)} PUBLISHED`,
    );
  };

  await publish('gemini', billedGeminiUsd, ledgerGeminiMicros);
  await publish('google_places', billedPlacesUsd, ledgerPlacesMicros);
  await prisma.$disconnect();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
