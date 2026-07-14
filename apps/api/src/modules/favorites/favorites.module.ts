import { Module } from '@nestjs/common';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';
import { FavoriteListsService } from './favorite-lists.service';
import { FavoriteListAccessPolicy } from './favorite-list-access.policy';
import { ListResultsAssembler } from './favorite-list-results.assembler';
import { FavoriteListMapper } from './favorite-list.mappers';
import { FavoritesPublicController } from './favorites.public.controller';
import { FavoritesShareController } from './favorites.share.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedModule } from '../../shared/shared.module';
import { IdentityModule } from '../identity/identity.module';
import { SearchModule } from '../search/search.module';
import { PhotosModule } from '../photos/photos.module';
import { FavoriteListTileGalleryService } from './favorite-list-tile-gallery.service';

@Module({
  imports: [
    PrismaModule,
    SharedModule,
    IdentityModule,
    SearchModule,
    PhotosModule,
  ],
  controllers: [
    FavoritesController,
    FavoritesPublicController,
    FavoritesShareController,
  ],
  providers: [
    FavoritesService,
    FavoriteListsService,
    FavoriteListAccessPolicy,
    ListResultsAssembler,
    FavoriteListMapper,
    FavoriteListTileGalleryService,
  ],
})
export class FavoritesModule {}
