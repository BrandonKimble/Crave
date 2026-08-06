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
import {
  placesCostMicrosPerCall,
  tomtomCostMicrosPerDraw,
} from '../src/modules/external-integrations/shared/vendor-pricing';

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
  // TOMTOM IS OPTIONAL, AND THAT IS THE HONEST SHAPE (red team 2026-08-04).
  // TomTom is not GCP, so its billed truth is not in the BigQuery export —
  // the only source is the vendor portal's invoice/credit history, read by a
  // human. Before this flag existed, reconciliation.tomtom could NEVER be
  // published: prime('tomtom') was dead code and gross('tomtom', x) was
  // permanently 1.0 while reading as if it were wired. Omitting the flag
  // skips the arm loudly instead of silently never supporting it.
  const billedTomtomRaw = argValue('--billed-tomtom-usd');
  const billedTomtomUsd =
    billedTomtomRaw === undefined ? null : requireNumber('--billed-tomtom-usd');
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
  let ledgerTomtomMicros = 0;
  for (const row of rows) {
    if (row.service === 'gemini') {
      ledgerGeminiMicros += pricedGeminiRow(row);
    } else if (row.service === 'google_places') {
      ledgerPlacesMicros +=
        placesCostMicrosPerCall(row.skuTier ?? null, row.operation) *
        (row.requestCount ?? 0);
    } else if (row.service === 'tomtom') {
      // Blended per-draw rate: the conservative every-draw-at-the-scarce-rate
      // figure the live meter uses, so both sides of the ratio speak the same
      // ledger dialect.
      ledgerTomtomMicros +=
        tomtomCostMicrosPerDraw(row.operation) * (row.requestCount ?? 0);
    }
  }

  const publish = async (
    service: 'gemini' | 'google_places' | 'tomtom',
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
  if (billedTomtomUsd !== null) {
    await publish('tomtom', billedTomtomUsd, ledgerTomtomMicros);
  } else {
    console.log(
      'reconciliation.tomtom: not published (no --billed-tomtom-usd). The ' +
        'source is the TomTom portal invoice — pass the figure when you have ' +
        'read it; the multiplier stays at its last published value (or 1.0 ' +
        'if never published).',
    );
  }
  await prisma.$disconnect();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
