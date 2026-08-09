import type { RestaurantResult } from '../../../types';
import { buildRestaurantResultCardDescriptor } from './restaurant-result-card-descriptor';

const buildRestaurant = (overrides: Partial<RestaurantResult> = {}): RestaurantResult => ({
  craveScore: 90,
  restaurantId: 'r1',
  restaurantName: 'Franklin Barbecue',
  scoreSubjectId: 'r1',
  scoreSubjectType: 'restaurant',
  topFood: [],
  totalDishCount: 0,
  ...overrides,
});

const buildDescriptor = (restaurant: RestaurantResult) =>
  buildRestaurantResultCardDescriptor({
    primaryFoodTerm: null,
    qualityColor: '#000000',
    rank: 1,
    restaurant,
  });

/**
 * F1019: the card used to render a dollar band looked up from a client-side
 * priceLevel -> "$25–$50" table. Nobody measured those numbers — they were rendered
 * next to real, observed facts (Google rating, hours, distance) and read as one of them.
 * The server already sends the REAL Google-observed range; when it doesn't, the honest
 * answer is the observed $-symbol, never an invented band.
 *
 * RED RECIPE: point `priceRangeLabel` back at a level-derived band renderer (the deleted
 * `getPriceRangeLabel`). Case (a) reds because the real range is discarded; case (b) reds
 * because '$$' becomes a fabricated '$25–$50'.
 */
describe('restaurant result card price label', () => {
  it('renders the REAL server-observed price range when present', () => {
    const descriptor = buildDescriptor(
      buildRestaurant({ priceLevel: 2, priceRangeText: '$10–20', priceSymbol: '$$' })
    );

    expect(descriptor.priceRangeLabel).toBe('$10–20');
  });

  it('falls back to the observed $-symbol, never an invented dollar band', () => {
    const descriptor = buildDescriptor(buildRestaurant({ priceLevel: 2, priceRangeText: null }));

    expect(descriptor.priceRangeLabel).toBe('$$');
  });

  it('shows nothing at all when the restaurant carries no price signal', () => {
    const descriptor = buildDescriptor(buildRestaurant({ priceLevel: null, priceRangeText: null }));

    expect(descriptor.priceRangeLabel).toBeNull();
  });
});
