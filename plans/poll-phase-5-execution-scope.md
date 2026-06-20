# Poll Plan — Phase 5 Execution Scope (gazetteer / entity linking)

> Companion to `community-polls-discussion-driven-collection-plan.md` §6.1/§6.5. Dep: Phase 4A–4C ✅
> (comments exist), shared matcher ✅ (P1.4 — the vocabulary + recall this sits on).

\*\*Status: core ✅ DONE (f1363e20) — live no-LLM highlighting of KNOWN entities in comments. Sandbox

- close-time graduation remain.\*\*

## ✅ Done — the span-scan + comment highlighting

`EntityTextSearchService.scanForKnownEntities(text, types, {marketKey})` — tokenize → 1..N-gram
candidate phrases with char offsets → ONE indexed query for entities whose normalized name/alias
equals a candidate → longest-match dedup. Always-fresh (live table), no LLM, market-scoped
restaurants. Wired into `postComment`/`editComment` (store `PollComment.entitySpans` +
`extractionStatus=highlighted`); `listComments` returns spans for the client to render tappable
highlights + deeplinks. Validated: correct spans + offsets; "breakfast sandwich" → one span (not
split); no-entity comment → none. Scoped to restaurant+food (avoids the §6.5 common-word-attribute
false-link problem — junk attributes are dropped at source by the ontology anyway).

## Remaining

- **5B — Sandbox / provisional projection (§6.1): DEFERRED (decision 2026-06-19).** Skipped for now;
  design captured below for a future build. Its ONLY unique payoff is live visibility of brand-new
  (not-yet-in-graph) spots _during_ the open poll — a few-days-early appearance vs. close. Correctness
  is never at stake: **5C already graduates new entities at close** regardless, and the live tally on
  _known_ entities (4D) already works. Not worth the subsystem cost right now.

  **The design IF/when we build it (the residual-gated, sandbox-safe shape — better than both "LLM
  every comment" and a non-LLM junk-heuristic):**
  - **Live ≠ global.** The live pass must NOT call `processPosts` (that's the _graduation_ path — it
    creates global entities + writes the evidence ledger). Live extraction is **extract + resolve
    only, into a poll-local sink**; the global write stays at close (5C), preserving the §6.1 sandbox
    (nothing reaches search/scores/global graph until the close-time plausibility pass).
  - **Gazetteer-gated LLM (the cheap-first-pass principle):** run the async per-comment LLM **only on
    comments where the gazetteer found ZERO on-subject entities.** Comments that already name a known
    on-subject entity skip the LLM entirely (the common case). This is what keeps us from "LLMing every
    comment."
  - **Edge — comment mentions a known AND an unknown entity (mixed):** it skips live extraction (gate
    sees the known one). Accepted leak, because a _popular_ new spot is mentioned in many comments and
    plenty will be pure-unknown (gate-passing) → it still surfaces live; and any all-mixed straggler is
    caught for certain at close by 5C. Live loss only, never correctness loss.
  - **Edge — nested replies:** a reply extracted in isolation loses its referent ("seconded" / "the
    second one"). 5C handles nesting cleanly already (full thread + `parentSourceId` → chunker gives
    the LLM ancestor context). Live v1 would extract **top-level comments only**; replies + mixed
    graduate at close. (v2: include the ancestor chain as context-only to resolve replies live.)
  - **Sink:** a new poll-local table (e.g. `poll_provisional_entities`: pollId, clusterKey,
    displayName, variants[], distinctEndorsers); unresolved on-subject mentions fuzzy-cluster + upsert
    here; the leaderboard read merges real-entity + provisional rows (provisional shown non-tappable).
  - Needs frontend (render provisional rows) to have any visible effect — part of why it's deferred.

- **5C — Close-time graduation (§6.3): ✅ DONE (cb6d91ab).** At poll close the full thread runs
  through the EXISTING collection pipeline as a `poll-thread` source — `PollGraduationService`
  flattens comments (oldest-first; question is context-only, `extract_from_post=false`) → calls
  `ExtractionPipelineService.processPosts({pipeline:'poll-thread'})` (Gemini extraction → resolution
  → new-entity discovery + enrichment → evidence ledger → projection rebuild) → re-runs the gazetteer
  per comment to backfill highlights for the newly-created entities (`extractionStatus→collected`) →
  finalizes the leaderboard. Idempotent via `Poll.graduatedAt` (migration 20260619220000) + the
  pipeline's own source-ledger dedupe. The `poll-lifecycle` cron now closes-AND-graduates expired
  polls (and retries closed-but-ungraduated), per-poll failures logged not fatal. NOTE: this re-runs
  the LLM over raw thread text via the existing pipeline — it does NOT consume 5B's provisional
  clusters (5B is a LIVE display concern; graduation is independent). The §6.3 "plausibility gate"
  for brand-new entities is whatever the existing collection pipeline already applies; no poll-specific
  gate was added.
- **5D — Disambiguation/confidence (§6.5, later):** when a span matches multiple entities, pick by
  calibrated confidence. Rare today (chains merge to one entity; market scoping); v1 keeps first match.

## Unblocks Phase 4D (now buildable)

With `entitySpans` populated, the **endorsement leaderboard (4D)** is unblocked via the plan's DEFAULT
**gazetteer-live** signal (§6.2): a comment's spans = the subjects it endorses; a like endorses those
subjects; dedupe `(user, subject, poll)` → `COUNT(DISTINCT user)` → `poll_leaderboard_entries`.
Polarity/sentiment ("X is overrated, go Y") is the §6.2 _upgrade_ (per-comment LLM), not required for
v1 (presence = endorsement, ~95%, corrected at close). So **4D v1 needs NO sentiment** — just project
from spans + likes, then retire the vote tally (§2.4).
