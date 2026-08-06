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

export interface PersonDataRule {
  table: string;
  column: string;
  disposition: PersonDataDisposition;
  /** Optional SQL predicate narrowing the rule to some rows of the table. */
  rowPredicate?: string;
  /**
   * TRUE when this column IDENTIFIES the person in this table — the key a
   * row-level action scopes by.
   *
   * `delete_row` is a ROW verb declared per COLUMN, so a table with several
   * person columns produced several DELETEs, each scoping by its own column.
   * Only one of them was ever a person key; the rest asked things like
   * "delete rows whose residue_text equals this uuid" and matched nothing.
   * Harmless only by luck — the one correct statement removed the row first.
   * Marking the key makes the scope a declaration instead of an accident.
   */
  personKey?: boolean;
  /**
   * How to reach the person from THIS table when the person key is not a
   * direct column — e.g. `signals` reaches a person only through
   * `signal_actors`. `$1` is bound to the user id. Declared, because a join
   * this important should be written down once, not re-derived per caller.
   */
  personScopeSql?: string;
  /** Why. Required for `retain` and `not_person` — the two that keep data. */
  basis?: string;
  /**
   * HOW LONG, for `retain`. Not optional, and `'indefinite'` is a WORD you
   * have to type.
   *
   * This was `horizonDays?: number`, and the optionality was the bug. Nine
   * rules retained data; two stated a horizon; the other seven were kept
   * FOREVER because nobody was ever asked. "Forever" was the silent default
   * of an omitted field rather than a decision anybody made — and that is the
   * same failure as a promise with no mechanism, one level earlier: the
   * promise was never even written down.
   *
   * An optional field is an invitation to declare something incomplete that
   * nothing notices. Making the choice mandatory means a new retained column
   * cannot be added without someone answering "until when?", and
   * `'indefinite'` records that the answer was considered rather than skipped.
   */
  horizon?: number | 'indefinite';
}

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
    basis:
      'Clerk identity — destroyed at the provider, so the local pointer must go too.',
  },
  {
    table: 'users',
    column: 'revenuecat_app_user_id',
    disposition: 'null_column',
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
    basis: 'Live push contact. Dies with the device row.',
  },
  {
    table: 'user_devices',
    column: 'device_key',
    disposition: 'delete_row',
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
    basis: 'Financial record (GDPR 17(3)(b); CCPA 1798.105(d)(1)).',
  },
];
