/**
 * HOME surface module (plans/home-surface-charter.md): app-curated lists —
 * the worker-side builder (materializes per live city on the recipe
 * cadences) and the api-side feed/detail reads. Viewport resolution rides
 * the shared ViewportVerdictService from PlacesModule (one law, never
 * forked).
 */
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedModule } from '../../shared/shared.module';
import { IdentityModule } from '../identity/identity.module';
import { PlacesModule } from '../places/places.module';
import { CuratedListBuilderService } from './curated-list-builder.service';
import { HomeController } from './home.controller';
import { HomeFeedService } from './home-feed.service';

@Module({
  imports: [PrismaModule, SharedModule, IdentityModule, PlacesModule],
  controllers: [HomeController],
  providers: [CuratedListBuilderService, HomeFeedService],
  exports: [CuratedListBuilderService, HomeFeedService],
})
export class HomeModule {}
