/**
 * §6 feed membership + §2.5 header verdict for the polls surface — PURE.
 *
 * Feed = polls of places in view PLUS descendants of the header subject(s).
 * The header is the SAME center-anchored judgment search uses
 * (resolveHeaderPlace, 2026-08-07 law — one law, one implementation; "Polls
 * in this area" is the client's rendering of the null verdict, exactly like
 * search's displayPlaceName).
 *
 * §4 boundary, feed half — "big-place (subdivision+) polls are
 * feed-at-that-zoom only": an in-view place that is BOTH over-scale for the
 * view (the §2 too-big scale test, which survives HERE as the feed boundary
 * even though §2.5 killed it as a header arm) AND structurally
 * subdivision-or-bigger (place-dag-read) is NOT a feed member. A merely
 * over-scale town (street zoom inside a city) keeps its membership — its
 * polls are that ground's polls; only subdivision+ places gate on scale.
 * (The never-push half lives in notification targeting.) The caller applies
 * the same subdivision+ set against the descendant-expanded ids, since §2.5
 * subjects may be over-scale dominators whose subtree echoes them back.
 */
import {
  GeoBbox,
  HeaderResolution,
  SubjectCandidate,
  bboxArea,
  isTooBigForView,
  resolveHeaderPlace,
} from '@crave-search/shared';

/**
 * The feed candidate IS the subject candidate (placeArea and the header
 * anchor live on SubjectCandidate itself). The alias survives as the polls
 * module's vocabulary word.
 */
export type FeedPlaceCandidate = SubjectCandidate;

export interface FeedMembership {
  /** §2.5 header verdict: the place name, or null → "Polls in this area". */
  headerPlaceName: string | null;
  /** The full §2.5 resolution (promise state + diagnostics read it). */
  resolution: HeaderResolution;
  /** In-view feed members (before descendant expansion). */
  memberPlaceIds: string[];
  /** Header subjects whose DESCENDANTS also join the feed (§6). */
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

  // §6 "+ descendants of the subject": the subject is the header place
  // (this-area carries none — the straddle that used to surface attention
  // holders died with the center-anchored law). Its subtree carries the
  // ground's polls (the in-view read already carries every intersecting
  // descendant that has a bbox; expansion adds the un-indexed/out-of-view
  // tail).
  const subjectPlaceIds = resolution.subjects.map((subject) => subject.placeId);

  return { headerPlaceName, resolution, memberPlaceIds, subjectPlaceIds };
}
