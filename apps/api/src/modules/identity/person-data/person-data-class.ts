/**
 * WHAT HAPPENS TO THIS COLUMN WHEN THE PERSON LEAVES.
 *
 * Declared, never inferred. The predecessor (`crave_person_data_map()`, a SQL
 * function classifying by COLUMN-NAME REGEX) is deleted, for two reasons that
 * are not about its error rate:
 *
 *  1. A regex answers CONFIDENTLY for a column it has never seen. A
 *     declaration REFUSES. For a legal obligation the failure to engineer
 *     against is not "we mis-swept editorial rows" (loud, recoverable — it
 *     cost one afternoon when `curated_lists.owner_user_id` matched and 672
 *     rows of home-surface content were being truncated out of staging); it
 *     is "a table added in six months quietly held personal data nobody
 *     classified and nobody deleted" (silent, unrecoverable, found by a
 *     regulator). Inference cannot produce that failure — it produces a
 *     plausible answer and moves on.
 *  2. A NAME CANNOT ENCODE A DISPOSITION. `user_reports.reporter_user_id` is
 *     the departing person's own act; `user_reports.reported_user_id` is a
 *     safety record ABOUT them. Same shape, opposite fates. No refinement of
 *     a pattern will ever separate them, because the difference is a policy
 *     fact that exists only in the owner's head until someone writes it down.
 *
 * Inference survives only as the ADVERSARY: `person-data-census.spec.ts`
 * sweeps an over-broad net for person-shaped columns and fails the build for
 * any that lack a declaration here. The regex stops being the answer and
 * becomes the question.
 *
 * The unit is (table, column) — NOT the table. Every ratified ruling is
 * column-grained or row-grained: keep the `signal_actors` row but kill two of
 * its columns; keep global `curated_lists` but delete the personal ones; keep
 * the recipient's message but drop the sender's copy.
 */
export type PersonDataDisposition =
  /** The row IS the person's. Delete it (per-user); truncate it (wholesale). */
  | 'delete_row'
  /** Keep the row, drop the person link. Authorship, actor mappings. */
  | 'sever'
  /** Keep the row, destroy THIS column's value. Fingerprints, free text. */
  | 'null_column'
  /** Keep as-is. Requires a stated legal basis and a horizon. */
  | 'retain'
  /**
   * The column keeps pointing at the departing person's OWN `users` row, which
   * survives ANONYMIZED (no name, no email, no auth identity — it exists only
   * to anchor retained financial records and severed authorship). Anonymity
   * comes from the shell, not from nulling the pointer.
   *
   * This is the Reddit/Discord shape and it is why NO Ghost User sentinel is
   * needed: the anonymized shell already IS the ghost, without a fake account
   * that has to be kept unfollowable, unmessageable and unsearchable.
   * `assertShellIsAnonymous` in the eraser proves the invariant this relies on.
   */
  | 'anonymized_by_shell'
  /** Deliberately NOT a person's data (a restaurant's phone is the business's). */
  | 'not_person';

/**
 * WHERE A ROW'S PERSON IS. Exactly one of three, always stated.
 *
 * These used to be two optional booleans-and-strings whose ABSENCE meant the
 * third case. "Neither field is set" is not a declaration — it is a blank that
 * happens to be interpreted, and the interpretation drifted: the eraser once
 * read it as "scope by your own column" and emitted `WHERE residue_text =
 * <uuid>`, a predicate that matches nothing.
 */
type PersonLocator =
  /** THIS column holds the person's id. */
  | { personKey: true; personScopeSql?: never; classifiedBy?: never }
  /** The person is reached through a join (signals -> signal_actors). */
  | { personScopeSql: string; personKey?: never; classifiedBy?: never }
  /**
   * This column NAMES person data but does not LOCATE a person — the table's
   * key does. A device fingerprint, a push token, a raw residue string.
   */
  | { classifiedBy: 'table-key'; personKey?: never; personScopeSql?: never };

type RuleIdentity = { table: string; column: string };

/**
 * THE RULE, AS A UNION — one variant per disposition, carrying exactly what
 * that disposition needs and nothing it does not.
 *
 * This was one interface with six optional fields, and every field that could
 * be omitted was a way to write a rule nothing would honour. Those were not
 * hypothetical: `horizonDays` sat on three rules with NO reader at all, and
 * seven more retained columns had no horizon because omitting one silently
 * meant forever. A test can catch that after the fact; a type can refuse it.
 *
 * What is now unwritable, each of which was reachable before:
 *   - a `retain` rule with a scope or a row predicate (the sweep ignores both,
 *     so the author would believe a filter applied that never did);
 *   - a `retain` with a day-count and no `horizonUnit` — the D146 defect,
 *     where the sweep assumed DELETE and would have destroyed the anonymized
 *     shell that anchors every retained financial record;
 *   - a horizon on `sever`/`null_column`/`anonymized_by_shell`, where nothing
 *     reads it;
 *   - an acting rule with no locator, which the compiler had to guess at;
 *   - a `retain` or `not_person` with no stated basis — the two dispositions
 *     that KEEP data, where "why" is the whole justification.
 */
export type PersonDataRule = RuleIdentity &
  (
    | (({
        disposition: 'delete_row' | 'sever' | 'null_column';
        /** Narrows the rule to some rows (a personal list, not an editorial one). */
        rowPredicate?: string;
        basis?: string;
      } & PersonLocator) & { horizon?: never; horizonUnit?: never })
    | {
        disposition: 'retain';
        /** Required: keeping a person's data needs a reason. */
        basis: string;
        /** Required: forever must be typed, never left blank. */
        horizon: 'indefinite';
        personKey?: true;
        horizonUnit?: never;
        personScopeSql?: never;
        rowPredicate?: never;
        classifiedBy?: never;
      }
    | {
        disposition: 'retain';
        basis: string;
        /** Days from the account's purge. */
        horizon: number;
        /**
         * Required WITH a day-count: does the horizon expire the ROW or just
         * this VALUE? Assuming "row" is what nearly deleted the anonymized
         * shell.
         */
        horizonUnit: 'row' | 'column';
        personKey?: true;
        personScopeSql?: never;
        rowPredicate?: never;
        classifiedBy?: never;
      }
    | {
        disposition: 'anonymized_by_shell';
        basis?: string;
        personKey?: never;
        personScopeSql?: never;
        rowPredicate?: never;
        classifiedBy?: never;
        horizon?: never;
        horizonUnit?: never;
      }
    | {
        disposition: 'not_person';
        /** Required: declaring something NOT a person's needs a reason. */
        basis: string;
        personKey?: never;
        personScopeSql?: never;
        rowPredicate?: never;
        classifiedBy?: never;
        horizon?: never;
        horizonUnit?: never;
      }
  );

