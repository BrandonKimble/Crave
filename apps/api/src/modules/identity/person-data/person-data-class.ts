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

  // ═══ QUARANTINE — OWNER RULING NEEDED ══════════════════════════════════
  // Each of these is person-adjacent in a way no lane below the owner should
  // decide. They pass today (they are named, and visible on every census run)
  // and the census prints the whole list so the quarantine cannot go quiet.
  {
    table: 'messages',
    column: 'body',
    coverage: 'awaiting_owner',
    basis:
      'DM text authored by the departing person, surviving in the recipient’s thread.',
    writer: 'messaging.service.ts — verbatim user-typed message text.',
    recommendation:
      'Owner call: keep (the recipient’s conversation record is theirs, and a half-thread is unreadable) vs null_column. Recommend RETAIN with a stated basis + horizon, matching the ruling that already preserved this row.',
  },
  {
    table: 'photos',
    column: 'caption',
    coverage: 'awaiting_owner',
    basis: 'Free text the person typed onto a photo that survives anonymized.',
    writer: 'photos.service.ts — user-supplied caption.',
    recommendation:
      'Recommend null_column: the photo is kept for the community, the person’s prose is not community content and can name them.',
  },
  {
    table: 'photos',
    column: 'pending_dish_name',
    coverage: 'awaiting_owner',
    basis: 'Free text typed by the person while a dish is unmatched.',
    writer: 'photos.service.ts — user-typed dish name awaiting resolution.',
    recommendation:
      'Recommend null_column (same reasoning as caption); it is discardable once the photo is anonymized.',
  },
  {
    table: 'poll_comments',
    column: 'body',
    coverage: 'awaiting_owner',
    basis:
      'Comment prose kept anonymized — anonymous authorship does not make the WORDS anonymous.',
    writer: 'polls comment service — verbatim user-typed comment.',
    recommendation:
      'Recommend RETAIN with a stated basis (this is the community content the 2026-08-03 ruling explicitly kept), but the ruling was about the ROW; the owner should confirm it covers the text.',
  },
  {
    table: 'polls',
    column: 'question',
    coverage: 'awaiting_owner',
    basis: 'Poll text, user-authored when the poll originated from a person.',
    writer:
      'polls creation path (and the system generator for scheduled polls).',
    recommendation:
      'Recommend RETAIN: the poll survives by ruling and is meaningless without its question. Confirm.',
  },
  {
    table: 'polls',
    column: 'metadata',
    coverage: 'awaiting_owner',
    basis: 'Open-shape JSON on a row that survives the person.',
    writer:
      'polls services — no schema; today generator provenance, but nothing stops a future writer putting a name in it.',
    recommendation:
      'Recommend a typed shape (or an allow-list assertion) so an unschema’d JSON column stops being an unclassifiable hole.',
  },
  {
    table: 'poll_topics',
    column: 'title',
    coverage: 'awaiting_owner',
    basis: 'Topic title, user-authored when created_by_user_id is set.',
    writer:
      'poll topic creation; title_source records whether it was generated.',
    recommendation: 'Recommend RETAIN alongside polls.question.',
  },
  {
    table: 'poll_topics',
    column: 'description',
    coverage: 'awaiting_owner',
    basis: 'Topic prose, user-authored when created_by_user_id is set.',
    writer: 'poll topic creation.',
    recommendation: 'Recommend RETAIN alongside polls.question.',
  },
  {
    table: 'user_reports',
    column: 'reason',
    coverage: 'awaiting_owner',
    basis:
      'Free text on a safety record — written BY the reporter, ABOUT the reported person. Both parties can be the departing one.',
    writer: 'user report submission — user-typed reason.',
    recommendation:
      'Recommend RETAIN with the 2555-day horizon already declared for reported_user_id; moderation evidence with its text stripped is not evidence.',
  },
  {
    table: 'photo_reports',
    column: 'reason',
    coverage: 'awaiting_owner',
    basis: 'Free text on a moderation record, same two-party shape as above.',
    writer: 'photo report submission — user-typed reason.',
    recommendation:
      'Recommend RETAIN with a stated horizon, as for user_reports.reason.',
  },
  {
    table: 'poll_comment_reports',
    column: 'reason',
    coverage: 'awaiting_owner',
    basis: 'Free text on a moderation record, same two-party shape as above.',
    writer: 'poll comment report submission — user-typed reason.',
    recommendation:
      'Recommend RETAIN with a stated horizon, as for user_reports.reason.',
  },
  {
    table: 'signals',
    column: 'meta',
    coverage: 'awaiting_owner',
    basis:
      'Open-shape JSON on a retained anonymous signal — the one column on this table nothing constrains.',
    writer:
      'signals.controller.ts / signals.service.ts compactMeta — today dwellMs and contextRestaurantId only.',
    recommendation:
      'Recommend a typed shape enforced at the writer, then not_person. Today’s contents are harmless; the ABSENCE of a shape is the finding.',
  },
  ...(
    ['geo_min_lat', 'geo_min_lng', 'geo_max_lat', 'geo_max_lng'] as const
  ).map(
    (column): ColumnCoverageEntry => ({
      table: 'signals',
      column,
      coverage: 'awaiting_owner',
      basis:
        'The bounding box the person was LOOKING AT when they searched — retained indefinitely on an actor that erasure only pseudonymizes. A repeated home-area viewport is re-identifying in a way a severed user_id does not fix.',
      writer: 'signals.service.ts — the client map viewport at signal time.',
      recommendation:
        'Recommend null_column on erasure (scoped like subject_text, via signal_actors), or coarsen the box at write time.',
    }),
  ),
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
      coverage: 'awaiting_owner',
      basis:
        'Every column is a map region a PERSON caused us to probe (center/radius or a bbox), quantized to cell_key. There is no person column, so erasure can never reach it — the anonymity rests entirely on the absence of a link plus a TTL.',
      writer:
        'the map/reconciler probe path — viewport boxes and discs from live app use.',
      recommendation:
        'Recommend not_person IF the TTL is real and stated; the owner should confirm the retention window rather than let it be implied.',
    }),
  ),
  {
    table: 'users',
    column: 'last_sign_in_at',
    coverage: 'awaiting_owner',
    basis:
      'Behavioural fact about the person surviving on the anonymized shell.',
    writer: 'the auth path, on every sign-in.',
    recommendation:
      'Recommend null_column at anonymize: the shell exists to anchor records, not to remember when they last used the app.',
  },
  ...(
    [
      ['onboarding_selected_city', 'the city the person chose at onboarding'],
      [
        'onboarding_preview_city',
        'the city the person previewed at onboarding',
      ],
      ['onboarding_city_place_id', 'the resolved place id for that city'],
      ['locale', 'the person’s device locale'],
    ] as const
  ).map(
    ([column, what]): ColumnCoverageEntry => ({
      table: 'users',
      column,
      coverage: 'awaiting_owner',
      basis: `Location/locale residue (${what}) surviving on the anonymized shell. Onboarding ANSWERS are nulled; these were left.`,
      writer: 'the onboarding flow / auth path.',
      recommendation:
        'Recommend null_column at anonymize — they are the person’s, and nothing retained depends on them.',
    }),
  ),
  {
    table: 'users',
    column: 'stripe_customer_id',
    coverage: 'awaiting_owner',
    basis:
      'A live pointer into Stripe, where the person’s name and card remain. Deliberately kept (an inline comment says “financial records must stay auditable”) but never declared, so it has no basis and no horizon.',
    writer: 'the billing path, at first checkout.',
    recommendation:
      'Recommend a `retain` rule with horizon 2555, matching billing_subscriptions.user_id — the comment IS the ruling, it just was not written where the mechanism can see it.',
  },
  {
    table: 'user_reserved_usernames',
    column: 'username',
    coverage: 'awaiting_owner',
    basis:
      'The departed person’s handle, deliberately burned so nobody can re-claim it. A handle can be an identity (real names, @firstlast).',
    writer:
      'the deletion path, which burns the handle here before username_history dies.',
    recommendation:
      'Recommend hashing the burned handle (the reservation only needs equality, exactly like the email HMAC) — or a `retain` rule with a stated basis if the plaintext is wanted for support.',
  },
  {
    table: 'notifications',
    column: 'device_id',
    coverage: 'awaiting_owner',
    basis:
      'A pointer at a person’s device row on a delivery ledger nothing in the declaration touches. The FK is optional, so a device delete SetNulls it — by Prisma default, not by declaration.',
    writer: 'the notification dispatcher.',
    recommendation:
      'Recommend declaring it (sever, scoped through notification_devices) so the behaviour is stated rather than inherited from a default.',
  },
  {
    table: 'collection_source_documents',
    column: 'raw_payload',
    coverage: 'awaiting_owner',
    basis:
      'The verbatim third-party post, author handle included. Not OUR user’s data — but it is somebody’s, and the table’s not_person entry is about US, not about them.',
    writer: 'the Reddit collector.',
    recommendation:
      'Out of scope for person erasure; recommend the owner state a corpus retention policy so this is governed by a decision instead of by silence.',
  },
  {
    table: 'collection_on_demand_requests',
    column: 'term',
    coverage: 'awaiting_owner',
    basis:
      'Typed search text, aggregated across people — but a term asked by exactly one person (distinct_user_count = 1) is that person’s query.',
    writer: 'the on-demand collection path, from user searches.',
    recommendation:
      'Recommend not_person if a k-anonymity floor is enforced on promotion; otherwise it needs a rule.',
  },
  {
    table: 'demand_scoring_candidates',
    column: 'normalized_text',
    coverage: 'awaiting_owner',
    basis: 'Derived from typed queries; same single-asker concern as above.',
    writer: 'the demand scorer, from signal/residue text.',
    recommendation: 'Recommend the same k-anonymity floor, then not_person.',
  },
  {
    table: 'llm_decision_records',
    column: 'input',
    coverage: 'awaiting_owner',
    basis:
      'Unschema’d JSON audit trail; whether a user’s query text ever lands here depends on the caller, not on this column.',
    writer: 'LLM decision callers across the app.',
    recommendation:
      'Recommend an assertion at the writer that inputs are corpus-derived, then not_person.',
  },
  {
    table: 'llm_batch_job_items',
    column: 'request',
    coverage: 'awaiting_owner',
    basis:
      'Same shape: batch payloads are corpus text TODAY, by convention only.',
    writer: 'the batch job submitters.',
    recommendation:
      'Recommend the same writer-side assertion, then not_person.',
  },
];
