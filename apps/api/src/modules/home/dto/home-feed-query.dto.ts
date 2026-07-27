import { IsOptional, IsUUID } from 'class-validator';
import { PlacesInViewQueryDto } from '../../places/dto/places-in-view.dto';

/**
 * GET /home/feed query: the viewport bbox PLUS the optional explicit
 * pick-a-city intent. The pick is a SOFT FALLBACK only — the server's
 * viewport verdict wins whenever it honestly resolves a live city (see
 * HomeFeedService.getFeed).
 */
export class HomeFeedQueryDto extends PlacesInViewQueryDto {
  @IsOptional()
  @IsUUID()
  pickedCityId?: string;
}
