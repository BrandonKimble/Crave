/**
 * @script-class: operational
 * @runner: one-off (2026-08-29 v16 activation repair)
 *
 * Re-run the projection rebuild an activate-shadow flip owed: the
 * affectedPlacesForDocuments alias bug (restaurant_id read as place_id)
 * collapsed the affected set to one undefined id, so the flip completed
 * without rebuilding. Recomputes the affected set for every document
 * whose ACTIVE run carries the given prompt hash and rebuilds in chunks.
 *
 *   npx ts-node scripts/rebuild-affected-projections.ts --hash <system_prompt_hash> --communities a,b
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ExtractionScopeService } from '../src/modules/content-processing/reddit-collector/extraction-scope.service';
import { ProjectionRebuildService } from '../src/modules/content-processing/reddit-collector/projection-rebuild.service';
import { RescoreCoordinatorService } from '../src/modules/content-processing/public-crave-score/rescore-coordinator.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const hash = arg('hash');
  const communities = (arg('communities') ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (!hash || !communities.length) {
    console.error(
      'Usage: rebuild-affected-projections.ts --hash <system_prompt_hash> --communities a,b',
    );
    process.exit(1);
  }
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  try {
    const scope = app.get(ExtractionScopeService);
    const rebuild = app.get(ProjectionRebuildService);
    const rescore = app.get(RescoreCoordinatorService);
    const placeIds = await scope.activePlacesForPromptHash(hash, communities);
    console.log(`Rebuilding projections for ${placeIds.length} restaurants…`);
    const CHUNK = 100;
    for (let i = 0; i < placeIds.length; i += CHUNK) {
      await rebuild.rebuildForPlaces(placeIds.slice(i, i + CHUNK));
      console.log(
        `  ${Math.min(i + CHUNK, placeIds.length)}/${placeIds.length}`,
      );
    }
    await rescore.markDirty('v16 activation projection-rebuild repair');
    console.log('DONE.');
  } finally {
    await app.close();
  }
}

void main();
