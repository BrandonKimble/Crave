import { Controller, Get, Param } from '@nestjs/common';
import { FavoriteListsService } from './favorite-lists.service';

@Controller('favorites/lists/share')
export class FavoritesShareController {
  constructor(private readonly favoriteListsService: FavoriteListsService) {}

  @Get(':shareSlug')
  async getSharedList(@Param('shareSlug') shareSlug: string) {
    return this.favoriteListsService.getSharedList(shareSlug);
  }
}
