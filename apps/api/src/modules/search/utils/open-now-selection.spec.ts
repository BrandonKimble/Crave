import {
  selectOpenNowRestaurantPage,
  type OpenNowCandidate,
} from './open-now-selection';

// RED-provable coverage for the open-now filter-before-paginate seam. The load-bearing
// case is `filters before it paginates` — it directly fails a filter-after-limit regression
// (the exact bug: paginate to the top-20-by-score, then filter, yields nothing when the open
// spots rank below the page).

const closed = (id: string): OpenNowCandidate => ({
  restaurantId: id,
  isOpen: false,
});
const open = (id: string): OpenNowCandidate => ({
  restaurantId: id,
  isOpen: true,
});
const unsupported = (id: string): OpenNowCandidate => ({
  restaurantId: id,
  isOpen: null,
});

describe('selectOpenNowRestaurantPage', () => {
  it('filters before it paginates: open spots ranked below page 1 still surface', () => {
    // 20 closed at ranks 1..20, then 5 open at ranks 21..25 — exactly the midnight
    // "best restaurants closed, late-night bars open" shape that produced 22 pins / 1 card.
    const candidates: OpenNowCandidate[] = [
      ...Array.from({ length: 20 }, (_, i) => closed(`closed-${i + 1}`)),
      ...Array.from({ length: 5 }, (_, i) => open(`open-${i + 1}`)),
    ];

    const result = selectOpenNowRestaurantPage(candidates, {
      skip: 0,
      take: 20,
    });

    // A filter-AFTER-limit implementation would return [] here (page 1 = 20 closed → 0 open).
    expect(result.pageIds).toEqual([
      'open-1',
      'open-2',
      'open-3',
      'open-4',
      'open-5',
    ]);
    expect(result.total).toBe(5);
    expect(result.supportedCount).toBe(25);
  });

  it('preserves the incoming rank order of open candidates', () => {
    const candidates: OpenNowCandidate[] = [
      open('a'),
      closed('b'),
      open('c'),
      closed('d'),
      open('e'),
    ];

    const result = selectOpenNowRestaurantPage(candidates, {
      skip: 0,
      take: 10,
    });

    expect(result.openIds).toEqual(['a', 'c', 'e']);
    expect(result.pageIds).toEqual(['a', 'c', 'e']);
    expect(result.total).toBe(3);
  });

  it('paginates over the open subset (page 2 uses the true open total)', () => {
    const candidates: OpenNowCandidate[] = Array.from({ length: 25 }, (_, i) =>
      open(`open-${i + 1}`),
    );

    const page2 = selectOpenNowRestaurantPage(candidates, {
      skip: 20,
      take: 20,
    });

    expect(page2.pageIds).toEqual([
      'open-21',
      'open-22',
      'open-23',
      'open-24',
      'open-25',
    ]);
    expect(page2.total).toBe(25);
  });

  it('drops unsupported (no-hours) candidates and excludes them from the open set', () => {
    const candidates: OpenNowCandidate[] = [
      open('has-hours-open'),
      unsupported('no-hours'),
      closed('has-hours-closed'),
    ];

    const result = selectOpenNowRestaurantPage(candidates, {
      skip: 0,
      take: 10,
    });

    expect(result.pageIds).toEqual(['has-hours-open']);
    expect(result.total).toBe(1);
    // supportedCount counts only rows with hours data (open + closed), never the null row.
    expect(result.supportedCount).toBe(2);
  });

  it('signals graceful degradation when NO candidate carries hours (supportedCount 0)', () => {
    const candidates: OpenNowCandidate[] = [
      unsupported('x'),
      unsupported('y'),
      unsupported('z'),
    ];

    const result = selectOpenNowRestaurantPage(candidates, {
      skip: 0,
      take: 10,
    });

    expect(result.supportedCount).toBe(0);
    expect(result.total).toBe(0);
    expect(result.pageIds).toEqual([]);
  });

  it('deduplicates by restaurantId, counting a restaurant once', () => {
    const candidates: OpenNowCandidate[] = [
      open('dup'),
      open('dup'),
      open('other'),
    ];

    const result = selectOpenNowRestaurantPage(candidates, {
      skip: 0,
      take: 10,
    });

    expect(result.openIds).toEqual(['dup', 'other']);
    expect(result.total).toBe(2);
  });
});
