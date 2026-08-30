import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import {
  PlaceNameHearingService,
  type PlaceNameHearingSummary,
} from './restaurant-name-hearing.service';
import { PLACE_NAME_RULE_VERSION } from './restaurant-name-rule';
import { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';
import { DrainExceedsStandingCapError } from './claim-rehearing-budget.service';
import {
  PLACE_NAME_LANE,
  placeNameLane,
  type PlaceNameClaim,
} from './restaurant-name-lane';

/**
 * THE GENERIC-WORD CENSUS — the restaurant-name court's docket feeder
 * (dormant-systems audit item 1, built 2026-08-30; the version "the other
 * session" wrote was never committed, so the court sat with an empty docket
 * while 399 unheard single-word recall surfaces sat live on ungrounded
 * places — among them the query-words `bacon`, `bbq`, `brooklyn`, `7`, each
 * a standing search-annihilator: an active restaurant recall surface grounds
 * a hard AND, so "best bbq tacos" collapses to one junk entity).
 *
 * WHAT THE CENSUS IS, AND WHAT IT IS NOT. It is a POPULATION SELECTOR: every
 * single-token active recall form on an active place entity is in the
 * population, because that is the exposure class — one word, hard-AND
 * semantics, no second token to rescue the query. It is NEVER a stop-list:
 * the census decides only WHO GETS A HEARING AND IN WHAT ORDER; the court
 * decides names from provenance evidence, which is how Chili's, Supper and
 * bb.q Chicken survive while a junk mint dies. Word-shape signals below are
 * DOCKET-ORDERING signals, not verdicts.
 *
 * ORDERING — riskiest first, each rank a measured harm class:
 *   1. UNGROUNDED before grounded. A place with no verified real-world
 *      listing is where junk mints live (the audit's 399 are all
 *      ungrounded); a grounded place's name has already survived a Places
 *      match. Grounded rows are still IN the population — a grounded place
 *      can hold a wrong extra surface — they just wait their turn.
 *   2. WORD-ROLE ELSEWHERE. The same folded form active as a recall surface
 *      on a NON-place entity (food/ingredient/attribute) means the word
 *      provably lives in queries (`bacon`, `bbq`) — the annihilation is not
 *      hypothetical. This reuses the corpus's own vocabulary as the
 *      genericness signal, which is the "verdicts as signals, never a
 *      stop-list" rule made concrete.
 *   3. BARE NUMBERS (`7`). No letters to be a name with; highest junk odds
 *      within a rank.
 *
 * IDEMPOTENCY / WATERMARK. The court's verdict ledger IS the watermark: the
 * census subtracts already-decided claims (at the rule + fold in force)
 * BEFORE capping the docket, so settled questions can never crowd unheard
 * ones out of a night — and a rule bump re-opens the population through the
 * same budgeted door, exactly like every other lane. `hear()` re-checks the
 * same predicate at its own chokepoint; the census filter is docket
 * hygiene, not the gate.
 *
 * SPEND. The docket cap bounds one night (~cap/8 LLM calls at 8 claims per
 * call); the court's rolling rehearing allowance is the governed gate above
 * it, and a docket beyond what the window has left REFUSES loudly — the
 * rail catches that refusal and reports it instead of dying, because the
 * remainder is simply tomorrow's docket.
 *
 * OUT OF SCOPE, ON PURPOSE: the entity's survival. An upheld name on an
 * ungroundable ghost ("Best") dies at the enrichment LIFECYCLE (the
 * janitor, `LOCATION_LIFECYCLE_CRON_ENABLED` — a launch flip-list item);
 * the court + census close the wrong-NAME hole only. SD-3 ruled those
 * jurisdictions separately, and the audit's warning stands: this feeder
 * without the janitor does not kill upheld-name ghosts.
 */

/** One night's docket. ~50 LLM calls at 8 claims/call — sized to drain the
 *  measured 399-row backlog in ~1 night and then serve the trickle, while
 *  staying far under the court's 2,000/24h rolling allowance so the census
 *  never eats the window the manual script also draws on. */
export const CENSUS_DOCKET_CAP = 400;

/** Population scan bound — a sanity ceiling, not a selector: the single-word
 *  place-surface population is ~hundreds today. If a scan ever hits this,
 *  the ordering still puts the riskiest rows first and the rest queue. */
const CENSUS_SCAN_LIMIT = 20_000;

export interface CensusDocketRow {
  entityId: string;
  form: string;
  grounded: boolean;
  wordElsewhere: boolean;
  numericOnly: boolean;
}

export interface CensusRunSummary {
  scanned: number;
  alreadyDecided: number;
  docket: number;
  /** Docket refused by the rolling rehearing allowance (0 = it ran). */
  refusedByBudget: boolean;
  hearing: PlaceNameHearingSummary | null;
}

@Injectable()
export class RestaurantNameCensusService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly court: PlaceNameHearingService,
    private readonly ledger: ClaimVerdictLedgerService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('RestaurantNameCensusService');
  }

  /**
   * THE CENSUS SELECT + the unheard filter + the cap. Public so a dry run
   * (or a spec) can inspect the docket without consulting any judge.
   */
  async buildDocket(cap = CENSUS_DOCKET_CAP): Promise<{
    docket: CensusDocketRow[];
    scanned: number;
    alreadyDecided: number;
  }> {
    // One row per (entity, folded form): several locale copies of one form
    // on one entity are ONE claim (the lane's key has no locale).
    const rows = await this.prisma.$queryRaw<
      Array<{
        entity_id: string;
        form: string;
        grounded: boolean;
        word_elsewhere: boolean;
        numeric_only: boolean;
      }>
    >`
      SELECT * FROM (
        SELECT DISTINCT ON (s.entity_id, s.form_folded)
               s.entity_id::text AS entity_id,
               s.form,
               EXISTS (
                 SELECT 1 FROM core_restaurant_locations l
                  WHERE l.restaurant_id = s.entity_id
                    AND l.google_place_id IS NOT NULL
               ) AS grounded,
               EXISTS (
                 SELECT 1
                   FROM entity_surface w
                   JOIN core_entities we ON we.entity_id = w.entity_id
                  WHERE w.form_folded = s.form_folded
                    AND w.status = 'active'
                    AND w.role <> 'display'
                    AND we.status = 'active'
                    AND we.type <> 'place'
               ) AS word_elsewhere,
               s.form_folded ~ '^[0-9]+$' AS numeric_only
          FROM entity_surface s
          JOIN core_entities e ON e.entity_id = s.entity_id
         WHERE e.type = 'place'
           AND e.status = 'active'
           AND s.status = 'active'
           AND s.role <> 'display'
           -- SINGLE TOKEN is the exposure class: one word, hard-AND recall,
           -- no second token to disambiguate the query.
           AND s.form_folded !~ '\\s'
           AND s.form_folded <> ''
         ORDER BY s.entity_id, s.form_folded, s.created_at ASC
      ) census
      ORDER BY census.grounded ASC,
               census.word_elsewhere DESC,
               census.numeric_only DESC,
               census.form ASC
      LIMIT ${CENSUS_SCAN_LIMIT}`;

    const population: CensusDocketRow[] = rows.map((row) => ({
      entityId: row.entity_id,
      form: row.form,
      grounded: row.grounded,
      wordElsewhere: row.word_elsewhere,
      numericOnly: row.numeric_only,
    }));

    // UNHEARD FILTER BEFORE THE CAP — the ledger is the watermark. Capping
    // first would let hundreds of settled upholds occupy the docket forever
    // while the unheard rows behind them never reach the court.
    const keys = population.map((row) =>
      placeNameLane.canonicalClaimKey(row as PlaceNameClaim),
    );
    const decided = await this.ledger.decidedKeys(
      PLACE_NAME_LANE,
      PLACE_NAME_RULE_VERSION,
      placeNameLane.keyFoldVersion,
      keys,
    );
    const unheard = population.filter(
      (row) =>
        !decided.has(placeNameLane.canonicalClaimKey(row as PlaceNameClaim)),
    );

    return {
      docket: unheard.slice(0, cap),
      scanned: population.length,
      alreadyDecided: population.length - unheard.length,
    };
  }

  /**
   * FEED THE COURT. Resume-first (paid decisions a dead run left
   * unexecuted), then hear the docket. A budget refusal is a REPORT, not a
   * crash — the remainder is tomorrow's docket, and the rolling window
   * exists precisely to spread it.
   */
  async run(
    options: { dryRun?: boolean; cap?: number } = {},
  ): Promise<CensusRunSummary> {
    const dryRun = options.dryRun ?? true;
    const { docket, scanned, alreadyDecided } = await this.buildDocket(
      options.cap ?? CENSUS_DOCKET_CAP,
    );
    const summary: CensusRunSummary = {
      scanned,
      alreadyDecided,
      docket: docket.length,
      refusedByBudget: false,
      hearing: null,
    };
    if (!docket.length) {
      this.logger.info('Restaurant-name census: nothing unheard', {
        ...summary,
        hearing: null,
      });
      return summary;
    }

    if (!dryRun) {
      await this.court.resumePendingEffects();
    }
    try {
      summary.hearing = await this.court.hear(
        docket.map(({ entityId, form }) => ({ entityId, form })),
        { dryRun },
      );
    } catch (error) {
      if (error instanceof DrainExceedsStandingCapError) {
        summary.refusedByBudget = true;
        this.logger.warn(
          'Restaurant-name census docket refused by the rehearing allowance',
          { docket: docket.length, message: error.message },
        );
        return summary;
      }
      throw error;
    }
    this.logger.info('Restaurant-name census complete', {
      ...summary,
      hearing: summary.hearing
        ? { ...summary.hearing, cases: summary.hearing.cases.length }
        : null,
      dryRun,
    });
    return summary;
  }
}
