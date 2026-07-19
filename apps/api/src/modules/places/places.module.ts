/**
 * Place Catalog module (plans/geo-demand-foundation-rebuild.md §1/§2) — the
 * places containment DAG + the background naming reconciler. This module is
 * the go-forward geography surface; src/modules/markets/ is the superseded
 * market model (§20) and nothing here may depend on it.
 */
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedModule } from '../../shared/shared.module';
import { PlacesCatalogService } from './places-catalog.service';
import { PlacesReconcilerService } from './places-reconciler.service';
import { TomtomChainProbeAdapter } from './tomtom-chain-probe.adapter';
import { TOMTOM_CHAIN_PROBE } from './tomtom-chain-probe.port';

@Module({
  imports: [PrismaModule, SharedModule, HttpModule],
  providers: [
    PlacesCatalogService,
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
  ],
  exports: [PlacesCatalogService, PlacesReconcilerService],
})
export class PlacesModule {}
