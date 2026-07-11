import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

/**
 * PATCH /favorites/lists/:listId/items/order — batch drag-save reorder
 * (w1-listdetail spec B.1.4). Must be EXACTLY the current membership
 * (set equality is enforced server-side).
 */
export class ReorderFavoriteListItemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  orderedItemIds!: string[];
}
