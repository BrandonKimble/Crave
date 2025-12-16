import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class RecordRestaurantViewDto {
  @IsUUID()
  restaurantId!: string;

  @IsOptional()
  @IsUUID()
  searchRequestId?: string;

  @IsOptional()
  @IsString()
  @IsIn([
    'search_suggestion',
    'results_sheet',
    'auto_open_single_candidate',
    'autocomplete',
  ])
  source?: string;
}
