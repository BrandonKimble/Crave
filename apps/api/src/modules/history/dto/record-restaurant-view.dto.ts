import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class RecordRestaurantViewDto {
  @IsUUID()
  restaurantId!: string;

  /** Optional viewed location — pins the §3 entity_view signal's geo to the
   *  exact location instead of the restaurant's primary one. */
  @IsOptional()
  @IsUUID()
  locationId?: string;

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
