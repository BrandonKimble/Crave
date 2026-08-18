import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Prisma, Entity, EntityType } from '@prisma/client';
import {
  activeEntityEventCountSql,
  acquireIdentityMergeLocks,
  activeWinnerRedirectMap,
  finalizeMergeCompletion,
  rekeyPlaceEventsToCanonical,
  rekeyPlaceEntityEventsToCanonical,
  activeCommunitiesArraySql,
  activeSupportExistsSql,
  dominantCommunitySql,
} from '../content-processing/reddit-collector/extraction-scope.service';
import {
  accentsAgreeUnbanked,
  entityLockKey,
} from '../content-processing/entity-resolver/entity-identity';
import {
  nonAggregatorDomainSql,
  sameBusinessVerdict,
} from './business-identity-rules';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { ProjectionRebuildService } from '../content-processing/reddit-collector/projection-rebuild.service';
import { EntityAnchorRehomeService } from '../content-processing/entity-resolver/entity-anchor-rehome.service';

type PlaceEntity = Entity;

/**
 * PREFIX-LANE PER-RUN CHURN CEILING.
 *
 * MEASURED on the local mirror 2026-08-03 (17,357 entities, 6,848 restaurants
 * with locations): the prefix lane's predicate admits SEVEN pairs corpus-wide.
 * So this is not a bound on normal operation — normal operation is two orders
 * of magnitude below it. It is the ceiling on ONE NIGHT'S churn if a change to
 * identity_key, to the ambiguity guard, or to the grounded predicate ever
 * widens the lane by an order of magnitude: the sweep is idempotent and runs
 * nightly, so a capped pass converges over nights while an uncapped one merges
 * a corpus-wide regression in a single unattended run.
 *
 * The exact-identity lane above is deliberately UNCAPPED: its predicate is an
 * exact key match, which cannot widen by construction. F364 found this number
 * bare, in a file where every other threshold records its evidence.
 */
const PREFIX_LANE_PER_RUN_CEILING = 200;

