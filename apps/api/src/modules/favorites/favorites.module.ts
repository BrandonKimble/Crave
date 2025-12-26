import { Module } from '@nestjs/common';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';
import { FavoriteListsService } from './favorite-lists.service';
import { FavoritesPublicController } from './favorites.public.controller';
import { FavoritesShareController } from './favorites.share.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedModule } from '../../shared/shared.module';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [PrismaModule, SharedModule, IdentityModule],
  controllers: [
    FavoritesController,
    FavoritesPublicController,
    FavoritesShareController,
  ],
  providers: [FavoritesService, FavoriteListsService],
})
export class FavoritesModule {}
