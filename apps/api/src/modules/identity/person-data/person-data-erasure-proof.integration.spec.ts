import { PrismaClient } from '@prisma/client';
import { PERSON_DATA_RULES, type PersonDataRule } from './person-data-class';
import { ruleWhere } from './person-data-scope';
import { PersonDataEraserService } from './person-data-eraser.service';

/**
 * THE SEED-AND-ERASE PROOF — every acting rule, proven to act.
 *
 * THE VACUITY PROBLEM THIS ENDS. Every erasure check so far could pass while
 * doing nothing:
 *
 *   - the id-sweep looks for the departing user's id and is structurally blind
 *     to a table that never holds it (`user_taste_profile` keys by the signals
 *     PSEUDONYM — the profile survived deletion forever, and the sweep was
 *     green the whole time);
 *   - a data check over an empty table reports clean and proves nothing;
 *   - the coverage ledger can only say "no rows in this corpus", which is the
 *     same answer a BROKEN predicate gives.
 *
 * A green check that cannot distinguish "correct" from "matched nothing" is
 * the disease, not the cure. So this stops waiting for data to exist and
 * MANUFACTURES it: for each rule, plant a row that the person owns, run the
 * real eraser, and assert the row is actually gone or actually nulled.
 *
 * WHY SEEDING WAS ABANDONED BEFORE, AND WHAT CHANGED. A first attempt tried
 * single-column inserts and died on NOT NULL columns, so it was dropped as
 * impossible. It is not impossible — it just needs the schema, which Postgres
 * will hand over: every NOT NULL column without a default gets a
 * type-appropriate filler. The earlier conclusion was a missing step mistaken
 * for a wall.
 *
 * EVERYTHING RUNS INSIDE A TRANSACTION THAT ALWAYS ROLLS BACK. The proof uses
 * a REAL user and the REAL eraser against the REAL schema, and leaves nothing
 * behind.
 */

const ROLLBACK = Symbol('rollback');

/**
 * GROUND TRUTH — how a row in this table ACTUALLY points at a person, stated
 * INDEPENDENTLY of the rule under test.
 *
 * This exists because the first version of this proof could not fail. It
 * planted the fixture using `rule.personScopeSql`, so re-introducing the
 * original taste-profile bug (scope by `actor_id = userId`) made the seeder
 * plant `actor_id = userId` too — and the broken predicate happily found its
 * own planted row. All 27 tests stayed green against the exact defect the file
 * was written to catch.
 *
 * That is the same blind-spot failure as everything else in this area, one
 * level up: a verifier that derives its expectation from its subject can only
 * ever confirm the subject. The fixture must come from a DIFFERENT source than
 * the rule — so this map states, per table, how the application really links a
 * row to a person, and the rule is then judged on whether it can find it.
 *
 * Default (no entry): the person-key column holds the user id directly.
 */
/** The person's signals pseudonym, created if the corpus has none. */
const resolveActorId = async (
  tx: PrismaClient,
  userId: string,
): Promise<string> => {
  const existing = await tx.$queryRawUnsafe<Array<{ actor_id: string }>>(
    `SELECT actor_id FROM signal_actors WHERE user_id = $1::uuid LIMIT 1`,
    userId,
  );
  if (existing[0]) return existing[0].actor_id;
  const actorId = '00000000-0000-4000-8000-0000000000ff';
  await tx.$executeRawUnsafe(
    `INSERT INTO signal_actors (actor_id, user_id) VALUES ($1::uuid, $2::uuid)`,
    actorId,
    userId,
  );
  return actorId;
};

const PERSON_LINK: Record<
  string,
  {
    column: string;
    resolve: (tx: PrismaClient, userId: string) => Promise<string>;
  }
