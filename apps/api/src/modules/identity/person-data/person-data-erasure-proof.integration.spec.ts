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
 * Rules whose FIXTURE cannot be built, and why.
 *
 * These would NOT be exemptions from erasure — the eraser still runs against
 * every rule in production, and the coverage ledger still reports which ones
 * live data exercises. They would be an honest statement that this proof
 * cannot construct a row, pinned so the set cannot grow without someone
 * noticing.
 *
 * It is EMPTY, and it should stay that way: every entry that ever sat in this map turned out to be a seeder
 * limitation wearing an excuse, never a fact about erasure. Eleven were
 * dissolved by letting the fixture own its people; five more by teaching it
 * that some tables key by the signals PSEUDONYM and that `users` is the
 * subject rather than a row to insert; the last six (F9981) by minting FK
 * parents instead of borrowing them.
 *
 * F9981 IS WHY THE BORROW HAD TO GO. The seeder used to satisfy a foreign key
 * with `SELECT <ref> FROM <parent> LIMIT 1` — whatever row the corpus happened
 * to hold. On a populated database that always found something and every rule
 * was green; on CI's freshly migrated one it found nothing, six rules reported
 * themselves unseedable, and the suite went red against code it had already
 * proven correct. A verdict that changes with the database is not a verdict
 * about the code. The fixture now MINTS the parent (recursively, satisfying
 * the parent's own parents, honouring SEED_SHAPE at every level) inside the
 * same rolled-back transaction, so what the corpus contains no longer enters
 * the answer.
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
 *
 * A value is either a SQL literal or a function handed `mint` — the same
 * recursive row-maker the foreign-key path uses. Anything a shape needs from
 * another table is therefore MADE here, never looked up: a `SELECT ... LIMIT 1`
 * would put the corpus back into the verdict (F9981).
 *
 * SEED_SHAPE applies to PARENT tables too, not only the table under test: a
 * minted parent has to be a row its own CHECKs allow.
 */
type SeedMint = (table: string, column: string) => Promise<string>;
type SeedValue = string | ((mint: SeedMint) => Promise<string>);

const SEED_SHAPE: Record<string, Record<string, SeedValue>> = {
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
    restaurant_id: (mint) => mint('core_entities', 'entity_id'),
  },
  // A minted entity is a RESTAURANT: user_list_items points its restaurant
  // column at core_entities, and the generic filler would take the first enum
  // label for `type`, which is not one. Stated honestly — no CHECK enforces
  // this today, so removing it does not turn the suite red; it is here because
  // a fixture that plants a "restaurant" which is not one is the kind of quiet
  // wrongness this file exists to refuse.
  core_entities: {
    type: `'place'`,
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
      maxLength: number | null;
      refTable: string | null;
      refColumn: string | null;
    }>
  > => {
    const rows = await tx.$queryRawUnsafe<
      Array<{
        column_name: string;
        data_type: string;
        udt_name: string;
        max_length: number | null;
        ref_table: string | null;
        ref_column: string | null;
      }>
    >(
      `SELECT c.column_name, c.data_type, c.udt_name,
              c.character_maximum_length AS max_length,
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
      maxLength: r.max_length,
      refTable: r.ref_table,
      refColumn: r.ref_column,
    }));
  };

  type Column = {
    name: string;
    type: string;
    udt: string;
    maxLength: number | null;
    refTable: string | null;
    refColumn: string | null;
  };
  type People = { userId: string; counterpartyId: string };

  /**
   * A PARENT ROW, MADE RATHER THAN FOUND (F9981).
   *
   * The foreign-key path used to borrow: `SELECT <ref> FROM <parent> LIMIT 1`.
   * That reads the corpus into the verdict — on a populated database every
   * rule was seedable, on a fresh one six were not, and the same code got two
   * different answers. So the parent is now INSERTED here, by exactly the
   * machinery that builds the row under test: the catalog names its NOT NULL
   * columns, SEED_SHAPE supplies whatever its CHECKs demand, and its own
   * foreign keys recurse through this same function. Everything lands in the
   * transaction that always rolls back.
   *
   * `chain` is the ancestry of the row being built. A table that reappears in
   * it is a REQUIRED cycle (a NOT NULL self-reference, or a mutual pair) —
   * unsatisfiable by any insert order, so it stops here and surfaces as the
   * fixture failure it is rather than recursing until the stack dies.
   */
  const mintRow = async (
    tx: PrismaClient,
    table: string,
    column: string,
    people: People,
    chain: string[],
  ): Promise<string> => {
    if (chain.includes(table)) {
      throw new Error(
        `unsatisfiable NOT NULL foreign-key cycle: ${[...chain, table].join(' -> ')}`,
      );
    }
    const nextChain = [...chain, table];
    const mint: SeedMint = async (parentTable, parentColumn) =>
      `'${await mintRow(tx, parentTable, parentColumn, people, nextChain)}'`;
    const shape = new Map<string, SeedValue>(
      Object.entries(SEED_SHAPE[table] ?? {}),
    );
    const cols: string[] = [];
    const vals: string[] = [];
    for (const col of await requiredColumns(tx, table)) {
      const forced = shape.get(col.name);
      cols.push(col.name);
      vals.push(
        forced === undefined
          ? await valueFor(tx, col, people, nextChain)
          : await resolveSeedValue(forced, mint),
      );
    }
    for (const [name, value] of shape) {
      if (cols.includes(name)) continue;
      cols.push(name);
      vals.push(await resolveSeedValue(value, mint));
    }
    const [row] = await tx.$queryRawUnsafe<Array<{ v: string }>>(
      `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')})
       VALUES (${vals.join(', ')})
       RETURNING "${column}"::text AS v`,
    );
    return row.v;
  };

  const resolveSeedValue = async (
    value: SeedValue,
    mint: SeedMint,
  ): Promise<string> => (typeof value === 'string' ? value : value(mint));

  /**
   * A value Postgres will accept. Order matters: a foreign key must point at a
   * row that EXISTS, and an enum must be one of its own labels — a generic
   * filler satisfies neither, which is why the first version of this seeder
   * failed on 17 of 27 rules and looked like an erasure problem.
   */
  const valueFor = async (
    tx: PrismaClient,
    col: Column,
    people: People,
    chain: string[],
  ): Promise<string> => {
    if (col.refTable && col.refColumn) {
      // A second users column is the OTHER party, never the subject again:
      // reusing the subject makes a self-follow or a self-block, which the
      // schema correctly rejects. `users` is also the one parent that is never
      // minted here — the fixture already owns its people.
      if (col.refTable === 'users') return `'${people.counterpartyId}'`;
      return `'${await mintRow(tx, col.refTable, col.refColumn, people, chain)}'`;
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
      // FRESH, not a padded counter. Once parents are minted rather than
      // borrowed, one seed can insert several rows — and a counter that
      // restarts per row handed two of them the same uuid, which a primary key
      // rejects. The database already owns a generator for this.
      return 'gen_random_uuid()';
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
    // NARROW TEXT IS REAL. Minting parents reaches columns the rules' own
    // tables never had — `core_entities.country` is char(2) — and a fixed
    // 'proof' filler is a 22001 that reads like an unseedable rule. The
    // catalog knows the width; honour it.
    return col.maxLength !== null && col.maxLength < 'proof'.length
      ? `'${'p'.repeat(col.maxLength)}'`
      : `'proof'`;
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
              // THE RULE'S OWN KEY IF IT HAS ONE, otherwise the table's.
              //
              // A `personKey` rule acts on the rows where ITS column holds the
              // person (D146 — per-column scoping), so the seed has to put the
              // person THERE. This used to take the table's FIRST person key
              // for every rule, which was only ever right because the old scope
              // ORed the whole table together: it planted `follower_user_id`
              // and then "proved" the `following_user_id` rule by finding a row
              // that rule should never have matched. A fixture that passes for
              // the wrong reason is the vacuous green this file exists to end.
              //
              // A `null_column` rule is the other case and still takes the
              // table's key: it names the value to DESTROY
              // (users.auth_provider_user_id), not what locates the person, so
              // seeding the user id into it would prove nothing.
              const keyColumn = rule.personKey
                ? rule.column
                : (PERSON_DATA_RULES.find(
                    (r) => r.table === rule.table && r.personKey,
                  )?.column ?? rule.column);
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
            const forced = new Map<string, SeedValue>(
              Object.entries(SEED_SHAPE[rule.table] ?? {}),
            );
            if (rule.rowPredicate) {
              for (const m of rule.rowPredicate.matchAll(
                /(\w+)\s*=\s*'([^']+)'/g,
              )) {
                forced.set(m[1], `'${m[2]}'`);
              }
            }

            // BUILDING THE ROW IS PART OF THE SEED, so its failures are
            // reported exactly like an insert failure below — a foreign-key
            // cycle the fixture cannot satisfy is a fixture fact, not an
            // erasure fact. It used to be a distinct "no parent row to point
            // at" verdict; there is no such thing now that parents are minted.
            const people = { userId, counterpartyId };
            const mint: SeedMint = async (parentTable, parentColumn) =>
              `'${await mintRow(client, parentTable, parentColumn, people, [rule.table])}'`;
            try {
              for (const col of required) {
                if (cols.includes(col.name)) continue;
                const value = forced.get(col.name);
                cols.push(col.name);
                vals.push(
                  value === undefined
                    ? await valueFor(client, col, people, [rule.table])
                    : await resolveSeedValue(value, mint),
                );
              }

              // Forced values for NULLABLE columns: `required` only covers NOT
              // NULL columns, so a CHECK that demands a nullable column be set
              // (user_list_items needs exactly ONE target, and both target
              // columns are nullable) is only satisfiable here.
              for (const [name, value] of forced) {
                if (cols.includes(name)) continue;
                cols.push(name);
                vals.push(await resolveSeedValue(value, mint));
              }
            } catch (error) {
              throw Object.assign(new Error('rollback'), {
                [ROLLBACK]: {
                  before: 0,
                  after: 0,
                  unseedable: (error instanceof Error
                    ? error.message
                    : String(error)
                  )
                    .replace(/\s+/g, ' ')
                    .slice(0, 220),
                },
              });
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
                //
                // TYPED, NOT ASSUMED. Every `users` column this reached was
                // text until `deleted_identity` (D148) arrived as jsonb, and a
                // text literal into jsonb is a 42804 the proof reported as
                // "unseedable" — a fixture gap that reads exactly like an
                // erasure gap. The catalog already knows the type; ask it.
                // And `deleted_identity` carries a CHECK (a stash may only
                // exist on a deleted row), so the row is marked deleted in the
                // same statement — the seed has to be a row the domain allows.
                const seeded = await client.$queryRawUnsafe<
                  Array<{ udt_name: string }>
                >(
                  `SELECT udt_name FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='users'
                      AND column_name=$1`,
                  rule.column,
                );
                const literal =
                  seeded[0]?.udt_name === 'jsonb'
                    ? `'{"seeded":"erasure-proof-value"}'::jsonb`
                    : `'erasure-proof-value'`;
                await client.$executeRawUnsafe(
                  `UPDATE users
                      SET "${rule.column}" = ${literal},
                          deleted_at = coalesce(deleted_at, now())
                    WHERE user_id = $1::uuid`,
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
