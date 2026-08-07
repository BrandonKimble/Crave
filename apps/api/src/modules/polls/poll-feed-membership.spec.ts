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
  return {
    placeId,
    name,
    coverageOfView,
    placeArea,
    // Feed fixtures are about membership, not the anchor; centred by
    // default so the header arm behaves as each case's coverage implies.
    containsViewCenter: true,
  };
}

describe('poll-feed-membership — §6 members + §2 header + §4 feed-at-that-zoom', () => {
  it('commensurate covering town: header named, town is subject AND member', () => {
    const town = candidate(TOWN, 'Round Rock', 0.9, 1.2);
    const result = resolveFeedMembership(VIEW, [town], new Set());
    expect(
      result.resolution.kind === 'place' ? result.resolution.place.name : null,
    ).toBe('Round Rock');
    expect(result.memberPlaceIds).toEqual([TOWN]);
    expect(
      result.resolution.kind === 'place'
        ? result.resolution.place.placeId
        : null,
    ).toBe(TOWN);
  });

  it('over-scale SUBDIVISION+ place is NOT a feed member (§4 feed-at-that-zoom), while the commensurate town stays', () => {
    const town = candidate(TOWN, 'Round Rock', 0.9, 1.2);
    const state = candidate(STATE, 'Texas', 1, 400); // view ≪ place → over-scale
    const result = resolveFeedMembership(VIEW, [town, state], new Set([STATE]));
    expect(result.memberPlaceIds).toEqual([TOWN]);
    expect(
      result.resolution.kind === 'place' ? result.resolution.place.name : null,
    ).toBe('Round Rock');
  });

  it('a merely over-scale TOWN-CLASS place (street zoom inside a city) KEEPS membership and IS the subject (a covering city contains the centre and is finest)', () => {
    const city = candidate(CITY, 'Austin', 1, 400); // over-scale but not subdivision+
    const result = resolveFeedMembership(VIEW, [city], new Set());
    expect(result.memberPlaceIds).toEqual([CITY]);
    // §2.5: the city covers the view → it IS the finest dominator (the old
    // containing-fallback arm is subsumed) — and as the named subject its
    // descendants join the feed (street zoom shows the city's ground).
    expect(
      result.resolution.kind === 'place' ? result.resolution.place.name : null,
    ).toBe('Austin');
    expect(result.resolution.kind).toBe('place');
    expect(
      result.resolution.kind === 'place' ? result.resolution.reason : null,
    ).toBe('finest-centered');
    expect(
      result.resolution.kind === 'place'
        ? result.resolution.place.placeId
        : null,
    ).toBe(CITY);
  });

  it('a covering parent with two child towns: the CENTERED child names the header and is the sole subject (the straddle reservation is dead)', () => {
    // The old law declared "this area" here with BOTH children as subjects.
    // It keyed on DAG siblinghood, which fired between NESTED places
    // (Austin/Travis — 19,451 municipalities carry their state as parent),
    // so the reservation died with the center-anchored law: the centre sits
    // in one child, and that child is the header and the subject.
    const cityWide = candidate(CITY, 'Metroburg', 1, 2);
    const west = candidate(TOWN, 'Westside', 0.5, 0.6);
    const east = {
      ...candidate(TOWN_B, 'Eastside', 0.5, 0.6),
      containsViewCenter: false,
    };
    const result = resolveFeedMembership(
      VIEW,
      [cityWide, west, east],
      new Set(),
    );
    expect(
      result.resolution.kind === 'place' ? result.resolution.place.name : null,
    ).toBe('Westside');
    expect(result.resolution.kind).toBe('place');
    expect(
      result.resolution.kind === 'place'
        ? result.resolution.place.placeId
        : null,
    ).toBe(TOWN);
    // All three stay members (none is subdivision+).
    expect(new Set(result.memberPlaceIds)).toEqual(
      new Set([CITY, TOWN, TOWN_B]),
    );
  });

  it('two towns, centre over NEITHER: header null ("Polls in this area"), no subjects — members carry the feed', () => {
    const a = {
      ...candidate(TOWN, 'Cedar Park', 0.5, 1),
      containsViewCenter: false,
    };
    const b = {
      ...candidate(TOWN_B, 'Leander', 0.5, 1),
      containsViewCenter: false,
    };
    const result = resolveFeedMembership(VIEW, [a, b], new Set());
    expect(result.resolution.kind).toBe('this-area');
    expect(result.resolution.kind).toBe('this-area');
    // Subjects are EMPTY now (the straddle used to surface both towns for
    // descendant expansion) — a this-area view's feed is exactly its
    // in-view members, which both towns remain.
    expect(result.resolution.kind).toBe('this-area');
    expect(new Set(result.memberPlaceIds)).toEqual(new Set([TOWN, TOWN_B]));
  });

  it('unnamed ground: nothing commensurate, nothing containing → header null, no subjects', () => {
    const result = resolveFeedMembership(VIEW, [], new Set());
    expect(result.resolution.kind).toBe('this-area');
    expect(result.resolution.kind).toBe('this-area');
    expect(result.memberPlaceIds).toEqual([]);
  });
});
