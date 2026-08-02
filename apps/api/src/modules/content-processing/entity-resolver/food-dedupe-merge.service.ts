import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EntityStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { foodNameVariants, isSameFoodUpToNumber } from './food-lemma';
import { entityIdentityKey } from './entity-identity';
import { LoggerService } from '../../../shared';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { EntityAnchorRehomeService } from './entity-anchor-rehome.service';
import { activeSupportExistsSql } from '../reddit-collector/extraction-scope.service';

export interface DedupeMergeSummary {
  candidatePairs: number;
  autoMerged: number;
  judgeMerged: number;
  judgeRejected: number;
}

const STOPWORDS = new Set(['and', 'with', 'the', 'a', 'of', 'de', 'y']);

/**
 * Periodic food dedupe-merge — the long-term-ideal replacement for the old
 * "Phase 3 raw-emit" idea. Duplicate variants that slip past within-batch
 * dedupe ("steak and frites" vs "steak frites", "hainan" vs "hainanese
 * chicken") get found by trigram candidate scan, adjudicated (deterministic
 * token-multiset rule first, batched LLM judge for the rest), and MERGED:
 * connections re-pointed (colliding (restaurant,food) rows folded together),
 * the loser's name banked as an alias on the winner, loser archived. The
 * variation data is thereby fully exploited instead of lost.
 *
 * Winner = the food with more connections (more evidence behind its name);
 * ties break to the shorter name (more canonical).
 */
