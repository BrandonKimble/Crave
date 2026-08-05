import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

/**
 * PATCH /favorites/lists/:listId/items/order — batch drag-save reorder
 * (w1-listdetail spec B.1.4). Must be a DUPLICATE-FREE SUBSET of the
 * current membership, not exact set equality: clients order from
 * executor-backed rows, which silently drop score-less/un-geocoded items,
 * so demanding strict equality bricked those lists. Items omitted here
 * keep their relative order and are appended after the ordered ones (see
 * UserListsService.reorderItems).
 */
export class ReorderUserListItemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  orderedItemIds!: string[];
}
