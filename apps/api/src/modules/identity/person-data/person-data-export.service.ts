import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { PERSON_DATA_RULES, type PersonDataRule } from './person-data-class';
import { subjectRows } from './person-data-scope';

/**
 * SUBJECT ACCESS / PORTABILITY (GDPR Art. 15 + 20, CCPA 1798.110/.115),
 * DERIVED FROM THE SAME DECLARATION THAT DRIVES ERASURE.
 *
 * The privacy policy already promised "Export your data in a portable format"
 * and nothing existed behind it — the same failure shape as the grace period:
 * a published commitment with no mechanism.
 *
 * WHY IT IS DERIVED RATHER THAN WRITTEN. Access and erasure are the same
 * question asked twice: *which columns, in which tables, are this person's?*
 * A hand-written exporter would answer it a second time, in a second place,
 * and the two answers would drift — and the drift would be invisible, because
 * an export that quietly omits a table looks exactly like an export of someone
 * with no rows in it. That is precisely how the old hand-written deletion
 * missed private lists, raw search text and device fingerprints: a new table
 * changed nothing, and no test failed.
 *
 * So there is ONE declaration. The eraser reads it to decide what to destroy;
 * this reads it to decide what to hand over. A newly classified column joins
 * both by construction, and the census fails the build for any person-shaped
 * column nobody classified — which means the export cannot silently go stale.
 *
 * WHAT IS EXPORTED. Every rule whose disposition means "this is the person's
 * data": `delete_row`, `sever`, `null_column`, `anonymized_by_shell`. Those
 * are exactly the columns we would act on for an erasure, which is the correct
 * test for whether something is theirs.
 *
 * WHAT IS NOT, and why that is right rather than convenient:
 *   - `not_person` — not their data by classification.
 *   - `retain` — kept under a stated legal basis. NOTE these ARE still
 *     personal data and a real Art.15 request covers them; they are excluded
 *     from the machine export because they are financial and safety records
 *     whose disclosure needs a human to check the requester's identity. The
 *     runbook covers that path.
 *
 * `excluded` IS TRUE BY CONSTRUCTION, NOT BY CLAIM (F9502).
 *
 * The exclusions have always been computed per COLUMN, but the query used to
 * be `SELECT *` per TABLE — so the payload said it had withheld
 * `user_reports.reported_user_id` and `user_blocks.blocked_user_id` while
 * shipping both, raw, next to the sentence claiming otherwise. That is a
 * disclosure of ANOTHER person's data (Art. 15(4) says a subject-access
 * response must not adversely affect the rights of others), and the runbook
 * then told the operator to hand-redact records the machine had already sent.
 * A manifest that describes a payload it does not control is not a safeguard;
 * it is a false statement with a process attached.
 *
 * So the projection is built FROM the same `excluded` list the payload
 * reports: physical columns (the catalog `SELECT *` itself expands from),
 * minus every column this run recorded as withheld. There is no second
 * opinion to drift — widening the manifest narrows the query in the same
 * pass, and a column can only appear in the payload by NOT appearing in
 * `excluded`.
 *
 * DELIVERY IS DELIBERATELY NOT AN ENDPOINT. Handing a full personal-data
 * archive to whoever holds a session token is a data-breach vector — the
 * export is the single most valuable object in the system. At this scale the
 * honest shape is an operator-run command against a verified request, which is
 * also what the regulation contemplates (identity verification, one month to
 * respond). If it ever becomes self-serve it needs re-authentication and an
 * out-of-band delivery, not a GET.
 */
@Injectable()
export class PersonDataExportService {
  private readonly logger: LoggerService;

