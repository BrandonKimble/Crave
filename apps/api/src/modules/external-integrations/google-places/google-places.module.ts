import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from '../../../shared/shared.module';
import { SharedServicesModule } from '../shared/shared-services.module';
import { GooglePlacesService } from './google-places.service';

@Module({
  imports: [
    SharedModule,
    SharedServicesModule,
    ConfigModule,
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
  ],
  providers: [GooglePlacesService],
  // SECURITY (final-final red team BLOCKER 1): the dev probe controller was
  // UNAUTHENTICATED in prod — an unmetered Places spend faucet (~$150/hr/IP
  // via the Enterprise+Atmosphere field mask, no campaign id, IP-tier
  // throttle only). Zero callers existed; deleted, not gated.
  exports: [GooglePlacesService],
})
export class GooglePlacesModule {}
