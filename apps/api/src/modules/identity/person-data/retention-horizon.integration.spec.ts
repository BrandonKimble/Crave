import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PERSON_DATA_RULES } from './person-data-class';
import { RetentionHorizonService } from './retention-horizon.service';
import { retentionWhere } from './person-data-scope';

/**
 * A HORIZON NOBODY ENFORCES IS A LIE, and a SECOND ANSWER DRIFTS.
 *
 * Two failures of the same family, checked together because they are the same
 * mistake at different altitudes:
 *
 *  1. `horizonDays` was declared on three retained rules and NOTHING read it.
 *     `grep horizonDays` outside the declaration returned nothing at all. We
 *     told users financial records are kept for a bounded period and had no
 *     mechanism that would ever end that period — the grace-period disease,
 *     one policy over.
 *
 *  2. The staging scrub answers "what is a person's data?" in 183 lines of
 *     hand-written SQL, which is the SAME question PERSON_DATA_RULES answers.
 *     Two answers drift, and this pair already has: the scrub once matched
 *     `curated_lists.owner_user_id` and destroyed 672 rows of global editorial
 *     content that were nobody's personal data.
 */
describe('retention horizon — the promise has a mechanism', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('every horizon is reachable by the compiler', () => {
    // A horizon on a table the compiler cannot scope is unenforceable: the
    // sweep would skip it silently and the promise would stay unkept while
    // looking kept.
    const unreachable = PERSON_DATA_RULES.filter(
      (rule) =>
        rule.disposition === 'retain' &&
        typeof rule.horizon === 'number' &&
        // The sweep's OWN scope builder, not the export scope. Asking
        // `subjectRows` here would have declared a horizon "reachable" through
        // a predicate the sweep no longer uses — a reachability test for the
        // wrong query.
        retentionWhere(rule, 't') === null,
    ).map((rule) => `${rule.table}.${rule.column}`);
    expect(unreachable).toEqual([]);
    // And the net must be non-empty, or this test is reading an empty list
    // back to itself.
    expect(RetentionHorizonService.horizonRuleKeys().length).toBeGreaterThan(0);
  });

  it('every retained column has DECIDED how long — none defaults to forever', () => {
    // THE ROOT CAUSE, not another instance of it.
    //
    // `horizonDays` used to be optional. Nine rules retained data, two stated a
    // horizon, and the other seven were kept FOREVER — not by decision, but
    // because an omitted optional field silently means "no limit". Building a
    // sweep for the two that happened to be filled in would have left the
    // other seven exactly as unbounded as before, and the next retained column
    // would have joined them without anyone noticing.
    //
    // An optional field is an invitation to declare something incomplete that
    // nothing reads. The field is mandatory now and `'indefinite'` is a word
    // you have to type, so the answer is always somebody's decision. This
    // asserts the property the type is meant to guarantee, because a type can
    // be widened back by anyone in a hurry.
    // TypeScript now narrows this to `never` — `horizon` is REQUIRED on the
    // retain variants, so a rule without one cannot be written. That is the
    // win, and it is also why this reads through a widened view: the assertion
    // survives someone widening the type back, which a compile-time guarantee
    // alone would not.
    const undecided = (
      PERSON_DATA_RULES as ReadonlyArray<{
        table: string;
        column: string;
        disposition: string;
        horizon?: unknown;
      }>
    )
      .filter((rule) => rule.disposition === 'retain' && rule.horizon == null)
      .map((rule) => `${rule.table}.${rule.column}`);
    expect(undecided).toEqual([]);

    // And 'indefinite' must be a REASON, not a shrug: it keeps a person's data
    // forever, so it needs the same stated basis a bounded retention does.
    const unexplained = PERSON_DATA_RULES.filter(
      (rule) =>
        rule.disposition === 'retain' &&
        rule.horizon === 'indefinite' &&
        !rule.basis,
    ).map((rule) => `${rule.table}.${rule.column}`);
    expect(unexplained).toEqual([]);
  });

  it('the horizon sweep no longer deletes rows a different rule keeps (D146)', () => {
    // THIS ASSERTION IS THE MUTATION PROOF, AND ITS HISTORY IS THE EVIDENCE.
    //
    // It has been all three states, in order. First `toEqual([])` guarding a
    // check that could NEVER return anything else (it required `ruleWhere` to
    // be non-null for a `retain` rule — impossible, `retain` is not an acting
    // disposition): a green light wired to nothing. Then, rederived against the
    // compiler's real contradictions, it was asserted NON-EMPTY, because the
    // 2555-day sweep for `user_reports.reported_user_id` built its DELETE from
    // the table's person-OR and so also matched `reporter_user_id`
    // (`anonymized_by_shell`) — destroying the safety record about a still-live
    // third party at a horizon that was never its own.
    //
    // Now the sweep scopes by the RETAINED COLUMN, so it is `[]` — and the flip
    // from "must be non-empty" to "must be empty" is what proves the defect is
    // gone rather than merely unwatched. Revert `sweep()` to `subjectRows` and
    // this goes red naming that exact pair again.
    expect(RetentionHorizonService.contradictions()).toEqual([]);
  });

  it('the sweep runs against the real schema and reports honestly', async () => {
    const service = new RetentionHorizonService(
      prisma as never,
      {
        setContext: () => ({
          info() {},
          warn() {},
          error() {},
          debug() {},
        }),
      } as never,
    );
    // EXECUTABILITY is the point: a horizon whose SQL does not run is exactly
    // as unenforced as no horizon at all. 2555 days is far beyond any row this
    // corpus holds, so the honest expectation today is zero — what is being
    // proven is that the query RUNS, against every horizon rule, without
    // throwing.
    const overdue = await service.overdue();
    expect(Array.isArray(overdue)).toBe(true);
    expect(overdue).toEqual([]);
  });

  it('THE TWO UNITS, PROVEN LIVE: an expired horizon NULLS a retained value and DELETES a retained record — and the shell survives both', async () => {
    // THE DEFECT THIS PROVES GONE (2026-08-07). `users.stripe_customer_id`
    // became a bounded 2555-day retention, and the sweep only knew one verb:
    // DELETE the row. On `users` that verb is catastrophic — the anonymized
    // shell is what anchors every retained financial record and every severed
    // authorship, so deleting it would take out the very rows the retention
    // exists to keep auditable. It did not fire only because the DELETE was
    // scoped `WHERE stripe_customer_id = <a user id>`, which matches nothing:
    // an unenforced promise wearing the costume of enforcement.
    //
    // So this drives BOTH units through one real sweep against a real
    // database, on one expired account, and asserts the three things that
    // distinguish them:
    //   the VALUE is gone, the RECORD is gone, and the SHELL is still there.
    const service = new RetentionHorizonService(
      prisma as never,
      {
        setContext: () => ({
          info() {},
          warn() {},
          error() {},
          debug() {},
        }),
      } as never,
    );

    // Purged 8 years ago: deleted_at set, purge_due_at cleared (the window
    // closed and the purge ran) — the exact state the sweep acts on.
    const [user] = await prisma.$queryRawUnsafe<Array<{ user_id: string }>>(
      `INSERT INTO users (email, updated_at, deleted_at, purge_due_at, stripe_customer_id)
       VALUES ($1, now(), now() - INTERVAL '2920 days', NULL, 'cus_horizon_test')
       RETURNING user_id`,
      `retention-horizon-${Date.now()}@example.invalid`,
    );
    try {
      // A LEAKED FIXTURE HERE POISONS THE SUITE, so the cleanup covers every
      // path from the first INSERT onward. This row is a purged account whose
      // horizon has passed — exactly what `overdue()` in the test above is
      // asserting it finds NONE of — so leaving one behind reds a sibling
      // test with a failure that looks nothing like its cause. (It did, once:
      // the billing INSERT threw on a bad enum value between the two, and the
      // next run failed in "reports honestly" instead.)
      await prisma.$executeRawUnsafe(
        `INSERT INTO billing_subscriptions
           (user_id, status, provider, entitlement_code, updated_at)
         VALUES ($1::uuid, 'cancelled', 'stripe', 'crave_plus', now())`,
        user.user_id,
      );

      await service.sweep();

      const [after] = await prisma.$queryRawUnsafe<
        Array<{ stripe_customer_id: string | null; subs: number }>
      >(
        `SELECT u.stripe_customer_id,
                (SELECT count(*)::int FROM billing_subscriptions b
                  WHERE b.user_id = u.user_id) AS subs
           FROM users u WHERE u.user_id = $1::uuid`,
        user.user_id,
      );

      // 1. THE SHELL SURVIVED. If the row were gone this query returns
      //    nothing — which is precisely the failure the 'column' unit exists
      //    to prevent, so it is asserted first and on its own.
      expect(after).toBeDefined();
      // 2. `horizonUnit: 'column'` — the VALUE expired, the row did not.
      expect(after.stripe_customer_id).toBeNull();
      // 3. `horizonUnit: 'row'` — the financial RECORD expired entirely.
      expect(after.subs).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(
        `DELETE FROM users WHERE user_id = $1::uuid`,
        user.user_id,
      );
    }
  });

  /**
   * THE SCRUB IS A SECOND ANSWER. It cannot be deleted (staging needs SQL that
   * runs without the app), but it must not disagree: every table the
   * declaration says holds a person's data has to be handled there, or staging
   * keeps PII the production eraser destroys.
   */
  it('every table the scrub KEEPS has its person link nulled', () => {
    // The precise invariant, and my first attempt got it wrong: it treated
    // "kept" as "not scrubbed" and flagged `polls`, which is exactly right to
    // keep — a poll survives its author (disposition `sever`: keep the row,
    // drop the link). Keeping a row is only a divergence if the PERSON stays
    // attached to it, so that is what this asserts.
    const scrub = readFileSync(
      join(
        __dirname,
        '../../../../../../scripts/rig/scrub-staging-user-data.sql',
      ),
      'utf8',
    );
    const kept =
      scrub.match(/keep_content text\[\] := ARRAY\[([^\]]+)\]/)?.[1] ?? '';
    const keptTables = [...kept.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(keptTables.length).toBeGreaterThan(0);

    const unsevered = keptTables.filter((table) => {
      const personColumns = PERSON_DATA_RULES.filter(
        (rule) =>
          rule.table === table &&
          (rule.disposition === 'sever' || rule.disposition === 'delete_row'),
      ).map((rule) => rule.column);
      // Staging may keep the CONTENT, never the person on it.
      return personColumns.some(
        (column) =>
          !new RegExp(
            `UPDATE[^;]*${table}[^;]*SET\\s+${column}\\s*=\\s*NULL`,
            's',
          ).test(scrub),
      );
    });
    expect(unsevered).toEqual([]);
  });
});
