/**
 * Resume-Campaign Ops Script (red team 2026-07-25)
 *
 * SpendCampaignService.resumeAfterBreach had no caller wiring — a campaign
 * flipped 'breached' by recordSpend could never be re-approved even though
 * the breach alert tells the owner to use resumeAfterBreach. Modeled on
 * resume-lane.ts.
 *
 * Two-step (print-then-approve, mirroring the estimate-hash gate):
 *   1. Run with only --campaign-id: prints the freshly recomputed refined
 *      estimate INCLUDING its hash (the campaign stays breached).
 *   2. Re-run with --campaign-id AND --estimate-hash <hash from step 1>:
 *      calls resumeAfterBreach, which recomputes + verifies the hash and
 *      reopens the campaign with the refined envelope.
 *
 *   yarn ts-node -r tsconfig-paths/register scripts/resume-campaign.ts \
 *     --campaign-id <uuid> [--estimate-hash <sha256>]
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GovernanceService } from '../src/modules/external-integrations/governance/governance.service';
import {
  ENVELOPE_BOOTSTRAP_TOLERANCE,
  hashEstimate,
  SpendCampaignService,
} from '../src/modules/external-integrations/shared/spend-campaign.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function resumeCampaign() {
  console.log('🔍 Campaign Resume');
  console.log('================================');

  const campaignId = argValue('--campaign-id');
  const providedHash = argValue('--estimate-hash');
  if (!campaignId) {
    throw new Error(
      'Usage: yarn ts-node apps/api/scripts/resume-campaign.ts ' +
        '--campaign-id <uuid> [--estimate-hash <sha256>]',
    );
  }

  let app;
  try {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'],
    });
    stopCronsForScript(app);

    const prisma = app.get(PrismaService);
    const spendCampaigns = app.get(SpendCampaignService);
    const governance = app.get(GovernanceService);

    const row = await prisma.spendCampaign.findUnique({
      where: { campaignId },
    });
    if (!row) {
      throw new Error(`No campaign row for id ${campaignId}`);
    }
    console.log('\n📊 Campaign:', {
      name: row.name,
      workClass: row.workClass,
      state: row.state,
      estimateMicros:
        row.estimateMicros === null ? null : Number(row.estimateMicros),
      spentMicros: Number(row.spentMicros),
    });

    if (!providedHash) {
      // Step 1: print the refined estimate + hash (same recomputation
      // resumeAfterBreach performs — rate lookup + drift-derived tolerance).
      const rate = await prisma.spendUnitCost.findUnique({
        where: {
          workClass_unit: { workClass: row.workClass, unit: row.unit },
        },
      });
      if (!rate) {
        throw new Error(
          `No published rate for ${row.workClass}::${row.unit} — run the ` +
            'pilot/rate publication first',
        );
      }
      const estimateMicros = Math.round(row.unitCount * rate.microUsdPerUnit);
      const drift = governance.pools.measureDrift(row.workClass);
      const toleranceFraction =
        drift === null
          ? ENVELOPE_BOOTSTRAP_TOLERANCE
          : Math.max(Math.abs(drift - 1), ENVELOPE_BOOTSTRAP_TOLERANCE);
      const estimateHash = hashEstimate({
        workClass: row.workClass,
        unit: row.unit,
        unitCount: row.unitCount,
        microUsdPerUnit: rate.microUsdPerUnit,
        estimateMicros,
        toleranceFraction,
      });
      console.log('\n📄 Refined estimate (campaign stays breached):', {
        unitCount: row.unitCount,
        microUsdPerUnit: rate.microUsdPerUnit,
        estimateUsd: (estimateMicros / 1_000_000).toFixed(2),
        toleranceFraction,
        envelopeUsd: (
          Math.round(estimateMicros * (1 + toleranceFraction)) / 1_000_000
        ).toFixed(2),
        estimateHash,
      });
      console.log('\nTo approve, re-run with: --estimate-hash ' + estimateHash);
      return;
    }

    const resumed = await spendCampaigns.resumeAfterBreach(
      campaignId,
      providedHash,
    );
    console.log('\n✅ Campaign resumed:', {
      campaignId: resumed.campaignId,
      estimateUsd: (resumed.estimateMicros / 1_000_000).toFixed(2),
      toleranceFraction: resumed.toleranceFraction,
      envelopeUsd: (resumed.envelopeMicros / 1_000_000).toFixed(2),
    });
  } finally {
    if (app) {
      await app.close();
    }
  }
}

if (require.main === module) {
  resumeCampaign()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(
        '❌ Campaign resume failed:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    });
}
