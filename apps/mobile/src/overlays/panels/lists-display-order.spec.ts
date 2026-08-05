/**
 * F1472: pinned-favorites display ordering. Split out of save-list-model.spec.ts,
 * which pinned this module's behavior under a filename naming a different module —
 * a spec is named for the module it pins.
 */
import { sortListsForDisplay } from './lists-display-order';
import type { UserListSummary } from '../../services/user-lists';

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

describe('sortListsForDisplay (lists page pinned favorites)', () => {
  const lists = [
    summary({ listId: 'a', position: 1, updatedAt: '2026-07-25T00:00:00Z' }),
    summary({
      listId: 'been',
      kind: 'been',
      systemKind: 'been',
      position: 2,
      updatedAt: '2026-07-24T00:00:00Z',
    }),
    summary({ listId: 'fav', kind: 'favorites', position: 3, updatedAt: '2026-07-01T00:00:00Z' }),
  ];

  it('pins the favorites-kind list first under recent sort', () => {
    expect(sortListsForDisplay(lists, 'recent').map((l: UserListSummary) => l.listId)).toEqual([
      'fav',
      'a',
      'been',
    ]);
  });

  it('pins the favorites-kind list first under custom sort', () => {
    expect(sortListsForDisplay(lists, 'custom').map((l: UserListSummary) => l.listId)).toEqual([
      'fav',
      'a',
      'been',
    ]);
  });

  it('keeps the uniform ordering when no favorites-kind list exists', () => {
    expect(
      sortListsForDisplay(lists.slice(0, 2), 'custom').map((l: UserListSummary) => l.listId)
    ).toEqual(['a', 'been']);
  });
});