/**
 * THE DECLARATION. One row per person-shaped column in the schema.
 *
 * Adding a person-shaped column without adding a rule here FAILS THE BUILD
 * (person-data-census.spec.ts). That is the whole mechanism: the moment you
 * have the context to classify a column is the moment you add it.
 */
export const PERSON_DATA_RULES: readonly PersonDataRule[] = [
  // ─── The person's own account ────────────────────────────────────────────
  {
    table: 'users',
    column: 'user_id',
    disposition: 'retain',
    horizon: 'indefinite',
    // IDENTIFYING AND RETAINED ARE DIFFERENT AXES. Retention says the VALUE
    // survives; personKey says the column NAMES the person. Conflating them
    // left `users` with no discoverable key once retained columns were
    // filtered out, so the eraser could not scope its own two null_column
    // rules and aborted the entire sweep.
    personKey: true,
    basis:
      'The surrogate id anchors retained financial records and severed authorship. Carries nothing about the person by itself.',
  },
  {
    table: 'users',
    column: 'auth_provider_user_id',
    disposition: 'null_column',
    classifiedBy: 'table-key',
    basis:
      'Clerk identity — destroyed at the provider, so the local pointer must go too.',
  },
  {
    table: 'users',
    column: 'revenuecat_app_user_id',
    disposition: 'null_column',
    classifiedBy: 'table-key',
  },
  // THE DELETION STASH (D148, owner-approved 2026-08-07).
  //
  // It holds the person's real handle, display name and avatar URL — the most
  // identifying thing on the row — and it exists for exactly one purpose: to
  // make the 30-day window a real undo. Past the deadline there is nothing to
  // undo, so it must go, and it goes as a DECLARED, EXECUTED rule rather than
  // as another `erased_by_hand` entry coupled to a grep of the purge. (The
  // purge ALSO writes `deletedIdentity: DbNull` in its anonymize statement;
  // the two agree, and a null is idempotent, so neither can be the only one
  // that runs.) `users.user_id` is `personKey`, so `classifiedBy: 'table-key'`
  // scopes the UPDATE to this person's own row.
  {
    table: 'users',
    column: 'deleted_identity',
    disposition: 'null_column',
    classifiedBy: 'table-key',
    basis:
      'The identity stashed at deletion time so restore can put it back. Nothing to restore past the deadline, so it is destroyed with the rest of the person.',
  },
  // MONEY, DECLARED WHERE THE MECHANISM CAN SEE IT (owner ruling 2026-08-07).
  // This was kept by an INLINE COMMENT in the purge — "stripeCustomerId
  // retained: financial records must stay auditable" — which is a real ruling
  // written in the one place nothing enforces. A comment cannot carry a basis
  // the census checks or a horizon anybody is ever asked for, so the column
  // sat in quarantine as retained-forever-by-omission. Same clause, same
  // horizon as the rest of the money: 7 years.
  {
    table: 'users',
    column: 'stripe_customer_id',
    disposition: 'retain',
    horizon: 2555,
    // COLUMN, not row: deleting the `users` row would destroy the anonymized
    // shell that anchors the very financial records this retention exists for.
    horizonUnit: 'column',
    basis:
      'Financial-records obligation (GDPR 17(3)(b) legal obligation; CCPA 1798.105(d)(8)) — the pointer that makes billing_checkout_sessions and billing_subscriptions auditable against the provider. Owner ruling 2026-08-07: money records keep 7 years.',
  },

  // ─── Private to the person: their own saved things ───────────────────────
  // RULING: hard delete. These leak TODAY — the soft delete means no FK
  // cascade ever fires, so `onDelete: Cascade` reads as protection and is not.
  {
    table: 'user_lists',
    column: 'owner_user_id',
    disposition: 'delete_row',
    personKey: true,
  },
  {
    table: 'user_list_items',
    column: 'added_by_user_id',
    disposition: 'delete_row',
    personKey: true,
  },
  {
    table: 'user_list_collaborators',
    column: 'user_id',
    disposition: 'delete_row',
    personKey: true,
  },
  {
    table: 'user_stats',
    column: 'user_id',
    disposition: 'delete_row',
    personKey: true,
  },
  {
    table: 'user_notifications',
    column: 'user_id',
    disposition: 'delete_row',
    personKey: true,
  },
  // BOTH columns are person keys: a person appears here in two roles and both
  // edges are theirs, so both are deleted (and both are exported). Marking
  // only one would silently leave every follow they RECEIVED in place.
  {
    table: 'user_follows',
    column: 'follower_user_id',
    disposition: 'delete_row',
    personKey: true,
  },
  {
    table: 'user_follows',
    column: 'following_user_id',
    disposition: 'delete_row',
    personKey: true,
  },
  {
    table: 'user_onboarding_responses',
    column: 'user_id',
    disposition: 'delete_row',
    personKey: true,
  },
  {
    table: 'poll_comment_likes',
    column: 'user_id',
    disposition: 'delete_row',
    personKey: true,
  },
  {
    table: 'photo_events',
    column: 'user_id',
    disposition: 'delete_row',
    personKey: true,
  },
  {
    table: 'poll_creation_attempts',
    column: 'user_id',
    disposition: 'delete_row',
    personKey: true,
  },
  {
    table: 'collection_on_demand_request_users',
    column: 'user_id',
    disposition: 'delete_row',
    personKey: true,
  },
  {
    table: 'access_grants',
    column: 'user_id',
    disposition: 'delete_row',
    personKey: true,
  },
  {
    table: 'conversation_participants',
    column: 'user_id',
    disposition: 'delete_row',
    personKey: true,
  },

  // Raw typed search text tied to a person. LEAKS TODAY.
  {
    table: 'collection_on_demand_unsegmented_residue',
    column: 'user_id',
    disposition: 'delete_row',
    personKey: true,
  },

  // ─── Devices and fingerprints ────────────────────────────────────────────
  {
    table: 'notification_devices',
    column: 'user_id',
    disposition: 'delete_row',
    personKey: true,
  },
  {
    table: 'user_devices',
    column: 'user_id',
    disposition: 'delete_row',
    personKey: true,
  },

  // ─── Content the community built on: keep it, sever the author ───────────
  // RULING (owner, 2026-08-03): photos KEPT anonymized (pending the ToS
  // content licence); polls/comments/endorsements likewise. Reddit's pattern:
  // "posts stay, but people can't see who they came from."
  { table: 'photos', column: 'user_id', disposition: 'anonymized_by_shell' },
  {
    table: 'poll_comments',
    column: 'user_id',
    disposition: 'anonymized_by_shell',
  },
  {
    table: 'poll_endorsements',
    column: 'user_id',
    disposition: 'anonymized_by_shell',
  },
  {
    table: 'polls',
    column: 'created_by_user_id',
    disposition: 'sever',
    personKey: true,
  },
  {
    table: 'poll_topics',
    column: 'created_by_user_id',
    disposition: 'sever',
    personKey: true,
  },

  // Curated lists: the case that proved table-grained classification is the
  // wrong unit. Personal ones are the person's; global ones are editorial
  // content with a NULL owner.
  {
    table: 'curated_lists',
    column: 'owner_user_id',
    disposition: 'delete_row',
    personKey: true,
    rowPredicate: "scope = 'personal'",
  },

  // Messages: ONE row, two parties. Deleting it would destroy the recipient's
  // copy of their own conversation — which the ruling explicitly preserves.
  {
    table: 'messages',
    column: 'sender_user_id',
    disposition: 'anonymized_by_shell',
    basis:
      'The recipient keeps their conversation record; only authorship is dropped.',
  },

  // ─── Anonymous demand evidence: sever the person, keep the act ───────────
  {
    table: 'signal_actors',
    column: 'user_id',
    disposition: 'sever',
    personKey: true,
    basis:
      'The actor stays as anonymous demand evidence; the mapping to the person is what must die.',
  },
  {
    table: 'signal_actors',
    column: 'device_key',
    disposition: 'null_column',
    classifiedBy: 'table-key',
    basis:
      'Hard-contact fingerprint; retaining it would let the next sign-in on that device re-adopt the actor.',
  },
  {
    table: 'signals',
    column: 'actor_id',
    disposition: 'retain',
    horizon: 'indefinite',
    basis:
      'Points at an already-severed anonymous actor. Raw text/viewport retention is governed separately by the signals redesign.',
  },
  {
    table: 'signal_demand_daily',
    column: 'actor_id',
    disposition: 'retain',
    horizon: 'indefinite',
    basis: 'Same: anonymous once signal_actors.user_id is severed.',
  },
  // THE SCOPE IS DECLARED, because the column is NOT a user id. `actor_id`
  // here is the signals PSEUDONYM (user-taste-profile.builder writes it from
  // signal_demand_daily), so `WHERE actor_id = <userId>` matched nothing and
  // the inferred profile survived deletion — silently, because the table is
  // empty in dev and the erasure sweep looks for the USER id, which never
  // appears in this table at all. A verifier that searches for the person key
  // cannot see a table that does not hold the person key.
  {
    table: 'user_taste_profile',
    column: 'actor_id',
    disposition: 'delete_row',
    personScopeSql:
      'actor_id IN (SELECT actor_id FROM signal_actors WHERE user_id = $1::uuid)',
    basis:
      'Inferred preferences ABOUT the person — their own data, rebuildable from empty.',
  },

  // ─── Safety records: survive, de-identified ──────────────────────────────
  {
    table: 'user_blocks',
    column: 'blocker_user_id',
    disposition: 'delete_row',
    personKey: true,
    basis:
      'The departing person is the blocker; with them gone the block protects nobody.',
  },
  {
    table: 'user_blocks',
    column: 'blocked_user_id',
    disposition: 'retain',
    horizon: 'indefinite',
    basis:
      'A block placed BY someone else protects THEM; it must outlive the blocked account.',
  },
  {
    table: 'user_reports',
    column: 'reporter_user_id',
    disposition: 'anonymized_by_shell',
    basis: 'The report survives for moderation; the reporter is de-identified.',
  },
  {
    table: 'user_reports',
    column: 'reported_user_id',
    disposition: 'retain',
    horizon: 2555,
    horizonUnit: 'row',
    basis:
      'A safety record ABOUT the departing person — the exact case a name-based rule cannot distinguish from the column above.',
  },
  {
    table: 'poll_comment_reports',
    column: 'reporter_user_id',
    disposition: 'anonymized_by_shell',
  },
  {
    table: 'photo_reports',
    column: 'user_id',
    disposition: 'anonymized_by_shell',
  },

  // ─── Money: legally required to survive ──────────────────────────────────
  {
    table: 'billing_subscriptions',
    column: 'user_id',
    disposition: 'retain',
    basis:
      'Tax/AML retention (GDPR 17(3)(b) legal obligation; CCPA 1798.105(d)(8)).',
    horizon: 2555,
    horizonUnit: 'row',
  },
  {
    table: 'username_history',
    column: 'user_id',
    disposition: 'delete_row',
    personKey: true,
    basis:
      'The handle is burned into reserved_usernames first; this person<->handle mapping then dies.',
  },
  // ─── CAUGHT BY THE CENSUS, not by me (2026-08-03) ────────────────────────
  // Every one of these is a column my table-level reasoning glossed over.
  // Four of them are the raw-free-text columns that leak today. This is the
  // adversary net doing exactly the job the regex-as-decider could not.
  {
    table: 'collection_on_demand_unsegmented_residue',
    column: 'residue_text',
    disposition: 'delete_row',
    classifiedBy: 'table-key',
    basis:
      'Raw typed search text. Dies with the row (same rule as its user_id).',
  },
  {
    table: 'signals',
    column: 'subject_text',
    disposition: 'null_column',
    personScopeSql:
      'actor_id IN (SELECT actor_id FROM signal_actors WHERE user_id = $1::uuid)',
    basis:
      'Raw typed query. The act survives as anonymous demand; the words do not.',
  },
  {
    table: 'signal_demand_daily',
    column: 'subject_text',
    disposition: 'null_column',
    personScopeSql:
      'actor_id IN (SELECT actor_id FROM signal_actors WHERE user_id = $1::uuid)',
    basis: 'Same words, rolled up. Counts survive, text does not.',
  },
  {
    table: 'user_taste_profile',
    column: 'subject_text',
    disposition: 'delete_row',
    personScopeSql:
      'actor_id IN (SELECT actor_id FROM signal_actors WHERE user_id = $1::uuid)',
    basis: 'Dies with the profile row (same rule as its actor_id).',
  },
  {
    table: 'signal_actors',
    column: 'actor_id',
    disposition: 'retain',
    horizon: 'indefinite',
    basis:
      'The pseudonym itself. Anonymous once user_id is severed and device_key nulled; the ledger points at it.',
  },
  {
    table: 'notification_devices',
    column: 'expo_push_token',
    disposition: 'delete_row',
    classifiedBy: 'table-key',
    basis: 'Live push contact. Dies with the device row.',
  },
  {
    table: 'user_devices',
    column: 'device_key',
    disposition: 'delete_row',
    classifiedBy: 'table-key',
    basis: 'Device fingerprint. Dies with the device row.',
  },
  {
    table: 'conversations',
    column: 'pair_key',
    disposition: 'retain',
    horizon: 'indefinite',
    basis:
      'Concatenated participant ids keying a conversation the OTHER party keeps. Severing it would orphan their thread; the departing side is removed via conversation_participants.',
  },
  {
    table: 'user_list_collaborators',
    column: 'invited_by_user_id',
    disposition: 'sever',
    personKey: true,
    basis: "The invite survives on someone else's list; who sent it does not.",
  },
  {
    table: 'billing_checkout_sessions',
    column: 'user_id',
    disposition: 'retain',
    horizon: 2555,
    horizonUnit: 'row',
    basis: 'Financial record (GDPR 17(3)(b); CCPA 1798.105(d)(1)).',
  },
];

