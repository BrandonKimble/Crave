/**
 * Place Catalog module (plans/geo-demand-foundation-rebuild.md §1/§2) — the
 * places containment DAG + the background naming reconciler. This module is
 * the go-forward geography surface (the legacy market model died in the
 * markets-extermination legs, 2026-07; §20 changelog).
 */
import { HttpModule } from '@nestjs/axios';
import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedModule } from '../../shared/shared.module';
import { IdentityModule } from '../identity/identity.module';
import {
  PLACE_BIRTH_LISTENER,
  PlacesCatalogService,
} from './places-catalog.service';
import { IpLocationService } from './ip-location.service';
import { LaunchPositionController } from './launch-position.controller';
import { PlacesController } from './places.controller';
import { PlacesPromotionService } from './places-promotion.service';
import { PlacesReconcilerService } from './places-reconciler.service';
import { TomtomChainProbeAdapter } from './tomtom-chain-probe.adapter';
import { TOMTOM_CHAIN_PROBE } from './tomtom-chain-probe.port';

@Module({
  // forwardRef: IdentityModule reaches back here via NotificationsModule →
  // PlacesModule (home-place targeting) — same loop notifications.module
  // already breaks with forwardRef on its Identity import.
  imports: [
    PrismaModule,
    SharedModule,
    HttpModule,
    forwardRef(() => IdentityModule),
  ],
  controllers: [PlacesController, LaunchPositionController],
  providers: [
    IpLocationService,
    PlacesCatalogService,
    PlacesPromotionService,
    PlacesReconcilerService,
    // The real governed adapter (§2 sketch mechanics on the cheap pool).
    // Pool denials and config faults THROW — the reconciler logs and skips,
    // and crucially does NOT write a negative observation for ground the
    // vendor was never actually asked about (only an empty CHAIN means
    // "no place here").
    {
      provide: TOMTOM_CHAIN_PROBE,
      useClass: TomtomChainProbeAdapter,
    },
    // §2.5(d) polygon at birth: the catalog's create chokepoint enqueues
    // every new place into the promotion queue through this token (a token,
    // not a class dep, because promotion → probe port → catalog types is a
    // module-level import cycle).
    {
      provide: PLACE_BIRTH_LISTENER,
      useExisting: PlacesPromotionService,
    },
  ],
  exports: [
    PlacesCatalogService,
    PlacesPromotionService,
    PlacesReconcilerService,
  ],
})
export class PlacesModule {}
