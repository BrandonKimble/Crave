/**
 * @script-class: probe
 * @finding: NOT YET BANKED — record what this probe answered, or delete it.
 *
 * A banked probe's value is the RECORDED RESULT, kept so the finding stays
 * reproducible. This one has no runner and no written-down finding: the
 * F414 sweep (2026-08-02) could establish the first fact mechanically but
 * not the second, and inventing one would be worse than leaving it visible.
 * Until a finding is written here, this file is a deletion candidate.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { GooglePlacesModule } from '../src/modules/external-integrations/google-places/google-places.module';
import { GooglePlacesService } from '../src/modules/external-integrations/google-places/google-places.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

async function bootstrap(): Promise<void> {
  const placeId = process.argv[2];
  if (!placeId) {
    console.error(
      'Usage: yarn ts-node -r tsconfig-paths/register scripts/probe-google-place.ts <placeId>',
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(GooglePlacesModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);

  try {
    const service = app.get(GooglePlacesService);
    const result = await service.getPlaceDetails(placeId, {
      includeRaw: true,
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    Logger.error(
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error.stack : undefined,
      'ProbeGooglePlace',
    );
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

bootstrap();