/**
 * ─────────────────────────────────────────────────────────────────────────
 * THE INVERSION (F9310, owner-approved 2026-08-07): GUILTY UNTIL CLASSIFIED.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The census used to ask "does any PERSON-SHAPED column lack a rule?" — where
 * person-shaped meant a reference-column regex plus a hardcoded literal list.
 * That net cannot catch the columns that matter most in six months: a `bio`,
 * a `phone_number`, a `home_address`, a `dob`, a `lat`/`lng` on a person's
 * action. None of them match `*_user_id`, none of them are in the literal
 * list, so none of them would ever be classified, and the declaration's own
 * promise — "a table added in six months can't quietly hold unclassified
 * PII" — was false for exactly the shape of column it was written about.
 *
 * So the question is inverted. EVERY (table, column) in schema.prisma must
 * now appear in a classification: either a `PERSON_DATA_RULES` rule above, or
 * an entry here. A column in neither FAILS THE CENSUS BUILD by name. There is
 * no residual category of "the net didn't happen to match it" — the net is
 * the schema itself, and it matches everything.
 *
 * Coverage is NOT a second disposition system. Every kind below either says
 * "no person is in here" or names the MECHANISM, declared elsewhere, that
 * already disposes of the column — and the census verifies that mechanism
 * actually exists rather than taking the claim's word for it.
 */
