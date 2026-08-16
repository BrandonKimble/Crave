import { userListsService, type UserListSummary } from '../../services/user-lists';
import { useSavedMembershipStore } from '../../store/saved-membership-store';

/**
 * Save-sheet row model (Favorites-as-kind, Spotify Liked-Songs shape):
 * the sheet ALWAYS offers a permanent "Favorites" option first — even when no
 * favorites-kind list exists yet (the server lazily creates it on first
 * heart). Selecting it dispatches the heart route
 * (POST /favorites/lists/favorites/items), NEVER the generic add-item route.
 * Every other list keeps the generic listId add.
 */

export const FAVORITES_ROW_ID = '__favorites__';

export type SaveListRowModel =
  | {
      rowId: typeof FAVORITES_ROW_ID;
      variant: 'favorites';
      name: 'Favorites';
      /** Item count when the favorites list already exists; null pre-creation. */
      itemCount: number | null;
      list: UserListSummary | null;
    }
  | {
      rowId: string;
      variant: 'list';
      name: string;
      itemCount: number;
      list: UserListSummary;
    };

/**
 * Build the sheet's rows from the server summaries: Favorites pinned FIRST
 * (materialized from the kind='favorites' summary when present, synthesized
 * when absent), then the remaining lists in server order.
 */
export const buildSaveListRows = (lists: UserListSummary[]): SaveListRowModel[] => {
  const favoritesList = lists.find((list) => list.kind === 'favorites') ?? null;
  const rows: SaveListRowModel[] = [
    {
      rowId: FAVORITES_ROW_ID,
      variant: 'favorites',
      name: 'Favorites',
      itemCount: favoritesList ? favoritesList.itemCount : null,
      list: favoritesList,
    },
  ];
  for (const list of lists) {
    if (list.kind === 'favorites') {
      continue;
    }
    rows.push({
      rowId: list.listId,
      variant: 'list',
      name: list.name,
      itemCount: list.itemCount,
      list,
    });
  }
  return rows;
};

export type SaveTargetPayload = {
  placeId?: string;
  connectionId?: string;
  locationId?: string;
  note?: string;
};

/**
 * Dispatch a save for a selected row: the favorites row rides the heart route
 * (server ensures the kind list), any other row rides the generic add-item.
 */
export const dispatchSaveForRow = async (
  selectedRowId: string,
  payload: SaveTargetPayload
): Promise<unknown> => {
  const result =
    selectedRowId === FAVORITES_ROW_ID
      ? await userListsService.addFavoriteItem(payload)
      : await userListsService.addItem(selectedRowId, payload);
  // Plus/saved pill coherence: a successful save marks the target saved
  // everywhere it renders (the batched-membership store's mutation seam).
  if (payload.placeId) {
    useSavedMembershipStore.getState().markSaved('restaurant', payload.placeId);
  } else if (payload.connectionId) {
    useSavedMembershipStore.getState().markSaved('connection', payload.connectionId);
  }
  return result;
};