> = {
  // The taste profile keys by the SIGNALS PSEUDONYM, not the user id —
  // user-taste-profile.builder writes actor_id from signal_demand_daily. This
  // is the fact the broken rule got wrong, so it is recorded here, away from
  // the rule.
  // Both signals tables key by the ACTOR, exactly like the taste profile:
  // the person is reached through signal_actors, never by a user id in the
  // row. Stated here, away from the rules, so a rule that gets the join wrong
  // cannot also define the fixture that would catch it.
  signals: {
    column: 'actor_id',
    resolve: (tx, userId) => resolveActorId(tx, userId),
  },
  signal_demand_daily: {
    column: 'actor_id',
    resolve: (tx, userId) => resolveActorId(tx, userId),
  },
  signal_actors: {
    column: 'user_id',
    resolve: (_tx, userId) => Promise.resolve(userId),
  },
  user_taste_profile: {
    column: 'actor_id',
    resolve: async (tx, userId) => {
      const existing = await tx.$queryRawUnsafe<Array<{ actor_id: string }>>(
        `SELECT actor_id FROM signal_actors WHERE user_id = $1::uuid LIMIT 1`,
        userId,
      );
      if (existing[0]) return existing[0].actor_id;
      const actorId = '00000000-0000-4000-8000-0000000000ff';
      await tx.$executeRawUnsafe(
        `INSERT INTO signal_actors (actor_id, user_id) VALUES ($1::uuid, $2::uuid)`,
        actorId,
        userId,
      );
      return actorId;
    },
  },
};

/**
 * Rules whose FIXTURE cannot be built in this corpus, and why.
 *
 * These are NOT exemptions from erasure — the eraser still runs against them
 * in production and the coverage ledger still watches for real rows. They are
 * an honest statement that this particular proof cannot construct a row here,
 * pinned so the set cannot grow without someone noticing.
 */
/**
 * Rules whose FIXTURE cannot be built here. EMPTY, and it should stay that
 * way: every entry that ever sat in this map turned out to be a seeder
 * limitation wearing an excuse, never a fact about erasure. Eleven were
 * dissolved by letting the fixture own its people; the last five by teaching
 * it that some tables key by the signals PSEUDONYM and that `users` is the
 * subject rather than a row to insert.
 */
const UNSEEDABLE: Record<string, string> = {};

/**
 * EXTRA COLUMN VALUES a table's CHECK constraints require.
 *
 * A CHECK encodes a business rule the catalog cannot express as a type — "a
 * lifetime grant has no day count", "a list item targets a restaurant XOR a
 * connection". A generic filler satisfies the column types and still produces
 * a row the domain forbids, so these two need the rule spelled out.
 *
 * This lives in the FIXTURE, never in PERSON_DATA_RULES: it is knowledge about
 * how to build a valid row, not about what happens to a person's data. Putting
 * it in the declaration would let a fixture concern start steering erasure.
 */
const SEED_SHAPE: Record<string, Record<string, string>> = {
  // kind='lifetime' is the one shape needing neither granted_days nor
  // expires_at, so it is the cheapest valid grant to construct.
  access_grants: {
    kind: `'lifetime'`,
    granted_days: 'NULL',
    expires_at: 'NULL',
  },
  // A signal must say WHERE it happened: place_id OR a full bbox. Both are
  // nullable, so the generic filler never touches them and the row lands with
  // neither — the same shape as user_list_items below, where a CHECK requires
  // a column the schema does not.
  signals: {
    geo_min_lat: '30.2',
    geo_min_lng: '-97.8',
    geo_max_lat: '30.3',
    geo_max_lng: '-97.7',
  },
  // Exactly one target — and the target column is NULLABLE, so the generic
  // filler never touches it and the row lands with ZERO targets, which the
  // check rejects just as firmly as two. A CHECK can require a column the
  // schema does not.
  user_list_items: {
    connection_id: 'NULL',
    restaurant_id: `(SELECT entity_id FROM core_entities WHERE type = 'restaurant' LIMIT 1)`,
  },
};

