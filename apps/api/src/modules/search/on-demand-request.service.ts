import { Injectable, Inject } from '@nestjs/common';
import { EntityType, OnDemandReason, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { JudgedVocabularyService } from '../content-processing/entity-resolver/judged-vocabulary.service';
import { normalizeDetectedLocaleTag } from '../../shared/locale';
import { SignalsService } from '../signals/signals.service';

export interface OnDemandRequestInput {
  term: string;
  entityType: EntityType;
  reason: OnDemandReason;
  entityId?: string | null;
  /** ENGINE re-key (§10/§11): the engines whose territory covers the ask's
   *  viewport. Queue rows are minted per engine; an ask with NO covering
   *  engine mints no queue row but STILL records its on_demand_ask signal —
   *  that is the uncovered-ask lane the ledger's territory read serves. */
  engineIds?: string[];
  /**
   * The language the ask was made in (spine step 2), canonical BCP 47 or
   * null. Rides onto the queue row AND onto the paired `on_demand_ask`
   * signal, so the two never disagree about what language a searcher used.
   *
   * NOT part of the demand identity: 'camarones' asked by a Spanish phone
   * and by an English one is ONE demand for one word. Splitting the row by
   * locale would halve the distinctUserCount that drives collection
   * priority — the exact R4-② mistake, one column over.
   */
  detectedLocale?: string | null;
  metadata?: Record<string, unknown>;
}

export interface OnDemandRequestRecordOptions {
  userId?: string | null;
  seenAt?: Date;
}

/**
 * One place decides what an empty/malformed tag means, so the queue row and
 * its paired signal can never disagree.
 *
 * This used to TRIM AND TRUNCATE only (A0 R2, 2026-08-11): any 35 characters
 * survived, so a malformed tag landed as free text on a row that the
 * `locale = ANY(chain)` match filter can never match — demand nobody can find,
 * collected against at real cost. It is a BCP-47 round trip now, shared with
 * every other locale-bearing write; `und`/unparseable means NULL, which is the
 * honest answer for a bare one-worder.
 */
function normalizeDetectedLocale(
  value: string | null | undefined,
): string | null {
  return normalizeDetectedLocaleTag(value);
}

@Injectable()
export class OnDemandRequestService {
  private readonly logger: LoggerService;
  private readonly cooldownMs: number;
  private readonly maxEntities: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService) loggerService: LoggerService,
    private readonly signals: SignalsService,
    private readonly judgedVocabulary: JudgedVocabularyService,
  ) {
    this.logger = loggerService.setContext('OnDemandRequestService');
    this.cooldownMs = this.resolveCooldownMs();
    this.maxEntities = this.resolveMaxEntities();
  }

  async recordRequests(
    requests: OnDemandRequestInput[],
    options: OnDemandRequestRecordOptions = {},
    context: Record<string, unknown> = {},
  ): Promise<OnDemandRequestInput[]> {
    const deduped = await this.deduplicateRequests(requests);
    const capped =
      this.maxEntities > 0 ? deduped.slice(0, this.maxEntities) : deduped;
    if (!capped.length) {
      return [];
    }

    const userId = this.normalizeUserId(options.userId);
    const seenAt =
      options.seenAt instanceof Date && !Number.isNaN(options.seenAt.getTime())
        ? options.seenAt
        : new Date();

    const queueCandidates = capped.flatMap((request) =>
      this.expandCollectableQueueTargets(request),
    );
    const queueable =
      this.cooldownMs > 0
        ? await this.filterByCooldown(queueCandidates, seenAt)
        : queueCandidates;
    const queueableKeys = new Set(
      queueable.map((request) => this.composeQueueTargetKey(request)),
    );

    // One search request can signal on-demand from TWO sites (interpretation-time
    // 'unresolved' + search-time 'low_result'); the shared searchRequestId dedupes
    // ask events across them (the request row itself is idempotent by identity).
    const searchRequestId =
      typeof context.searchRequestId === 'string' && context.searchRequestId
        ? context.searchRequestId
        : null;

    await this.prisma.$transaction(async (tx) => {
      for (const request of capped) {
        const resultRestaurantCount = this.extractInteger(
          context.restaurantCount,
        );
        const resultFoodCount = this.extractInteger(context.foodCount);
        const queueTargets = this.expandCollectableQueueTargets(request);
        const metadata = this.buildMetadata(request.metadata, context);

        for (const queueTarget of queueTargets) {
          const requestIsQueueable = queueableKeys.has(
            this.composeQueueTargetKey(queueTarget),
          );

          const createData: Prisma.OnDemandRequestCreateInput = {
            term: request.term,
            entityType: request.entityType,
            reason: request.reason,
            engineId: queueTarget.engineId,
            entityIdentityKey: queueTarget.entityIdentityKey,
            lastSeenAt: seenAt,
            lastQueuedAt: requestIsQueueable ? seenAt : undefined,
            detectedLocale: normalizeDetectedLocale(request.detectedLocale),
            metadata,
          };

          if (request.entityId) {
            createData.entity = {
              connect: { entityId: request.entityId },
            };
          }

          if (resultRestaurantCount !== null) {
            createData.resultRestaurantCount = resultRestaurantCount;
          }
          if (resultFoodCount !== null) {
            createData.resultFoodCount = resultFoodCount;
          }

          const updateData: Prisma.OnDemandRequestUpdateInput = {
            lastSeenAt: seenAt,
            engineId: queueTarget.engineId,
            entityIdentityKey: queueTarget.entityIdentityKey,
          };
          if (requestIsQueueable) {
            updateData.lastQueuedAt = seenAt;
          }
          // LAST DECIDED ANSWER WINS, BUT SILENCE NEVER OVERWRITES ONE. A
          // later ask whose language was undecidable must not erase a locale
          // an earlier ask actually established — that would make the column
          // flicker to NULL on the most common ask shape (a bare one-worder)
          // and lose the very rows collection needs.
          const askLocale = normalizeDetectedLocale(request.detectedLocale);
          if (askLocale) {
            updateData.detectedLocale = askLocale;
          }

          if (metadata) {
            updateData.metadata = metadata;
          }

          if (request.entityId !== undefined) {
            updateData.entity = request.entityId
              ? { connect: { entityId: request.entityId } }
              : { disconnect: true };
          }
          if (resultRestaurantCount !== null) {
            updateData.resultRestaurantCount = resultRestaurantCount;
          }
          if (resultFoodCount !== null) {
            updateData.resultFoodCount = resultFoodCount;
          }

          // Demand identity excludes `reason` — the same demand arriving as
          // 'unresolved' and later 'low_result' is ONE row; reason is a
          // last-writer-wins attribute on it.
          updateData.reason = request.reason;
          const record = await tx.onDemandRequest.upsert({
            where: {
              term_entityType_engineId_entityIdentityKey: {
                term: request.term,
                entityType: request.entityType,
                engineId: queueTarget.engineId,
                entityIdentityKey: queueTarget.entityIdentityKey,
              },
            },
            create: createData,
            update: updateData,
            select: { requestId: true },
          });

          if (userId) {
            await tx.onDemandRequestUser.upsert({
              where: {
                requestId_userId: {
                  requestId: record.requestId,
                  userId,
                },
              },
              create: {
                requestId: record.requestId,
                userId,
                firstSeenAt: seenAt,
                lastSeenAt: seenAt,
                askCount: 1,
              },
              update: {
                lastSeenAt: seenAt,
                askCount: { increment: 1 },
              },
            });

            const distinctUserCount = await tx.onDemandRequestUser.count({
              where: { requestId: record.requestId },
            });

            await tx.onDemandRequest.update({
              where: { requestId: record.requestId },
              data: { distinctUserCount },
            });
          }
        }

        // Phase C: the gap record IS a signal (kind = 'on_demand_ask',
        // replacing collection_on_demand_ask_events). Subject carries the
        // asked term (+ resolved entity for low-result asks); geo is the
        // searcher's viewport bounds — the same bbox as the search act, so
        // the §11 unmet family reads asks by TERRITORY, not engine name.
        // Fire-and-forget by law; the two ask sites of one search share
        // meta.askSearchRequestId and are deduped AT READ (deliberately NOT
        // meta.searchRequestId — that key is the ledger-wide act-dedupe key
        // and would collapse the ask into its originating search act).
        this.signals.record({
          kind: 'on_demand_ask',
          userId,
          subject: {
            entityId: request.entityId ?? null,
            term: request.term,
          },
          geo: this.signals.bboxFromBounds(
            this.extractBounds(context.bounds) ?? null,
          ),
          occurredAt: seenAt,
          detectedLocale: normalizeDetectedLocale(request.detectedLocale),
          meta: {
            askSearchRequestId: searchRequestId ?? undefined,
            reason: request.reason,
            entityType: request.entityType,
            resultRestaurantCount: resultRestaurantCount ?? undefined,
            resultFoodCount: resultFoodCount ?? undefined,
            source:
              typeof context.source === 'string' ? context.source : undefined,
          },
        });
      }
    });

    this.logger.debug('Recorded on-demand requests', {
      requests: capped.map((request) => ({
        term: request.term,
        entityType: request.entityType,
        reason: request.reason,
      })),
      queueable: queueable.length,
      userId: userId ?? undefined,
    });

    return capped.filter((request) =>
      this.expandCollectableQueueTargets(request).some((target) =>
        queueableKeys.has(this.composeQueueTargetKey(target)),
      ),
    );
  }

  private async deduplicateRequests(
    requests: OnDemandRequestInput[],
  ): Promise<OnDemandRequestInput[]> {
    const seen = new Set<string>();
    const result: OnDemandRequestInput[] = [];
    for (const request of requests) {
      const sanitizedTerm = await this.sanitizeTerm(
        request.term,
        request.detectedLocale,
      );
      if (!sanitizedTerm) {
        continue;
      }
      const entityId = this.normalizeEntityId(request.entityId);
      const key = `${request.reason}:${
        request.entityType
      }:${entityId ?? 'no_entity'}:${sanitizedTerm.toLowerCase()}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      // FIELD-BY-FIELD REBUILD — every field of OnDemandRequestInput must be
      // listed here or it is silently dropped on the way to the writer. That
      // is exactly what happened to `detectedLocale` on its first run: the
      // caller set it, the column stayed NULL, and nothing anywhere errored.
      // The dedupe KEY deliberately excludes locale (locale is an attribute
      // of a demand, not a dimension of it — see the field's doc comment),
      // but excluding it from the key must not mean dropping the value.
      result.push({
        term: sanitizedTerm,
        entityType: request.entityType,
        reason: request.reason,
        entityId,
        engineIds: this.normalizeEngineIds(request.engineIds),
        detectedLocale: request.detectedLocale ?? null,
        metadata: request.metadata,
      });
    }
    return result;
  }

  private normalizeUserId(userId?: string | null): string | null {
    const normalized = typeof userId === 'string' ? userId.trim() : '';
    return normalized.length ? normalized : null;
  }

  private normalizeEntityId(entityId?: string | null): string | null {
    const normalized = typeof entityId === 'string' ? entityId.trim() : '';
    return normalized.length ? normalized : null;
  }

  /**
   * THE WRITE DOOR (2026-08-13). An on-demand request is a spend decision —
   * it sends the collector out to search a term — so it may never be recorded
   * about a word nobody has judged. `judgeThenStrip` hears every unheard token
   * of this ask in its own language BEFORE the sanitized term is minted, then
   * removes the ones ruled pure grammatical work; a term left with nothing but
   * grammar is no ask at all and is dropped.
   *
   * The ask's OWN language still decides. What changed is that we now hold a
   * vocabulary for every language a word has been heard in, rather than only
   * English — so a Spanish ask is judged in Spanish instead of escaping
   * judgement altogether.
   *
   * The ask-SHAPE strip ("best … near me") runs after as its own law — from
   * WORD-ROLE verdicts now, per-language, where the retired
   * `generic-token-handling.ts` list was English-only.
   */
  private async sanitizeTerm(
    term: string,
    detectedLocale?: string | null,
  ): Promise<string> {
    const judged = await this.judgedVocabulary.judgeThenStrip(
      term,
      detectedLocale,
    );
    // HELD counts as "no ask yet": an on-demand request sends the collector
    // out to spend, and it waits for the verdict rather than guessing.
    if (judged.isGenericOnly || judged.heldUnjudged) return '';
    const stripped = this.judgedVocabulary.stripAskFrame(
      judged.text,
      detectedLocale,
    );
    return stripped.isGenericOnly ? '' : stripped.text;
  }

  // §16 K1 — RATIFIED 2026-07-24 (§18-8b(a), owner-delegated): the 300s
  // is a PURE DEBOUNCE ("the same ask may re-trigger at most every 5
  // minutes") — the old landing-latency rationale is deleted because
  // duplicate-work protection is the queue's target-key +
  // searchRequestId DEDUPE's job, not the cooldown's. The 5-entity
  // blast radius is K1 ("one ask queues a handful") — collection breadth
  // per ask is an owner cost stance; deriving it from engagement would
  // cross the values boundary.
  private resolveCooldownMs(): number {
    return 300_000;
  }

  private resolveMaxEntities(): number {
    return 5;
  }

  private composeQueueTargetKey(request: {
    term: string;
    entityType: EntityType;
    reason: OnDemandReason;
    engineId: string;
    entityIdentityKey: string;
  }): string {
    return `${request.reason}:${
      request.entityType
    }:${request.entityIdentityKey}:${request.term.toLowerCase()}:${
      request.engineId
    }`;
  }

  private async filterByCooldown(
    requests: Array<{
      term: string;
      entityType: EntityType;
      reason: OnDemandReason;
      engineId: string;
      entityIdentityKey: string;
    }>,
    seenAt: Date,
  ): Promise<
    Array<{
      term: string;
      entityType: EntityType;
      reason: OnDemandReason;
      engineId: string;
      entityIdentityKey: string;
    }>
  > {
    if (this.cooldownMs <= 0) {
      return requests;
    }
    if (!requests.length) {
      return [];
    }

    const ors = requests.map((request) => ({
      term: request.term,
      entityType: request.entityType,
      reason: request.reason,
      engineId: request.engineId,
      entityIdentityKey: request.entityIdentityKey,
    }));

    const existing = await this.prisma.onDemandRequest.findMany({
      where: { OR: ors },
      select: {
        term: true,
        entityType: true,
        reason: true,
        engineId: true,
        entityIdentityKey: true,
        lastQueuedAt: true,
      },
    });

    const cutoffByKey = new Map<string, Date | null>();
    for (const row of existing) {
      cutoffByKey.set(
        `${row.reason}:${row.entityType}:${row.entityIdentityKey}:${row.term.toLowerCase()}:${
          row.engineId
        }`,
        row.lastQueuedAt,
      );
    }

    const nowMs = seenAt.getTime();
    return requests.filter((request) => {
      const key = this.composeQueueTargetKey(request);
      const lastQueuedAt = cutoffByKey.get(key);
      if (!lastQueuedAt) {
        return true;
      }
      return nowMs - lastQueuedAt.getTime() >= this.cooldownMs;
    });
  }

  private expandCollectableQueueTargets(request: OnDemandRequestInput): Array<{
    term: string;
    entityType: EntityType;
    reason: OnDemandReason;
    engineId: string;
    entityIdentityKey: string;
  }> {
    const entityIdentityKey = this.composeEntityIdentityKey(request.entityId);
    return this.normalizeEngineIds(request.engineIds).map((engineId) => ({
      term: request.term,
      entityType: request.entityType,
      reason: request.reason,
      engineId,
      entityIdentityKey,
    }));
  }

  private composeEntityIdentityKey(entityId?: string | null): string {
    return this.normalizeEntityId(entityId) ?? 'no_entity';
  }

  private normalizeEngineIds(engineIds?: string[] | null): string[] {
    if (!Array.isArray(engineIds)) {
      return [];
    }
    return Array.from(
      new Set(
        engineIds
          .map((engineId) =>
            typeof engineId === 'string' ? engineId.trim() : '',
          )
          .filter((engineId) => engineId.length > 0),
      ),
    );
  }

  private buildMetadata(
    metadata: Record<string, unknown> | undefined,
    context: Record<string, unknown>,
  ): Prisma.JsonObject | undefined {
    const base: Record<string, unknown> = {
      ...(metadata ?? {}),
    };
    if (Object.keys(context).length > 0) {
      base.context = {
        ...(typeof base.context === 'object' && base.context !== null
          ? (base.context as Record<string, unknown>)
          : {}),
        ...context,
      };
    }
    return Object.keys(base).length ? (base as Prisma.JsonObject) : undefined;
  }

  /** The ask sites pass the search viewport as context.bounds (see the two
   *  recordRequests call sites) — the on_demand_ask signal's geo. */
  private extractBounds(value: unknown): {
    northEast: { lat: number; lng: number };
    southWest: { lat: number; lng: number };
  } | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const bounds = value as {
      northEast?: { lat?: unknown; lng?: unknown };
      southWest?: { lat?: unknown; lng?: unknown };
    };
    const ne = bounds.northEast;
    const sw = bounds.southWest;
    if (
      typeof ne?.lat !== 'number' ||
      typeof ne.lng !== 'number' ||
      typeof sw?.lat !== 'number' ||
      typeof sw.lng !== 'number'
    ) {
      return null;
    }
    return {
      northEast: { lat: ne.lat, lng: ne.lng },
      southWest: { lat: sw.lat, lng: sw.lng },
    };
  }

  private extractInteger(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value);
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return Math.trunc(parsed);
      }
    }
    return null;
  }
}
