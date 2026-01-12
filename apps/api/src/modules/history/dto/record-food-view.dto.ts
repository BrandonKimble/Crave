import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class RecordFoodViewDto {
  @IsUUID()
  connectionId!: string;

  @IsOptional()
  @IsUUID()
  foodId?: string;

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
