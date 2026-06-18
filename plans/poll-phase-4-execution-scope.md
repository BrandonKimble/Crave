# Poll Plan — Phase 4 Execution Scope (thread + voting/endorsement)

> Companion to `community-polls-discussion-driven-collection-plan.md` §4–§5. Style matches the
> completed `poll-phase-{0-1,2,3}-execution-scope.md`. Dep: Phase 2 ✅ (tables), Phase 3 ✅.
>
> **Status: 4A–4C ✅ DONE (b0209ba9) — poll discussions live (comment CRUD + likes + read/realtime).
> 4D ⛔ GATED on Phase 5 (gazetteer).** Leaderboard stays vote-based until the endorsement projection
> (4D) is built post-gazetteer. Recommended next: **Phase 5 (gazetteer)**, then 4D.

**⚠️ Sequencing finding (important):** §5's **endorsement leaderboard** = `COUNT(DISTINCT user)`
endorsing a subject, where a comment "endorses" the entities it positively names. Knowing which
entities a comment names = `PollComment.entitySpans`, produced by the **Phase 5 gazetteer** (§6.1) —
NOT built. So Phase 4's leaderboard half (4D) is **gated on Phase 5**; the existing **vote-based**
leaderboard (PollOption votes, via poll-aggregation) stays as the interim. The **comment thread +
likes** (4A–4C) is fully buildable now. (This inverts the §12 order, which put Phase 4's leaderboard
before the Phase-5 gazetteer — the dependency runs the other way.)

**Buildable now = poll discussions** (a real shippable feature): comment CRUD, threading, per-comment
likes, thread sort, moderation, realtime. The leaderboard stays vote-based until Phase 5 lands.

All infra is ready: `ModerationService`/`UserEventService`/`UserStatsService`/`PollsGateway` are
injected in `PollsService`; the comment/like tables exist; `castVote`/`addOption` are the patterns to
mirror.

---

## 4A — Comment CRUD (post / edit / soft-delete, threaded)

`PollComment`: post, edit, soft-delete; `parentCommentId` threading (shallow depth cap, presentational);
`publicId` (short, shareable deeplink); moderate `body` on post (`moderateText`, mirrors poll
description) → `moderationStatus`; `extractionStatus='pending'` (gazetteer fills `entitySpans` in
Phase 5). Discussion AND ranked polls both have threads.

- **Endpoints** (`polls.controller.ts`, ClerkAuthGuard + `@CurrentUser`): `POST /:pollId/comments`
  (CreateCommentDto `{ body, parentCommentId? }`), `PATCH /comments/:commentId` (edit own),
  `DELETE /comments/:commentId` (soft-delete own).
- **Service:** `postComment` (moderate → create w/ `publicId`), `editComment` (re-moderate, set
  `editedAt`), `deleteComment` (set `deletedAt`, keep for audit). Event `poll_comment_posted` +
  `UserStats.pollsContributedCount`. Gateway `emitPollUpdate(pollId)`.
- **Files:** `polls.controller.ts`, `polls.service.ts`, `dto/create-comment.dto.ts`, `polls.gateway.ts`.
- **Dep:** none. **Accept:** post/edit/soft-delete a comment + reply; moderation rejects abusive
  bodies; soft-deleted excluded from reads; `publicId` unique.

## 4B — Per-comment likes + thread sort

`PollCommentLike` toggle (mirror `castVote`): like/unlike, maintain `PollComment.score` (denorm like
count) for sort. Self-like on own comment ignored for endorsement (§5) but allowed as a like.
Thread sort: by `score` desc (default) or `loggedAt` desc (new).

- **Endpoints:** `POST /comments/:commentId/likes` (toggle).
- **Service:** `toggleCommentLike` (upsert/delete `PollCommentLike` + `score` ±1 in a txn). Event
  `poll_comment_liked`. Gateway emit.
- **Dep:** 4A. **Accept:** like/unlike toggles `score`; a user likes many comments; sort by score/new.

## 4C — Read surface + realtime + current-user state

Comments read path: `GET /:pollId/comments` (threaded, sorted, excludes soft-deleted, paginated) +
attach `currentUserLiked` per comment (mirror `attachCurrentUserVotes`). Gateway: per-poll comment/
like events so the thread updates live (extend `emitPollUpdate` or add `emitCommentEvent`).

- **Dep:** 4A/4B. **Accept:** threaded comments returned with per-user like state; live updates fire.

## 4D — Endorsement-projection leaderboard — ⛔ GATED on Phase 5 (gazetteer)

§5: leaderboard = `COUNT(DISTINCT user)` endorsing a subject (restaurant entity OR restaurant+dish
Connection), deduped `(user, subject, poll)`; endorse = authoring/liking a comment that positively
names the subject; "+1" writes the same set; polarity from sentiment; multi-subject comments endorse
all (deduped). Materialize into `poll_leaderboard_entries`, rebuilt on interaction + at close. This
**needs comment→entity spans (Phase 5 gazetteer) + sentiment** → build AFTER Phase 5. At that point
also **rewrite poll-aggregation's vote tally** into this projection (§2.4). Until then the vote-based
leaderboard stands.

- **Dep:** Phase 5 (gazetteer / entitySpans) + sentiment. **Accept:** (later) distinct-endorser
  counts per subject from comments+likes; "+1" and a like converge on one set; vote tally retired.

---

## Sequencing

Build **4A → 4B → 4C** now (comment thread + likes + realtime = poll discussions). **4D** waits for
**Phase 5 (gazetteer)** — recommend doing Phase 5 next _after_ 4A–4C, then 4D, since the leaderboard
endorsement depends on it.
