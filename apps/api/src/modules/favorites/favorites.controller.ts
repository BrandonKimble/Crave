import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Patch,
  UseGuards,
  Query,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { CurrentUser } from '../../shared';
import { FavoritesService } from './favorites.service';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { FavoriteListsService } from './favorite-lists.service';
import { CreateFavoriteListDto } from './dto/create-favorite-list.dto';
import { UpdateFavoriteListDto } from './dto/update-favorite-list.dto';
import { AddFavoriteListItemDto } from './dto/add-favorite-list-item.dto';
import { UpdateFavoriteListPositionDto } from './dto/update-favorite-list-position.dto';
import { UpdateFavoriteListItemDto } from './dto/update-favorite-list-item.dto';
import { ShareFavoriteListDto } from './dto/share-favorite-list.dto';
import { ListFavoriteListsDto } from './dto/list-favorite-lists.dto';

@Controller('favorites')
@UseGuards(ClerkAuthGuard)
export class FavoritesController {
  constructor(
    private readonly favoritesService: FavoritesService,
    private readonly favoriteListsService: FavoriteListsService,
  ) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.favoritesService.listForUser(user.userId);
  }

  @Get('lists')
  listLists(@CurrentUser() user: User, @Query() query: ListFavoriteListsDto) {
    return this.favoriteListsService.listForUser(user.userId, query);
  }

  @Post('lists')
  createList(@CurrentUser() user: User, @Body() dto: CreateFavoriteListDto) {
    return this.favoriteListsService.createList(user.userId, dto);
  }

  @Get('lists/:listId')
  getList(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
  ) {
    return this.favoriteListsService.getListForUser(user.userId, listId);
  }

  @Patch('lists/:listId')
  updateList(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: UpdateFavoriteListDto,
  ) {
    return this.favoriteListsService.updateList(user.userId, listId, dto);
  }

  @Patch('lists/:listId/position')
  updateListPosition(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: UpdateFavoriteListPositionDto,
  ) {
    return this.favoriteListsService.updateListPosition(
      user.userId,
      listId,
      dto.position,
    );
  }

  @Post('lists/:listId/items')
  addListItem(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: AddFavoriteListItemDto,
  ) {
    return this.favoriteListsService.addItem(user.userId, listId, dto);
  }

  @Patch('lists/:listId/items/:itemId')
  updateListItemPosition(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateFavoriteListItemDto,
  ) {
    return this.favoriteListsService.updateItemPosition(
      user.userId,
      listId,
      itemId,
      dto.position,
    );
  }

  @Delete('lists/:listId/items/:itemId')
  @HttpCode(204)
  removeListItem(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.favoriteListsService.removeItem(user.userId, listId, itemId);
  }

  @Post('lists/:listId/share')
  enableShare(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: ShareFavoriteListDto,
  ) {
    return this.favoriteListsService.enableShare(user.userId, listId, dto);
  }

  @Delete('lists/:listId/share')
  @HttpCode(204)
  disableShare(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
  ) {
    return this.favoriteListsService.disableShare(user.userId, listId);
  }

  @Delete('lists/:listId')
  @HttpCode(204)
  removeList(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
  ) {
    return this.favoriteListsService.deleteList(user.userId, listId);
  }

  @Post()
  addFavorite(@CurrentUser() user: User, @Body() dto: CreateFavoriteDto) {
    return this.favoritesService.addFavorite(user.userId, dto);
  }

  @Delete('entity/:entityId')
  @HttpCode(204)
  removeFavoriteByEntityId(
    @CurrentUser() user: User,
    @Param('entityId', ParseUUIDPipe) entityId: string,
  ) {
    return this.favoritesService.removeFavoriteByEntityId(
      user.userId,
      entityId,
    );
  }

  @Delete(':favoriteId')
  @HttpCode(204)
  removeFavorite(
    @CurrentUser() user: User,
    @Param('favoriteId') favoriteId: string,
  ) {
    return this.favoritesService.removeFavorite(user.userId, favoriteId);
  }
}
