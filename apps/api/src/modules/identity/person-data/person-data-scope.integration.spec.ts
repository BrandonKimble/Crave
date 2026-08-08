import { PrismaClient } from '@prisma/client';
import { PERSON_DATA_RULES } from './person-data-class';

/**
 * A RULE'S SCOPE MUST BE ABLE TO MATCH THE PERSON'S ROWS.
 *
 * `delete_row` and `sever` scope by their own column unless the rule declares
 * `personScopeSql`. That silently assumes the column holds a USER id — and
 * `user_taste_profile.actor_id` does not: it holds the signals PSEUDONYM
 * (user-taste-profile.builder writes it from signal_demand_daily). So
 * `DELETE ... WHERE actor_id = <userId>` matched nothing, and the inferred
 * taste profile — data explicitly classified as the person's own — survived
 * deletion.
 *
 * WHY NOTHING CAUGHT IT. The live erasure proof sweeps every uuid column
 * looking for the departing person's id. That id NEVER appears in this table,
 * so the sweep passed. A verifier that hunts for the person key is structurally
 * blind to a table that does not contain the person key — the same
 * shares-its-subject's-blind-spot failure, one level down.
 *
 * WHY AN EMPTY TABLE IS NOT A PASS. `user_taste_profile` is empty in dev, so a
 * pure data check would have reported "no mismatches" and proved nothing. Any
 * column this cannot verify from data MUST be declared below, by a human, with
 * a reason. Unverifiable is not clean.
 *
 * WHY THE DECLARATION IS NOW REQUIRED OF EVERY COLUMN (F9981). The declaration
 * used to be demanded only where the corpus happened to be silent — so the same
 * rules passed unremarked on a populated database and failed as undeclared on
 * CI's fresh one. Thirteen columns were "verified" purely because someone's
 * laptop had rows. That makes the verdict a property of the database rather
 * than of the code, which is the same disease one level up: what a check
 * concludes must not depend on where it runs.
 *
 * So the shape is inverted. EVERY column that scopes by itself must be
 * declared here with a human reason — that part is environment-independent and
 * is the real claim. The DATA then serves as a CONTRADICTION check on top: if
 * the corpus does hold non-null values and NONE of them is a user id, the
 * declaration is wrong and this fails. An empty table simply contradicts
 * nothing; it can no longer flip the verdict.
 */

/**
 * Columns asserted to hold user ids directly. Each needs a human reason — that
 * is the point: the check converts silence into a decision.
 */
const DIRECT_PERSON_KEY: Record<string, string> = {
  'photo_events.user_id':
    'Written from the authenticated request user in the photo write path.',
  'poll_creation_attempts.user_id':
    'The attempt log keys the requesting user (text column, same value).',
  'collection_on_demand_unsegmented_residue.user_id':
    'The asking user; rows predating the column are null, never a pseudonym.',
  'user_devices.user_id': 'Device rows are keyed by the owning user.',
  'notification_devices.user_id': 'Push tokens are keyed by the owning user.',
  'user_onboarding_responses.user_id': 'One row per user, keyed by user id.',
  'poll_topics.created_by_user_id':
    'Null for seeded/system topics; when set it is the creating user.',
  'curated_lists.owner_user_id':
    'Null for global editorial lists; when set it is the owning user.',
  'user_devices.device_key':
    'Secondary column of a delete_row rule — the sibling user_id rule scopes the delete; this one classifies the column.',
  'collection_on_demand_unsegmented_residue.residue_text':
    'Secondary column of a delete_row rule — same as above.',
  'user_list_collaborators.user_id':
    'The collaborating user; the row IS their membership.',
  'user_blocks.blocker_user_id':
    'The person who placed the block. (The blocked side is RETAINED — a block protects whoever placed it and must outlive the blocked account.)',
  'user_list_collaborators.invited_by_user_id':
    'The inviter. Severed rather than deleted: the invitation survives for the OTHER collaborators, minus who made it.',
  'user_taste_profile.subject_text':
    'Secondary column; scoped by the declared personScopeSql alongside actor_id.',
  'signal_actors.user_id':
    'The mapping row itself: actor_id is the pseudonym, user_id is the person it stands for. Deliberately NOT a foreign key — severing it is what anonymizes the signals, and a constraint would fight that.',
  'polls.created_by_user_id':
    'The poll author, written from the authenticated request user. Null for seeded/system polls.',
};

