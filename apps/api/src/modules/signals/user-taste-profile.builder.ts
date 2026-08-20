import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  COOLDOWN_GAUSSIAN_DAYS,
  RECENCY_FLAT_DAYS,
} from '../polls/supply/poll-supply.constants';
import { dailyActsCteSql } from './act-identity';
import { redirectJoinSql, resolvedSubjectSql } from './subject-identity';
import { ECHO_SIGNAL_KINDS } from './signals.service';

/**
 * THE DERIVED TASTE PROFILE (D40 §3) — what an actor has actually done,
 * counted.
 *
 * WHY IT EXISTS. "What they searched recently / search most / tap on most"
 * already flows through the signals ledger under `@RecordsSignal`
 * enforcement. What was missing was not a pipeline — it was a place for a
 * recipe to READ those facts without writing its own SQL. The personal
 * weekly list used to hand-roll a `signals` query (`engagedSubjectIds`) that
 * knew nothing about echo exclusion or act grain: a fourth dialect of the law
 * `act-identity.ts` exists to state once, quietly disagreeing with the other
 * three.
 *
 * SOURCE: `signal_demand_daily` through `dailyActsCteSql`. Never raw
 * `signals`. That builder owns echo exclusion, subject scope, and `kind`
 * being IN the grain, and it cannot be half-adopted.
 *
 * FACTS ONLY (no-fake-estimates law). Two columns: `act_count` and
 * `last_act_at`. There is no blended affinity score here and no per-kind
 * coefficient — that is the shape D39 deleted in F467. A consumer that needs
 * an ORDER declares its own rule, in one place, and says so.
 *
 * NO INVENTED HORIZON. The windows are the ones this codebase already
 * ratified — RECENCY_FLAT_DAYS (the current weekly cycle) and
 * COOLDOWN_GAUSSIAN_DAYS (the rolling baseline) — plus window 0, ALL
 * HISTORY. Nothing here decides that a two-year-old search should stop
 * counting; it records how recent each act was and leaves that ruling to its
 * owner.
 *
 * REBUILDABLE FROM EMPTY, always. That is the contract that makes it safe to
 * change the derivation later: a wrong profile is fixed by rebuilding, never
 * by patching, and nothing outside this class writes the table.
 */

/** ALL HISTORY. Not a cutoff — the absence of one. */
export const TASTE_WINDOW_ALL_DAYS = 0;

/**
 * The windows the profile is materialised at. Both non-zero values are
 * existing ratified constants (poll-supply.constants); no new number is
 * minted here.
 */
export const TASTE_PROFILE_WINDOWS: readonly number[] = [
  TASTE_WINDOW_ALL_DAYS,
  RECENCY_FLAT_DAYS,
  COOLDOWN_GAUSSIAN_DAYS,
];

/** The ledger's first possible day — how "all history" is expressed to a
 *  builder whose parameter is a since-day. */
const EPOCH_DAY_KEY = '1970-01-01';

const ECHO_KINDS: string[] = [...ECHO_SIGNAL_KINDS];

export interface TasteProfileRebuildResult {
  actors: number;
  rows: number;
}

