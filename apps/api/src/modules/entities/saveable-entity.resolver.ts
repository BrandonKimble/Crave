import { Injectable } from '@nestjs/common';
import { EntityStatus, EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * "IS THIS A REAL, LIVE, SAVEABLE ENTITY?" — ONE ANSWER (D36 / F602, F621,
 * F661, F682).
 *
 * FOUR surfaces used to answer this independently, with four different
 * subsets of {redirect-resolve, type, status}: UserListsService.addItem
 * (existence only), PhotosService.createUploadTicket (type only),
 * HistoryService.record*View (type only) and SharePackageResolverService
 * (type + status — the only one that was right). So an archived restaurant
 * could be saved onto a list, photographed (moderated, BILLED) and viewed,
 * while a merge loser — one hop from a perfectly live survivor — was
 * permanently "unavailable" in a DM.
 *
 * The law, stated once:
 *   1. REDIRECT FIRST. A merge writes `entity_redirects (from → to)`, and the
 *      merge writer keeps chains FLAT (one hop — its own spec asserts it), so
 *      a single lookup resolves an id minted before the merge.
 *   2. THEN TYPE. A food id handed in as a restaurantId is not a near-miss;
 *      it is a different kind of thing.
 *   3. THEN STATUS === 'active'. The share resolver's semantics are the
 *      reference: `pending` and `archived` are both refusals, because a save
 *      / photo / view anchored on either is invisible work.
 *
 * Returning `null` (never throwing) is deliberate: each caller owns its own
 * refusal vocabulary — 404 on a save, 400 on a photo ticket, a silent skip on
 * a curated copy — and one shared resolver must not pick for them.
 */
export type ResolvedEntity = {
  entityId: string;
  name: string;
  city: string | null;
  latitude?: Prisma.Decimal | null;
  longitude?: Prisma.Decimal | null;
};

@Injectable()
export class SaveableEntityResolver {
  constructor(private readonly prisma: PrismaService) {}

  /** The survivor restaurant for this id, or null if it is not one / not live. */
  async resolveSaveablePlace(entityId: string): Promise<ResolvedEntity | null> {
    return this.resolve(entityId, EntityType.place);
  }

  /** The survivor food (dish) for this id, or null. */
  async resolveSaveableItem(entityId: string): Promise<ResolvedEntity | null> {
    return this.resolve(entityId, EntityType.item);
  }

  /**
   * Batch form for read paths that serve MANY stored ids (the curated shelves
   * and list detail, F692). Keyed by the id that was ASKED — the caller keeps
   * its stored row and learns which live entity it now means. Ids that
   * resolve to nothing are simply absent, which is the caller's cue to drop
   * the row rather than render a husk.
   */
  async resolveActiveByIds(
    entityIds: string[],
    type?: EntityType,
  ): Promise<Map<string, ResolvedEntity>> {
    const asked = Array.from(new Set(entityIds));
    if (!asked.length) return new Map();

    const redirects = await this.prisma.entityRedirect.findMany({
      where: { fromEntityId: { in: asked } },
      select: { fromEntityId: true, toEntityId: true },
    });
    const redirectMap = new Map(
      redirects.map((row) => [row.fromEntityId, row.toEntityId]),
    );
    const resolvedByAsked = new Map(
      asked.map((id) => [id, redirectMap.get(id) ?? id]),
    );

    const live = await this.prisma.entity.findMany({
      where: {
        entityId: { in: Array.from(new Set(resolvedByAsked.values())) },
        status: EntityStatus.active,
        ...(type ? { type } : {}),
      },
      select: {
        entityId: true,
        name: true,
        city: true,
        latitude: true,
        longitude: true,
      },
    });
    const liveById = new Map(live.map((entity) => [entity.entityId, entity]));

    const out = new Map<string, ResolvedEntity>();
    for (const [askedId, resolvedId] of resolvedByAsked) {
      const entity = liveById.get(resolvedId);
      if (entity) out.set(askedId, entity);
    }
    return out;
  }

  private async resolve(
    entityId: string,
    type: EntityType,
  ): Promise<ResolvedEntity | null> {
    const redirect = await this.prisma.entityRedirect.findUnique({
      where: { fromEntityId: entityId },
      select: { toEntityId: true },
    });
    const resolvedId = redirect?.toEntityId ?? entityId;
    const entity = await this.prisma.entity.findFirst({
      where: { entityId: resolvedId, type, status: EntityStatus.active },
      select: { entityId: true, name: true, city: true },
    });
    return entity ?? null;
  }
}
