/**
 * HOME surface reads (plans/home-surface-charter.md): the shelves feed and
 * the curated-list detail. Auth posture mirrors polls/places: ClerkAuthGuard
 * on the controller, default rate tier per read.
 */
import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { CurrentUser } from '../../shared';
import { RateLimitTier } from '../infrastructure/throttler/throttler.decorator';
import { HomeFeedQueryDto } from './dto/home-feed-query.dto';
import {
  CuratedListDetailResponse,
  HomeFeedResponse,
  HomeFeedService,
} from './home-feed.service';

@Controller('home')
@UseGuards(ClerkAuthGuard)
export class HomeController {
  constructor(private readonly homeFeed: HomeFeedService) {}

  @Get('feed')
  @RateLimitTier('default')
  getFeed(
    @CurrentUser() user: User,
    @Query() query: HomeFeedQueryDto,
  ): Promise<HomeFeedResponse> {
    if (query.minLat > query.maxLat) {
      // Latitude is not circular — this shape is malformed, not wrap.
      throw new BadRequestException('minLat must be <= maxLat');
    }
    return this.homeFeed.getFeed(
      query.toBbox(),
      user.userId,
      query.pickedCityId,
    );
  }

  @Get('lists/:listId')
  @RateLimitTier('default')
  getList(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
  ): Promise<CuratedListDetailResponse> {
    return this.homeFeed.getListDetail(listId, user.userId);
  }

  /** Save-a-copy (list-detail verbs leg): copy the curated list's current items
   *  into a new favorites list owned by the caller. */
  @Post('lists/:listId/save')
  @RateLimitTier('default')
  saveList(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
  ): Promise<{ listId: string; name: string; itemCount: number }> {
    return this.homeFeed.saveListToUserLists(listId, user.userId);
  }
}