@Injectable()
export class PlaceEntityMergeService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ProjectionRebuildService))
    private readonly projectionRebuildService: ProjectionRebuildService,
    private readonly anchorRehome: EntityAnchorRehomeService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('RestaurantEntityMergeService');
  }

  /**
   * THE SERVICE OWNS THE TRANSACTION — callers cannot pass one (F9966).
   *
   * History, because this shape was bought twice: the grounding lane used to
   * wrap its location re-point and this merge in its own transaction while
   * this method opened a rival one — a self-deadlock over the same location
   * rows that expired both 15-minute budgets and killed the ghost sweep
   * (P2028 #1). The first fix let callers pass `tx` in — which exposed
   * P2028 #2 (the post-merge projection rebuild still opened its own
   * transaction against the caller's uncommitted re-keys) and, worse, made
   * the post-commit rebuild PURE CONVENTION: a fifth tx-passing caller that
   * forgot it would compile, pass tests, and merge with stale projections.
   *
   * So control is inverted. A caller with pre-merge work that must be atomic
   * with the merge (the grounding lane's location re-point) passes `prepare`,
   * which runs INSIDE this service's transaction before the merge body; its
   * return value is merged into canonicalUpdate. The projection rebuild runs
   * here, after commit, ALWAYS — there is no forgettable path because there
   * is no other path.
   *
   * @param params.prepare caller's pre-merge work, atomic with the merge;
   *  whatever EntityUpdateInput fields it returns overlay canonicalUpdate.
   */
  async mergeDuplicatePlace(params: {
    canonical: PlaceEntity;
    duplicate: PlaceEntity;
    canonicalUpdate: Prisma.EntityUpdateInput;
    prepare?: (
      tx: Prisma.TransactionClient,
    ) => Promise<Prisma.EntityUpdateInput | void>;
  }): Promise<PlaceEntity> {
    const { canonical, duplicate, canonicalUpdate } = params;
    if (canonical.entityId === duplicate.entityId) {
      throw new Error(
        `self-merge refused: ${canonical.entityId} (round-11 fuzz D1 — a self-merge silently annihilates the ledger)`,
      );
    }

    this.logger.info('Merging duplicate restaurant entity', {
      canonicalId: canonical.entityId,
      duplicateId: duplicate.entityId,
    });

    const runMerge = async (
      tx: Prisma.TransactionClient,
    ): Promise<PlaceEntity> => {
      const prepared = params.prepare ? await params.prepare(tx) : undefined;
      const effectiveCanonicalUpdate: Prisma.EntityUpdateInput = {
        ...canonicalUpdate,
        ...(prepared ?? {}),
      };
      // Same identity locks the creation path takes (H3 — round-12
      // audit: the plan asserted this, the code didn't do it).
      await acquireIdentityMergeLocks(tx, EntityType.place, [
        entityLockKey(canonical.name, EntityType.place),
        entityLockKey(duplicate.name, EntityType.place),
      ]);

      // THE CANONICAL IS RE-RESOLVED UNDER THE LOCK (2026-08-12 red team).
      //
      // Every caller picks its canonical by reading the database OUTSIDE this
      // transaction — the place-id ownership pre-check reads
      // `restaurant_locations` then `core_entities.status`, the collision
      // handler and the same-name sweep do the same — so between that read
      // and this transaction another merge can archive the very entity we are
      // about to merge INTO. The result was not a crash: the merge succeeded,
      // re-keying a live corpus onto an ARCHIVED winner and writing a
      // redirect whose target is archived — precisely the "stranded evidence"
      // state `activeWinnerRedirectMap` refuses to follow, so every later
      // event write and read walks past it and the evidence is dark.
      //
      // The fix is not a pre-flight check (that is the same stale read, one
      // line lower). The identity locks above are name-keyed and the racing
      // merge holds the SAME canonical name key, so it is already serialized
      // against us: a read taken HERE, after the locks, is authoritative for
      // the rest of this transaction. So we take it, and resolve exactly the
      // way the event ledger's write chokepoint does — through the
      // active-winner redirect map — which turns the race from data damage
      // into the correct answer: merge into whoever absorbed our canonical.
      // ASYMMETRIC BY DESIGN. The CANONICAL side follows its redirect: "the
      // live entity that absorbed our winner" is still the right home for
      // this evidence, and following it is what the ledger chokepoint does.
      // The DUPLICATE side does NOT: if the loser was itself merged away, its
      // content already lives at some third entity, and re-targeting would
      // drag that whole (possibly large, possibly unrelated) entity into a
      // merge nobody judged. A stale loser means the decision is stale —
      // refuse, and let the sweep re-judge the healed graph.
      const winner = await activeWinnerRedirectMap(tx, [canonical.entityId]);
      const canonicalId = winner.get(canonical.entityId) ?? canonical.entityId;
      const duplicateId = duplicate.entityId;
      const [canonicalRow, duplicateRow] = await Promise.all([
        tx.entity.findUnique({
          where: { entityId: canonicalId },
          select: { status: true },
        }),
        tx.entity.findUnique({
          where: { entityId: duplicateId },
          select: { status: true },
        }),
      ]);
      if (canonicalId === duplicateId) {
        // The race already did this merge (the loser IS our canonical's
        // winner). Replaying it would be a self-merge, which annihilates the
        // ledger (round-11 fuzz D1).
        throw new Error(
          `merge refused: ${canonical.entityId} and ${duplicateId} both resolve to ${canonicalId} — a concurrent merge already joined them`,
        );
      }
      if (!canonicalRow || canonicalRow.status === 'archived') {
        // Archived with NO active redirect target: the winner is stranded
        // itself. Refusing leaves the duplicate intact for the next sweep,
        // which is recoverable; proceeding is not.
        throw new Error(
          `merge refused: canonical ${canonicalId} is not active under the identity lock (a concurrent merge archived it)`,
        );
      }
      if (!duplicateRow || duplicateRow.status === 'archived') {
        throw new Error(
          `merge refused: duplicate ${duplicateId} was already merged away under the identity lock`,
        );
      }

      await this.mergePlaceEvents(tx, canonicalId, duplicateId);
      await this.mergePlaceEntityEvents(tx, canonicalId, duplicateId);
      await this.rehomePlaceEntityReferences(tx, canonicalId, duplicateId);
      await this.mergeConnections(tx, canonicalId, duplicateId);
      await this.mergeLocations(tx, canonicalId, duplicateId);

      const updatedCanonical = await tx.entity.update({
        where: { entityId: canonicalId },
        data: effectiveCanonicalUpdate,
      });

      // Alias bank + archive + score prune + redirect flatten: ONE
      // contract shared with the food merge (round-12 audit — the two
      // copy-pasted tails had diverged; see finalizeMergeCompletion).
      await finalizeMergeCompletion(tx, canonicalId, duplicateId);

      return updatedCanonical;
    };

    const result = await this.prisma.$transaction(
      runMerge,
      // Explicit budget (round-10 violence red team): the default 5s
      // killed large merges permanently-but-silently. Matches the
      // rebuild's budget.
      { timeout: 15 * 60 * 1000, maxWait: 30_000 },
    );

    this.logger.info('Restaurant entity merge completed', {
      canonicalId: result.entityId,
    });

    // POST-COMMIT, ALWAYS (P2028 #2): the rebuild opens its own transaction
    // over core_restaurant_items rows the merge just re-keyed, so it must
    // run after the commit above — and because the service owns both the
    // transaction and this call, no caller can forget it.
    await this.projectionRebuildService.rebuildForPlaces([result.entityId]);

    return result;
  }

  private async mergePlaceEvents(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    await rekeyPlaceEventsToCanonical(tx, canonicalId, duplicateId);
  }

  private async mergePlaceEntityEvents(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    await rekeyPlaceEntityEventsToCanonical(tx, canonicalId, duplicateId);
  }

  private async rehomePlaceEntityReferences(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    // Phase C: the dead event tables (search_event_entities,
    // user_restaurant_views, user_entity_view_events, user_search_demand_daily,
    // collection_on_demand_ask_events) need NO rekey — user-act history lives
    // in the immutable signals ledger, resolved through entity_redirects at
    // read (the redirect row is written by the merge flow itself).
    await this.anchorRehome.rehomeUserListItems(
      tx,
      'placeId',
      canonicalId,
      duplicateId,
    );
    // poll targets + topic arrays, curated items, photos, on-demand
    // requests, demand candidates: the shared user-anchor law (also used
    // by the food merge — one implementation, no drift)
    await this.anchorRehome.rehomeEntityAnchors(tx, canonicalId, duplicateId);
  }

  private async mergeLocations(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    const duplicateLocations = await tx.placeLocation.findMany({
      where: { placeId: duplicateId },
    });

    if (!duplicateLocations.length) {
      return;
    }

    const canonicalLocations = await tx.placeLocation.findMany({
      where: { placeId: canonicalId },
    });
    const canonicalByPlaceId = new Map(
      canonicalLocations
        .filter((loc) => loc.googlePlaceId)
        .map((loc) => [loc.googlePlaceId as string, loc]),
    );

    for (const location of duplicateLocations) {
      if (
        location.googlePlaceId &&
        canonicalByPlaceId.has(location.googlePlaceId)
      ) {
        // Drop duplicate location row; prefer canonical's
        await tx.placeLocation.delete({
          where: { locationId: location.locationId },
        });
        continue;
      }

      // A MOVED ROW IS NEVER BORN PRIMARY (F355). This read
      // `location.isPrimary || canonicalLocations.length === 0` against a
      // snapshot taken BEFORE the loop — so when the canonical started with
      // zero locations, EVERY moved row was flagged primary, and the
      // "ensure a primary exists" step below then picked one for the FK and
      // left the rest flagged. MEASURED consequence on the local mirror
      // 2026-08-03: 398 restaurants carry more than one `is_primary = true`
      // row, while the FK and the boolean never DISAGREE about which row is
      // primary (0 rows where the FK points at a non-primary) — i.e. the
      // boolean was never a second answer, only the same answer plus 398
      // false extras. "The primary location" is a single-valued property of
      // the RESTAURANT and it already has a single-valued home
      // (core_entities.primary_location_id), so election happens ONCE, below.
      await tx.placeLocation.update({
        where: { locationId: location.locationId },
        data: {
          placeId: canonicalId,
          isPrimary: false,
          updatedAt: new Date(),
        },
      });
    }

    // ELECT EXACTLY ONE PRIMARY — the FK's row, and no other.
    let primary = await tx.placeLocation.findFirst({
      where: { placeId: canonicalId, isPrimary: true },
    });

    if (!primary) {
      const firstLocation = await tx.placeLocation.findFirst({
        where: { placeId: canonicalId },
        orderBy: { updatedAt: 'desc' },
      });
      if (firstLocation) {
        await tx.placeLocation.update({
          where: { locationId: firstLocation.locationId },
          data: { isPrimary: true },
        });
        primary = firstLocation;
      }
    }

    if (primary) {
      // …and demote every other row of this restaurant. Without this the
      // merge could only ever ADD primaries: a duplicate that arrived with
      // its own flagged row, or an earlier merge's leftovers, stayed flagged
      // forever. This is the single-valuedness the FK has by construction,
      // asserted on the boolean that lacks it — the column has only a
      // non-unique index, so nothing else can.
      await tx.placeLocation.updateMany({
        where: {
          placeId: canonicalId,
          isPrimary: true,
          locationId: { not: primary.locationId },
        },
        data: { isPrimary: false },
      });
    }

    if (primary) {
      await tx.entity.update({
        where: { entityId: canonicalId },
        data: {
          primaryLocation: { connect: { locationId: primary.locationId } },
        },
      });
    }
  }

  private async mergeConnections(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    const connections = await tx.connection.findMany({
      where: { placeId: duplicateId },
    });

    if (!connections.length) {
      return;
    }

    for (const connection of connections) {
      const conflicting = await tx.connection.findFirst({
        where: {
          placeId: canonicalId,
          itemId: connection.itemId,
        },
        select: {
          connectionId: true,
          itemId: true,
        },
      });

      if (conflicting) {
        await this.rehomeConnectionReferences(
          tx,
          connection.connectionId,
          conflicting.connectionId,
        );
        await tx.connection.delete({
          where: { connectionId: connection.connectionId },
        });
      } else {
        await tx.connection.update({
          where: { connectionId: connection.connectionId },
          data: { placeId: canonicalId },
        });
      }
    }
  }

  private async rehomeConnectionReferences(
    tx: Prisma.TransactionClient,
    sourceConnectionId: string,
    targetConnectionId: string,
  ): Promise<void> {
    // Phase C: view history lives in the signals ledger; the recently-viewed
    // reader resolves dead connections to the survivor via entity_redirects +
    // (food, restaurant) at read (SignalDemandReadService.recentlyViewedFoods)
    // — no per-merge rekey of view rows exists anymore.
    await this.anchorRehome.rehomeUserListItems(
      tx,
      'connectionId',
      targetConnectionId,
      sourceConnectionId,
    );
    // curated picks + photos cascade on connection delete — repoint first
    await this.anchorRehome.rehomeConnectionAnchors(
      tx,
      targetConnectionId,
      sourceConnectionId,
    );
  }

  /**
   * SAME-NAME DUPLICATE SWEEP (2026-07-26 root cause: a check-then-act race
   * in entity creation — now advisory-locked — plus a places path that never
   * consulted the reddit-created entity left 51 same-name active pairs).
   * SAFE RULE: hold only when BOTH sides are place-grounded with disjoint
   * place ids (genuinely two physical businesses); any ungrounded side is a
   * pre-enrichment duplicate of the same corpus stream. Canonical = the
   * grounded side when exactly one is grounded (it carries enrichment),
   * else the more-evidenced side. Idempotent; cheap at zero dupes. Manual
   * lever: scripts/merge-duplicate-restaurants.ts (report / --apply).
   */
  async sweepSameNameDuplicates(
    options: { apply: boolean } = { apply: true },
  ): Promise<{
    merged: number;
    held: number;
    decisions: Array<{
      name: string;
      verdict: 'merge' | 'hold';
      canonicalId?: string;
      duplicateId?: string;
    }>;
  }> {
    // STRIPPED-KEY grouping (class ③, empirically validated: 21/21 stripped
    // collisions on the mirror were REAL duplicates). The old normalization
    // turned punctuation into SPACES, so "Phil's"→"phil s" never grouped
    // with "Phils"→"phils" — which is why possessive twins survived a
    // nightly dedupe sweep for months. Groups of ANY size now qualify
    // (Grizzelda's existed ×3); pairs are peeled per run — the nightly
    // cadence converges multi-member groups over a few days.
    const groups = await this.prisma.$queryRaw<
      Array<{ name: string; entity_ids: string[] }>
    >`
      SELECT identity_key AS name,
             array_agg(entity_id ORDER BY created_at) AS entity_ids
      FROM core_entities e
      -- D5 for RESTAURANTS (round-six regression #2): the food sweep was
      -- hardened against shadow-minted vocabulary; this sibling was not.
      -- Two zero-evidence shadow restaurants passed the community gate
      -- (both empty), tied on entity_id, and merged SILENTLY. Same
      -- predicate, same import, same law.
      WHERE type = 'place' AND status = 'active'
        AND ${Prisma.raw(activeSupportExistsSql('e.entity_id'))}
        -- EMPTY FOLD IS NOT AN IDENTITY (round-10 aging sim, executed:
        -- every non-Latin name folds to '' and the sweep merged a Chinese
        -- noodle shop into a Russian dumpling house on the empty group).
        AND identity_key IS NOT NULL AND identity_key <> ''
      GROUP BY identity_key
      HAVING count(*) >= 2
    `;
    // PREFIX LANE (class ③): the stub/qualifier duplicate classes —
    // "Garbos" orbiting "Garbo's on Mopac", "Valentinas" vs "Valentinas
    // Tex Mex Bbq" — are token-boundary PREFIX pairs, invisible to exact
    // grouping. Conservative admission: the shorter side must be
    // UNGROUNDED (a stub by definition — grounded prefix pairs are the
    // chain/branch question, deliberately untouched pending P2.2), and
    // the SAME evidence hierarchy below judges the pair.
    // DOMAIN LANE (round-13 F3): a metro-demoted mint that later GROUNDS
    // to a branch of the same brand shares the brand's canonical domain —
    // but the identity lane needs equal folds and the prefix lane demands
    // an UNGROUNDED stub, so a grounded twin never paired and brand
    // fragmentation was permanent. Same registrable non-aggregator domain
    // = one operating business (the evidence hierarchy's own top rule),
    // so the pair goes straight to judgment.
    const domainPairs = await this.prisma.$queryRaw<
      Array<{ name: string; entity_ids: string[] }>
    >`
      SELECT lower(a.canonical_domain) AS name,
             ARRAY[a.entity_id, b.entity_id] AS entity_ids
      FROM core_entities a
      JOIN core_entities b
        ON b.type = 'place' AND b.status = 'active'
       AND a.entity_id < b.entity_id
       AND lower(b.canonical_domain) = lower(a.canonical_domain)
      WHERE a.type = 'place' AND a.status = 'active'
        AND a.canonical_domain IS NOT NULL
        -- Aggregator doctrine has ONE home (business-identity-rules.ts);
        -- this literal and the JS hierarchy below render from the same
        -- fragment list, so they cannot drift.
        AND ${Prisma.raw(nonAggregatorDomainSql('lower(a.canonical_domain)'))}
        AND ${Prisma.raw(activeSupportExistsSql('a.entity_id'))}
        AND ${Prisma.raw(activeSupportExistsSql('b.entity_id'))}
      LIMIT 50
    `;

    const prefixPairs = await this.prisma.$queryRaw<
      Array<{ name: string; entity_ids: string[] }>
    >`
      WITH stripped AS (
        SELECT entity_id,
               identity_key AS key,
               EXISTS (SELECT 1 FROM core_restaurant_locations l
                       WHERE l.restaurant_id = e2.entity_id
                         AND l.google_place_id IS NOT NULL) AS grounded
        FROM core_entities e2
        WHERE type = 'place' AND status = 'active'
          AND identity_key IS NOT NULL AND identity_key <> ''
          AND ${Prisma.raw(activeSupportExistsSql('e2.entity_id'))}
      )
      SELECT b.key AS name, ARRAY[a.entity_id, b.entity_id] AS entity_ids
      FROM stripped a
      JOIN stripped b
        ON a.key <> b.key
       AND b.key LIKE a.key || ' %'
       AND a.grounded = false
       AND length(a.key) >= 4
      -- AMBIGUITY GUARD: a stub that prefixes MORE THAN ONE distinct
      -- longer name ('kings' → kings kolache / kings co imperial / ...)
      -- cannot be attributed mechanically — hold it for a human or the
      -- re-extraction, never merge into whichever pair sorts first.
      WHERE (
        SELECT count(DISTINCT b2.key) FROM stripped b2
        WHERE b2.key <> a.key AND b2.key LIKE a.key || ' %'
      ) = 1
      LIMIT ${PREFIX_LANE_PER_RUN_CEILING}
    `;

    let merged = 0;
    let held = 0;
    const decisions: Array<{
      name: string;
      verdict: 'merge' | 'hold';
      canonicalId?: string;
      duplicateId?: string;
    }> = [];
    for (const group of [...groups, ...domainPairs, ...prefixPairs]) {
      const details = await this.prisma.$queryRaw<
        Array<{
          entity_id: string;
          name: string;
          mention_count: number;
          place_ids: string[];
          domain: string | null;
          communities: string[];
          dominant_community: string | null;
        }>
      >`
        SELECT e.entity_id,
               e.name,
               ${Prisma.raw(activeEntityEventCountSql('e.entity_id'))} AS mention_count,
               COALESCE((SELECT array_agg(DISTINCT l.google_place_id) FILTER (WHERE l.google_place_id IS NOT NULL) FROM core_restaurant_locations l WHERE l.restaurant_id = e.entity_id), '{}') AS place_ids,
               e.canonical_domain AS domain,
               ${Prisma.raw(activeCommunitiesArraySql('e.entity_id'))} AS communities,
               ${Prisma.raw(dominantCommunitySql('e.entity_id'))} AS dominant_community
        FROM core_entities e
        WHERE e.entity_id = ANY(${group.entity_ids}::uuid[])
          -- round-6 red team: an earlier merge THIS RUN may have archived a
          -- member; judging a stale snapshot could merge a tombstone (the
          -- length guard below then skips the pair for free)
          AND e.status = 'active'
        ORDER BY e.created_at
      `;
      if (details.length < 2) continue;
      // Pair-peel: judge the two OLDEST members this run; larger groups
      // converge across nightly runs as each merge removes a member.
      const [a, b] = details;
      // EVIDENCE HIERARCHY — ONE home (business-identity-rules.ts,
      // sameBusinessVerdict): shared ground or shared owned domain → merge;
      // two distinct owned domains → two businesses → hold; else DOMINANT-
      // community identity (final red team #1: any-overlap cross-metro-
      // merged Gueros into Gueros Brooklyn off one stray mention). The
      // extraction also closed a drift hole: the old inline JS aggregator
      // regex lacked facebook/instagram while the SQL lane above had them,
      // so two entities that merely shared facebook.com read as one owned
      // domain and merged.
      const mergeable = sameBusinessVerdict(
        {
          placeIds: a.place_ids,
          domain: a.domain,
          communities: a.communities,
          dominantCommunity: a.dominant_community,
        },
        {
          placeIds: b.place_ids,
          domain: b.domain,
          communities: b.communities,
          dominantCommunity: b.dominant_community,
        },
      );
      if (!mergeable) {
        held += 1;
        decisions.push({ name: group.name, verdict: 'hold' });
        continue;
      }
      // ACCENT VETO (2026-08-12 red team): identity_key strips accents, so
      // tone-differing names ("Cơm Chay" vs "Cơm Cháy") group as fold twins
      // and sameBusinessVerdict's dominant-community arm would merge two
      // different words into one restaurant. The one shared rule
      // (entity-identity.ts, same law as the resolver's mint veto): both
      // sides accented + accent-preserving folds conflict => different
      // businesses => hold. One-sided/absent accents still merge as before.
      if (!accentsAgreeUnbanked(a.name, b.name)) {
        held += 1;
        decisions.push({ name: group.name, verdict: 'hold' });
        continue;
      }
      const aGrounded = a.place_ids.length > 0;
      const bGrounded = b.place_ids.length > 0;
      const [canonicalId, duplicateId] =
        aGrounded !== bGrounded
          ? aGrounded
            ? [a.entity_id, b.entity_id]
            : [b.entity_id, a.entity_id]
          : b.mention_count > a.mention_count
            ? [b.entity_id, a.entity_id]
            : [a.entity_id, b.entity_id];
      decisions.push({
        name: group.name,
        verdict: 'merge',
        canonicalId,
        duplicateId,
      });
      if (!options.apply) {
        merged += 1;
        continue;
      }
      try {
        const canonical = await this.prisma.entity.findUniqueOrThrow({
          where: { entityId: canonicalId },
        });
        const duplicate = await this.prisma.entity.findUniqueOrThrow({
          where: { entityId: duplicateId },
        });
        await this.mergeDuplicatePlace({
          canonical,
          duplicate,
          canonicalUpdate: {},
        });
        merged += 1;
      } catch (error) {
        this.logger.error('Same-name duplicate merge failed', error, {
          operation: 'same_name_duplicate_sweep',
          canonicalId,
          duplicateId,
        });
      }
    }
    if (merged || held) {
      this.logger.warn('Same-name duplicate sweep result', {
        operation: 'same_name_duplicate_sweep',
        apply: options.apply,
        merged,
        held,
      });
    }
    return { merged, held, decisions };
  }
}
