import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { canonicalFold } from '../content-processing/entity-resolver/entity-identity';
import { RESTAURANT_NAME_RULE_VERSION } from '../content-processing/entity-resolver/restaurant-name-rule';
import {
  RESTAURANT_NAME_LANE,
  restaurantNameLane,
} from '../content-processing/entity-resolver/restaurant-name-lane';

/**
 * THE DENIED-NAME READ — the court's verdicts, consulted where names are
 * matched (R15 defect 2, 2026-08-16).
 *
 * A `notAName` verdict from the restaurant-name court (C4a) deprecates the
 * form's `entity_surface` rows — but the name arms never read that table for
 * the ENTITY'S OWN NAME: autocomplete's exact/prefix arms and the gazetteer's
 * identity/name arms match `core_entities.name` / `identity_key` DIRECTLY, so
 * a denied name stayed fully reachable (probed: ghost-class names like
 * 'Bistro', 'Cozy', 'Fonda' still served exact-top after their denial). The
 * court ruled and the arms never heard.
 *
 * WHAT THIS SERVICE IS: the denied set, cached — every (entityId, folded form)
 * with a live `notAName` verdict AT THE RULE + FOLD VERSION IN FORCE (the
 * ledger's own `=` version discipline: a superseded rule's denial answers
 * nothing). NOT a hand list; the ledger is the one authority and this is a
 * read of it. The name arms anti-join against it wherever `e.name` /
 * `e.identity_key` can produce a match; nothing here touches the alias arms —
 * surface deprecation already governs those.
 *
 * NAME-HOOD ≠ SEARCHABILITY: an `isName` verdict (ghost 'Best' is UPHELD)
 * changes nothing — only `notAName` suppresses, and only for the denied
 * (entity, form) pair. An entity whose name is denied but which holds some
 * other adjudicated recall surface remains reachable through that surface.
 *
 * CACHE IDIOM: same shape as the judged-vocabulary verdict cache
 * (80b161352) — a plain unref()'d setInterval started in onModuleInit (an
 * @Interval is dead on PROCESS_ROLE=api, exactly the process that serves the
 * arms), a max(decided_at)+count watermark so a poll that finds nothing new
 * costs one indexed aggregate, and a lazy first load so scripts pay only when
 * they match names.
 */

/** How often a process checks whether another one ruled something. */
const CACHE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export interface DeniedNamePair {
  entityId: string;
  /** canonicalFold of the denied form — the spelling `identity_key` speaks,
   *  so the arms can compare it to the column they already match on. */
  formFolded: string;
}

@Injectable()
export class DeniedNameRegistryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger: LoggerService;
  private refreshTimer: NodeJS.Timeout | null = null;
  private loadPromise: Promise<void> | null = null;
  private loaded = false;
  private refreshing = false;
  private pairs: DeniedNamePair[] = [];
  private pairSet = new Set<string>();
  private watermark: { decidedAt: string | null; count: number } = {
    decidedAt: null,
    count: -1,
  };

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('DeniedNameRegistryService');
  }

  onModuleInit(): void {
    this.refreshTimer = setInterval(
      () => void this.refreshIfChanged(),
      CACHE_REFRESH_INTERVAL_MS,
    );
    this.refreshTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /** Every live denial, for the SQL anti-join VALUES list. */
  async deniedNamePairs(): Promise<ReadonlyArray<DeniedNamePair>> {
    await this.ensureLoaded();
    return this.pairs;
  }

  /** Membership test for the gazetteer's in-process span loop. */
  async isDeniedName(entityId: string, formFolded: string): Promise<boolean> {
    await this.ensureLoaded();
    return this.pairSet.has(`${entityId}|${formFolded}`);
  }

  /** Poll: reload only when the ledger moved (one indexed aggregate). */
  async refreshIfChanged(): Promise<boolean> {
    if (this.refreshing) return false;
    this.refreshing = true;
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ decided_at: Date | null; count: bigint }>
      >`SELECT max(decided_at) AS decided_at, count(*) AS count
          FROM claim_verdicts
         WHERE lane = ${RESTAURANT_NAME_LANE} AND outcome = 'notAName'
           AND rule_version = ${RESTAURANT_NAME_RULE_VERSION}
           AND fold_version = ${restaurantNameLane.keyFoldVersion}`;
      const decidedAt = rows[0]?.decided_at?.toISOString() ?? null;
      const count = Number(rows[0]?.count ?? 0);
      if (
        this.loaded &&
        decidedAt === this.watermark.decidedAt &&
        count === this.watermark.count
      ) {
        return false;
      }
      await this.load();
      this.watermark = { decidedAt, count };
      return true;
    } catch (error) {
      this.logger.error('denied-name registry refresh FAILED', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return false;
    } finally {
      this.refreshing = false;
    }
  }

  /** Test/ops hook: drop the cache so the next read reloads. */
  invalidate(): void {
    this.loaded = false;
    this.loadPromise = null;
    this.watermark = { decidedAt: null, count: -1 };
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loadPromise ??= this.load().then(() => {
      this.loadPromise = null;
    });
    await this.loadPromise;
  }

  private async load(): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ claim_key: string }>>`
      SELECT claim_key FROM claim_verdicts
       WHERE lane = ${RESTAURANT_NAME_LANE} AND outcome = 'notAName'
         AND rule_version = ${RESTAURANT_NAME_RULE_VERSION}
         AND fold_version = ${restaurantNameLane.keyFoldVersion}`;
    const pairs: DeniedNamePair[] = [];
    const pairSet = new Set<string>();
    for (const row of rows) {
      const sep = row.claim_key.indexOf('|');
      if (sep <= 0) continue;
      const entityId = row.claim_key.slice(0, sep);
      // The claim key holds surfaceClaimKey (accent-preserving fold);
      // canonicalFold of it equals canonicalFold of the original form — the
      // spelling identity_key speaks.
      const formFolded = canonicalFold(row.claim_key.slice(sep + 1));
      if (!formFolded) continue;
      pairs.push({ entityId, formFolded });
      pairSet.add(`${entityId}|${formFolded}`);
    }
    this.pairs = pairs;
    this.pairSet = pairSet;
    this.loaded = true;
  }
}
