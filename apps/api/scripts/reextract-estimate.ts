/**
 * Create + approve the spend campaign for a shadow re-extraction —
 * the same manifest/approve-by-hash law as onboarding (§24.3).
 *
 *   npx ts-node scripts/reextract-estimate.ts --communities a,b --prompt-version N
 *   npx ts-node scripts/reextract-estimate.ts --communities a,b --prompt-version N \
 *        --approve-estimate <hash>
 *
 * Re-extraction replays EXISTING documents: no Places line (place-grounded
 * restaurants are never re-created — expectedNewRestaurants=0); the spend
 * is extraction/interactive/embedding over the doc count.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SpendCampaignService } from '../src/modules/external-integrations/shared/spend-campaign.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const communities = (arg('communities') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const promptVersion = arg('prompt-version');
  const approveHash = arg('approve-estimate');
  if (!communities.length || !promptVersion) {
    console.error(
      'Usage: reextract-estimate.ts --communities a,b --prompt-version N [--approve-estimate <hash>]',
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  try {
    const prisma = app.get(PrismaService);
    const campaigns = app.get(SpendCampaignService);

    const [{ count }] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS count FROM collection_source_documents
      WHERE community = ANY(${communities})`;
    const docCount = Number(count);
    const name = `reextract:${communities.join('+')}:v${promptVersion}`;

    const estimate = await campaigns.prepareManifestEstimate({
      name,
      docCount,
      expectedNewRestaurants: 0,
    });
    console.log(`Campaign: ${estimate.campaignId} (${name})`);
    console.log(`Docs: ${docCount}`);
    for (const line of estimate.lines) {
      console.log(
        `  ${line.workClass.padEnd(28)} $${(line.estimateMicros / 1e6).toFixed(2)}`,
      );
    }
    console.log(
      `TOTAL $${(estimate.totalEstimateMicros / 1e6).toFixed(2)}  tolerance ${(estimate.toleranceFraction * 100).toFixed(0)}%  envelope $${(estimate.envelopeMicros / 1e6).toFixed(2)}`,
    );
    console.log(`Estimate hash: ${estimate.estimateHash}`);

    if (!approveHash) {
      console.log(
        `\nNOT approved. Re-run with --approve-estimate ${estimate.estimateHash} after owner sign-off.`,
      );
      return;
    }
    await campaigns.approve(estimate.campaignId, approveHash);
    console.log(
      `APPROVED. Arm the shadow: ./scripts/rig/reextract.sh shadow ${communities.join(',')} ${promptVersion} ${estimate.campaignId}`,
    );
  } finally {
    await app.close();
  }
}

void main();