  /** Dispositions that mean "this column holds the person's own data". */
  private static readonly EXPORTABLE = new Set([
    'delete_row',
    'sever',
    'null_column',
    'anonymized_by_shell',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('PersonDataExport');
  }

  /**
   * Everything we hold about one person, keyed by table.
   *
   * Grouped by table because a rule is per COLUMN but a row is the unit a
   * human can read: several rules over one table must produce one section, not
   * several near-duplicate ones.
   */
  async export(userId: string): Promise<{
    userId: string;
    generatedAt: string;
    tables: Record<string, unknown[]>;
    excluded: Array<{ table: string; column: string; basis?: string }>;
  }> {
    const byTable = new Map<string, PersonDataRule[]>();
    const excluded: Array<{ table: string; column: string; basis?: string }> =
      [];
    /**
     * THE MANIFEST, INDEXED — the same entries, addressable by table.
     *
     * Deliberately populated in the loop that builds `excluded`, from the same
     * push: the projection below and the sentence the subject reads are then
     * two views of ONE list, and no edit can move one without the other.
     */
    const withheld = new Map<string, Set<string>>();

    for (const rule of PERSON_DATA_RULES) {
      if (!PersonDataExportService.EXPORTABLE.has(rule.disposition)) {
        // Recorded, not silently dropped: an export that omits things without
        // saying so is indistinguishable from a complete one — and now
        // WITHHELD, not merely recorded (see the header, F9502).
        excluded.push({
          table: rule.table,
          column: rule.column,
          basis: rule.basis,
        });
        const set = withheld.get(rule.table) ?? new Set<string>();
        set.add(rule.column);
        withheld.set(rule.table, set);
        continue;
      }
      const list = byTable.get(rule.table) ?? [];
      list.push(rule);
      byTable.set(rule.table, list);
    }

    const tables: Record<string, unknown[]> = {};
    for (const table of byTable.keys()) {
      // THE COMPILER ANSWERS, this service does not decide.
      //
      // This loop used to build its own predicate — `rules[0].column`, which
      // is authoring order — so `user_follows` would have exported the follows
      // a person MADE and silently omitted the ones they RECEIVED, and
      // `user_taste_profile` would have compared a signals pseudonym to a user
      // id and returned nothing. An export that quietly omits a table looks
      // exactly like an export of someone with no rows in it, which is the
      // failure this file's own doc comment warns about, committed one level
      // down. It shares `subjectRows` with the eraser now.
      //
      // includeRetained: false — retained rows (financial, safety) go out
      // through the human step, redacted, per the runbook. They are still
      // reported in `excluded` so the omission is stated rather than silent.
      const where = subjectRows(table, { includeRetained: false });
      if (!where) continue;

      // Outside the try: its own failures are already specific, and wrapping
      // them in "Export failed for X:" twice reads like two faults.
      const projection = await this.projection(table, withheld);
      // Every column of this table is withheld — there is nothing to hand
      // over, and `SELECT  FROM` is not a query.
      if (projection.length === 0) continue;

      try {
        const rows = await this.prisma.$queryRawUnsafe<unknown[]>(
          `SELECT ${projection.map((c) => `"${c}"`).join(', ')} ` +
            `FROM "${table}" WHERE ${where}`,
          userId,
        );
        if (rows.length) tables[table] = rows;
      } catch (error) {
        // FAIL LOUD. A subject-access response that silently skipped a table
        // would be a false statement about what we hold.
        throw new Error(
          `Export failed for ${table}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.logger.info('Person data exported', {
      userId,
      tables: Object.keys(tables).length,
    });

    return {
      userId,
      generatedAt: new Date().toISOString(),
      tables,
      excluded,
    };
  }

  /**
   * THE COLUMNS THIS TABLE MAY HAND OVER — everything it physically has, minus
   * everything this run's manifest says it withheld.
   *
   * WHY THE CATALOG RATHER THAN THE DECLARATION. The declaration classifies
   * PERSON-shaped columns; it deliberately says nothing about `created_at`, a
   * list's name, or a report's reason code. Projecting only declared columns
   * would answer the leak by gutting the export — a subject-access response
   * made of foreign keys. `SELECT *` expands from `information_schema`, so
   * subtracting from that same catalog yields exactly the set `SELECT *` would
   * have returned, less the withheld ones, and nothing is dropped by accident.
   *
   * FAIL LOUD ON A NAME THAT DOES NOT EXIST. A withheld column the table does
   * not have means the declaration and the schema have drifted (a rename), and
   * the renamed column is now on the include side while the manifest still
   * names the old one — the exact F9502 falsehood, returning quietly. The
   * census checks declared names against `schema.prisma`; this checks them
   * against the database the query actually runs on, which is the one that can
   * disagree at 3am.
   */
  private async projection(
    table: string,
    withheld: Map<string, Set<string>>,
  ): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ${table}
      ORDER BY ordinal_position
    `;
    const physical = rows.map((r) => r.column_name);
    if (physical.length === 0) {
      throw new Error(`Export failed for ${table}: table has no columns`);
    }
    const hidden = withheld.get(table) ?? new Set<string>();
    const missing = [...hidden].filter((c) => !physical.includes(c));
    if (missing.length > 0) {
      throw new Error(
        `Export failed for ${table}: the manifest withholds ` +
          `${missing.join(', ')}, which this table does not have. The ` +
          `declaration and the schema have drifted; a renamed column would ` +
          `ship while the export claims it was withheld.`,
      );
    }
    return physical.filter((c) => !hidden.has(c));
  }
}
