import type { HomeFeedResponse } from '../../../services/home';
import {
  buildHomeShelfRows,
  homeShelfRowItemType,
  homeShelfRowKeyExtractor,
} from './home-shelf-rows';

const list = (listId: string) => ({
  listId,
  title: `List ${listId}`,
  subtitle: null,
  iconKey: 'trending',
  listType: 'restaurant',
  itemCount: 5,
  previewNames: [],
});

describe('home shelf rows (section composition + getItemType)', () => {
  it('composes one row per non-empty shelf, in server order', () => {
    const feed: HomeFeedResponse = {
      resolvedCity: { placeId: 'c1', name: 'Austin' },
      shelves: [
        { shelfKey: 'best_of', title: 'Best of Austin', lists: [list('a')] },
        { shelfKey: 'empty', title: 'Empty', lists: [] },
        { shelfKey: 'trending', title: 'Trending', lists: [list('b'), list('c')] },
      ],
      liveCities: [],
    };
    const rows = buildHomeShelfRows(feed);
    expect(rows.map((row) => row.shelfKey)).toEqual(['best_of', 'trending']);
    expect(rows.every((row) => row.kind === 'shelf')).toBe(true);
  });

  it('resolvedCity null → the ONE pick-a-city row from liveCities', () => {
    const feed: HomeFeedResponse = {
      resolvedCity: null,
      shelves: [],
      liveCities: [{ placeId: 'c1', name: 'Austin' }],
    };
    const rows = buildHomeShelfRows(feed);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('cityPicker');
    expect(rows[0].title).toBe('Pick a city');
  });

  it('resolvedCity null with NO live cities → zero rows (honest empty, never fake)', () => {
    expect(buildHomeShelfRows({ resolvedCity: null, shelves: [], liveCities: [] })).toEqual([]);
    expect(buildHomeShelfRows(null)).toEqual([]);
  });

  it('getItemType distinguishes shelf rows from the city picker; keys are shelf keys', () => {
    const shelfRow = buildHomeShelfRows({
      resolvedCity: { placeId: 'c1', name: 'Austin' },
      shelves: [{ shelfKey: 'best_of', title: 'Best', lists: [list('a')] }],
      liveCities: [],
    })[0];
    const pickerRow = buildHomeShelfRows({
      resolvedCity: null,
      shelves: [],
      liveCities: [{ placeId: 'c1', name: 'Austin' }],
    })[0];
    expect(homeShelfRowItemType(shelfRow)).toBe('shelf');
    expect(homeShelfRowItemType(pickerRow)).toBe('cityPicker');
    expect(homeShelfRowItemType(shelfRow)).not.toBe(homeShelfRowItemType(pickerRow));
    expect(homeShelfRowKeyExtractor(shelfRow)).toBe('best_of');
    expect(homeShelfRowKeyExtractor(pickerRow)).toBe('city_picker');
  });
});
