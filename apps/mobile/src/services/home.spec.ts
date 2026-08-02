import { normalizeHomeFeedResponse } from './home-feed-normalize';

describe('home feed client normalization', () => {
  it('normalizes a full server payload (server emits shelf `key`)', () => {
    const feed = normalizeHomeFeedResponse({
      resolvedCity: { placeId: 'p1', name: 'Austin' },
      shelves: [
        {
          key: 'best_of',
          title: 'Best of Austin',
          lists: [
            {
              listId: 'l1',
              title: 'Best Tacos',
              subtitle: 'July rotation',
              iconKey: 'dish',
              listType: 'dish',
              itemCount: 12,
              previewNames: ['A', 'B', 'C'],
            },
          ],
        },
      ],
      liveCities: [{ placeId: 'p1', name: 'Austin' }],
    });
    expect(feed.resolvedCity).toEqual({ placeId: 'p1', name: 'Austin' });
    expect(feed.shelves).toHaveLength(1);
    expect(feed.shelves[0].shelfKey).toBe('best_of');
    expect(feed.shelves[0].lists[0]).toEqual({
      listId: 'l1',
      title: 'Best Tacos',
      subtitle: 'July rotation',
      iconKey: 'dish',
      listType: 'dish',
      itemCount: 12,
      previewNames: ['A', 'B', 'C'],
    });
  });

  it('accepts the client vocabulary `shelfKey` too', () => {
    const feed = normalizeHomeFeedResponse({
      resolvedCity: null,
      shelves: [{ shelfKey: 'near_you', title: 'Near you', lists: [] }],
      liveCities: [],
    });
    expect(feed.shelves[0].shelfKey).toBe('near_you');
  });

  it('drops malformed rows instead of fabricating them (no-fake law)', () => {
    const feed = normalizeHomeFeedResponse({
      resolvedCity: { placeId: 42, name: 'nope' },
      shelves: [
        { title: 'no key', lists: [] },
        {
          key: 'ok',
          title: 'OK',
          lists: [{ listId: 'l1', title: 'Valid' }, { title: 'missing id' }, null],
        },
      ],
      liveCities: [{ placeId: 'p2', name: 'NYC' }, { placeId: 7 }],
    });
    expect(feed.resolvedCity).toBeNull();
    expect(feed.shelves).toHaveLength(1);
    expect(feed.shelves[0].lists).toHaveLength(1);
    expect(feed.shelves[0].lists[0].previewNames).toEqual([]);
    expect(feed.liveCities).toEqual([{ placeId: 'p2', name: 'NYC' }]);
  });

  it('degrades an unrecognizable payload to the honest empty feed', () => {
    expect(normalizeHomeFeedResponse(undefined)).toEqual({
      resolvedCity: null,
      shelves: [],
      liveCities: [],
      catalogWatermark: null,
    });
  });
});