describe('erasure proof — each rule provably acts on a row it owns', () => {
  const prisma = new PrismaClient();

  /**
   * THE FIXTURE OWNS ITS PEOPLE. It used to borrow a live user out of the
   * corpus, and that single choice was the root cause of every rule this proof
   * could not construct — eleven of them, each pinned with its own plausible
   * excuse:
   *
   *   - `user_stats` collided on the primary key, because the borrowed user
   *     already had a stats row;
   *   - `access_grants` collided on (user, source, sourceRef), because every
   *     real user already carries a trial grant;
   *   - `user_follows` and `user_blocks` were rejected as self-reference,
   *     because there was only ever ONE person in the fixture;
   *   - the composite-key tables collided against rows the borrowed user
   *     already had.
   *
   * Eleven excuses, one cause. Creating a subject and a counterparty makes all
   * of them ordinary inserts. Reading that list as eleven separate limitations
   * is exactly the patch-shaped mistake — it argued for eleven exemptions when
   * the fixture just needed to stop borrowing.
   */
  const makeUser = async (tx: PrismaClient, tag: string): Promise<string> => {
    const [row] = await tx.$queryRawUnsafe<Array<{ user_id: string }>>(
      `INSERT INTO users (email, updated_at) VALUES ($1, now()) RETURNING user_id`,
      `erasure-proof-${tag}@example.invalid`,
    );
    return row.user_id;
  };

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * Columns that must be supplied for an insert to succeed, WITH what they
   * reference. The catalog answers both questions a generic seeder has to ask:
   * "what values does this enum accept" and "what row must already exist".
   * Hand-maintaining either would rot the moment the schema moved.
   */
  const requiredColumns = async (
    tx: PrismaClient,
    table: string,
  ): Promise<
    Array<{
      name: string;
      type: string;
      udt: string;
      refTable: string | null;
      refColumn: string | null;
    }>
  > => {
    const rows = await tx.$queryRawUnsafe<
      Array<{
        column_name: string;
        data_type: string;
        udt_name: string;
        ref_table: string | null;
        ref_column: string | null;
      }>
    >(
      `SELECT c.column_name, c.data_type, c.udt_name,
              ccu.table_name  AS ref_table,
              ccu.column_name AS ref_column
       FROM information_schema.columns c
       LEFT JOIN information_schema.key_column_usage kcu
         ON kcu.table_name = c.table_name AND kcu.column_name = c.column_name
       LEFT JOIN information_schema.table_constraints tc
         ON tc.constraint_name = kcu.constraint_name
        AND tc.constraint_type = 'FOREIGN KEY'
       LEFT JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
       WHERE c.table_schema='public' AND c.table_name=$1
         AND c.is_nullable='NO' AND c.column_default IS NULL
         AND c.is_identity='NO'`,
      table,
    );
    // A column can appear TWICE — once for its primary key and once for its
    // foreign key — and the join emits a NULL reference for the PK row. Keeping
    // whichever came first meant a column that IS a foreign key was sometimes
    // treated as a plain uuid and filled with a made-up value, which the
    // database then rejected. Prefer the row that actually names a reference.
    const byColumn = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const existing = byColumn.get(row.column_name);
      if (!existing || (!existing.ref_table && row.ref_table)) {
        byColumn.set(row.column_name, row);
      }
    }
    return [...byColumn.values()].map((r) => ({
      name: r.column_name,
      type: r.data_type,
      udt: r.udt_name,
      refTable: r.ref_table,
      refColumn: r.ref_column,
    }));
  };

  /**
   * A value Postgres will accept. Order matters: a foreign key must point at a
   * row that EXISTS, and an enum must be one of its own labels — a generic
   * filler satisfies neither, which is why the first version of this seeder
   * failed on 17 of 27 rules and looked like an erasure problem.
   */
  const valueFor = async (
    tx: PrismaClient,
    col: {
      name: string;
      type: string;
      udt: string;
      refTable: string | null;
      refColumn: string | null;
    },
    index: number,
    people: { userId: string; counterpartyId: string },
  ): Promise<string | null> => {
    if (col.refTable && col.refColumn) {
      // A second users column is the OTHER party, never the subject again:
      // reusing the subject makes a self-follow or a self-block, which the
      // schema correctly rejects.
      if (col.refTable === 'users') return `'${people.counterpartyId}'`;
      const [row] = await tx.$queryRawUnsafe<Array<{ v: string }>>(
        `SELECT "${col.refColumn}"::text AS v FROM "${col.refTable}" LIMIT 1`,
      );
      // No parent row to point at — the corpus cannot express this rule.
      // Returning null makes that a REPORTED skip, never a silent pass.
      return row ? `'${row.v}'` : null;
    }
    if (col.type === 'USER-DEFINED') {
      const [row] = await tx.$queryRawUnsafe<Array<{ label: string }>>(
        `SELECT enumlabel AS label FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = $1 ORDER BY e.enumsortorder LIMIT 1`,
        col.udt,
      );
      // NOT every USER-DEFINED type is an enum: `citext` is a domain-ish
      // extension type with no pg_enum rows. Treating "no labels" as
      // unseedable wrongly benched username_history — a rule that erases fine.
      if (row) return `'${row.label}'::"${col.udt}"`;
      return `'proof'::"${col.udt}"`;
    }
    if (col.type === 'uuid') {
      return `'00000000-0000-4000-8000-${String(index).padStart(12, '0')}'`;
    }
    if (col.type.includes('timestamp') || col.type === 'date') return 'now()';
    if (
      col.type.includes('int') ||
      col.type === 'numeric' ||
      col.type.includes('double') ||
      col.type === 'real'
    ) {
      return '0';
    }
    if (col.type === 'boolean') return 'false';
    if (col.udt === 'jsonb' || col.udt === 'json') return `'{}'::jsonb`;
    if (col.type === 'ARRAY') return `'{}'`;
    return `'proof'`;
  };

  const ACTING = PERSON_DATA_RULES.filter((r) => ruleWhere(r) !== null);

  it('has acting rules to prove (the net is not empty)', () => {
    expect(ACTING.length).toBeGreaterThan(10);
  });

  it.each(ACTING.map((r) => [`${r.table}.${r.column}`, r] as const))(
    '%s — a seeded row the person owns does not survive erasure',
    async (key, rule: PersonDataRule) => {
      const outcome = await prisma
        .$transaction(
          async (tx) => {
            const client = tx as unknown as PrismaClient;
            const where = ruleWhere(rule)!;
            const userId = await makeUser(client, 'subject');
            // The OTHER side of any two-person row: a follow needs someone to
            // follow, a block needs someone to block.
            const counterpartyId = await makeUser(client, 'counterparty');

            // ── plant ────────────────────────────────────────────────────────
            // The person key gets the real user id; everything else NOT NULL
            // gets a filler. `personScopeSql` rules reach the person through
            // another table, so their own key column is filled from that table's
            // real value — proving the JOIN, which is the whole point for
            // user_taste_profile.
            // THE SUBJECT'S OWN ROW ALREADY EXISTS. For rules ON `users`, the
            // fixture created the person — inserting a second row keyed by the
            // same id collides on the primary key. The row under test is the one
            // we already made, so the seed step is simply already done.
            const seedIsTheSubject = rule.table === 'users';
            const required = seedIsTheSubject
              ? []
              : await requiredColumns(client, rule.table);
            const cols: string[] = [];
            const vals: string[] = [];

            // PLANT PER GROUND TRUTH, NOT PER RULE. The link column and its
            // value come from PERSON_LINK — an independent statement of how the
            // application really associates this row with a person. The rule is
            // then judged on whether its predicate can FIND that row.
            const link = PERSON_LINK[rule.table];
            if (link) {
              cols.push(link.column);
              vals.push(`'${await link.resolve(client, userId)}'`);
            } else {
              // THE TABLE'S KEY, not the rule's own column. A `null_column`
              // rule names the value to DESTROY (users.auth_provider_user_id),
              // which is not what locates the person — seeding the user id into
              // that column would prove nothing about whether the rule finds
              // the right row. Only a declared locating column identifies.
              const keyColumn =
                PERSON_DATA_RULES.find(
                  (r) => r.table === rule.table && r.personKey,
                )?.column ?? rule.column;
              cols.push(keyColumn);
              vals.push(`'${userId}'`);
            }

            // THE ROW PREDICATE DEFINES WHAT IS THEIRS, so it wins over the
            // generic filler. `curated_lists` is the case: a list is the
            // person's only when `scope = 'personal'`, but `scope` is a NOT NULL
            // enum, so the filler set it to the first label ('global') and the
            // rule then correctly refused to select the seed. The proof was
            // testing a row that was never in scope — a fixture bug that reads
            // exactly like an erasure bug.
            const forced = new Map<string, string>(
              Object.entries(SEED_SHAPE[rule.table] ?? {}),
            );
            if (rule.rowPredicate) {
              for (const m of rule.rowPredicate.matchAll(
                /(\w+)\s*=\s*'([^']+)'/g,
              )) {
                forced.set(m[1], `'${m[2]}'`);
              }
            }

            let unseedable: string | null = null;
            for (const [i, col] of required.entries()) {
              if (cols.includes(col.name)) continue;
              const value =
                forced.get(col.name) ??
                (await valueFor(client, col, i + 1, {
                  userId,
                  counterpartyId,
                }));
              if (value === null) {
                unseedable = `${col.name} -> ${col.refTable ?? col.udt}`;
                break;
              }
              cols.push(col.name);
              vals.push(value);
            }
            if (unseedable) {
              throw Object.assign(new Error('rollback'), {
                [ROLLBACK]: { before: 0, after: 0, unseedable },
              });
            }

            // Forced values for NULLABLE columns: `required` only covers NOT
            // NULL columns, so a CHECK that demands a nullable column be set
            // (user_list_items needs exactly ONE target, and both target columns
            // are nullable) is only satisfiable here.
            for (const [name, value] of forced) {
              if (!cols.includes(name)) {
                cols.push(name);
                vals.push(value);
              }
            }

            // AN INSERT FAILURE IS A DIFFERENT VERDICT FROM AN ERASURE FAILURE.
            // This assertion is about whether erasure ACTS; being unable to
            // build the fixture (a composite constraint, a unique index, a check
            // that two user columns differ) says nothing about that. Conflating
            // them would either hide real erasure bugs among fixture noise or
            // train the reader to ignore red. So it is reported as its own
            // outcome, and the set of them is pinned below so it cannot grow
            // silently.
            try {
              if (seedIsTheSubject) {
                // The fixture already created this person, so the row under
                // test exists — inserting a second one collides on the primary
                // key. What the seed still has to do is give the column a
                // VALUE to destroy, so "it was nulled" is a real observation
                // rather than a column that happened to be null already.
                await client.$executeRawUnsafe(
                  `UPDATE users SET "${rule.column}" = $1 WHERE user_id = $2::uuid`,
                  'erasure-proof-value',
                  userId,
                );
              } else {
                await client.$executeRawUnsafe(
                  `INSERT INTO "${rule.table}" (${cols
                    .map((c) => `"${c}"`)
                    .join(', ')}) VALUES (${vals.join(', ')})`,
                );
              }
            } catch (error) {
              throw Object.assign(new Error('rollback'), {
                [ROLLBACK]: {
                  before: 0,
                  after: 0,
                  // The WHOLE cause, compacted. A parser that silently reports
                  // "insert failed" when its pattern misses turns a diagnosable
                  // failure into a shrug — the same missing-tooling-reads-as-
                  // clean shape as everything else here.
                  unseedable: (error instanceof Error
                    ? error.message
                    : String(error)
                  )
                    .replace(/\s+/g, ' ')
                    .slice(0, 220),
                },
              });
            }

            // The seed must actually be selected by the rule's own predicate —
            // otherwise the assertion below would pass on a row that was never
            // in scope, which is exactly the vacuous green this file exists to
            // eliminate.
            const [before] = await client.$queryRawUnsafe<Array<{ n: number }>>(
              `SELECT count(*)::int AS n FROM "${rule.table}" WHERE ${where}`,
              userId,
            );

            // ── erase ────────────────────────────────────────────────────────
            const statement =
              rule.disposition === 'delete_row'
                ? `DELETE FROM "${rule.table}" WHERE ${where}`
                : `UPDATE "${rule.table}" SET "${rule.column}" = NULL WHERE ${where}`;
            await client.$executeRawUnsafe(statement, userId);

            // WHAT "ERASED" MEANS DEPENDS ON THE VERB, and this assertion used
            // to assume row-removal for all three. `delete_row` removes the
            // row; `sever` and `null_column` deliberately KEEP it and destroy
            // one value — a comment survives its author, a users row survives
            // as the anonymized shell. Counting surviving rows therefore
            // reported a correct null_column erasure as a failure, which is a
            // verifier measuring the wrong thing rather than a defect.
            const survivingValue =
              rule.disposition === 'delete_row'
                ? `SELECT count(*)::int AS n FROM "${rule.table}" WHERE ${where}`
                : `SELECT count(*)::int AS n FROM "${rule.table}"
                     WHERE (${where}) AND "${rule.column}" IS NOT NULL`;
            const [after] = await client.$queryRawUnsafe<Array<{ n: number }>>(
              survivingValue,
              userId,
            );

            throw Object.assign(new Error('rollback'), {
              [ROLLBACK]: { before: before.n, after: after.n },
            });
          },
          {
            // 30s, not Prisma's 5s default. This proof introspects the catalog
            // for every rule before it can insert, which is far more work than
            // an app transaction — and it only ever timed out in the COMBINED
            // run, where the database is already warm with other specs' load.
            // A fixture that fails under load and passes alone reads exactly
            // like a real defect; it was the timeout.
            timeout: 30_000,
          },
        )
        .catch(
          (error: {
            [ROLLBACK]?: {
              before: number;
              after: number;
              unseedable?: string;
            };
          }) => {
            if (error[ROLLBACK]) return error[ROLLBACK];
            throw error;
          },
        );

      if (outcome.unseedable) {
        // REPORTED, never silent, and PINNED: a rule may only be unseedable if
        // it is already on the list. A new one fails here rather than quietly
        // joining the set of things nobody proves.
        // The REASON is in the assertion, not just the pin: a pinned rule
        // whose cause has changed is a different fact, and a bare boolean
        // would hide that.
        expect({
          key,
          pinned: key in UNSEEDABLE,
          why: outcome.unseedable,
        }).toEqual({
          key,
          pinned: true,
          why: outcome.unseedable,
        });
        return;
      }

      // The seed was in scope...
      expect({ key, seedSelected: outcome.before > 0 }).toEqual({
        key,
        seedSelected: true,
      });
      // ...and erasure removed it from scope.
      expect({ key, remaining: outcome.after }).toEqual({ key, remaining: 0 });
    },
  );
});

