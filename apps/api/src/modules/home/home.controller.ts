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
import { RecordsSignal } from '../signals/records-signal.decorator';

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
   *  into a new list owned by the caller. */
  @Post('lists/:listId/save')
  // D36/F690: this declaration was PRESENT, PLAUSIBLE AND FALSE — it claimed
  // the copy recorded 'favorite_added' "via UserListsService" while the
  // service wrote user_list_items directly and injected no such dependency,
  // so a save-a-copy was a save the demand ledger never heard. The copy now
  // really does go through UserListsService.addItem, one act per copied item,
  // which is what @RecordsSignal asserts here.
  @RecordsSignal('favorite_added')
  @RateLimitTier('default')
  saveList(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
  ): Promise<{ listId: string; name: string; itemCount: number }> {
    return this.homeFeed.saveListToUserLists(listId, user.userId);
  }
}
