/**
 * Curated-list → ListDetail adapters: dish rows speak the REAL connection
 * vocabulary — the id is a build fact stored on the curated row. No synthetic
 * ids exist anywhere: a legacy row without one is DROPPED, never faked.
 */
import { mapCuratedDetailToSearchResponse } from './curated-list-adapter';
import type { CuratedListDetailResponse } from './home';

const detail = (items: CuratedListDetailResponse['items']): CuratedListDetailResponse => ({
  listId: 'list-1',
  title: 'Best dishes',
  subtitle: null,
  iconKey: 'dish',
  listType: 'dish',
  recipeKey: 'dish_best:x',
  rotationKey: '2026-07-26',
  scope: 'global',
  city: { placeId: 'p-1', name: 'Austin' },
  itemCount: items.length,
  builtAt: '2026-07-26T00:00:00Z',
  viewerRole: 'viewer',
  items,
});

const item = (
  overrides: Partial<CuratedListDetailResponse['items'][number]>
): CuratedListDetailResponse['items'][number] => ({
  rank: 1,
  entityId: 'food-1',
  placeId: 'rest-1',
  connectionId: null,
  label: 'Breakfast Taco',
  subLabel: 'Taco Haus',
  latitude: 30.3,
  longitude: -97.7,
  craveScore: 9.5,
  craveScoreExact: 0.99,
  rising: null,
  ...overrides,
});

describe('curated-list-adapter — connectionId consumption on dish rows', () => {
  it('the stored build-time connectionId becomes the row connectionId AND score subject', () => {
    const response = mapCuratedDetailToSearchResponse(detail([item({ connectionId: 'conn-1' })]));
    expect(response.dishes[0].connectionId).toBe('conn-1');
    expect(response.dishes[0].scoreSubjectId).toBe('conn-1');
  });

  it('a legacy dish row without a connectionId is DROPPED from the projection, never given a fake id', () => {
    const response = mapCuratedDetailToSearchResponse(
      detail([item({ connectionId: 'conn-1' }), item({ rank: 2, connectionId: null })])
    );
    expect(response.dishes).toHaveLength(1);
    expect(response.dishes[0].connectionId).toBe('conn-1');
  });
});