export type ColumnCoverage =
  /** Nothing about a person is in this column. Corpus, ops, derived, config. */
  | 'not_person'
  /**
   * Person data whose ROW is destroyed by a `delete_row` rule on this same
   * table. Census-verified: claiming this on a table with no `delete_row`
   * rule fails, so the claim cannot outlive the rule it leans on.
   */
  | 'dies_with_row'
  /**
   * Person data on a row the declaration deliberately KEEPS — under a
   * `retain`, `sever` or `anonymized_by_shell` rule on this same table, whose
   * basis this column inherits. Census-verified the same way.
   */
  | 'lives_with_row'
  /**
   * Erased by hand-written code OUTSIDE the rule walk (the account-anonymize
   * step). `handledBy` names the file; the census greps it for this column's
   * field name, so deleting the handler reds the census.
   */
  | 'erased_by_hand'
  /**
   * QUARANTINE. Real ambiguity that only the owner can rule on. Passes today
   * (the column is at least NAMED and visible) but the census prints the
   * whole list on every run so it cannot become the quiet default.
   */
  | 'awaiting_owner';

export interface ColumnCoverageEntry {
  table: string;
  /** Omit to cover EVERY column of the table. Column entries win over it. */
  column?: string;
  coverage: ColumnCoverage;
  basis: string;
  /** `erased_by_hand` only: path (relative to this file) of the handler. */
  handledBy?: string;
  /** `awaiting_owner` only: what actually gets written into the column. */
  writer?: string;
  /** `awaiting_owner` only: the disposition this lane would recommend. */
  recommendation?: string;
}

const LIVES_WITH_ROW_BASIS: Record<string, string> = {
  billing_checkout_sessions:
    'Financial record retained under the rule on user_id (GDPR 17(3)(b)).',
  billing_subscriptions:
    'Financial record retained under the rule on user_id (GDPR 17(3)(b)).',
  conversations:
    'The other party keeps this thread; the departing side leaves via conversation_participants.',
  messages:
    'The recipient’s copy of their own conversation; authorship is dropped by the sender_user_id rule.',
  photo_reports:
    'Moderation record; the reporter is de-identified by the rule on user_id.',
  photos: 'The photo survives anonymized (owner ruling 2026-08-03).',
  poll_comment_reports: 'Moderation record; the reporter is de-identified.',
  poll_comments: 'The comment survives anonymized (owner ruling 2026-08-03).',
  poll_endorsements: 'The endorsement survives anonymized.',
  poll_topics: 'The topic survives with its creator severed.',
  polls: 'The poll survives with its creator severed.',
  signal_actors:
    'The anonymous actor survives once user_id is severed and device_key nulled.',
  signal_demand_daily:
    'Anonymous demand rollup; the words are nulled by the subject_text rule.',
  signals:
    'Anonymous demand evidence; the words are nulled by the subject_text rule.',
  user_reports:
    'Safety record retained under the declared rules on its two person columns.',
  users:
    'The anonymized shell survives to anchor retained financial records and severed authorship (users.user_id retain).',
};

