import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { CurrentUser } from '../../shared';
import { HistoryService } from './history.service';
import type { RestaurantStatusPreviewDto } from '../search/dto/restaurant-status-preview.dto';
import { RecordRestaurantViewDto } from './dto/record-restaurant-view.dto';
import { RecordFoodViewDto } from './dto/record-food-view.dto';
import { ListRestaurantViewsDto } from './dto/list-restaurant-views.dto';
import { ListFoodViewsDto } from './dto/list-food-views.dto';

@Controller('history')
@UseGuards(ClerkAuthGuard)
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Post('restaurants/viewed')
  async recordRestaurantView(
    @Body() dto: RecordRestaurantViewDto,
    @CurrentUser() user: User,
  ): Promise<{ status: 'ok' }> {
    await this.historyService.recordRestaurantView(user.userId, dto);
    return { status: 'ok' };
  }

  @Post('foods/viewed')
  async recordFoodView(
    @Body() dto: RecordFoodViewDto,
    @CurrentUser() user: User,
  ): Promise<{ status: 'ok' }> {
    await this.historyService.recordFoodView(user.userId, dto);
    return { status: 'ok' };
  }

  @Get('restaurants/viewed')
  listRecentlyViewedRestaurants(
    @Query() query: ListRestaurantViewsDto,
    @CurrentUser() user: User,
  ): Promise<
    Array<{
      restaurantId: string;
      restaurantName: string;
      city?: string | null;
      region?: string | null;
      lastViewedAt: Date;
      viewCount: number;
      statusPreview?: RestaurantStatusPreviewDto | null;
    }>
  > {
    return this.historyService.listRecentlyViewedRestaurants(
      user.userId,
      query,
    );
  }

  @Get('foods/viewed')
  listRecentlyViewedFoods(
    @Query() query: ListFoodViewsDto,
    @CurrentUser() user: User,
  ): Promise<
    Array<{
      connectionId: string;
      foodId: string;
      foodName: string;
      restaurantId: string;
      restaurantName: string;
      lastViewedAt: Date;
      viewCount: number;
      statusPreview?: RestaurantStatusPreviewDto | null;
    }>
  > {
    return this.historyService.listRecentlyViewedFoods(user.userId, query);
  }
}
