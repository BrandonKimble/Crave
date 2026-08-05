/**
 * Favorites-as-kind save-sheet model + heart verb dispatch.
 * RED-provable law: the Favorites option dispatches the heart route
 * (POST /favorites/lists/favorites/items), NEVER the generic add-item route;
 * hearting toggles via the heart routes only.
 */
import { buildSaveListRows, dispatchSaveForRow, FAVORITES_ROW_ID } from './save-list-model';
import { isEntityFavorited, runHeartToggle } from '../../hooks/use-favorite-heart';
import { userListsService, type UserListSummary } from '../../services/user-lists';
import { resetSavedMembershipQueue } from '../../store/saved-membership-store';

// F830: the mock must cover EVERY method this spec's import graph can reach,
// not only the ones it calls directly. `use-favorite-heart` pulls in the saved-
// membership store, whose 50ms batch flush calls `batchMemberships`; omitting it
// crashed the jest worker after teardown while the run still printed green.
jest.mock('../../services/user-lists', () => ({
  userListsService: {
    addItem: jest.fn().mockResolvedValue({}),
    addFavoriteItem: jest.fn().mockResolvedValue({}),
    removeFavoriteItem: jest.fn().mockResolvedValue(undefined),
    batchMemberships: jest
      .fn()
      .mockResolvedValue({ savedRestaurantIds: [], savedConnectionIds: [] }),
  },
}));

// …and the timer itself is disarmed, so nothing at all runs after teardown.
afterEach(() => {
  resetSavedMembershipQueue();
});

const summary = (overrides: Partial<UserListSummary>): UserListSummary => ({
  listId: 'list-1',
  name: 'Tacos',
  description: null,
  listType: 'restaurant',
  visibility: 'private',
  kind: 'standard',
  itemCount: 3,
  position: 1,
  systemKind: null,
  shareEnabled: false,
  updatedAt: '2026-07-20T00:00:00Z',
  previewItems: [],
  ...overrides,
});

describe('buildSaveListRows (plus/save modal model)', () => {
  it('offers Favorites FIRST even when no favorites-kind list exists yet', () => {
    const rows = buildSaveListRows([summary({ listId: 'a' }), summary({ listId: 'b' })]);
    expect(rows[0]).toMatchObject({
      rowId: FAVORITES_ROW_ID,
      variant: 'favorites',
      name: 'Favorites',
      itemCount: null,
      list: null,
    });
    expect(rows.map((row) => row.rowId)).toEqual([FAVORITES_ROW_ID, 'a', 'b']);
  });

  it('offers Favorites first with ZERO lists (empty account)', () => {
    const rows = buildSaveListRows([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].variant).toBe('favorites');
  });

  it('materializes the favorites row from the kind=favorites summary and dedupes it', () => {
    const favorites = summary({
      listId: 'fav-1',
      name: 'Favorites',
      kind: 'favorites',
      itemCount: 7,
    });
    const rows = buildSaveListRows([summary({ listId: 'a' }), favorites, summary({ listId: 'b' })]);
    expect(rows[0]).toMatchObject({ rowId: FAVORITES_ROW_ID, itemCount: 7, list: favorites });
    expect(rows.map((row) => row.rowId)).toEqual([FAVORITES_ROW_ID, 'a', 'b']);
  });
});

describe('dispatchSaveForRow (heart route vs generic add-item)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('the Favorites row dispatches the heart route, never the generic add-item', async () => {
    await dispatchSaveForRow(FAVORITES_ROW_ID, { restaurantId: 'r-1', locationId: 'l-1' });
    expect(userListsService.addFavoriteItem).toHaveBeenCalledWith({
      restaurantId: 'r-1',
      locationId: 'l-1',
    });
    expect(userListsService.addItem).not.toHaveBeenCalled();
  });

  it('a regular list row dispatches the generic add-item, never the heart route', async () => {
    await dispatchSaveForRow('list-9', { connectionId: 'c-1', note: 'yum' });
    expect(userListsService.addItem).toHaveBeenCalledWith('list-9', {
      connectionId: 'c-1',
      note: 'yum',
    });
    expect(userListsService.addFavoriteItem).not.toHaveBeenCalled();
  });
});

describe('runHeartToggle (one-tap heart verb)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('heart on an unhearted restaurant POSTs the favorites heart route only', async () => {
    const result = await runHeartToggle({
      isFavorite: false,
      target: { restaurantId: 'r-1', locationId: 'l-1' },
    });
    expect(result).toBe('added');
    expect(userListsService.addFavoriteItem).toHaveBeenCalledWith({
      restaurantId: 'r-1',
      locationId: 'l-1',
    });
    expect(userListsService.addItem).not.toHaveBeenCalled();
    expect(userListsService.removeFavoriteItem).not.toHaveBeenCalled();
  });

  it('unheart DELETEs via the favorites heart route with the bare selector', async () => {
    const result = await runHeartToggle({
      isFavorite: true,
      target: { restaurantId: 'r-1', locationId: 'l-1' },
    });
    expect(result).toBe('removed');
    expect(userListsService.removeFavoriteItem).toHaveBeenCalledWith({ restaurantId: 'r-1' });
    expect(userListsService.addFavoriteItem).not.toHaveBeenCalled();
  });

  it('dish hearts ride the connection selector', async () => {
    await runHeartToggle({ isFavorite: false, target: { connectionId: 'c-2' } });
    expect(userListsService.addFavoriteItem).toHaveBeenCalledWith({
      connectionId: 'c-2',
      locationId: undefined,
    });
  });
});

describe('isEntityFavorited', () => {
  it('is true only when a kind=favorites membership exists', () => {
    expect(isEntityFavorited(undefined)).toBe(false);
    expect(
      isEntityFavorited([
        {
          itemId: 'i',
          listId: 'l',
          listName: 'Been',
          listType: 'restaurant',
          kind: 'been',
          systemKind: 'been',
          note: null,
        },
      ])
    ).toBe(false);
    expect(
      isEntityFavorited([
        {
          itemId: 'i',
          listId: 'l',
          listName: 'Favorites',
          listType: 'restaurant',
          kind: 'favorites',
          systemKind: 'favorites',
          note: null,
        },
      ])
    ).toBe(true);
  });
});