export const COLUMN_COVERAGE: readonly ColumnCoverageEntry[] = [
  // ═══ NON-PERSON TABLES ════════════════════════════════════════════════
  // The corpus, the machinery that builds it, and the ops ledgers. None of
  // these carries a person link; where one arguably brushes a person, the
  // column-level entries further down override the table.
  ...(
    [
      ['api_usage_ledger', 'Cost meter: service, tokens, campaign. No person.'],
      [
        'billing_event_logs',
        'Provider webhook ledger keyed by external event id.',
      ],
      ['collection_communities', 'Which subreddits/cities we collect from.'],
      ['collection_extraction_coverage_claims', 'Extraction bookkeeping.'],
      ['collection_extraction_input_documents', 'Extraction bookkeeping.'],
      [
        'collection_extraction_inputs',
        'Extraction payloads over public corpus text.',
      ],
      ['collection_extraction_runs', 'Extraction run metadata.'],
      [
        'collection_keyword_attempt_history',
        'Harvest scheduling per search term.',
      ],
      [
        'collection_on_demand_requests',
        'AGGREGATED demand per term; the per-person edge lives in collection_on_demand_request_users, which is classified.',
      ],
      ['collection_processed_sources', 'Idempotency bookkeeping.'],
      [
        'collection_relevance_verdicts',
        'Keep/drop judgements over public posts.',
      ],
      ['collection_runs', 'Collection run metadata.'],
      [
        'collection_source_documents',
        'PUBLIC third-party corpus (Reddit posts). Not our users’ data; governed by the collection retention policy, not by person erasure.',
      ],
      ['core_crave_score_runs', 'Scoring run metadata.'],
      ['core_entities', 'The dish/restaurant/attribute vocabulary.'],
      ['core_public_entity_scores', 'Aggregate public scores.'],
      ['core_restaurant_attribute_evidence', 'Corpus-derived evidence.'],
      ['core_restaurant_entity_events', 'Corpus-derived mentions.'],
      ['core_restaurant_entity_signals', 'Corpus-derived rollups.'],
      ['core_restaurant_events', 'Corpus-derived mentions.'],
      ['core_restaurant_item_mentions', 'Corpus-derived mentions.'],
      ['core_restaurant_items', 'The dish graph.'],
      [
        'core_restaurant_locations',
        'A restaurant’s address and phone are the BUSINESS’s, not a person’s — the original not_person example.',
      ],
      ['crave_score_calibration_epochs', 'Scoring constants.'],
      [
        'curated_list_items',
        'Rows of editorial lists; personal lists die whole via curated_lists.',
      ],
      [
        'demand_scoring_candidates',
        'Demand-scoring trace over anonymous actors.',
      ],
      ['demand_scoring_runs', 'Scoring run metadata.'],
      ['derived_entity_sibling_edges', 'Derived from the entity graph.'],
      ['derived_entity_word_deletes', 'Derived from the entity graph.'],
      ['derived_food_category_edges', 'Derived from the entity graph.'],
      ['derived_location_open_intervals', 'Derived restaurant hours.'],
      ['engines', 'Geographic search engines (place-id sets).'],
      ['entity_alias', 'Vocabulary.'],
      ['entity_labels', 'Vocabulary.'],
      ['entity_redirects', 'Vocabulary.'],
      ['entity_satisfies', 'Vocabulary.'],
      [
        'estimator_state',
        'Decayed moments keyed by an estimator subject (a term or lane), never a person.',
      ],
      ['gemini_context_caches', 'LLM cache handles over corpus prompts.'],
      ['llm_batch_jobs', 'Batch job bookkeeping.'],
      ['llm_batch_job_items', 'Batch item payloads (corpus extraction).'],
      ['llm_decision_records', 'LLM decision audit trail.'],
      ['llm_prompts', 'Versioned prompt text we wrote.'],
      ['metro_location_probes', 'Which restaurants we probed for a metro.'],
      ['notifications', 'The push DELIVERY ledger: type, status, retry state.'],
      ['ops_alerts', 'Operator alerts about the system.'],
      ['place_geometries', 'Geographic boundaries.'],
      ['place_geometry_promotions', 'Boundary fetch bookkeeping.'],
      ['places', 'The gazetteer.'],
      [
        'poll_leaderboard_entries',
        'Aggregate endorsement counts; no person column.',
      ],
      ['poll_place_supply', 'Poll supply per place.'],
      ['poll_weekly_ticks', 'Poll publishing cadence per place.'],
      ['pool_window_consumption', 'Rate-limit windows.'],
      ['rescore_state', 'A dirty flag.'],
      ['signal_demand_rebuild_state', 'A watermark.'],
      ['source_collection_lanes', 'Collection scheduling and cost baselines.'],
      ['sources', 'Which platforms/handles we collect from.'],
      ['spend_campaigns', 'Budget envelopes.'],
      ['spend_unit_costs', 'Unit cost table.'],
      [
        'user_list_share_events',
        'Share-link telemetry keyed by list + slug; carries no user id (the actor is deliberately not recorded).',
      ],
      [
        'user_reserved_usernames',
        'Burned handles. Deliberately outlives the person — see the quarantine entry on its username column.',
      ],
      ['vendor_lookup_misses', 'Vendor lookup bookkeeping.'],
    ] as const
  ).map(
    ([table, basis]): ColumnCoverageEntry => ({
      table,
      coverage: 'not_person',
      basis,
    }),
  ),

  // ═══ MIXED TABLES: rows the person's own rule DESTROYS ═════════════════
  // Every remaining column of a table whose person key is `delete_row`. The
  // census refuses this claim on a table with no delete_row rule, so it can
  // never drift into "we assumed something deletes it".
  ...(
    [
      ['access_grants', 'Entitlement grant belonging to the departing person.'],
      ['collection_on_demand_request_users', 'The person’s own ask edge.'],
      [
        'collection_on_demand_unsegmented_residue',
        'Raw typed search text and its context; the whole row is the person’s.',
      ],
      ['conversation_participants', 'The person’s side of a conversation.'],
      [
        'curated_lists',
        'Personal lists die whole (scope=‘personal’); global rows are editorial with a NULL owner and hold no person.',
      ],
      ['notification_devices', 'The person’s device registration.'],
      ['photo_events', 'The person’s view/like events.'],
      ['poll_comment_likes', 'The person’s like.'],
      ['poll_creation_attempts', 'The person’s rate-limit attempt.'],
      [
        'user_blocks',
        'Rows the person authored die; rows ABOUT them are held by the declared retain rule on blocked_user_id.',
      ],
      ['user_devices', 'The person’s device fingerprint row.'],
      ['user_follows', 'The person’s follow edges, both directions.'],
      ['user_list_collaborators', 'The person’s collaboration row.'],
      [
        'user_list_items',
        'Items on the person’s own list — including the free-text note.',
      ],
      [
        'user_lists',
        'The person’s private saved lists, names and descriptions included.',
      ],
      [
        'user_notifications',
        'The person’s notification feed, payload included.',
      ],
      ['user_onboarding_responses', 'The person’s onboarding answers.'],
      ['user_stats', 'Counters about the person.'],
      ['user_taste_profile', 'Inferred preferences about the person.'],
      ['username_history', 'The person→handle mapping.'],
    ] as const
  ).map(
    ([table, basis]): ColumnCoverageEntry => ({
      table,
      coverage: 'dies_with_row',
      basis,
    }),
  ),

  // ═══ MIXED TABLES: rows the declaration deliberately KEEPS ═════
  // Anonymity here comes from the rule on the person column (sever / retain /
  // anonymized_by_shell); these columns inherit that row's basis.
  //
  // COLUMN-BY-COLUMN, DELIBERATELY — the one place table-level grouping is
  // BANNED (and the census enforces it). A table-level claim is an INHERITED
  // DEFAULT for columns that do not exist yet, so it is only safe when the
  // default is safe: on a not_person table nothing about a person can appear
  // without someone noticing, and on a dies_with_row table a new column is
  // destroyed with its row either way. But "this row is KEPT" as a default
  // means a `bio` added to `users` in six months would be born classified,
  // retained, and never erased — which is the exact silent failure this whole
  // inversion exists to make impossible. So retaining coverage is spelled out,
  // and a new column on any of these tables reds the census by name.
  ...Object.entries({
    billing_checkout_sessions: [
      'checkout_session_id',
      'provider',
      'external_session_id',
      'status',
      'url',
      'cancel_url',
      'success_url',
      'expires_at',
      'completed_at',
      'cancelled_at',
      'metadata',
      'created_at',
      'updated_at',
    ],
    billing_subscriptions: [
      'subscription_id',
      'status',
      'current_period_start',
      'current_period_end',
      'cancel_at_period_end',
      'cancelled_at',
      'created_at',
      'entitlement_code',
      'external_customer_id',
      'external_subscription_id',
      'last_event_id',
      'last_event_received_at',
      'metadata',
      'plan_name',
      'platform',
      'price_id',
      'product_id',
      'provider',
      'updated_at',
    ],
    conversations: [
      'conversation_id',
      'last_message_at',
      'last_message_id',
      'created_at',
    ],
    messages: [
      'message_id',
      'conversation_id',
      'kind',
      'shared_entity_kind',
      'shared_entity_id',
      'shared_entity_slug',
      'client_dedupe_id',
      'created_at',
    ],
    photo_reports: ['report_id', 'photo_id', 'created_at'],
    photos: [
      'photo_id',
      'restaurant_id',
      'connection_id',
      'public_id',
      'media_type',
      'status',
      'visibility',
      'taken_at',
      'ticketed_at',
      'focus_score',
      'width',
      'height',
      'bytes',
      'report_count',
      'moderated_at',
      'created_at',
      'updated_at',
    ],
    poll_comment_reports: ['report_id', 'comment_id', 'created_at'],
    poll_comments: [
      'comment_id',
      'poll_id',
      'parent_comment_id',
      'score',
      'public_id',
      'moderation_status',
      'extraction_status',
      'entity_spans',
      'logged_at',
      'edited_at',
      'deleted_at',
    ],
    poll_endorsements: ['poll_id', 'subject_type', 'subject_id', 'created_at'],
    poll_topics: [
      'topic_id',
      'region',
      'country',
      'place_id',
      'category_entity_ids',
      'seed_entity_ids',
      'metadata',
      'created_at',
      'updated_at',
      'target_dish_id',
      'target_restaurant_id',
      'target_food_attribute_id',
      'target_restaurant_attribute_id',
      'topic_type',
      'title_source',
      'title_locale',
    ],
    polls: [
      'poll_id',
      'topic_id',
      'state',
      'origin',
      'mode',
      'axis',
      'place_id',
      'region',
      'scheduled_for',
      'launched_at',
      'closed_at',
      'graduated_at',
      'allow_user_additions',
      'audience_filters',
      'created_at',
      'updated_at',
    ],
    signal_actors: ['created_at', 'excluded_at'],
    signal_demand_daily: [
      'row_id',
      'day',
      'place_id',
      'kind',
      'subject_type',
      'subject_id',
      'signal_count',
      'last_occurred_at',
    ],
    signals: [
      'signal_id',
      'kind',
      'subject_type',
      'subject_id',
      'place_id',
      'occurred_at',
      'recorded_at',
      'detected_locale',
    ],
    user_reports: ['report_id', 'created_at'],
    users: [
      'username_status',
      'username_updated_at',
      'onboarding_status',
      'onboarding_completed_at',
      'onboarding_version',
      'onboarding_question_set_version',
      'created_at',
      'auth_provider',
      'deleted_at',
      'purge_due_at',
      'updated_at',
    ],
  } as Record<string, readonly string[]>).flatMap(
    ([table, cols]): ColumnCoverageEntry[] =>
      cols.map((column) => ({
        table,
        column,
        coverage: 'lives_with_row' as const,
        basis: LIVES_WITH_ROW_BASIS[table],
      })),
  ),

  // ═══ ERASED BY HAND, OUTSIDE THE RULE WALK ═════════════════════════════
  // The identity columns on `users` are NOT in PERSON_DATA_RULES, and that is
  // not an oversight the inversion should paper over: `users.email` is NOT
  // NULL, so a `null_column` rule for it would be a declaration that cannot
  // execute — the exact defect the `sever`-nullability check already catches.
  // The anonymize step HMAC-hashes it instead (evasion signal without an
  // identity) and nulls the rest. Declaring the handler makes that visible,
  // and the census greps the handler for each field name so the coupling is
  // mechanical rather than a comment.
  ...(
    [
      [
        'email',
        'Replaced with a salted one-way HMAC — NOT NULL, so it is scrambled rather than nulled.',
      ],
      [
        'username',
        'Nulled by the anonymize step; assertShellIsAnonymous proves it.',
      ],
      [
        'display_name',
        'Nulled by the anonymize step; assertShellIsAnonymous proves it.',
      ],
      [
        'avatar_url',
        'Nulled by the anonymize step (and destroyed at Cloudinary).',
      ],
      ['onboarding_responses', 'Set to DbNull by the anonymize step.'],
    ] as const
  ).map(
    ([column, basis]): ColumnCoverageEntry => ({
      table: 'users',
      column,
      coverage: 'erased_by_hand',
      basis,
      handledBy: '../account-deletion.service.ts',
    }),
  ),

  // ═══ OWNER RULING 2026-08-07 (D147) — THE QUARANTINE, DISPOSITIONED ═════
  //
  // 39 of the 40 quarantined columns were ruled on in one sentence:
  //
  //   "Contributions stay under a [deleted] byline; telemetry stays attached
  //    only to the anonymous shell, kept for metrics; money records keep 7
  //    years; the burned username becomes a hash."
  //
  // Each group below records WHICH clause disposed of it, and — because a
  // basis that only cites an authority is not a mechanism — names the code
  // that makes the ruling true. Where the ruling was CONDITIONAL (the
  // telemetry clause is legitimate only if the person link is really severed),
  // the condition is verified in the basis by naming the rule that severs it.

  // ─── (1) CONTRIBUTIONS: kept, under a [deleted] byline ───────────────────
  // The Reddit model, one level down from the 2026-08-03 row ruling: that
  // ruling kept the ROW; this one confirms it covers the WORDS. Legitimate
  // only because every author link on these rows is already severed or
  // anonymized by a declared rule — each entry names its own.
  ...(
    [
      [
        'messages',
        'body',
        'messages.sender_user_id → anonymized_by_shell',
        'DM prose in the recipient’s own thread; a half-thread is unreadable.',
      ],
      [
        'poll_comments',
        'body',
        'poll_comments.user_id → anonymized_by_shell',
        'Community comment prose the thread is built on.',
      ],
      [
        'polls',
        'question',
        'polls.created_by_user_id → sever',
        'The poll survives by ruling and is meaningless without its question.',
      ],
      [
        'poll_topics',
        'title',
        'poll_topics.created_by_user_id → sever',
        'The topic’s own name.',
      ],
      [
        'poll_topics',
        'description',
        'poll_topics.created_by_user_id → sever',
        'The topic’s own prose.',
      ],
      [
        'user_reports',
        'reason',
        'user_reports.reporter_user_id → anonymized_by_shell (and reported_user_id → retain, horizon 2555)',
        'Moderation evidence with its text stripped is not evidence.',
      ],
      [
        'photo_reports',
        'reason',
        'photo_reports.user_id → anonymized_by_shell',
        'Moderation evidence, same shape.',
      ],
      [
        'poll_comment_reports',
        'reason',
        'poll_comment_reports.reporter_user_id → anonymized_by_shell',
        'Moderation evidence, same shape.',
      ],
      [
        'photos',
        'caption',
        'photos.user_id → anonymized_by_shell',
        'The caption is part of the contribution the community sees.',
      ],
      [
        'photos',
        'pending_dish_name',
        'photos.user_id → anonymized_by_shell',
        'The contributor’s dish claim, still the photo’s only label until it resolves.',
      ],
    ] as const
  ).map(
    ([table, column, severedBy, what]): ColumnCoverageEntry => ({
      table,
      column,
      coverage: 'lives_with_row',
      basis:
        `User contribution survives anonymized — owner ruling 2026-08-07, Reddit-model ("contributions stay under a [deleted] byline"). ${what} ` +
        `The byline is severed by a declared rule, not by hope: ${severedBy}.`,
    }),
  ),

  // ─── (2) TELEMETRY ON THE ANONYMOUS SHELL: kept, for metrics ─────────────
  // CONDITIONAL RULING, AND THE CONDITION IS VERIFIED. "Kept for metrics" is
  // only legitimate while the row carrying it names nobody. For `users` that
  // is the anonymize step (assertShellIsAnonymous proves it). For `signals`
  // the link is two hops — signal.actor_id → signal_actors.actor_id — and
  // BOTH are declared: `signal_actors.user_id` is `sever` (set NULL) and
  // `signal_actors.device_key` is `null_column`, so after erasure the actor
  // row is a bare pseudonym with no person column and no device fingerprint
  // left to re-adopt it on the next sign-in. Order is load-bearing and the
  // eraser encodes it (null_column before sever), so the viewport's actor is
  // reachable while the words are nulled and unreachable afterwards.
  ...(
    ['geo_min_lat', 'geo_min_lng', 'geo_max_lat', 'geo_max_lng'] as const
  ).map(
    (column): ColumnCoverageEntry => ({
      table: 'signals',
      column,
      coverage: 'lives_with_row',
      basis:
        'Anonymous-shell metrics — owner ruling 2026-08-07; legitimate only because erasure severs the person link (per-column scoping D146). ' +
        'VERIFIED MECHANISM: the viewport hangs off signals.actor_id, and the only path from an actor to a person is signal_actors.user_id, which is declared `sever` (nulled), with signal_actors.device_key declared `null_column` so the fingerprint cannot re-attach it. The bbox survives as demand geography attached to a pseudonym.',
    }),
  ),
  {
    table: 'users',
    column: 'last_sign_in_at',
    coverage: 'lives_with_row',
    basis:
      'Anonymous-shell metrics (retention/churn) — owner ruling 2026-08-07; legitimate only because erasure severs the person link (per-column scoping D146). VERIFIED MECHANISM: the anonymize step in account-deletion.service.ts HMACs the email and nulls username/display_name/avatar_url/auth_provider_user_id, and PersonDataEraserService.assertShellIsAnonymous throws if any of them survives — so this timestamp is attached to a shell that names nobody.',
  },
  ...(
    [
      ['onboarding_selected_city', 'the city chosen at onboarding'],
      ['onboarding_preview_city', 'the city previewed at onboarding'],
      ['onboarding_city_place_id', 'the resolved place id for that city'],
      ['locale', 'the device locale'],
    ] as const
  ).map(
    ([column, what]): ColumnCoverageEntry => ({
      table: 'users',
      column,
      coverage: 'lives_with_row',
      basis:
        `Anonymous-shell metrics (${what} — city mix and localisation) — owner ruling 2026-08-07; legitimate only because erasure severs the person link (per-column scoping D146). ` +
        'VERIFIED MECHANISM: same as users.last_sign_in_at — the anonymize step strips every identity column on this row and assertShellIsAnonymous fails the purge if it did not.',
    }),
  ),

  // ─── (3) MONEY: users.stripe_customer_id ────────────────────────────────
  // NO ENTRY HERE, deliberately. It graduated OUT of coverage and into
  // PERSON_DATA_RULES as a real `retain` rule with horizon 2555 (see above).
  // The inline comment in account-deletion.service.ts was the ruling all
  // along; it is now written where the mechanism can see it, so the census
  // enforces its basis and its horizon like every other retained column.

  // ─── (5) OPEN-SHAPE JSON AND UNLINKED TELEMETRY ─────────────────────────
  {
    table: 'signals',
    column: 'meta',
    coverage: 'not_person',
    basis:
      'Shape-enforced at the writer. SignalsService.record() is the ONLY writer of this column, and compactMeta now drops any key outside SIGNAL_META_KEYS (an explicit allow-list of ids, counts, enums and keyed HMACs) — so a future caller cannot smuggle free text or a name in. Owner ruling 2026-08-07 (Q7): keep the data, enforce the shape.',
  },
  {
    table: 'polls',
    column: 'metadata',
    coverage: 'lives_with_row',
    basis:
      'Generator provenance on a poll the declaration keeps (polls.created_by_user_id → sever). Owner ruling 2026-08-07 (Q7): keep as-is. HONEST GAP: unlike signals.meta there is no single writer to enforce a shape at — polls.service.ts writes it from several paths — so this is classified by the row’s fate, not by a proven shape. TODO: give it a typed shape when the polls write paths are next consolidated.',
  },
  {
    table: 'llm_decision_records',
    column: 'input',
    coverage: 'not_person',
    basis:
      'LLM audit trail over corpus text. Owner ruling 2026-08-07 (Q7): keep as-is. HONEST GAP: there is no single writer to assert at — callers across the app construct this — so "corpus-derived" is a convention today, not a mechanism. TODO: route decision records through one recorder and assert the input shape there.',
  },
  {
    table: 'llm_batch_job_items',
    column: 'request',
    coverage: 'not_person',
    basis:
      'Batch extraction payloads over corpus text. Owner ruling 2026-08-07 (Q7): keep as-is. HONEST GAP: same as llm_decision_records.input — several submitters, no single enforcement point. TODO: assert the payload shape at a single batch submitter.',
  },
  {
    table: 'collection_source_documents',
    column: 'raw_payload',
    coverage: 'not_person',
    basis:
      'THIRD-PARTY PUBLIC CORPUS, not our users’ data: the verbatim Reddit post as published, author handle included. Owner ruling 2026-08-07 (Q7). Person erasure cannot reach it because no person of ours is in it; it is governed by the collection retention policy. HONEST GAP: that policy has no TTL in code today — nothing prunes this table — so "governed" means "by the corpus policy", not "by a mechanism you can point at".',
  },
  {
    table: 'collection_on_demand_requests',
    column: 'term',
    coverage: 'not_person',
    basis:
      'Aggregated demand across askers; the per-person edge is a DIFFERENT table (collection_on_demand_request_users), which is declared `delete_row` on erasure AND pruned at 90 days by OnDemandRequestUsersCleanupService, which then recomputes distinct_user_count. So the term outlives every link to who asked it. Owner ruling 2026-08-07 (Q7). HONEST GAP: there is no k-anonymity FLOOR — a term asked once still exists as a term; what does not exist is any way to attribute it.',
  },
  {
    table: 'demand_scoring_candidates',
    column: 'normalized_text',
    coverage: 'not_person',
    basis:
      'Normalized demand term on a scoring-trace row over anonymous actors (the table is not_person for the same reason). Same basis and same honest gap as collection_on_demand_requests.term: no person link survives, and no k-anonymity floor is claimed. Owner ruling 2026-08-07 (Q7).',
  },
  ...(
    [
      'region_id',
      'kind',
      'center_lat',
      'center_lng',
      'radius_meters',
      'min_lat',
      'min_lng',
      'max_lat',
      'max_lng',
      'observed_at',
      'cell_key',
    ] as const
  ).map(
    (column): ColumnCoverageEntry => ({
      table: 'probed_regions',
      column,
      coverage: 'not_person',
      basis:
        'Unlinked probe telemetry with a REAL, VERIFIED TTL. The row records a map region we asked a vendor about — quantized to cell_key, with no person column anywhere on the table. Owner ruling 2026-08-07 (Q7). The TTL is not implied: NEGATIVE_OBSERVATION_TTL_MS = 30 days in places-reconciler.service.ts, enforced twice — pruneExpiredRegions() DELETEs rows past the cutoff, and the read filters on the same cutoff regardless of whether the prune has run.',
    }),
  ),

  // ─── STILL OPEN: one column the ruling did not reach ─────────────────────
  {
    table: 'notifications',
    column: 'device_id',
    coverage: 'awaiting_owner',
    basis:
      'A pointer at a person’s device row on a delivery ledger nothing in the declaration touches. The FK is optional, so a device delete SetNulls it — by Prisma default, not by declaration.',
    writer: 'the notification dispatcher.',
    recommendation:
      'NOT COVERED by the 2026-08-07 ruling (it is neither a contribution, telemetry-on-the-shell, money, nor a handle) and it is not a pure declaration change either: notification_devices.user_id is `delete_row`, which the eraser runs BEFORE every `sever`, so a sever rule added here would find its subquery already empty and no-op while reading as protection. Declaring it truthfully needs the eraser’s ordering to gain a "sever-before-the-owning-row-dies" phase. Held open deliberately rather than papered over.',
  },
];
