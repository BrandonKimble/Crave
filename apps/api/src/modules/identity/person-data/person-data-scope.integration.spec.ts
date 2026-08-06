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
 */

/**
 * Columns asserted to hold user ids directly, where the data cannot say so
 * (empty table, or every value null). Each needs a human reason — that is the
 * point: the check converts silence into a decision.
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
};

describe('person-data scope — a rule can actually reach the person', () => {
  const prisma = new PrismaClient();
  const SCOPING = new Set(['delete_row', 'sever']);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('every scoping rule either declares a scope, or provably holds user ids', async () => {
    const problems: string[] = [];
    let verifiedFromData = 0;

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
      const [row] = await prisma.$queryRawUnsafe<
        Array<{ nonnull: number; matching: number }>
      >(
        `SELECT count("${rule.column}")::int AS nonnull,
                count(*) FILTER (
                  WHERE "${rule.column}"::text IN (SELECT user_id::text FROM users)
                )::int AS matching
         FROM "${rule.table}"`,
      );

      if (row.nonnull === 0) {
        // The data cannot answer. A human must.
        if (!DIRECT_PERSON_KEY[key]) {
          problems.push(
            `${key}: no rows to verify against and no declaration. Either add ` +
              `personScopeSql (if the column is not a user id, like ` +
              `user_taste_profile.actor_id) or record why it is a direct ` +
              `person key in DIRECT_PERSON_KEY.`,
          );
        }
        continue;
      }

      if (row.matching === 0) {
        problems.push(
          `${key}: has ${row.nonnull} non-null values and NONE of them is a ` +
            `user id, so this rule matches no rows for anybody. Declare ` +
            `personScopeSql.`,
        );
        continue;
      }
      verifiedFromData += 1;
    }

    expect(problems).toEqual([]);
    // The check must be doing work — if nothing was verifiable from data, the
    // whole thing has degenerated into reading the allowlist back to itself.
    expect(verifiedFromData).toBeGreaterThan(0);
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