describe('person-data scope — a rule can actually reach the person', () => {
  const prisma = new PrismaClient();
  const SCOPING = new Set(['delete_row', 'sever']);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('every scoping rule either declares a scope, or provably holds user ids', async () => {
    const problems: string[] = [];
    let provenBySchema = 0;

    /**
     * THE STRONGEST EVIDENCE IS THE SCHEMA, and it is the same everywhere.
     * A column with a foreign key to users(user_id) cannot hold anything but a
     * user id — the database refuses. That is a better answer than either a
     * human note or a sample of whatever rows a corpus happens to carry, and it
     * is why eleven of the thirteen columns CI flagged as undeclared need no
     * declaration at all: they were always provable, just never asked.
     */
    const usersForeignKeys = new Set(
      (
        await prisma.$queryRawUnsafe<Array<{ key: string }>>(
          `SELECT tc.table_name || '.' || kcu.column_name AS key
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON kcu.constraint_name = tc.constraint_name
             JOIN information_schema.constraint_column_usage ccu
               ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND ccu.table_name = 'users'
              AND ccu.column_name = 'user_id'`,
        )
      ).map((r) => r.key),
    );

    for (const rule of PERSON_DATA_RULES) {
      if (!SCOPING.has(rule.disposition)) continue;
      // A declared scope IS the answer — nothing to infer.
      if (rule.personScopeSql) continue;
      // `users` is scoped by its own primary key.
      if (rule.table === 'users') continue;
      // A delete_row table with a declared KEY: this table's other columns
      // classify, they do not scope, so they have nothing to verify.
      //
      // `personKey` ONLY — not "or personScopeSql on some sibling". Accepting a
      // sibling's scope let the mutation through: removing the scope from
      // `user_taste_profile.actor_id` left the sibling `subject_text` still
      // carrying one, so actor_id was waved past as classify-only while it was
      // in fact the unscoped key. A guard whose exemption can be satisfied by
      // the thing it is guarding is not a guard.
      if (
        rule.disposition === 'delete_row' &&
        !rule.personKey &&
        PERSON_DATA_RULES.some(
          (r) =>
            r.table === rule.table &&
            r.disposition === 'delete_row' &&
            r.personKey,
        )
      ) {
        continue;
      }

      const key = `${rule.table}.${rule.column}`;
      // THE CLAIM, made the same way on every database: this column holds user
      // ids because the schema says so, or because a human said so. Neither
      // answer moves when the corpus does.
      if (usersForeignKeys.has(key)) {
        provenBySchema += 1;
      } else if (!DIRECT_PERSON_KEY[key]) {
        problems.push(
          `${key}: nothing says this column holds user ids. Either add ` +
            `personScopeSql (if it is not a user id, like ` +
            `user_taste_profile.actor_id), give it a foreign key to ` +
            `users(user_id), or record why it is a direct person key in ` +
            `DIRECT_PERSON_KEY.`,
        );
        continue;
      }

      // THE DATA CONTRADICTS, IT NO LONGER DECIDES. Rows can prove the claim
      // WRONG; their absence proves nothing and is therefore not an outcome.
      const [row] = await prisma.$queryRawUnsafe<
        Array<{ nonnull: number; matching: number }>
      >(
        `SELECT count("${rule.column}")::int AS nonnull,
                count(*) FILTER (
                  WHERE "${rule.column}"::text IN (SELECT user_id::text FROM users)
                )::int AS matching
         FROM "${rule.table}"`,
      );

      if (row.nonnull === 0) continue;

      if (row.matching === 0) {
        problems.push(
          `${key}: has ${row.nonnull} non-null values and NONE of them is a ` +
            `user id, so this rule matches no rows for anybody. Declare ` +
            `personScopeSql.`,
        );
        continue;
      }
    }

    expect(problems).toEqual([]);
    // The check must be doing work — if nothing was provable from the schema,
    // the whole thing has degenerated into reading the allowlist back to
    // itself. Counted from the CATALOG, so this guard means the same on an
    // empty database as on a full one.
    expect(provenBySchema).toBeGreaterThan(0);
  });

  it('the taste profile is reachable — the rule that was broken', async () => {
    // Named separately because it is the defect this file was bought with:
    // the scope must resolve through signal_actors, not by comparing a
    // pseudonym to a user id.
    const rule = PERSON_DATA_RULES.find(
      (r) => r.table === 'user_taste_profile' && r.column === 'actor_id',
    );
    expect(rule?.personScopeSql).toContain('signal_actors');

    // And it must be executable, not merely present.
    const [{ n }] = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM user_taste_profile WHERE ${rule!.personScopeSql}`,
      '00000000-0000-4000-8000-000000000000',
    );
    expect(typeof n).toBe('number');
  });
});
