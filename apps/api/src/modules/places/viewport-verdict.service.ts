/**
 * THE viewport→place-verdict seam — the ONE server-side home of the §2/§2.5/§4
 * composition (placesInView → resolveFeedMembership → resolveHeaderPlace +
 * descendant expansion), extracted from the polls feed so home and polls can
 * never fork the law. Polls' queryPolls calls this; the standalone
 * GET /places/viewport-verdict endpoint (home's header) calls this. One law,
 * one implementation.
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
  /** §2.5 header verdict: the covering place, or null → "this area". */
  headerPlace: { placeId: string; name: string } | null;
  /**
   * §6 membership: in-view places (minus over-scale subdivision+ places, the
   * §4 feed boundary) ∪ descendants of the commensurate subject(s).
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
      parentPlaceIds: entry.parentPlaceIds,
    }));
    // §4 feed half: only OVER-SCALE candidates ever need the structural
    // subdivision+ judgment (a handful of ancestors per view).
    const viewArea = bboxArea(view);
    const bigPlaceIds = new Set<string>();
    for (const candidate of candidates) {
      if (
        isTooBigForView(viewArea, candidate.placeArea) &&
        (await isSubdivisionOrBigger(this.prisma, candidate.placeId))
      ) {
        bigPlaceIds.add(candidate.placeId);
      }
    }
    const membership = resolveFeedMembership(view, candidates, bigPlaceIds);
    // Docket #1: the header-answer earned-moment hook is DELETED — a place
    // that can answer a header already has (or is seconds from) its outline.
    const descendants = membership.subjectPlaceIds.length
      ? await descendantPlaceIds(this.prisma, membership.subjectPlaceIds)
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
