/**
 * §6 feed membership + §2 header verdict for the polls surface — PURE.
 *
 * Feed = polls of places in view PLUS descendants of the commensurate
 * subject(s). The header is the SAME §2 subjecthood judgment search uses
 * (resolveHeaderPlace — one law, one implementation; "Polls in this area" is
 * the client's rendering of the null verdict, exactly like search's
 * displayMarketName).
 *
 * §4 boundary, feed half — "big-place (subdivision+) polls are
 * feed-at-that-zoom only": an in-view place that is BOTH over-scale for the
 * view (§2's too-big disqualifier — the view attends to < 1/3 of it) AND
 * structurally subdivision-or-bigger (place-dag-read) is NOT a feed member.
 * A merely over-scale town (street zoom inside a city) keeps its membership
 * — its polls are that ground's polls; only subdivision+ places gate on
 * commensurability. (The never-push half lives in notification targeting.)
 */
import { GeoBbox, bboxArea } from '../places/place-geo';
import {
  HeaderResolution,
  SubjectCandidate,
  isTooBigForView,
  resolveHeaderPlace,
} from '../places/subjects';

export interface FeedPlaceCandidate extends SubjectCandidate {
  /** area(place bbox), same squared-degree metric as the view's. */
  placeArea: number;
}

export interface FeedMembership {
  /** §2 header verdict: the place name, or null → "Polls in this area". */
  headerPlaceName: string | null;
  /** The full §2 resolution (promise state + diagnostics read it). */
  resolution: HeaderResolution;
  /** In-view feed members (before descendant expansion). */
  memberPlaceIds: string[];
  /** Commensurate subjects whose DESCENDANTS also join the feed (§6). */
  subjectPlaceIds: string[];
}

export function resolveFeedMembership(
  view: GeoBbox,
  candidates: FeedPlaceCandidate[],
  subdivisionOrBiggerIds: ReadonlySet<string>,
): FeedMembership {
  const viewArea = bboxArea(view);
  const resolution = resolveHeaderPlace(view, candidates);
  const headerPlaceName =
    resolution.kind === 'place' ? resolution.place.name : null;

  const memberPlaceIds = candidates
    .filter(
      (candidate) =>
        !(
          isTooBigForView(viewArea, candidate.placeArea) &&
          subdivisionOrBiggerIds.has(candidate.placeId)
        ),
    )
    .map((candidate) => candidate.placeId);

  // §6 "+ descendants of the commensurate subject": subjects exist on the
  // commensurate verdicts (single/covering place AND multi-place straddles).
  // The containing-fallback names an over-scale place but has NO commensurate
  // subject — no descendant expansion (the in-view read already carries every
  // intersecting descendant that has a bbox).
  const subjectPlaceIds = resolution.subjects.map((subject) => subject.placeId);

  return { headerPlaceName, resolution, memberPlaceIds, subjectPlaceIds };
}
