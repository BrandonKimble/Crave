import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import type { SurfaceLocaleOracle } from './query-analyzer';

/**
 * THE REGISTRY-SURFACE LANGUAGE INDEX — folded surface text → the locales it
 * is banked under.
 *
 * WHY THIS EXISTS. Language detection on a food query is not a modelling
 * problem, it is a LOOKUP problem we had been refusing to do. A sentence-
 * trained n-gram detector is structurally blind on 1–3 words: measured on the
 * live corpus, 'camarones' and 'lengua' detect NULL and 'cơm tấm' detects
 * `pt`. Meanwhile the concept graph already holds all three words, each
 * stamped with the locale someone banked it under — `camarones` is an `es`
 * surface of shrimp, `cơm tấm` a `vi` surface of broken rice. The registry
 * KNOWS the answer the detector is guessing at.
 *
 * WHY IN MEMORY, AND WHY SYNCHRONOUS. `analyzeQuery` is the one-call-per-query
 * pipeline (A5) and is synchronous by contract — per-probe detection would
 * multiply a cost the plan prices as ~free. A per-query SELECT would put a
 * round trip in front of every search. The whole locale-tagged vocabulary is
 * small enough to hold: measured on the dev mirror, ~40k active non-`und`
 * recall surfaces, which is a few MB of strings.
 *
 * WHAT IS INDEXED, AND WHY ONLY THAT:
 *  - `status = 'active'` — a deprecated surface is a word we deliberately
 *    stopped honouring; it must not name a language either.
 *  - `role <> 'display'` — a display-only row is a REFUSED recall claim
 *    (P0-b). It is a label, not a claim on the word, so it carries no
 *    authority to say what language a query is in. This is the same
 *    predicate the recall path itself uses; the two must not disagree.
 *  - `locale <> 'und'` — `und` is the universal sentinel, not a language. An
 *    `und` row says nothing about language BY DEFINITION, and including it
 *    would make the oracle's "exactly one language" test answer for the
 *    English-by-construction corpus every time.
 *
 * DERIVED, AND IT SAYS SO. This is a rebuildable read model over
 * `entity_surface` — nothing is authored here. It refreshes on a cadence and
 * on demand (`refresh()`), and a refresh failure leaves the LAST GOOD index
 * serving rather than emptying it: a stale word list still names languages
 * correctly, an empty one silently reverts every short query to the detector
 * that cannot do the job. A never-loaded index answers nothing, which is
 * exactly the pre-existing behaviour.
 */
@Injectable()
export class SurfaceLocaleIndexService implements OnModuleInit {
  private readonly logger: LoggerService;
  /** folded form → the distinct locales banked under it. */
  private index = new Map<string, string[]>();
  private loadedAt: Date | null = null;
  private refreshInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SurfaceLocaleIndexService');
  }

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  /** Hourly is far finer than the vocabulary actually moves — surfaces are
   *  banked by extraction and by the demand-vocabulary sweep, both of which
   *  run on much longer cadences — and it bounds staleness to well under a
   *  day without ever being expensive. */
  @Cron('7 * * * *')
  async scheduledRefresh(): Promise<void> {
    await this.refresh();
  }

  /**
   * THE ORACLE handed to `analyzeQuery`. Bound once and stable, so callers
   * can hold it; it always reads the CURRENT index, never a snapshot taken at
   * bind time.
   */
  readonly oracle: SurfaceLocaleOracle = (foldedText: string) =>
    this.index.get(foldedText) ?? EMPTY;

  /** Observability: an index nobody can see the size of is an index nobody
   *  can tell has silently emptied. */
  stats(): { forms: number; loadedAt: Date | null } {
    return { forms: this.index.size, loadedAt: this.loadedAt };
  }

  async refresh(): Promise<{ forms: number }> {
    if (this.refreshInFlight) return { forms: this.index.size };
    this.refreshInFlight = true;
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ form_folded: string; locales: string[] }>
      >`
        SELECT s.form_folded, array_agg(DISTINCT lower(s.locale)) AS locales
          FROM entity_surface s
         WHERE s.status = 'active'
           AND s.role <> 'display'
           AND lower(s.locale) <> 'und'
           AND s.form_folded <> ''
         GROUP BY s.form_folded`;
      const next = new Map<string, string[]>();
      for (const row of rows) {
        next.set(row.form_folded, row.locales);
      }
      this.index = next;
      this.loadedAt = new Date();
      this.logger.info('Surface locale index refreshed', {
        forms: next.size,
      });
      return { forms: next.size };
    } catch (error) {
      // LAST GOOD WINS. See the class comment: emptying the index on a
      // transient DB error would silently downgrade every short query back to
      // the detector that cannot answer, with nothing on screen to show it.
      this.logger.warn(
        'Surface locale index refresh failed (serving last good index)',
        {
          forms: this.index.size,
          loadedAt: this.loadedAt,
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      );
      return { forms: this.index.size };
    } finally {
      this.refreshInFlight = false;
    }
  }
}

const EMPTY: readonly string[] = Object.freeze([]);
