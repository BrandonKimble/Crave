import { GeoBbox } from '@crave-search/shared';
import {
  FeedPlaceCandidate,
  resolveFeedMembership,
} from './poll-feed-membership';

const TOWN = '11111111-1111-1111-1111-111111111111';
const TOWN_B = '22222222-2222-2222-2222-222222222222';
const CITY = '33333333-3333-3333-3333-333333333333';
const STATE = '44444444-4444-4444-4444-444444444444';

/** 1°×1° view at the origin (area 1 in the squared-degree metric). */
const VIEW: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 };

function candidate(
  placeId: string,
  name: string,
  coverageOfView: number,
  placeArea: number,
): FeedPlaceCandidate {
  // bbox only matters for containment tests; give big places a containing box.
  const half = Math.sqrt(placeArea) / 2;
  return {
    placeId,
    name,
    bbox: {
      minLat: 0.5 - half,
      minLng: 0.5 - half,
      maxLat: 0.5 + half,
      maxLng: 0.5 + half,
    },
    coverageOfView,
    placeArea,
  };
}

describe('poll-feed-membership — §6 members + §2 header + §4 feed-at-that-zoom', () => {
  it('commensurate covering town: header named, town is subject AND member', () => {
    const town = candidate(TOWN, 'Round Rock', 0.9, 1.2);
    const result = resolveFeedMembership(VIEW, [town], new Set());
    expect(result.headerPlaceName).toBe('Round Rock');
    expect(result.memberPlaceIds).toEqual([TOWN]);
    expect(result.subjectPlaceIds).toEqual([TOWN]);
  });

  it('over-scale SUBDIVISION+ place is NOT a feed member (§4 feed-at-that-zoom), while the commensurate town stays', () => {
    const town = candidate(TOWN, 'Round Rock', 0.9, 1.2);
    const state = candidate(STATE, 'Texas', 1, 400); // view ≪ place → over-scale
    const result = resolveFeedMembership(VIEW, [town, state], new Set([STATE]));
    expect(result.memberPlaceIds).toEqual([TOWN]);
    expect(result.headerPlaceName).toBe('Round Rock');
  });

  it('a merely over-scale TOWN-CLASS place (street zoom inside a city) KEEPS membership and IS the subject (§2.5: covering ⇒ dominator)', () => {
    const city = candidate(CITY, 'Austin', 1, 400); // over-scale but not subdivision+
    const result = resolveFeedMembership(VIEW, [city], new Set());
    expect(result.memberPlaceIds).toEqual([CITY]);
    // §2.5: the city covers the view → it IS the finest dominator (the old
    // containing-fallback arm is subsumed) — and as the named subject its
    // descendants join the feed (street zoom shows the city's ground).
    expect(result.headerPlaceName).toBe('Austin');
    expect(result.resolution.kind).toBe('place');
    expect(
      result.resolution.kind === 'place' ? result.resolution.reason : null,
    ).toBe('finest-dominator');
    expect(result.subjectPlaceIds).toEqual([CITY]);
  });

  it('§2.5 straddle reservation: the covering dominator with TWO attention-holding CHILDREN yields "this area" with the children as subjects', () => {
    const cityWide = candidate(CITY, 'Metroburg', 1, 2);
    const west = {
      ...candidate(TOWN, 'Westside', 0.5, 0.6),
      parentPlaceIds: [CITY],
    };
    const east = {
      ...candidate(TOWN_B, 'Eastside', 0.5, 0.6),
      parentPlaceIds: [CITY],
    };
    const result = resolveFeedMembership(
      VIEW,
      [cityWide, west, east],
      new Set(),
    );
    expect(result.headerPlaceName).toBeNull();
    expect(result.resolution.kind).toBe('this-area');
    expect(new Set(result.subjectPlaceIds)).toEqual(new Set([TOWN, TOWN_B]));
    // All three stay members (none is subdivision+).
    expect(new Set(result.memberPlaceIds)).toEqual(
      new Set([CITY, TOWN, TOWN_B]),
    );
  });

  it('multi-place straddle: header null ("Polls in this area"), BOTH subjects expand descendants', () => {
    const a = candidate(TOWN, 'Cedar Park', 0.5, 1);
    const b = candidate(TOWN_B, 'Leander', 0.5, 1);
    const result = resolveFeedMembership(VIEW, [a, b], new Set());
    expect(result.headerPlaceName).toBeNull();
    expect(result.resolution.kind).toBe('this-area');
    expect(new Set(result.subjectPlaceIds)).toEqual(new Set([TOWN, TOWN_B]));
    expect(new Set(result.memberPlaceIds)).toEqual(new Set([TOWN, TOWN_B]));
  });

  it('unnamed ground: nothing commensurate, nothing containing → header null, no subjects', () => {
    const result = resolveFeedMembership(VIEW, [], new Set());
    expect(result.headerPlaceName).toBeNull();
    expect(result.subjectPlaceIds).toEqual([]);
    expect(result.memberPlaceIds).toEqual([]);
  });
});
