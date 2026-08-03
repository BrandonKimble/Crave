import { Module } from '@nestjs/common';
import { UserListsController } from './user-lists.controller';
import { UserListsService } from './user-lists.service';
import { UserListAccessModule } from './user-list-access.module';
import { ListResultsAssembler } from './user-list-results.assembler';
import { UserListMapper } from './user-list.mappers';
import { UserListsPublicController } from './user-lists.public.controller';
import { UserListsShareController } from './user-lists.share.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedModule } from '../../shared/shared.module';
import { IdentityModule } from '../identity/identity.module';
import { SearchModule } from '../search/search.module';
import { PhotosModule } from '../photos/photos.module';
import { SignalsModule } from '../signals/signals.module';
import { UserListTileGalleryService } from './user-list-tile-gallery.service';

@Module({
  imports: [
    PrismaModule,
    SharedModule,
    IdentityModule,
    SearchModule,
    PhotosModule,
    SignalsModule,
    UserListAccessModule,
  ],
  controllers: [
    UserListsController,
    UserListsPublicController,
    UserListsShareController,
  ],
  providers: [
    UserListsService,
    ListResultsAssembler,
    UserListMapper,
    UserListTileGalleryService,
  ],
})
export class UserListsModule {}
