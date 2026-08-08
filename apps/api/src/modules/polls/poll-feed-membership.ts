/**
 * §6 feed membership + §2.5 header verdict for the polls surface — PURE.
 *
 * Feed = polls of places in view PLUS descendants of the header subject(s).
 * The header verdict is the SAME center-anchored judgment the client
 * subject store runs (resolveHeaderPlace, 2026-08-07 law — one law, one
 * implementation; one naming AUTHORITY since 2026-08-08: only the client
 * renders names, "Polls in this area" being its rendering of a null
 * verdict).
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
  /**
   * The header verdict (the place's NAME lives at resolution.place.name —
   * a headerPlaceName copy used to sit beside this and nothing in
   * production read it; deleted 2026-08-07 with subjectPlaceIds, which was
   * always derivable as kind === 'place' ? [place.placeId] : []).
   */
  resolution: HeaderResolution;
  /** In-view feed members (before descendant expansion). */
  memberPlaceIds: string[];
}

export function resolveFeedMembership(
  view: GeoBbox,
  candidates: FeedPlaceCandidate[],
  subdivisionOrBiggerIds: ReadonlySet<string>,
): FeedMembership {
  const viewArea = bboxArea(view);
  const resolution = resolveHeaderPlace(view, candidates);

  const memberPlaceIds = candidates
    .filter(
      (candidate) =>
        !(
          isTooBigForView(viewArea, candidate.placeArea) &&
          subdivisionOrBiggerIds.has(candidate.placeId)
        ),
    )
    .map((candidate) => candidate.placeId);

  return { resolution, memberPlaceIds };
}