@Injectable()
export class FoodDedupeMergeService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LLMService,
    private readonly anchorRehome: EntityAnchorRehomeService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('FoodDedupeMergeService');
  }

  /** Nightly convergence (class ④): the restaurant sweep has run nightly
   *  for weeks while food dedupe was manual-only — which is how 26
   *  duplicate food groups accumulated. Same 3AM window; deterministic
   *  lanes are free, the judge lane is a handful of interactive calls
   *  under Tier-2/3 governance. Cron registration is worker-gated
   *  globally (isSchedulerRuntime). */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runNightly(): Promise<void> {
    await this.refreshSortedIdentityKeys();
    await this.run({ dryRun: false });
  }

  /** identity_key_sorted is APP-WRITTEN (the lemma fold has no SQL
   *  mirror). Creates write it inline; renames and pre-column rows heal
   *  here nightly before the lanes that join on it run. */
  async refreshSortedIdentityKeys(): Promise<void> {
    const stale = await this.prisma.$queryRaw<
      Array<{ entityId: string; name: string; type: string }>
    >`
      SELECT entity_id AS "entityId", name, type::text AS type
      FROM core_entities
      WHERE identity_key_sorted IS NULL
         OR (type NOT IN ('food','ingredient') AND identity_key_sorted <> identity_key)
    `;
    for (const row of stale) {
      await this.prisma.$executeRaw`
        UPDATE core_entities
        SET identity_key_sorted = ${entityIdentityKey(row.name, row.type as never)}
        WHERE entity_id = ${row.entityId}::uuid`;
    }
  }

  async run(
    options: { similarityFloor?: number; dryRun?: boolean } = {},
  ): Promise<DedupeMergeSummary> {
    const floor = options.similarityFloor ?? 0.72;
    const dryRun = options.dryRun ?? false;
    const summary: DedupeMergeSummary = {
      candidatePairs: 0,
      autoMerged: 0,
      judgeMerged: 0,
      judgeRejected: 0,
    };

    // 0. NUMBER VARIANTS FIRST — and deliberately OUTSIDE the trigram scan.
    // This sweep has always excluded substring-related pairs (step 1's
    // `position(a.name IN b.name) = 0`) to protect legitimate specific-vs-
    // general dishes like "chicken sandwich" inside "chicken parm sandwich".
    // But "taco" is a substring of "tacos", so that guard silently excluded
    // EVERY singular/plural pair — which is why 260 of them accumulated in a
    // database that has had a dedupe sweep all along. Number variance is
    // decided in code (food-lemma.ts), never by similarity or by the judge,
    // so it gets its own lane with no floor and no LLM call.
    // ACTIVE-SUPPORT ONLY (foundational re-derivation, D5): this sweep used
    // to see EVERY active food, including vocabulary a SHADOW extraction
    // minted. It could then judge a shadow-minted food and a live one the
    // same, archive the LIVE one, and rekey user list items into a
    // candidate that might be discarded — which `discard` cannot undo.
    // "Has a connection" IS "has active support": the projection rebuild
    // only writes connections from the document's ACTIVE run.
    const activeFoods = await this.prisma.$queryRaw<
      Array<{ entityId: string; name: string }>
    >(Prisma.sql`
      SELECT e.entity_id AS "entityId", e.name
      FROM core_entities e
      WHERE e.type = 'food' AND e.status = 'active'
        AND ${Prisma.raw(activeSupportExistsSql('e.entity_id'))}`);
    const seenNumberPair = new Set<string>();
    const numberVariantPairs: {
      a_id: string;
      a_name: string;
      b_id: string;
      b_name: string;
    }[] = [];
    const byLowerName = new Map(
      activeFoods.map((f) => [f.name.toLowerCase().trim(), f]),
    );
    for (const food of activeFoods) {
      for (const variant of foodNameVariants(food.name)) {
        const other = byLowerName.get(variant);
        if (!other || other.entityId === food.entityId) continue;
        if (!isSameFoodUpToNumber(food.name, other.name)) continue;
        const key = [food.entityId, other.entityId].sort().join(':');
        if (seenNumberPair.has(key)) continue;
        seenNumberPair.add(key);
        numberVariantPairs.push({
          a_id: food.entityId,
          a_name: food.name,
          b_id: other.entityId,
          b_name: other.name,
        });
      }
    }
    // STALE-SNAPSHOT GUARD (red team R4): with three variants
    // (taco/tacos/tacoes) the pair list is enumerated once, so a later pair
    // can reference an entity an earlier pair already archived — and the
    // winner rule would happily crown a tombstone. Any id consumed by a
    // completed number merge skips subsequent pairs; the next sweep run
    // sees the healed state and finishes the chain.
    const consumedByNumberLane = new Set<string>();
    for (const pair of numberVariantPairs) {
      if (
        consumedByNumberLane.has(pair.a_id) ||
        consumedByNumberLane.has(pair.b_id)
      ) {
        continue;
      }
      if (dryRun) {
        this.logger.info('Would merge number-variant foods', {
          a: pair.a_name,
          b: pair.b_name,
          via: 'number',
        });
      } else {
        await this.mergeFoodPair(pair.a_id, pair.b_id);
        consumedByNumberLane.add(pair.a_id);
        consumedByNumberLane.add(pair.b_id);
      }
      summary.autoMerged += 1;
    }
    const mergedByNumber = new Set(
      numberVariantPairs.flatMap((p) => [p.a_id, p.b_id]),
    );

    // 0b. WORD-ORDER TWINS (final red team #6): identical token multiset
    // after the canonical fold ("square pizza"/"pizza square" — the exact
    // twin class the identity lock was built for, still in the graph
    // because the trigram lane requires BOTH sides supported and one twin
    // never got items). Deterministic like the number lane: decided in
    // code, no judge. OR-support suffices — merging an unsupported twin
    // into its supported double cannot promote shadow vocabulary, the
    // supported side wins. Same conflation caveat as the creation-time
    // order-probe (round 4): logged loudly, none genuinely distinct today.
    const orderTwinPairs = await this.prisma.$queryRaw<
      { a_id: string; a_name: string; b_id: string; b_name: string }[]
    >`
      SELECT a.entity_id a_id, a.name a_name, b.entity_id b_id, b.name b_name
      FROM core_entities a
      JOIN core_entities b ON a.entity_id < b.entity_id
      WHERE a.type = 'food' AND b.type = 'food'
        AND a.status = 'active' AND b.status = 'active'
        AND (
          EXISTS (SELECT 1 FROM core_restaurant_items ca
                  WHERE a.entity_id IN (ca.restaurant_id, ca.food_id))
          OR EXISTS (SELECT 1 FROM core_restaurant_items cb
                     WHERE b.entity_id IN (cb.restaurant_id, cb.food_id))
        )
        AND a.identity_key_sorted IS NOT NULL
        AND a.identity_key_sorted = b.identity_key_sorted
    `;
    // JUDGE-GATED, never auto (final-final red team: the column's first
    // backfill immediately surfaced "dumpling soup"/"soup dumplings" —
    // token-multiset-identical yet genuinely DIFFERENT dishes. Word order
    // can be meaning; only the judge may collapse it.)
    const orderPairsToJudge = orderTwinPairs.filter(
      (pair) =>
        !consumedByNumberLane.has(pair.a_id) &&
        !consumedByNumberLane.has(pair.b_id) &&
        !mergedByNumber.has(pair.a_id) &&
        !mergedByNumber.has(pair.b_id),
    );
    if (orderPairsToJudge.length && !dryRun) {
      const verdicts = await this.llmService.matchEntitiesBatch({
        kind: 'food',
        items: orderPairsToJudge.map((pair) => ({
          term: pair.a_name,
          candidates: [{ id: 1, name: pair.b_name }],
        })),
      });
      for (let i = 0; i < orderPairsToJudge.length; i += 1) {
        const pair = orderPairsToJudge[i];
        if (verdicts[i]?.decision !== 'match') {
          summary.judgeRejected += 1;
          continue;
        }
        this.logger.warn('Merging word-order twin foods (judge-approved)', {
          a: pair.a_name,
          b: pair.b_name,
          via: 'token-multiset+judge',
        });
        await this.mergeFoodPair(pair.a_id, pair.b_id);
        consumedByNumberLane.add(pair.a_id);
        consumedByNumberLane.add(pair.b_id);
        summary.judgeMerged += 1;
      }
    } else if (orderPairsToJudge.length) {
      for (const pair of orderPairsToJudge) {
        this.logger.info('Would judge word-order twin foods', {
          a: pair.a_name,
          b: pair.b_name,
        });
      }
    }

    // 1. Candidate pairs: high trigram similarity, both active foods, and not
    // substring-related (substrings are legitimate specific-vs-general dishes,
    // e.g. "chicken sandwich" ⊂ "chicken parm sandwich").
    const allPairs = await this.prisma.$queryRaw<
      { a_id: string; a_name: string; b_id: string; b_name: string }[]
    >`
      SELECT a.entity_id a_id, a.name a_name, b.entity_id b_id, b.name b_name
      FROM core_entities a
      JOIN core_entities b ON a.entity_id < b.entity_id
      WHERE a.type = 'food' AND b.type = 'food'
        AND a.status = 'active' AND b.status = 'active'
        -- active-support only (D5): never merge shadow-minted vocabulary.
        -- The predicate is the scope service's ONE definition, imported.
        AND ${Prisma.raw(activeSupportExistsSql('a.entity_id'))}
        AND ${Prisma.raw(activeSupportExistsSql('b.entity_id'))}
        AND similarity(a.name, b.name) > ${floor}
        AND position(a.name IN b.name) = 0
        AND position(b.name IN a.name) = 0
      ORDER BY similarity(a.name, b.name) DESC
      LIMIT 200
    `;
    const pairs = allPairs.filter(
      (p) => !mergedByNumber.has(p.a_id) && !mergedByNumber.has(p.b_id),
    );
    summary.candidatePairs = pairs.length;
    if (!pairs.length) {
      return summary;
    }

    // 2. Deterministic rule: identical token multisets modulo connector
    // stopwords ("steak and frites" == "steak frites") auto-merge; the rest
    // go to one batched judge call.
    const autoMerge: typeof pairs = [];
    const needJudge: typeof pairs = [];
    for (const pair of pairs) {
      if (this.contentTokens(pair.a_name) === this.contentTokens(pair.b_name)) {
        autoMerge.push(pair);
      } else {
        needJudge.push(pair);
      }
    }

    let judged: { pair: (typeof pairs)[number]; same: boolean }[] = [];
    if (needJudge.length) {
      const verdicts = await this.llmService.matchEntitiesBatch({
        kind: 'food',
        items: needJudge.map((pair) => ({
          term: pair.a_name,
          candidates: [{ id: 1, name: pair.b_name }],
        })),
      });
      judged = needJudge.map((pair, index) => ({
        pair,
        same: verdicts[index]?.decision === 'match',
      }));
    }

    const toMerge = [
      ...autoMerge.map((pair) => ({ pair, via: 'auto' as const })),
      ...judged
        .filter((entry) => entry.same)
        .map((entry) => ({ pair: entry.pair, via: 'judge' as const })),
    ];
    summary.judgeRejected += judged.filter((entry) => !entry.same).length;

    for (const { pair, via } of toMerge) {
      if (dryRun) {
        this.logger.info('Would merge duplicate foods', {
          a: pair.a_name,
          b: pair.b_name,
          via,
        });
      } else {
        await this.mergeFoodPair(pair.a_id, pair.b_id);
      }
      if (via === 'auto') summary.autoMerged += 1;
      else summary.judgeMerged += 1;
    }

    this.logger.info('Food dedupe-merge pass complete', {
      dryRun,
      ...(summary as unknown as Record<string, unknown>),
    });
    return summary;
  }

  /** Full merge: pick winner by evidence, fold connections, bank the loser's
   *  name+aliases on the winner, archive the loser. */
  private async mergeFoodPair(idA: string, idB: string): Promise<void> {
    const [connectionsA, connectionsB] = await Promise.all([
      this.prisma.connection.count({ where: { foodId: idA } }),
      this.prisma.connection.count({ where: { foodId: idB } }),
    ]);
    const [entityA, entityB] = await Promise.all([
      this.prisma.entity.findUniqueOrThrow({
        where: { entityId: idA },
        select: { entityId: true, name: true, aliases: true },
      }),
      this.prisma.entity.findUniqueOrThrow({
        where: { entityId: idB },
        select: { entityId: true, name: true, aliases: true },
      }),
    ]);
    const aWins =
      connectionsA !== connectionsB
        ? connectionsA > connectionsB
        : entityA.name.length <= entityB.name.length;
    const winner = aWins ? entityA : entityB;
    const loser = aWins ? entityB : entityA;

    await this.prisma.$transaction(async (tx) => {
      // Fold colliding connections (same restaurant has both variants).
      const loserConnections = await tx.connection.findMany({
        where: { foodId: loser.entityId },
      });
      for (const connection of loserConnections) {
        const surviving = await tx.connection.findUnique({
          where: {
            restaurantId_foodId: {
              restaurantId: connection.restaurantId,
              foodId: winner.entityId,
            },
          },
          select: { connectionId: true, lastMentionedAt: true },
        });
        if (!surviving) {
          await tx.connection.update({
            where: { connectionId: connection.connectionId },
            data: { foodId: winner.entityId },
          });
          continue;
        }
        // Re-point dependents, sum counters, drop the loser row.
        // COLLISION DEDUPE (red team R1): the claim-identity rollup shadows
        // only ACROSS foods (c2.food_id <> c.food_id), so two direct
        // mentions of the SAME document landing on ONE merged connection
        // can never shadow each other — a bare re-point would recreate at
        // the mention grain exactly the double count this merge exists to
        // kill. A loser mention whose (document, kind) already exists on
        // the survivor is dropped, mirroring mergeFoodEntityEvents.
        const survivorMentions = await tx.restaurantItemMention.findMany({
          where: { connectionId: surviving.connectionId },
          select: { sourceDocumentId: true, kind: true },
        });
        const survivorKeys = new Set(
          survivorMentions.map(
            (mention) => `${mention.sourceDocumentId ?? ''}:${mention.kind}`,
          ),
        );
        const loserMentions = await tx.restaurantItemMention.findMany({
          where: { connectionId: connection.connectionId },
          select: {
            id: true,
            sourceDocumentId: true,
            kind: true,
            sourceUpvotes: true,
          },
        });
        // Deleted mentions must ALSO leave the counters (red team F2): the
        // loser's counters are incremented onto the survivor wholesale
        // below, so a deduped-away mention would stay baked into
        // mention_count/total_upvotes — dish ranking and minimumVotes read
        // those columns, recreating at the dish grain the double count this
        // dedupe kills at the mention grain.
        let deletedDirectCount = 0;
        let deletedDirectUpvotes = 0;
        let deletedSupportCount = 0;
        let deletedSupportUpvotes = 0;
        for (const mention of loserMentions) {
          const key = `${mention.sourceDocumentId ?? ''}:${mention.kind}`;
          if (mention.sourceDocumentId && survivorKeys.has(key)) {
            await tx.restaurantItemMention.delete({
              where: { id: mention.id },
            });
            if (mention.kind === 'direct') {
              deletedDirectCount += 1;
              deletedDirectUpvotes += mention.sourceUpvotes;
            } else {
              deletedSupportCount += 1;
              deletedSupportUpvotes += mention.sourceUpvotes;
            }
          } else {
            await tx.restaurantItemMention.update({
              where: { id: mention.id },
              data: { connectionId: surviving.connectionId },
            });
            survivorKeys.add(key);
          }
        }
        await this.anchorRehome.rehomeUserListItems(
          tx,
          'connectionId',
          surviving.connectionId,
          connection.connectionId,
        );
        // curated picks + photos cascade on connection delete — repoint
        // BEFORE the loser row goes (shared user-anchor law)
        await this.anchorRehome.rehomeConnectionAnchors(
          tx,
          surviving.connectionId,
          connection.connectionId,
        );
        // (event re-pointing happens once per pair, after the connection
        // loop — see mergeFoodEntityEvents)
        // Phase C: view history lives in the signals ledger — the reader
        // resolves the dead connectionId to the survivor at read (via
        // entity_redirects + (food, restaurant)); no rekey.
        await tx.connection.update({
          where: { connectionId: surviving.connectionId },
          data: {
            mentionCount: {
              increment: connection.mentionCount - deletedDirectCount,
            },
            totalUpvotes: {
              increment: connection.totalUpvotes - deletedDirectUpvotes,
            },
            supportMentionCount: {
              increment: connection.supportMentionCount - deletedSupportCount,
            },
            supportTotalUpvotes: {
              increment: connection.supportTotalUpvotes - deletedSupportUpvotes,
            },
            lastMentionedAt:
              connection.lastMentionedAt &&
              (!surviving.lastMentionedAt ||
                connection.lastMentionedAt > surviving.lastMentionedAt)
                ? connection.lastMentionedAt
                : undefined,
          },
        });
        await tx.connection.delete({
          where: { connectionId: connection.connectionId },
        });
      }

      // Bank the loser's name + aliases on the winner; archive the loser.
      const mergedAliases = Array.from(
        new Set(
          [...winner.aliases, loser.name, ...loser.aliases]
            .map((alias) => alias.trim().toLowerCase())
            .filter(Boolean),
        ),
      );
      await tx.entity.update({
        where: { entityId: winner.entityId },
        data: { aliases: mergedAliases, nameEmbeddingStale: true },
      });
      await tx.entity.update({
        where: { entityId: loser.entityId },
        data: { status: EntityStatus.archived },
      });

      // Hard-rekey every user-anchored table off the archived loser (poll
      // targets + topic arrays, curated items, photos, on-demand requests,
      // demand candidates) — user links never point at a tombstone.
      await this.anchorRehome.rehomeEntityAnchors(
        tx,
        winner.entityId,
        loser.entityId,
      );

      // Identity is a judgment (§3, red-team 2b): merges WRITE redirects; the
      // signals ledger is never rekeyed — readers resolve loser subjectIds to
      // the survivor at read. Chains are flattened so the readers' one-hop
      // COALESCE stays complete (A→B then B→C rewrites A→C), and any stale
      // redirect FROM the live winner is dropped.
      // THE SUBSTRATE, NOT JUST THE PROJECTION (2026-07-28). Re-pointing
      // connections alone is NOT DURABLE: core_restaurant_items is a
      // PROJECTION rebuilt from the entity-event ledger, and the
      // rebuild does not follow entity_redirects. So a merge that leaves the
      // event ledger pointing at the archived loser is undone by the next
      // full rebuild — it would RESURRECT every split we just collapsed.
      // Measured when this was found: 4,247 events still pointed at archived
      // foods. The restaurant merge already did this
      // (mergeRestaurantEntityEvents); the food merge simply never did.
      await this.mergeFoodEntityEvents(tx, winner.entityId, loser.entityId);

      await tx.entityRedirect.updateMany({
        where: { toEntityId: loser.entityId },
        data: { toEntityId: winner.entityId },
      });
      await tx.entityRedirect.deleteMany({
        where: { fromEntityId: winner.entityId },
      });
      await tx.entityRedirect.upsert({
        where: { fromEntityId: loser.entityId },
        update: { toEntityId: winner.entityId },
        create: { fromEntityId: loser.entityId, toEntityId: winner.entityId },
      });
    });

    this.logger.info('Merged duplicate foods', {
      winner: winner.name,
      loser: loser.name,
    });
  }

  private contentTokens(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token && !STOPWORDS.has(token))
      .sort()
      .join(' ');
  }
  /** Re-point the loser's evidence events onto the winner. Mirrors
   *  RestaurantEntityMergeService.mergeRestaurantEntityEvents: an event that
   *  would collide with an identical winner event is dropped rather than
   *  duplicated, so a merge can never inflate evidence. */
  private async mergeFoodEntityEvents(
    tx: Prisma.TransactionClient,
    winnerId: string,
    loserId: string,
  ): Promise<void> {
    const loserEvents = await tx.restaurantEntityEvent.findMany({
      where: { entityId: loserId },
      select: {
        eventId: true,
        extractionRunId: true,
        sourceDocumentId: true,
        restaurantId: true,
        evidenceType: true,
      },
    });

    for (const event of loserEvents) {
      // Mirrors the LIVE content unique (run, doc, restaurant, entity,
      // type) — the mention-key check missed same-document collisions and
      // the re-point aborted on P2002 (round-2 red team).
      const conflicting = await tx.restaurantEntityEvent.findFirst({
        where: {
          extractionRunId: event.extractionRunId,
          sourceDocumentId: event.sourceDocumentId,
          restaurantId: event.restaurantId,
          entityId: winnerId,
          evidenceType: event.evidenceType,
        },
        select: { eventId: true },
      });
      if (conflicting) {
        await tx.restaurantEntityEvent.delete({
          where: { eventId: event.eventId },
        });
        continue;
      }
      await tx.restaurantEntityEvent.update({
        where: { eventId: event.eventId },
        data: { entityId: winnerId },
      });
    }
  }
}