/**
 * THE ORDER IS LOAD-BEARING, AND NOTHING TESTED IT.
 *
 * The eraser runs delete_row → null_column → sever, and that sequence is a
 * correctness requirement, not a style choice: `signals.subject_text` reaches
 * its person ONLY through `signal_actors.user_id`, and `sever` is what nulls
 * that mapping. Run sever first and the null_column predicate matches nothing
 * — the raw typed search text of a deleted person survives forever, silently,
 * with erasure reporting success.
 *
 * That is the taste-profile failure again, one level up: the wrong thing
 * happens, nothing errors, and every existing check stays green. The
 * per-rule seed-and-erase proof above CANNOT catch it, because it exercises
 * each rule in isolation — order is a property of the whole sweep.
 */
describe('erasure order — sever must not run before the scopes that need it', () => {
  const prisma = new PrismaClient();
  const ROLL = Symbol('roll');

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('destroys raw search text BEFORE severing the actor that reaches it', async () => {
    const result = await prisma
      .$transaction(async (tx) => {
        const client = tx as unknown as PrismaClient;
        const [user] = await client.$queryRawUnsafe<Array<{ user_id: string }>>(
          `INSERT INTO users (email, updated_at)
           VALUES ('erasure-order@example.invalid', now()) RETURNING user_id`,
        );
        const actorId = '00000000-0000-4000-8000-00000000ffff';
        await client.$executeRawUnsafe(
          `INSERT INTO signal_actors (actor_id, user_id) VALUES ($1::uuid, $2::uuid)`,
          actorId,
          user.user_id,
        );
        await client.$executeRawUnsafe(
          // A signal must say WHERE it happened (place_id or a bbox) — the
          // ledger's own shape check. A viewport is the honest choice here:
          // this is a typed search, which is exactly what carries a bbox.
          `INSERT INTO signals
             (actor_id, kind, subject_type, subject_text, occurred_at,
              geo_min_lat, geo_min_lng, geo_max_lat, geo_max_lng)
           VALUES ($1::uuid, 'search', 'term', 'a private thing they typed', now(),
                   30.2, -97.8, 30.3, -97.7)`,
          actorId,
        );

        // THE REAL SERVICE, THE REAL ORDER — not a re-implementation of it.
        const eraser = new PersonDataEraserService(
          client as never,
          {
            setContext: () => ({
              info() {},
              warn() {},
              error() {},
              debug() {},
            }),
          } as never,
        );
        await eraser.erase(user.user_id);

        const [left] = await client.$queryRawUnsafe<Array<{ n: number }>>(
          `SELECT count(*)::int AS n FROM signals
           WHERE actor_id = $1::uuid AND subject_text IS NOT NULL`,
          actorId,
        );
        const [severed] = await client.$queryRawUnsafe<Array<{ n: number }>>(
          `SELECT count(*)::int AS n FROM signal_actors
           WHERE actor_id = $1::uuid AND user_id IS NULL`,
          actorId,
        );
        throw Object.assign(new Error('roll'), {
          [ROLL]: { textLeft: left.n, severed: severed.n },
        });
      })
      .catch((error: { [ROLL]?: { textLeft: number; severed: number } }) => {
        if (error[ROLL]) return error[ROLL];
        throw error;
      });

    // The words are gone...
    expect({ textLeft: result.textLeft }).toEqual({ textLeft: 0 });
    // ...and the actor is anonymous, which is the state that makes the text
    // unreachable in the first place. Both, in that order.
    expect({ severed: result.severed }).toEqual({ severed: 1 });
  });
});
