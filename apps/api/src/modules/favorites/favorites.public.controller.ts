import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { FavoriteListsService } from './favorite-lists.service';
import { ListFavoriteListsDto } from './dto/list-favorite-lists.dto';

@Controller('users')
export class FavoritesPublicController {
  constructor(private readonly favoriteListsService: FavoriteListsService) {}

  @Get(':userId/favorites/lists')
  async listPublicLists(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: ListFavoriteListsDto,
  ) {
    return this.favoriteListsService.listPublicForUser(userId, query);
  }
}
