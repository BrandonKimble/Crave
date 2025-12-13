import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { CurrentUser } from '../../shared';
import { FavoritesService } from './favorites.service';
import { CreateFavoriteDto } from './dto/create-favorite.dto';

@Controller('favorites')
@UseGuards(ClerkAuthGuard)
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.favoritesService.listForUser(user.userId);
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
