import {
  parseDesireLink,
  serializeDesireLinkToPath,
  type ParsedDesireLink,
} from './desire-url-codec';

type LiveLink = Exclude<ParsedDesireLink, { kind: 'none' }>;

const ROUND_TRIP_CASES: LiveLink[] = [
  {
    kind: 'entityAction',
    action: { kind: 'restaurantWorld', restaurantId: 'rest-123', restaurantName: 'Caffè Panna' },
  },
  {
    kind: 'entityAction',
    action: { kind: 'restaurantWorld', restaurantId: 'rest-123', restaurantName: '' },
  },
  {
    kind: 'entityAction',
    action: { kind: 'entityDesire', entityType: 'food', entityId: 'e-9', label: 'gelato' },
  },
  {
    kind: 'entityAction',
    action: {
      kind: 'entityDesire',
      entityType: 'restaurant_attribute',
      entityId: 'attr/slash',
      label: 'outdoor seating',
    },
  },
  {
    kind: 'entityAction',
    action: { kind: 'pushScene', scene: 'userProfile', params: { userId: 'u-alice' } },
  },
  {
    kind: 'entityAction',
    action: { kind: 'listWorld', listId: 'list-7', listType: 'dish', label: 'Date night' },
  },
  { kind: 'sharedList', shareSlug: 'sunny-tacos-9f' },
  { kind: 'naturalSearch', query: 'best khachapuri & wine' },
  { kind: 'shortcutSearch', shortcutTab: 'restaurants' },
  { kind: 'polls', pollId: 'poll-1', marketKey: 'new-york' },
  { kind: 'polls', pollId: 'poll-1', marketKey: null },
];

// RT-1: malformed percent-encoding must NEVER throw — WHATWG URL accepts a stray '%'
// in the path, decodeURIComponent throws on it, and this codec runs inside the Linking
// event listener. Garbled links degrade to the raw segment / a lookup miss.

describe('desire-url-codec', () => {
  describe('round trip (serialize → parse ≡ identity, both bases)', () => {
    it.each(ROUND_TRIP_CASES.map((link) => [serializeDesireLinkToPath(link), link] as const))(
      'https base %s',
      (path, link) => {
        expect(parseDesireLink(`https://crave-search.app${path}`)).toEqual(link);
      }
    );

    it.each(ROUND_TRIP_CASES.map((link) => [serializeDesireLinkToPath(link), link] as const))(
      'crave scheme %s',
      (path, link) => {
        // crave:/<path> — the first segment becomes the URL hostname; the parser folds it back.
        expect(parseDesireLink(`crave:/${path}`)).toEqual(link);
      }
    );
  });

  describe('desire-url-codec — malformed percent-encoding (RT-1)', () => {
    it('a stray % in a query segment parses without throwing (raw segment preserved)', () => {
      const parsed = parseDesireLink('crave://q/50%');
      expect(parsed).toEqual({ kind: 'naturalSearch', query: '50%' });
    });

    it('a truncated escape in an id segment parses without throwing', () => {
      expect(() => parseDesireLink('crave://r/abc%2')).not.toThrow();
      expect(() => parseDesireLink('crave://l/x%zz')).not.toThrow();
      expect(() => parseDesireLink('https://crave.example/u/%')).not.toThrow();
    });
  });

  it('parses the bare polls collection with market', () => {
    expect(parseDesireLink('crave://polls?market=austin')).toEqual({
      kind: 'polls',
      marketKey: 'austin',
      pollId: null,
    });
  });

  it('parses the legacy restaurant path', () => {
    expect(parseDesireLink('https://crave-search.app/restaurant/rest-42')).toEqual({
      kind: 'entityAction',
      action: { kind: 'restaurantWorld', restaurantId: 'rest-42', restaurantName: '' },
    });
  });

  it('parses the emitted share-link format verbatim (BookmarksPanel outbound)', () => {
    expect(parseDesireLink('https://crave-search.app/l/sunny-tacos-9f')).toEqual({
      kind: 'sharedList',
      shareSlug: 'sunny-tacos-9f',
    });
  });

  it('rejects junk without throwing', () => {
    expect(parseDesireLink('not a url')).toEqual({ kind: 'none' });
    expect(parseDesireLink('https://crave-search.app/')).toEqual({ kind: 'none' });
    expect(parseDesireLink('crave://e/unknown-type/x')).toEqual({ kind: 'none' });
    expect(parseDesireLink('crave://s/pizza')).toEqual({ kind: 'none' });
    expect(parseDesireLink('crave://r/')).toEqual({ kind: 'none' });
  });
});
