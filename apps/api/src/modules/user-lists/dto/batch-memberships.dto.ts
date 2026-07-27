import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';

/**
 * POST /lists/memberships — ONE batched "is it saved anywhere?" read for a
 * screenful of result cards (plus/saved pill state). Per-row reads would be
 * dishonest jank; this is the single round-trip the card surfaces share.
 */
export class BatchMembershipsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  restaurantIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  connectionIds?: string[];
}
