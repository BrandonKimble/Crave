import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { primaryLanguageSubtag } from '../../shared/locale';
import type {
  SurfaceLocaleEvidence,
  SurfaceLocaleOracle,
} from './query-analyzer';

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
 *  - A PROVENANCE THAT KNOWS A LANGUAGE (see LANGUAGE_KNOWLEDGE_SOURCES).
 *    This is the one that had to be added (A0 red team F3/F4, 2026-08-11).
 *    A locale column says which language a row is FILED under; it does not by
 *    itself say that anyone ever KNEW. Two producers know: the vocabulary
 *    GENERATOR, which was asked a per-language question ("what is this called
 *    in Spanish?"), and the JUDGE, which settled a word claim. Everything else
 *    is a filing decision made by a writer that only OBSERVED a string.
 *    Two of those were feeding this index:
 *      - `extraction`, which tagged 10,670 forms with the configured language
 *        of the SUBREDDIT they were read out of. 'bún đậu mắm tôm' detected
 *        `en` at confidence 1.0 off the back of it.
 *      - `query_banking`, which is the LOOP. That lane banks a demand term
 *        under the locale the SEARCH WAS DETECTED IN — so a mis-detection
 *        writes a row, the row enters this index, and the index then reports
 *        that mis-detection as ground truth for every later search of the
 *        same word, forever. It is excluded on principle and not on measured
 *        damage: there is no amount of damage at which a feedback loop
 *        becomes an oracle, and the corpus happening to hold zero such rows
 *        today is not a reason to leave the door open.
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
/**
 * THE PRODUCERS OF LANGUAGE-KNOWLEDGE — the only provenances whose locale
 * column is an ANSWER rather than a filing decision.
 *
 * 'vocabulary' is the generator's declared search surfaces; 'sweep', 'seed',
 * 'manual' and 'synthesis' are the four provenances `LabelSweepService.
 * writeLabels` writes labels under — all of them the output of a prompt that
 * NAMED a language, or (for 'manual') of a human who did. A judge-settled row
 * qualifies through `claim_judge_version`, not through its source: the
 * adjudicator preserves each claim's original provenance when it writes the
 * verdict, so the stamp is the only thing that records that a hearing
 * happened.
 *
 * Deliberately NOT here: 'extraction' and 'query_banking' (see the class
 * comment), and every provenance that carries a form from somewhere else
 * without re-deciding its language — 'legacy', 'merge_fold',
 * 'ontology_rename', 'places', 'cuisine', 'knowledge_synthesis'. The last is
 * the closest call: it IS a model asserting a word, but it is asked about a
 * DISH, not about a language, and it writes 'und' for exactly that reason.
 */
const LANGUAGE_KNOWLEDGE_SOURCES = [
  'vocabulary',
  'sweep',
  'seed',
  'manual',
  'synthesis',
];

@Injectable()
export class SurfaceLocaleIndexService implements OnModuleInit {
  private readonly logger: LoggerService;
  /** folded form → per-language evidence (see SurfaceLocaleEvidence). */
  private index = new Map<string, SurfaceLocaleEvidence[]>();
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
      // ENTITIES, NOT ROWS. A label and its search surface are two rows on
      // ONE entity — one writer's one answer — and counting them as two would
      // let a single generator response clear the "more than one entity says
      // so" bar the analyzer applies before contradicting a stated prior.
      // The base language is taken so the analyzer never has to re-derive it:
      // 'es-MX' and 'es' are one language's evidence. It is derived in TS by
      // `primaryLanguageSubtag` — the module that owns the rule — rather than
      // by SQL `split_part`, which is a TRUNCATION, not a parse: it reads a
      // malformed 'es_MX' as the language 'es_mx' and files it as a language
      // of its own, and it cannot recognise 'und' for what it is.
      const rows = await this.prisma.$queryRaw<
        Array<{ form_folded: string; locale: string; entities: bigint }>
      >`
        SELECT s.form_folded,
               lower(s.locale) AS locale,
               count(DISTINCT s.entity_id)::bigint AS entities
          FROM entity_surface s
         WHERE s.status = 'active'
           AND s.role <> 'display'
           AND lower(s.locale) <> 'und'
           AND s.form_folded <> ''
           AND (s.source = ANY(${LANGUAGE_KNOWLEDGE_SOURCES}::text[])
                OR s.claim_judge_version IS NOT NULL)
         GROUP BY 1, 2`;
      // Merging two locale rows into one language would DOUBLE-COUNT an
      // entity holding a surface under both, and the count is load-bearing —
      // it feeds the "more than one entity says so" bar. It cannot happen:
      // the write door banks language-only (`bankableLanguageTag`) and the
      // live corpus holds zero regional tags on this table, so each language
      // comes from exactly one row and SQL's DISTINCT survives intact. The
      // fold is still performed, rather than the locale being used as the
      // language directly, so that a legacy regional row would be filed under
      // its real language instead of inventing one.
      const next = new Map<string, Map<string, SurfaceLocaleEvidence>>();
      for (const row of rows) {
        const language = primaryLanguageSubtag(row.locale, row.locale);
        let bucket = next.get(row.form_folded);
        if (!bucket) {
          bucket = new Map<string, SurfaceLocaleEvidence>();
          next.set(row.form_folded, bucket);
        }
        const existing = bucket.get(language);
        if (existing) existing.entities += Number(row.entities);
        else bucket.set(language, { language, entities: Number(row.entities) });
      }
      this.index = new Map(
        [...next].map(([form, byLanguage]) => [form, [...byLanguage.values()]]),
      );
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

const EMPTY: readonly SurfaceLocaleEvidence[] = Object.freeze([]);
