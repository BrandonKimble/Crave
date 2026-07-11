import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * POST /favorites/lists/:listId/collaborators/join — the invite IS the share
 * slug presented with intent (w1-listdetail spec B.1.3).
 */
export class JoinFavoriteListCollaboratorsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  shareSlug!: string;
}
