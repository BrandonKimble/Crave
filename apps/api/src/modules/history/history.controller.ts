import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { CurrentUser } from '../../shared';
import { HistoryService } from './history.service';
import { RecordPlaceViewDto } from './dto/record-restaurant-view.dto';
import { RecordItemViewDto } from './dto/record-food-view.dto';
import { ListPlaceViewsDto } from './dto/list-restaurant-views.dto';
import { ListItemViewsDto } from './dto/list-food-views.dto';
import { RecordsSignal } from '../signals/records-signal.decorator';

@Controller('history')
@UseGuards(ClerkAuthGuard)
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Post('places/viewed')
  @RecordsSignal('entity_view')
  async recordPlaceView(
    @Body() dto: RecordPlaceViewDto,
    @CurrentUser() user: User,
  ): Promise<{ status: 'ok' }> {
    await this.historyService.recordPlaceView(user.userId, dto);
    return { status: 'ok' };
  }

  @Post('items/viewed')
  @RecordsSignal('entity_view')
  async recordItemView(
    @Body() dto: RecordItemViewDto,
    @CurrentUser() user: User,
  ): Promise<{ status: 'ok' }> {
    await this.historyService.recordItemView(user.userId, dto);
    return { status: 'ok' };
  }

  @Get('places/viewed')
  listRecentlyViewedPlaces(
    @Query() query: ListPlaceViewsDto,
    @CurrentUser() user: User,
    // F843 (2026-08-03): the return type DEFERS to the service instead of restating it.
    // Three hand-maintained mirrors of this one row shape existed — this controller, the
    // service, and mobile's `RecentlyViewedRestaurant` — and THIS one was already STALE: it
    // omitted `locationId` and `locationAddress`, which the service returns and mobile
    // consumes (the earned-address suggestion rides on them). A restated return type on a
    // pass-through method can only ever be a copy that rots; there is no third truth now.
    // STILL OWED (the finding's full fix): the row belongs in `packages/shared`, imported by
    // both sides, so the CLIENT copy cannot drift either — that is a cross-package move and
    // wants the same pass that does F842's request-DTO generation.
  ): ReturnType<HistoryService['listRecentlyViewedPlaces']> {
    return this.historyService.listRecentlyViewedPlaces(user.userId, query);
  }

  // F680 (2026-08-04): same drift as F843 above, same fix — the inline
  // return type here omitted `locationId`/`locationAddress` (the earned-
  // address suggestion), which the service returns and mobile consumes.
  // Deferring to the service's own type means there is only one truth.
  @Get('items/viewed')
  listRecentlyViewedItems(
    @Query() query: ListItemViewsDto,
    @CurrentUser() user: User,
  ): ReturnType<HistoryService['listRecentlyViewedItems']> {
    return this.historyService.listRecentlyViewedItems(user.userId, query);
  }
}
