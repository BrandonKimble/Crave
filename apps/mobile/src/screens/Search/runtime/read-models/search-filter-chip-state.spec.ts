import {
  SEARCH_FILTER_CHIP_OBSERVED_BUS_KEYS,
  areSearchFilterChipStatesEqual,
  selectSearchFilterChipState,
} from './search-filter-chip-state';
import { SearchRuntimeBus } from '../shared/search-runtime-bus';
import { writeSearchDesiredTuple } from '../shared/search-desired-state-writer';

// F3900 / D78. The strip's chip states come from the runtime bus and from NOTHING
// else — the eight props that used to carry the same values were overwritten before
// a single one was read, and are deleted. These specs hold the surviving source
// accountable: sever any read below (return a constant, drop a field from the
// equality) and the matching case goes RED.
describe('selectSearchFilterChipState', () => {
  const busWithTuple = (
    variant: Partial<{
      openNow: boolean;
      rising: boolean;
      includeSimilar: boolean;
      dietary: readonly string[];
    }>,
    tab: 'dishes' | 'restaurants' = 'restaurants'
  ): SearchRuntimeBus => {
    const bus = new SearchRuntimeBus();
    writeSearchDesiredTuple(bus, { filterVariant: variant, tab }, 'chip_open_now');
    return bus;
  };

  it('reads every chip state off the desired tuple, not off a snapshot', () => {
    const chipState = selectSearchFilterChipState(
      busWithTuple(
        { openNow: true, rising: true, includeSimilar: true, dietary: ['vegan'] },
        'dishes'
      ).getState()
    );

    expect(chipState.openNow).toBe(true);
    expect(chipState.risingActive).toBe(true);
    expect(chipState.includeSimilarActive).toBe(true);
    expect(chipState.dietary).toEqual(['vegan']);
    expect(chipState.activeTab).toBe('dishes');
  });

  it('reads the idle tuple as every chip OFF', () => {
    const chipState = selectSearchFilterChipState(new SearchRuntimeBus().getState());

    expect(chipState.openNow).toBe(false);
    expect(chipState.risingActive).toBe(false);
    expect(chipState.includeSimilarActive).toBe(false);
    expect(chipState.dietary).toEqual([]);
    expect(chipState.activeTab).toBe('restaurants');
  });

  it('reads the price chip off the bus price fields', () => {
    const bus = new SearchRuntimeBus();
    bus.publish({
      priceButtonIsActive: true,
      priceButtonLabelText: '$$–$$$',
      isPriceSelectorVisible: true,
      isSortSelectorVisible: true,
    });

    const chipState = selectSearchFilterChipState(bus.getState());

    expect(chipState.priceButtonActive).toBe(true);
    expect(chipState.priceButtonLabel).toBe('$$–$$$');
    expect(chipState.isPriceSelectorVisible).toBe(true);
    expect(chipState.isSortSelectorVisible).toBe(true);
  });

  it('defaults similarAvailableCount to 0 when no results metadata has landed', () => {
    expect(
      selectSearchFilterChipState(new SearchRuntimeBus().getState()).similarAvailableCount
    ).toBe(0);
  });

  // The subscribe scope is the strip's wake-up contract: a key read by the
  // projection but missing from this list is a chip that silently stops
  // updating, which is exactly the bug the bus read was introduced to fix.
  it('declares an observed bus key for every field it reads', () => {
    expect([...SEARCH_FILTER_CHIP_OBSERVED_BUS_KEYS].sort()).toEqual(
      [
        'desiredTuple',
        'isPriceSelectorVisible',
        'isSortSelectorVisible',
        'priceButtonIsActive',
        'priceButtonLabelText',
        'results',
      ].sort()
    );
  });
});

describe('areSearchFilterChipStatesEqual', () => {
  const base = selectSearchFilterChipState(new SearchRuntimeBus().getState());

  it('holds for an identical projection', () => {
    expect(areSearchFilterChipStatesEqual(base, { ...base })).toBe(true);
  });

  it.each([
    ['activeTab', { activeTab: 'dishes' as const }],
    ['openNow', { openNow: true }],
    ['dietary', { dietary: ['vegan'] }],
    ['includeSimilarActive', { includeSimilarActive: true }],
    ['similarAvailableCount', { similarAvailableCount: 3 }],
    ['risingActive', { risingActive: true }],
    ['priceButtonActive', { priceButtonActive: true }],
    ['priceButtonLabel', { priceButtonLabel: '$$' }],
    ['isPriceSelectorVisible', { isPriceSelectorVisible: true }],
    ['isSortSelectorVisible', { isSortSelectorVisible: true }],
  ])('reports a %s change as unequal', (_field, patch) => {
    expect(areSearchFilterChipStatesEqual(base, { ...base, ...patch })).toBe(false);
  });
});