@Injectable()
export class UserTasteProfileBuilder {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('UserTasteProfileBuilder');
  }

  /**
   * Rebuild the profile for the actors whose aggregate rows changed in this
   * pass. The aggregate rebuild is day-sliced, so "touched" is expressed as
   * the set of days it rebuilt: every actor with a row on one of those days.
   *
   * An empty day list rebuilds nothing — deliberately. A pass that found no
   * new signals has nothing to say about anybody's tastes, and rebuilding the
   * world on an empty pass would hide that.
   */
  async rebuildForDays(dayKeys: string[]): Promise<TasteProfileRebuildResult> {
    if (!dayKeys.length) {
      return { actors: 0, rows: 0 };
    }
    const actors = await this.prisma.$queryRaw<Array<{ actor_id: string }>>`
      SELECT DISTINCT actor_id
      FROM signal_demand_daily
      WHERE day = ANY(${dayKeys}::date[])
    `;
    return this.rebuildActors(actors.map((row) => row.actor_id));
  }

  /**
   * Full rebuild from empty. Cheap by construction — the aggregate is the
   * source — and supported because "rebuildable from scratch" is the whole
   * reason this table is allowed to exist.
   */
  async rebuildAll(): Promise<TasteProfileRebuildResult> {
    const actors = await this.prisma.$queryRaw<Array<{ actor_id: string }>>`
      SELECT DISTINCT actor_id FROM signal_demand_daily
    `;
    return this.rebuildActors(actors.map((row) => row.actor_id));
  }

  async rebuildActors(actorIds: string[]): Promise<TasteProfileRebuildResult> {
    if (!actorIds.length) {
      return { actors: 0, rows: 0 };
    }
    let rows = 0;
    for (const windowDays of TASTE_PROFILE_WINDOWS) {
      rows += await this.rebuildWindow(actorIds, windowDays);
    }
    this.logger.info('Rebuilt user taste profile', {
      actors: actorIds.length,
      rows,
      windows: [...TASTE_PROFILE_WINDOWS],
    });
    return { actors: actorIds.length, rows };
  }

  /**
   * One (actor set, window) slice: delete + re-derive, in one transaction.
   * The same delete-and-reinsert unit the demand aggregate uses, for the same
   * reason — it is idempotent, so an overlapping pass is free.
   */
  private async rebuildWindow(
    actorIds: string[],
    windowDays: number,
  ): Promise<number> {
    const sinceDayKey =
      windowDays === TASTE_WINDOW_ALL_DAYS
        ? EPOCH_DAY_KEY
        : new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      await tx.$executeRaw`
        DELETE FROM user_taste_profile
        WHERE window_days = ${windowDays}
          AND actor_id = ANY(${actorIds}::uuid[])
      `;
      // TWO INSERTS, ONE CTE. The subject rows are the ledger's own facts;
      // the attribute rows are the SAME facts rolled up to the vocabulary the
      // curated recipes speak, so a recipe joins the profile instead of
      // re-deriving anything. Both come out of one daily-acts CTE, so they
      // can never disagree about what an act is.
      const actsCte = dailyActsCteSql({
        dimensions: [
          // `kind` is already IN the builder's grain (two kinds by one actor
          // on one day are two acts) but not in its select list, so it is
          // named here to come out. Adding a dimension the grain already
          // carries cannot split a group — the silent-inflation trap the
          // builder's doc warns about is the reverse case.
          { expr: Prisma.sql`a.kind`, as: 'kind' },
          { expr: Prisma.sql`a.subject_type`, as: 'subject_type' },
          // MERGE-SURVIVOR id, not the raw recorded id (red team 2026-08-19
          // H1): the profile was redirect-blind — acts on merge losers
          // (archived) vanished from taste and curated personalization
          // PERMANENTLY, and the loss compounds with every dedupe merge.
          // Same one-hop law as every demand reader (subject-identity.ts).
          { expr: resolvedSubjectSql('a'), as: 'subject_id' },
          { expr: Prisma.sql`a.subject_text`, as: 'subject_text' },
        ],
        from: Prisma.sql`signal_demand_daily a ${redirectJoinSql('a')}`,
        where: Prisma.sql`a.actor_id = ANY(${actorIds}::uuid[])
          -- The GLOBAL tile only: every act lands there exactly once. Summing
          -- over place tiles would count one act as many (§3 attribution
          -- fans an act out across its containing/contained places).
          AND a.place_id IS NULL`,
        extraAggregates: Prisma.sql`MAX(a.last_occurred_at) AS last_act_at`,
        actsAlias: 'acts',
        echoKinds: ECHO_KINDS,
        sinceDayKey,
        subjectScope: 'any',
      });

      const subjectRows = await tx.$executeRaw(Prisma.sql`
        /*taste_profile:subjects*/
        WITH day_acts AS (${actsCte}),
        totals AS (
          SELECT
            actor_id,
            kind,
            subject_type,
            subject_id,
            subject_text,
            SUM(acts)::int AS act_count,
            MAX(last_act_at) AS last_act_at
          FROM day_acts
          -- An act with NO subject (subject_type 'none' — a bare viewport
          -- dwell, a search that resolved to nothing) says nothing about
          -- taste. Measured on the local corpus: it was landing two rows per
          -- window carrying 625 acts, a large number attached to no
          -- preference at all. Dropped here, not filtered downstream, so no
          -- reader has to know about it.
          WHERE subject_type <> 'none'
          GROUP BY 1, 2, 3, 4, 5
        )
        INSERT INTO user_taste_profile (
          actor_id, window_days, subject_kind, subject_id, subject_text,
          kind, act_count, last_act_at
        )
        SELECT
          actor_id, ${windowDays}, subject_type, subject_id, subject_text,
          kind, act_count, last_act_at
        FROM totals
      `);

      // The roll-up: acts on a RESTAURANT become acts on that restaurant's
      // mined attributes (cuisine, context). Recipes speak attributes, so
      // this is the join they need; it is a projection of the rows above,
      // never an independent count.
      const attributeRows = await tx.$executeRaw(Prisma.sql`
        /*taste_profile:attributes*/
        WITH day_acts AS (${actsCte}),
        totals AS (
          SELECT
            actor_id,
            kind,
            subject_id,
            SUM(acts)::int AS act_count,
            MAX(last_act_at) AS last_act_at
          FROM day_acts
          WHERE subject_type = 'entity' AND subject_id IS NOT NULL
          GROUP BY 1, 2, 3
        )
        INSERT INTO user_taste_profile (
          actor_id, window_days, subject_kind, subject_id, subject_text,
          kind, act_count, last_act_at
        )
        SELECT
          t.actor_id, ${windowDays}, 'attribute', attr.entity_id, attr.name,
          t.kind, SUM(t.act_count)::int, MAX(t.last_act_at)
        FROM totals t
        JOIN core_entities r
          ON r.entity_id = t.subject_id
         AND r.type = 'place'
         AND r.status = 'active'
        JOIN LATERAL unnest(r.restaurant_attributes) AS ra(attribute_id) ON TRUE
        JOIN core_entities attr
          ON attr.entity_id = ra.attribute_id
         AND attr.type = 'place_attribute'
         AND attr.status = 'active'
        GROUP BY t.actor_id, attr.entity_id, attr.name, t.kind
      `);

      return subjectRows + attributeRows;
    });
  }
}
