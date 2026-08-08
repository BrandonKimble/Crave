/**
 * THE viewport→place-verdict seam — the ONE server-side home of the §2/§2.5/§4
 * composition (placesInView → resolveFeedMembership → resolveHeaderPlace +
 * descendant expansion), extracted from the polls feed so home and polls can
 * never fork the law. Polls' queryPolls calls this; the
 * home feed (home's header) calls this. One law, one implementation. (The
 * standalone GET /places/viewport-verdict route was deleted 2026-08-08 —
 * zero callers ever existed.)
 */
import { Injectable } from '@nestjs/common';
import { GeoBbox, bboxArea, isTooBigForView } from '@crave-search/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FeedPlaceCandidate,
  resolveFeedMembership,
} from '../polls/poll-feed-membership';
import { PlacesCatalogService } from './places-catalog.service';
import { descendantPlaceIds, isSubdivisionOrBigger } from './place-dag-read';

export interface ViewportVerdict {
  /** The header verdict: the finest centred place, or null → "this area". */
  headerPlace: { placeId: string; name: string } | null;
  /**
   * §6 membership: in-view places (minus over-scale subdivision+ places, the
   * §4 feed boundary) ∪ descendants of the header place.
   */
  placeIds: string[];
  /** The raw in-view candidate rows (id + name), for consumers that label. */
  placesInView: Array<{ placeId: string; name: string }>;
}

@Injectable()
export class ViewportVerdictService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly placesCatalog: PlacesCatalogService,
  ) {}

  /** §6/§2/§4: in-view membership + header verdict + descendant expansion. */
  async resolveViewportVerdict(view: GeoBbox): Promise<ViewportVerdict> {
    const placesInView = await this.placesCatalog.placesInView(view);
    const candidates: FeedPlaceCandidate[] = placesInView.map((entry) => ({
      placeId: entry.place.placeId,
      name: entry.place.name,
      coverageOfView: entry.coverageOfView,
      placeArea: entry.placeArea,
      containsViewCenter: entry.containsViewCenter,
    }));
    // §4 feed half: only OVER-SCALE candidates ever need the structural
    // subdivision+ judgment (a handful of ancestors per view).
    const viewArea = bboxArea(view);
    // Only over-scale candidates need the structural test — a handful per
    // view — and their DAG reads are independent, so they run together
    // rather than as serialized round trips on the feed hot path.
    const overScale = candidates.filter((candidate) =>
      isTooBigForView(viewArea, candidate.placeArea),
    );
    const structural = await Promise.all(
      overScale.map((candidate) =>
        isSubdivisionOrBigger(this.prisma, candidate.placeId),
      ),
    );
    const bigPlaceIds = new Set<string>(
      overScale
        .filter((_, index) => structural[index])
        .map((candidate) => candidate.placeId),
    );
    const membership = resolveFeedMembership(view, candidates, bigPlaceIds);
    // Docket #1: the header-answer earned-moment hook is DELETED — a place
    // that can answer a header already has (or is seconds from) its outline.
    //
    // EXPANSION IS GATED ON THE SUBJECT NOT BEING SUBDIVISION+ (round-2 red
    // team). Two reasons, one mechanism:
    //   - the DAG records 19,451 municipalities under their STATE, so a
    //     state-header expansion returned ~20k ids into `place_id = ANY()`
    //     on every rural pan — a correctness-shaped perf bomb;
    //   - §4's own law already says big-place polls are feed-at-that-zoom
    //     only, and descendant expansion was quietly the loophole around it.
    // A state names the header at state zoom and its feed is its in-view
    // members; a city/borough/neighbourhood subject expands its subtree as
    // before. (Known thin spot, documented not fixed: a COUNTY subject
    // expands to almost nothing because only 14 municipalities nationwide
    // carry a county parent — the county header is rare, and the geometry-
    // keyed expansion that would fix it is a separate decision.)
    const subject =
      membership.resolution.kind === 'place'
        ? membership.resolution.place
        : null;
    const descendants =
      subject && !(await isSubdivisionOrBigger(this.prisma, subject.placeId))
        ? await descendantPlaceIds(this.prisma, [subject.placeId])
        : [];
    // §4 feed half holds through descendant expansion too: a §2.5 subject
    // can itself be an over-scale subdivision+ dominator (state-scale zoom),
    // and the subtree read echoes its roots — subtract the structurally big
    // over-scale places from the final membership so their polls stay
    // feed-at-that-zoom only.
    const placeIds = [
      ...new Set([...membership.memberPlaceIds, ...descendants]),
    ].filter((placeId) => !bigPlaceIds.has(placeId));
    return {
      headerPlace:
        membership.resolution.kind === 'place'
          ? {
              placeId: membership.resolution.place.placeId,
              name: membership.resolution.place.name,
            }
          : null,
      placeIds,
      placesInView: candidates.map(({ placeId, name }) => ({ placeId, name })),
    };
  }
}
