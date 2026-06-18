# Poll Plan — Phase 2 Execution Scope (Seam-1 cutover + data model)

> Companion to `community-polls-discussion-driven-collection-plan.md` (the architecture).
> Breaks master-plan **Phase 2** (§2 data model + §2.4 Seam-1) into actionable tasks, in the
> same style as the completed `poll-phase-0-1-execution-scope.md`.
> Status: **✅ COMPLETE (2026-06).** Dep: Phases 0–1 ✅ done.
> 2A cutover (commit 7cad3a9d) · 2B–2D data model (commit 723bcbf1). Decisions: rebuild-to-flush
> (no-op here — dev DB has 0 polls/votes, so no historical pollution) · schema-first (done; tables
> land empty now, logic in Phases 3–4). Next: master-plan **Phase 3** (poll creation + axis inference).

Legend: **Files** = primary touch points · **Dep** = depends on · **Accept** = done criteria.

**Shape of Phase 2:** one contained _deletion_ (the score-pollution cutover, real behavior change)

- three _additive_ schema tasks (new/evolved tables, no behavior yet — logic lands in Phases 3–4).
  Do **2A first** (it's the value + the only risk); 2B–2D are low-risk additive migrations that can
  follow in parallel.

---

## 2A — Seam-1 cutover: delete the pseudo-mention pollution (§2.4)

**Goal:** stop laundering poll votes into fake Reddit mentions. Today poll votes inject **pseudo
signal into `Connection.decayedMentionScore`/`decayedUpvoteScore`** (and an entity
`generalPraiseUpvotes` boost), so Crave Scores are dishonest. Delete all of it; poll evidence
will re-enter later as an honest typed source (`source_kind='poll_thread'`, Phase 5/§6.3), never a
fake mention.

**The pollution is in THREE places (verified in code) — delete all:**

1. `poll-aggregation.service` `applyConnectionSignals` — direct `Connection.decayedMentionScore/
decayedUpvoteScore` increment (immediate path).
2. `poll-aggregation` `generalPraiseUpvotes` praise-boost (best_restaurant_attribute polls).
3. `poll-aggregation` writes `PollCategoryAggregate` → `poll-category-replay` (hourly) replays it
   as a **second** increment into the same Connection decayed scores.

**Delete:**

- `poll-category-replay.service.ts` + its hourly cron.
- `poll-score-refresh.service.ts` (obsolete once polls no longer write scores).
- `PollCategoryAggregate` model + the `poll_category_aggregates` table (migration drop).
- In `poll-aggregation.service.ts`: `calculatePseudoSignals`, `applyConnectionSignals`,
  `upsertCategoryAggregate`, the `generalPraiseUpvotes` boost, and both `pollScoreRefresh.refreshFor*`
  calls. **Keep** the legit vote/consensus counting on `PollOption` (it stays until Phase 4 rewrites
  it into the comment-endorsement projection — do NOT delete that half).
- `POLL_PSEUDO_*` env + config keys.

**Historical cleanup (the clean exit):** the deletes stop _future_ pollution, but past pseudo-
increments already sit in `Connection.decayedMentionScore`. `projection-rebuild.service` recomputes
that score fresh from the Reddit evidence ledger (`n += exp(-Δ/decay)`), and poll pseudo-mentions are
NOT ledger events — so **run a projection rebuild once post-cutover** to flush historical pollution.
Verify scores then reflect Reddit-only evidence.

- **Files:** `src/modules/polls/{poll-aggregation,poll-category-replay,poll-score-refresh}.service.ts`,
  `polls.module.ts`, `prisma/schema.prisma` (drop `PollCategoryAggregate`), config + `.env`, new migration.
- **Dep:** none (independent of the new tables).
- **Accept:** no code path writes pseudo signal into `Connection`/`generalPraiseUpvotes` from polls;
  `poll_category_aggregates` dropped; a projection rebuild yields clean Reddit-only scores; the existing
  poll vote flow still works (votes counted on `PollOption`, leaderboard intact, just no score
  pollution); `test-pipeline.ts` green.
- **Risk:** intended scoring change (poll-boosted Connection scores drop). Low at current scale.
  Confirm `projection-rebuild` is a full recompute (overwrites `n`), not incremental, before relying on
  it for cleanup.

---

## 2B — Poll model evolution (§2.1)

**Goal:** give `Poll` the fields the thread-first model needs. Add (existing `marketKey`/`region`/
`state` stay):

- `origin` enum `seeded | user | curator` — replaces scheduler-ownership of lifecycle.
- `mode` enum `ranked | discussion` — `discussion` polls have no axis/leaderboard/collection.
- `axis Json?` — the inferred subject axis (Phase 3 fills it); null for discussion polls.

Backfill existing rows: `origin='seeded'` (all current polls are scheduler-created), `mode='ranked'`.

- **Files:** `prisma/schema.prisma` (Poll + 2 enums), migration (+ backfill), `polls.service.ts`
  (set `origin`/`mode` on create).
- **Dep:** none. **Accept:** migration applies + backfills; create-poll sets origin/mode; tsc green.

---

## 2C — Comment + like tables (§2.2) — schema only

**Goal:** add the comment thread spine. There is **no comment model today**. Add:

- `poll_comments`: `commentId` PK, `pollId`, `userId`, `parentCommentId?` (self-relation, threading),
  `body`, `score` (denorm like-count for sort), `loggedAt`, `editedAt?`, `deletedAt?` (soft delete),
  `publicId` (stable, shareable deeplink), `moderationStatus`, `extractionStatus`
  (`pending|highlighted|collected`), `entitySpans Json?` (Phase-5 highlight spans). Indexes:
  `(pollId, score desc)`, `(pollId, loggedAt desc)`, `(parentCommentId)`, `(userId)`.
- `poll_comment_likes`: `(commentId, userId)` PK, `loggedAt`. Unrestricted per user.
- Prisma relations: `Poll.comments`, self-relation for threading, `User` back-relations.

**No service/endpoint logic in this task** — comment CRUD + thread sort is Phase 4. This is the
table + relations only (so Phase 4 builds on a stable schema, and 2A's "rewrite the legit half"
has its target tables).

- **Files:** `prisma/schema.prisma`, migration.
- **Dep:** none (parallel with 2A/2B). **Accept:** migration applies; models compile; relations valid.

---

## 2D — Endorsement projection table (§2.3) — schema only

**Goal:** the leaderboard is a **projection**, not a vote table. Add `poll_leaderboard_entries`:
`pollId`, `subjectType` enum `entity | connection`, `subjectId`, `distinctEndorsers`, `score`,
`rank`, `updatedAt`. Unique `(pollId, subjectType, subjectId)`; index `(pollId, rank)`. (Subject =
restaurant entity OR restaurant+dish `Connection`, mirroring Crave-Score subjects.)

**No projection logic in this task** — Phase 4 fills it from comment endorsements (`COUNT(DISTINCT
user)`), rebuilt on interaction + authoritatively at close.

- **Files:** `prisma/schema.prisma`, migration.
- **Dep:** none. **Accept:** migration applies; model compiles.

---

## Sequencing & open decisions

- **Order:** 2A first (value + risk, validate the score cutover), then 2B/2C/2D as additive
  migrations (can batch into one migration or land separately).
- **Open decision 1 — historical cleanup:** run the projection rebuild post-2A to flush past poll
  pollution (recommended), vs leave historical scores as-is. Negligible at 250-post scale; matters in
  production. **Recommend: rebuild.**
- **Open decision 2 — schema-first vs vertical-slice:** this plan follows the master plan's
  schema-first sequencing (2C/2D land empty tables now; logic in Phase 4). Alternative: defer 2C/2D and
  build each table _with_ its Phase-4 logic. **Recommend: schema-first** (smaller migrations; unblocks
  2A's "rewrite the legit half" which needs the endorsement table; lets Phase 3/4 build on stable
  schema) — but it's a real choice.
