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
 *     whose disclosure needs a human to check the requester's identity and to
 *     redact the OTHER people in them (a report names its subject; a block
 *     names the blocked). The runbook covers that path.
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

    for (const rule of PERSON_DATA_RULES) {
      if (!PersonDataExportService.EXPORTABLE.has(rule.disposition)) {
        // Recorded, not silently dropped: an export that omits things without
        // saying so is indistinguishable from a complete one.
        excluded.push({
          table: rule.table,
          column: rule.column,
          basis: rule.basis,
        });
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

      try {
        const rows = await this.prisma.$queryRawUnsafe<unknown[]>(
          `SELECT * FROM "${table}" WHERE ${where}`,
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
}
