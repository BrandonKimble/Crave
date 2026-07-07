# Archive Pre-Filter Pipeline + Universal Relevance Gate

**Date:** 2026-07-06. Supersedes §5 of
[archive-collection-efficiency-handoff.md](archive-collection-efficiency-handoff.md)
(the "open design space" is now decided). All decisions below are owner-settled
unless marked OPEN.

## Decisions (settled)

1. **Zero-comment posts: dropped unconditionally.** No body-length exception —
   owner call, not worth the carve-out.
2. **Filter order: deterministic first, cheap LLM second, extraction last.**
   Free work shrinks paid work.
3. **Thread granularity for all gating.** Never filter individual comments —
   sentiment lives at (dish, restaurant) level and threads resolve anaphorically.
4. **No negativity gate at ANY level — empirically confirmed.** Real check on
   r/austinfood: "Hey so homeslice pizza is like not good…?" (18 comments) is a
   recommendation goldmine (Allday, Smalls, Via 313, Hoboken + a specific dish);
   negative food posts attract "go here instead." The relevance gate asks ONLY
   "is this food/venue-related?" — the extraction prompt's Step-6 positivity
   gate stays where it is (precision work, entangled with extraction, ~free
   where it sits since survivors are read in full anyway).
5. **The relevance gate becomes UNIVERSAL, not archive-only.** Every collection
   type (archive, keyword, chronological, on-demand) currently sends 100% of
   pulled posts to the expensive extraction prompt. End shape: one
   `RelevanceGateService` stage inside `ExtractionPipelineService.processPosts`,
   BEFORE chunking — so every pipeline gets it automatically through the
   existing single seam (same pattern as the batch-mode seam and the completion
   handlers).
6. **Verdicts persisted** (`collection_relevance_verdicts`: platform post id,
   verdict, model, reason, judged_at). A post judged once is never re-judged —
   re-loads and keyword-search overlaps are free — and false drops are
   auditable.
7. **Multi-subreddit cities:** `collection_communities` is already N:1 to
   market; make `--subreddit` repeatable in onboard-market (market's
   `sourceCommunity` = first/primary).
8. **Live-city onboarding = dark launch** (industry-standard additive backfill):
   onboard with the market not yet surfaced → load → validation gates → flip
   visible. Needs a `--dark` onboarding option + a flip. Watch: worker
   contention (loader runs machine-side against prod DB) and shared Google
   rate budgets (coordinator already arbitrates).

## Ingest window: RECOMMEND 3 years (OPEN until owner confirms)

Decay already handles ranking fairness: Crave Score weights mentions by source
recency, so an established place's 2021 pile can't drown a 2025 up-and-comer —
that concern is solved and we shouldn't solve it twice with the window. What
decay does NOT fix is that old data costs the most per useful mention:
restaurant closure (~10%/yr compounding) means years 4–5 of a window are the
most likely to reference dead places — paid extraction + Google enrichment +
janitor churn for venues we then archive. And the decision is REVERSIBLE in
one direction only: loading 3y now and backfilling years 4–5 later is one
idempotent command (source-id dedupe makes it additive); un-loading is not a
thing. So: 3-year default window, per-market override, revisit after the
Austin eyeball if coverage feels thin.

## The funnel

**Stage 0 — deterministic, free (in ArchiveIngestionService / loader):**

- Window: `created_utc >= now - WINDOW_YEARS` (per-market, default 3y).
  Nothing enforces ANY window today — biggest single win.
- Drop posts: deleted/removed, zero comments (unconditional), author is a bot
  (AutoModerator etc.).
- Strip comments: bots, [deleted]/[removed] bodies.

**Stage 1 — cheap LLM relevance gate (flash-lite, Batch API, packed):**

- Judges TITLE + BODY only (never comments): "could this thread plausibly
  contain food/drink venue discussion or recommendations?"
- Whole-corpus cost ≈ under $1 per city (hundreds of titles per packed request
  at batch rates).
- Verdict + reason persisted (decision 6).

**Stage 2 — existing extraction prompt on survivors (unchanged, batch mode).**

## The relevance prompt must be grounded in real posts (owner requirement)

Build it from an observational pass, not from imagination: sample ~1 month of
titles+bodies from ≥6 archives across the three sub types and derive the
principles from what's actually there. First observations (2026-07-06 sample):

- **Dedicated food subs (r/austinfood):** dense but NOT clean. Real traps seen:
  news ("Workers at three Austin restaurants say paychecks bounced" — food-
  adjacent, zero recommendations), service-anecdotes ("Strange interaction at
  P Terrys"), meta/meetups ("Cinnamon Rolls Taste Tester Meetup"), and
  opaque-title posts ("Hissy Fit :(" — 29 comments, unjudgeable from title
  alone → the BODY must always ride along; "Comedor" — a bare restaurant name
  IS relevant). Bare-venue-name titles must pass.
- **Travel subs (r/JapanTravel):** ~90% itinerary/lodging/logistics noise;
  food asks appear embedded ("Seeking food, culture, and natural beauty").
  Zero-comment filter alone already kills most (0–2c typical); the gate
  catches the rest. Mixed posts (food as one ask among several) should PASS —
  extraction handles the rest.
- **General city subs (r/Atlanta):** the gate's raison d'être — traffic/
  politics/housing noise with buried food asks ("Takeout Sesame Noodles",
  "Restaurant ideas for a teen dinner?"). NOTE: **bars/drink venues are in
  scope** ("cool dive bar", "Restaurants that have THC drinks?") — the prompt
  must say venues-where-you-consume, not "food" narrowly.
- **Principle style:** same ethos as the collection prompt — boiled-down
  principles first ("does this thread plausibly seek or share where to
  eat/drink?"), a handful of real examples as secondary reinforcement, and an
  explicit fail-OPEN lean (a false keep costs pennies at Stage 2; a false drop
  loses signal forever).

Prompt-authoring step: pull the samples, draft, then REPLAY the gate over a
labeled slice (hand-label ~150 real posts across the 3 sub types) and report
precision/recall before trusting it.

## Measurement gate (before the real load)

Run Stage 0+1 over the full 5y austinfood slice + one travel sub + one city
sub. Report: keep-rate per stage per sub type, projected extraction-token
delta, and a false-drop audit (sample 30 dropped posts, eyeball). Ledger
prices the gate itself. Only then wire Stage 1 into processPosts for all
collection types.

## Build order

1. Stage-0 gates in the loader (window + structural) + multi-subreddit
   onboarding + `--dark`.
2. Sampling pass → relevance prompt drafted from real observations → labeled
   replay (precision/recall).
3. RelevanceGateService + verdict table + processPosts wiring (universal),
   flag-gated `COLLECTION_RELEVANCE_GATE=off|archive|all` for staged rollout.
4. Measurement run on Austin (+1 travel +1 city sub) → owner eyeball → lock.

## Dependencies / notes

- Batch INVALID_ARGUMENT fix must land first for batch-mode gating (interactive
  works meanwhile).
- Keyword/chronological/on-demand inherit the gate via processPosts — verify
  their post payloads carry title+body at that seam.
- Verdict ledger doubles as the "have we seen this post" record the keyword
  scheduler can consult before even pulling content.
