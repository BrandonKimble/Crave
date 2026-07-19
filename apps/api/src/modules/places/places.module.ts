/**
 * Place Catalog module (plans/geo-demand-foundation-rebuild.md §1/§2) — the
 * places containment DAG + the background naming reconciler. This module is
 * the go-forward geography surface; src/modules/markets/ is the superseded
 * market model (§20) and nothing here may depend on it.
 */
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedModule } from '../../shared/shared.module';
import { PlacesCatalogService } from './places-catalog.service';
import { PlacesReconcilerService } from './places-reconciler.service';
import {
  TOMTOM_CHAIN_PROBE,
  TomtomChainProbeNotWiredAdapter,
} from './tomtom-chain-probe.port';

@Module({
  imports: [PrismaModule, SharedModule],
  providers: [
    PlacesCatalogService,
    PlacesReconcilerService,
    // TODO(Phase-B cutover): swap in the real governed TomTom adapter
    // (reverse geocode + once-ever forward geocode per unknown node, drawing
    // on the cheap pool per §14/§22). The not-wired stub keeps the reconciler
    // inert-but-safe: noteViewport() logs and self-heals, never throws.
    {
      provide: TOMTOM_CHAIN_PROBE,
      useClass: TomtomChainProbeNotWiredAdapter,
    },
  ],
  exports: [PlacesCatalogService, PlacesReconcilerService],
})
export class PlacesModule {}
