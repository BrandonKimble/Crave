import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { GooglePlacesModule } from '../src/modules/external-integrations/google-places/google-places.module';
import { GooglePlacesService } from '../src/modules/external-integrations/google-places/google-places.service';

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
