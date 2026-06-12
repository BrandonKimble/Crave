# Community Polls + Discussion-Driven Collection — Master Plan

> Status: **DESIGN / PLANNING** (not started). Supersedes the deferred "Seam 1"
> (poll → quality pollution) item from the plans audit. Seams 2 (search_events
> split) and 3 (shared scoring kernel) are already committed; this plan absorbs
> and replaces the old poll evidence bridge.

## 0. One-paragraph thesis

Polls today are a soulless, structured proxy for a forum, and they pollute scores
by laundering votes into fake Reddit mentions (`poll_category_aggregates.pseudoMentions`
→ `Connection.decayedMentionScore`). We invert the model: **the discussion thread is
primary, and the "poll" leaderboard is a read-model projected over it.** A poll thread
becomes a _first-class collection source_ that flows through the exact same
extraction → resolution → evidence pipeline as Reddit, so (a) we get real anecdotal
voice (soul), (b) scoring evidence is honest and explainable, and (c) the pseudo-mention
bridge is deleted, not replaced. Users see one object called a "poll" (thread + leaderboard);
the schema keeps the two layers distinct.

---

## 1. Core principles (the invariants every decision must respect)

1. **Thread is the source of truth; leaderboard is a projection.** No vote/score is
   stored on the leaderboard directly — it is computed from comments + endorsements.
2. **A poll thread is just another collection source.** Reuse the Reddit collection
   pipeline wholesale (extraction prompt, flattening, resolution tiers, new-entity
   discovery, evidence ledger). Do not build a parallel extractor.
3. **Raw interactions are Reddit-loose; the leaderboard is subject-exact.** The leaderboard
   _subject_ is the poll's axis target — a **restaurant entity** ("best Italian", "best patio")
   OR a **restaurant+dish `Connection`** ("best breakfast sandwich"; `Connection` is unique on
   `(restaurantId, foodId)`). Dedupe endorsements per `(user, subject, poll)` downstream; never
   block a user mid-interaction. (Mirrors the existing Crave-Score `subjectType`/`subjectId`
   pattern, where a subject is already a restaurant or a connection/dish.)
4. **Collect greedily, project narrowly.** Every on-topic-or-not comment feeds the global
   graph; only on-axis entities appear as leaderboard rows.
5. **Authoritative processing happens at poll close.** Real-time surfaces (highlighting,
   live counts) are best-effort projections; the canonical evidence is computed once at close.
6. **No pre-seeding.** Cold start is acceptable; _seeded_-origin polls are a recurring weekly
   ritual (user-origin polls are always-on) and should not resurface old data. Day-one
   usefulness comes from Reddit-seeded scores.
7. **Aliases everywhere.** Every entity (incl. attributes) has aliases; matching,
   resolution, and the gazetteer must all be alias-aware.

---

## 1A. Architectural throughline — what's actually shared vs. distinct (audited against code)

Stepping back, several problems are _thematically_ about identity ("is this the same entity?"),
but the code shows they are **NOT one kernel** — they're one genuinely-shared core plus several
distinct, differently-shaped fixes. Be precise (over-consolidating obscures the real shapes):

- **GENUINELY SHARED — one text→entity matching + confidence core.** Collection resolution
  (`EntityResolutionService`), autocomplete retrieval (`EntityTextSearchService`), the gazetteer,
  and new-entity variant clustering all want the _same_ thing: match a string to candidate
  entities with a **calibrated confidence + principled abstain** (evidence tier + similarity +
  selectivity/IDF — §6.5). This is the real shared kernel; converge the two matchers onto it.
- **DISTINCT mechanism (not the matcher) — attribute canonicalization.** A closed-vocab
  ontology + periodic LLM-batch (§6.6). It _uses_ the matcher but adds an ontology table + batch
  adjudication. Separate system, sits on top.
- **LOCALIZED fix (not a kernel) — restaurant chain-merge.** A name-agreement gate on
  `mergeIntoCanonicalDomainEntityIfNeeded` (§6.6). One targeted precision fix, not a shared core.

**Ranking is also NOT one kernel (verified):**

- **Collection priority** → already the **seam-3 demand-curves kernel** (`keyword-slice-selection`
  imports `curves.*`). A demand problem, not relevance-prediction.
- **Main search results** → ranked by **Crave Score** (`search.service` `ORDER BY
pcs.display_score`). A quality ranking that already exists.
- **Autocomplete** (incl. poll suggestions) → the only genuine **relevance-prediction** kernel
  (§8.2). Its scope is autocomplete, NOT search/collection.

**Sequencing:** the shared matcher core underlies polls (gazetteer/discovery), the attribute
ontology, AND autocomplete — so it is the true foundation; build it **first**. The other items
(restaurant un-merge, attribute ontology, junk cleanup) are independent standalone tasks, not
one monolith. Junk words are fixed at the **source** by the ontology (LLM drops them); the
residual common-word-_name_ case is just low match-confidence in the shared matcher — there is
**no separate selectivity gate** as its own component.

---

## 2. Data model

### 2.1 Poll (the user-facing object = thread + optional leaderboard)

Evolve the existing `Poll` model. Key additions:

- `origin: 'seeded' | 'user' | 'curator'` — replaces scheduler-ownership of lifecycle.
- `mode: 'ranked' | 'discussion'` — `discussion` polls have no axis, no leaderboard,
  no collection, no projection.
- `axis Json?` — the inferred subject axis (see §3). Null for discussion polls.
- `marketKey`, `region` — already present; the per-market feed key.
- `state` — keep existing `draft→scheduled→active→closed→archived`; ownership shifts
  from cron to event/activity-driven for `user` origin.
- Keep `allowUserAdditions` etc. but their meaning changes (options emerge from comments,
  not a separate add-option form — see §5).

### 2.2 Comment (NEW — there is no comment model today)

`poll_comments`:

- `commentId` (PK, surrogate), `pollId`, `userId`, `parentCommentId` (nullable, threading),
- `body` (text), `score` (denormalized like count for sort), `loggedAt`, `editedAt`,
- `deletedAt` (soft delete), `publicId` (stable, shareable, for deeplinking),
- `moderationStatus`, `extractionStatus` (`pending|highlighted|collected`),
- `entitySpans Json?` — resolved entity spans for highlighting (from §6 on-submit pass).
- Indexes: `(pollId, score desc)`, `(pollId, loggedAt desc)`, `(parentCommentId)`,
  `(userId)`.

`poll_comment_likes`: `(commentId, userId)` PK, `loggedAt`. Reddit-style per-comment
likes (drive thread sort + anecdote ranking). Unrestricted; a user may like many comments.

### 2.3 Endorsement (the leaderboard's deduped unit)

The leaderboard does NOT get its own table of votes. It is a **projection**:

- **The subject is the poll's axis target, not always a bare entity:** a restaurant **entity**
  (restaurant-axis polls) OR a restaurant+dish **`Connection`** (dish-axis polls). Model it as
  `(subjectType: 'entity' | 'connection', subjectId)` — same shape as Crave-Score subjects.
- An endorsement = `(user, subject, poll)` derived from: authoring a comment that _positively_
  recommends the subject, OR liking a comment that does.
- Leaderboard row count = `COUNT(DISTINCT userId)` over endorsements for that subject.
- Materialize as a refreshed projection table `poll_leaderboard_entries`
  (`pollId, subjectType, subjectId, distinctEndorsers, score, rank, updatedAt`) rebuilt
  on interaction (cheap, real-time best-effort) and authoritatively at close.
- **Reconciliation with favorites — RESOLVED in §13A.** Likes are a separate _public_ signal
  (not the personal `UserFavorite`); subject = entity or connection; deduped per
  `(user, subject, poll)`. See §13A.

### 2.4 Evidence integration (Seam 1 — the actual cutover)

- **Pollution is in THREE places (verified in code), not one — delete all:**
  1. `poll-aggregation.service` `applyConnectionSignals` directly increments
     `Connection.decayedMentionScore/decayedUpvoteScore` (immediate path).
  2. `poll-aggregation` boosts entity `generalPraiseUpvotes` (`praiseBoost`).
  3. `poll-aggregation` writes `PollCategoryAggregate` → `poll-category-replay` (hourly)
     replays it as a _second_ increment into the same Connection decayed scores.
- **Delete:** `poll-category-replay.service`, `poll-score-refresh.service`,
  `PollCategoryAggregate` model, the entire pseudo-signal block in `poll-aggregation`
  (`calculatePseudoSignals` / `applyConnectionSignals` / `generalPraiseUpvotes` boost /
  aggregate write / both `pollScoreRefresh.refreshFor*` calls), and `POLL_PSEUDO_*` env.
- **Rewrite (not delete) `poll-aggregation`'s legit half:** its vote/consensus counting on
  `PollOption` becomes the **comment-endorsement leaderboard projection** (§5).
- A closed poll thread is submitted to the collection pipeline as a source with
  provenance `source_kind = 'poll_thread'` (alongside `reddit`). Its extracted mentions
  flow into the same evidence ledger (`core_restaurant_events` / entity events) the
  scoring layer already rebuilds from, tagged by source so weights/provenance are explicit.
- `quality-score.service` consumes the union of typed evidence; poll provenance is a
  named source, never a fake mention. Explainability ("ranked here because N comments,
  M likes") is the same data the leaderboard shows.

---

## 3. Poll creation, axis inference, discussion-only fallback

### 3.1 The poll-subject prompt (NEW prompt file)

Add `apps/api/src/modules/external-integrations/llm/prompts/poll-subject-prompt.md`,
a small/cheap-model prompt (sibling to `query-prompt.md`). Input: the natural-language
question. Output (structured, with confidence):

```
{ targetType: 'restaurant' | 'dish',
  constraint?: { kind: 'attribute' | 'cuisine' | 'category', term, resolvedEntityId? },
  anchorEntity?: { resolvedEntityId },
  confidence: number }
```

Axis shapes to support (this set covers essentially all "best/what" food questions):
| Question | targetType | constraint | anchor |
|---|---|---|---|
| best breakfast sandwich | dish | category: breakfast sandwich | — |
| what to order at Joe's | dish | — | Joe's |
| best Italian in LES | restaurant | cuisine: italian | — |
| **best patio** | restaurant | attribute: patio | — |
| best spicy ramen | dish | dish-attribute: spicy (+category: ramen) | — |

### 3.2 Creation flow

1. Moderate the question (food-aware Gemini moderation pass — see §9).
2. Run the question through the poll-subject prompt.
3. **High confidence** → `mode='ranked'`, store `axis`. Show the inferred structure back
   as a lightweight confirm chip ("Ranking: 🥪 breakfast sandwiches · 📍 NYC") with an
   edit affordance. Not a form; an escape hatch against misinference.
4. **Low/no confidence** → `mode='discussion'` **automatically and seamlessly** (no user
   prompt). Discussion polls: no axis, no leaderboard, no collection, no projection — pure
   thread. This handles "what's your favorite food memory?" gracefully.

### 3.3 Attribute creation parity

For an attribute-target poll ("best patio"), the close-time pipeline **creates/links the
`patio` attribute to restaurants that lack it**, identical to Reddit collection behavior.
The leaderboard ranks restaurants having the attribute. Aliases are honored throughout.

---

## 4. Comment thread model (mirror collection exactly)

### 4.1 Flattening + context (matches `collection-prompt.md`)

At close, the thread is submitted to the pipeline using the same shape Reddit uses:

- **Poll question → the "post"/"ask"** (provides the category anchor for terse replies).
- **Comments flattened** into a list, each carrying `parent_id` (context only) and `score`
  (its like count → upvote analog).
- **Depth-aware anchor resolution** (from the prompt's Global Principle) is preserved:
  - Reply (has parent): current clause → parent comment → earlier lines → post/ask.
  - Top-level: current comment → post/ask → earlier lines.
- **Inferred entities preserved**: "seconded" / "+1" inherits the parent's entity; a reply
  naming its own spot uses its own; a bare "Joe's!" inherits the poll question's category
  ("breakfast sandwich @ Joe's"). This is exactly the existing ask-and-reply behavior.
- A reply with **no** entities collects nothing (pure discussion/soul).

### 4.2 Chunking

Reuse the existing chunker (`LLM_MAX_CHUNK_COMMENTS=80`, `LLM_MAX_CHUNK_CHARS=12000`,
target tokens). A poll thread is typically one post + N comments — same envelope as a
Reddit thread.

### 4.3 UI threading

Limit nesting depth (shallower than Reddit) — presentational only, does not affect the
flattened extraction model. Default sort by votes; offer sort-by-new.

---

## 5. Voting / endorsement model

- **Thread likes**: Reddit-style, per-comment, unrestricted. Rank comments within the
  thread and rank anecdotes inside a leaderboard row. A user may like many comments.
- **Leaderboard count**: `COUNT(DISTINCT user)` endorsing a subject (entity or connection),
  deduped by `(user, subject, poll)`. Liking 3 comments about Joe's = 1 endorsement of Joe's.
- **Leaderboard "+1" button** = a synonym for "endorse this subject / like its
  representative comment," writing into the same endorsement set — NOT a parallel tally.
- **Polarity**: endorsement = positively-recommended subject only (reuse collection
  sentiment). A like on "Joe's is overrated, go Sal's" endorses Sal's.
- **Multi-subject comment**: endorses all positively-recommended subjects in it (deduped
  per user-subject).
- **Self-vote**: authoring already counts; ignore the author's like on their own comment.
- **Duplicate top-level comments for same entity**: allowed socially; dedupe in projection.

No "you already voted" friction ever surfaces.

---

## 6. Entity linking — two passes (drop "Layer A" chips entirely)

### 6.1 On submit — real-time gazetteer highlighter (display-only, no LLM)

- Reuse `EntityTextSearchService` (alias-trigram + phonetic) as a **gazetteer**; run
  **longest-match phrase containment** over the submitted comment to find known-entity
  spans (compounds like "breakfast sandwich" resolve because the phrase is in the index).
- Resolve spans via the cheap exact/alias tiers → store `entitySpans` → highlight +
  deeplink instantly (tap → restaurant profile or entity-scoped search, TikTok-style).
- **Best-effort**: brand-new entities (not in the graph) don't get _in-text highlighting_ at
  submit (the gazetteer can't match what isn't there), but they're still tracked as
  **provisional projection rows live** (the sandbox — below) and graduate to real global
  entities at close.
- **Implementation flag**: `EntityTextSearchService` is prefix-tuned; add/confirm a
  _containment / longest-match_ query mode (the alias-trigram core is reusable).

**New-entity handling — the poll is a SANDBOX; the gate is at the GLOBAL boundary.** New
entities mentioned in comments appear LIVE in the poll's discussion AND projection (even
potential junk) — the poll is self-contained. The protection is that **nothing reaches the
real/global system (search, profiles, Crave Scores) until it passes the plausibility gate.**
This is cheap because the live poll-local projection just _clusters mention spans_ — no
resolution/Places needed to display in-poll.

1. **Live (poll-local):** the gazetteer resolves + in-text-highlights KNOWN entities; unmatched
   mention-spans are fuzzy-clustered ("Joe's" / "Joe's Pizza" / "Joes pizza" → one row) and shown
   as **provisional projection rows** (NOT in-text highlighted — the gazetteer can't deeplink
   what it can't resolve). Junk shows here too — fine, it's sandboxed (and subject to in-thread
   moderation/reporting). Counting is the same as known entities.
2. **Close (graduation to global):** the authoritative collection pass resolves the provisional
   clusters, runs the **plausibility gate** (part of `collection-prompt.md` — §13A), and
   **graduates only the plausible ones to real global entities/scores**. Junk stays poll-local
   and never pollutes the global graph. Hard coreference ("the place on 5th") also resolves here.

### 6.2 Live leaderboard — separate from authoritative scoring

The leaderboard must be **live** (reflect the discussion at any moment); the expensive
sentiment-weighted **scoring evidence** can finalize at close. Split them:

- **Leaderboard** = `DISTINCT user` endorsing each on-axis entity. Needs only per-comment
  "which on-axis entities + who endorsed." Recomputed live, incrementally, per comment —
  so **edit/delete are trivial** (recompute that one comment's contribution; delete drops
  its spans). This is NOT where edit/delete gets hard.
- Two ways to source the live signal (pick per cost/accuracy):
  - **Default — gazetteer-live (free):** the on-submit gazetteer (§6.1) already finds
    on-axis entity spans; treat presence as a positive endorsement and recompute the
    `DISTINCT user` count live. ~95% accurate in a "best X" poll; rare negatives /
    inferred-entity ("seconded") cases are corrected by the close-time pass. Label the UI
    "live tally · finalizes when the poll closes."
  - **Upgrade — per-comment async LLM on submit (exact-live):** run a cheap extraction per
    comment on post (poll question + parent as context → full sentiment + inference), store
    it on the comment, drive live highlight + live leaderboard from it; close-time only
    _aggregates_ (no re-extraction). Edit → re-extract that one comment. Costs one cheap LLM
    call per comment (more prompt overhead than batching). Adopt only if live noticeably
    drifts from the finalized tally.

### 6.3 On close — authoritative collection pipeline (the real evidence)

- Submit the full thread (per §4) through the existing pipeline: Gemini extraction
  (compounds + sentiment + inference) → resolution tiers → new-entity discovery + Google
  enrichment → evidence ledger → leaderboard finalize → highlight backfill.
- Source of scoring evidence, new entities/attributes, and final highlights. (Under the
  per-comment upgrade this is aggregation-only — extraction already happened on submit.)

### 6.4 Why not compose-time chips (Layer A)

Resolution is already cheap (exact/alias/fuzzy); a chip only saves the small _extraction_
sliver, which we pay at close anyway. Chips add real typing friction (habitual rejection)
for marginal savings. **Cut.**

### 6.5 The two matchers — convergence

- **`EntityTextSearchService` (autocomplete)** = _retrieval_: partial input → ranked
  candidate list. Prefix + Postgres FTS (`ts_rank_cd`/`websearch_to_tsquery` over
  `crave_entity_search_tsv`) + trigram + **phonetic** (`dmetaphone`) + alias, length-aware
  thresholds, market scope, quality tiebreak. **Never writes.** The richer matcher.
- **`EntityResolutionService` (collection)** = _resolution_: full surface string → pick
  THE one canonical entity or `unmatched` → create-new (Google Places). Three tiers
  (exact → alias → fuzzy@0.75). Decisive, **writes entities**.
- Different jobs (rank-many vs. pick-one-or-create); neither is "better," but
  EntityResolution's single 0.75-trigram tier is cruder than EntityTextSearch's stack.
- **Convergence:** make `EntityTextSearchService` the shared retrieval/candidate-generation
  core; reduce `EntityResolutionService` to a thin decision layer (pick-best + create-new)
  on top. The **gazetteer highlighter reuses EntityTextSearch** — its FTS path already does
  "which entity names/aliases appear in this text," ≈ the containment matching we need.

**Empirical findings (tested against live DB):**

- Alias matching works (e.g. "dog friendly" → `allows dogs` via exact-alias path); FTS
  handles multi-word/typo ("shake shack"→Shake Shack, "katz"→Katz's). Retrieval is strong.
- **Abstain cannot be similarity-based.** There are entities literally named after common
  words — `downtown`, `favorite`, `good`, `friendly` (all `*_attribute`) — which exact-match
  at score **1.00**. A naive gazetteer would wrongly link them. The shared core needs a
  **calibrated confidence** = evidence tier + similarity + **term selectivity/IDF** + entity
  quality. **No separate "selectivity gate":** it collapses into (a) the ontology dropping
  junk at the _source_ (those attributes never become entities → gazetteer never finds them),
  and (b) term-rarity as one _input_ to the calibrated confidence (a lone common-word match is
  inherently low-confidence). The gazetteer simply requires high confidence to link.
- **Data-quality issue (independent of polls):** these junk single-word attribute entities
  exist and likely already degrade attribute autocomplete/resolution today — but they're fixed
  at source by the ontology (§6.6), not by a separate gate.
- **Convergence preconditions:** (1) add calibrated-confidence (incl. selectivity) to the core;
  (2) junk-entity cleanup. Without them, naive convergence regresses.
- **Post-convergence experiment — embedding recall (user-approved to test):** the attribute
  ontology (§6.6) proved embeddings catch different-word synonyms lexical recall can't
  (`al fresco`≈`outdoor seating` 0.93 cosine, `acye`≈`all you can eat`). The same recall gap
  exists in the matcher for **dishes** ("BEC"↔"bacon egg and cheese", "bao"↔"pork bun");
  restaurant proper nouns benefit less (trigram/phonetic already handle typos/short forms).
  After the converged matcher lands, A/B autocomplete + resolution **with vs. without an
  embedding recall lane** (`EmbeddingService` already exists) and compare candidate quality.
  Embeddings stay recall-only — the calibrated decision layer keeps all precision.

### 6.6 Entity vocabulary & alias model (prerequisite for clean matching + ranking)

**Problem (root-caused against live DB + code):**

- **Restaurants over-converge** via the `canonical_domain` chain-merge
  (`mergeIntoCanonicalDomainEntityIfNeeded`). This is _correct_ for real chains (7-Eleven,
  Chipotle, Chick-fil-A each = one entity, 61 locations). The bug is narrow: the
  `GENERIC_WEBSITE_DOMAIN_DENYLIST` covers ordering aggregators (doordash, ubereats,
  toasttab…) but **misses social/link domains** (`facebook.com`, `instagram.com`,
  `linktr.ee`, generic hosts). So every independent restaurant whose Google website is its
  social page gets `canonical_domain=facebook.com` and fuses into one fake "chain" (e.g.
  "Moe's Doughs" = 11 unrelated locations, aliases = the fused restaurants' names).
- **Attributes fragment** ("outdoor patio/seating/garden/space" = 4 entities) because a
  curated attribute ontology **already exists** (`GOOGLE_RESTAURANT_ATTRIBUTE_DEFINITIONS`:
  "allows dogs"→[dog friendly, pet friendly…]) and is used for **Google-sourced** attributes
  — but **collection-extracted attributes bypass it** and coin free-form entities. Junk
  single-word attributes ("downtown", "good", "favorite") also slip in via collection.

**Ideal model — asymmetric by entity class:**

- **Open vocab (restaurants) → place_id identity + NAME-AGREEMENT chain grouping (list-free).**
  Root cause confirmed: `mergeIntoCanonicalDomainEntityIfNeeded` merges any two restaurants
  sharing `canonicalDomain` **with no name check**. Fix: **gate the chain-merge on name
  agreement** — real chains share domain _and_ name (every "7-Eleven" is named "7-Eleven");
  false merges share a generic domain but have different names. With a name-agreement gate,
  facebook.com restaurants never merge regardless of domain → **the denylist is no longer
  load-bearing** (keep only as a trivial pre-filter; no periodic alias audits needed). Plus a
  one-time **un-merge cleanup** for existing giants. `google_place_id` stays atomic identity.
- **Closed vocab (attributes, dish categories) → an AI-BUILT ontology table (validated).**
  Confirmed: collection attributes go through `resolveContextualAttributes` → `resolveBatch`
  (fuzzy@0.75, too strict for different-word synonyms) and never get canonicalized — that's the
  fragmentation. **The hardcoded `GOOGLE_RESTAURANT_ATTRIBUTE_DEFINITIONS` is only 23 tags**
  (vs 738+469 in the DB) — it was a narrow Google-Places-field→name mapping, NOT an ontology,
  and hand-expanding it is hopeless. **Do not expand the hardcoded list.** End state: a single
  **AI-built/maintained ontology table** over the real vocabulary; the 23 Google fields are
  demoted to a structured-signal→canonical mapping that _points into_ that table.
  - **Validated against live DB (this planning session):** fed 45 real attributes to `gemini-3-flash-preview`
    with a canonicalization prompt → correctly merged the `outdoor garden/patio/seating/space`
    fragmentation into one canonical, made semantic merges trigram can't (date-night/romantic,
    cocktails), rejected junk (downtown, favorite, friendly, "good X"), kept distinct ones
    separate (good-for-groups ≠ good-for-children). A couple borderline calls (dog-cafe→dog-
    friendly) → the one-time bulk run is **human-reviewable**; the ongoing novel-tail is low-stakes.
  - **Applies to BOTH `restaurant_attribute` AND `food_attribute`** (same mechanism, scoped
    per type). Run the food/dish vocabulary through the same ontology.
  - **Full 738 run (validated at scale):** 738 → **420 canonicals + 84 rejected** (~32%
    cleanup), distinct kept distinct, junk + unknown neighborhoods rejected. **Caveat: it
    over-merges vague/broad concepts** ("Neighborhood Spot" swallowed 16; "meat market" +
    "seafood market" fused).
  - **Merge principle = CONSERVATIVE, and it's grounded in how search works.** Verified:
    search FTS tokenizes, so a "market" query already matches "meat market"/"seafood market"
    (and "outdoor" matches all the outdoor variants). So **under-merging costs nothing** (search
    unites related attributes for broad queries) while **over-merging is lossy + irreversible**
    (you can't recover "seafood market" precision once fused). Therefore the prompt is
    **principles-first**: merge only _interchangeable_ phrasings; keep separate anything
    differing by a meaningful qualifier (cuisine/food-type/intensity/audience); when unsure,
    keep separate. The one-time bulk pass is also human-reviewed.
  - **I/O shape — SUPERSEDED (free-clustering → per-term placement).** The original
    `{groups:[{canonical,members[]}], rejected}` free-clustering was BUILT and FAILED on real
    data: it conflated same-axis-opposite-value pairs (merged `thick`/`thin`, `mini`/`giant`,
    `dinner`/`lunch`) and self-conflicted across chunks (duplicate canonicals). Replaced with
    **per-term placement** (commit 4e8d1e91): one candidate term + an embedding-shortlist of
    nearest canonicals → `match` (an existing canonical) / `new` (distinct) / `reject` (junk).
    The decision is narrow and order-stable; antonyms now stay apart by construction. Output:
    `{decision, candidate_id, reason}`.
  - **Embeddings ARE now used for recall (the deferral condition was met).** This section
    previously deferred vector blocking until "eval shows lexical blocking misses real merges."
    It does: `al fresco`≈`outdoor seating` (cos 0.93) and `acye`≈`all you can eat` (0.78) share
    no characters — trigram/token blocking misses them entirely. `EmbeddingService`
    (gemini-embedding-001, 768-dim, L2-normalized) supplies recall; blocking is **top-K nearest**
    (the cosine band is narrow — unrelated≈0.82, antonyms≈0.86, synonyms≈0.93 — so an absolute
    threshold is useless, and the LLM still does ALL precision: embeddings put `thick`≈`thin`
    close too). A second **canonical-dedupe pass** re-places each new canonical against the
    others to fold near-duplicates that per-batch placement created — this is what kills the
    duplicate-canonical problem globally, order-independently.
  - **No separate ontology table.** The canonical vocabulary IS the `core_entities` rows of the
    type with `status='active'`, synonyms in the `aliases` column. A separate table would be a
    second source of truth that drifts; the 23 Google fields map onto these entities. (Decision
    made during implementation — flag for sign-off.)
  - **Tooling:** `attribute-placement-prompt.md` + `ATTRIBUTE_PLACEMENT` schema + new
    `EmbeddingService`, loaded via `LLMService` (same pattern as collection/query/cuisine).
    Gotcha (hit + fixed): gemini-3 _thinking_ tokens count against `maxOutputTokens`, so even a
    tiny JSON reply needs headroom (512 truncated mid-thought → fail-closed `new`; raised to 2048).

  **Scale note (production-correct — must be right the first time):** attributes are a
  _bounded_ vocabulary; the canonical set saturates (Google/Yelp cap at a few hundred), so
  even at 100x data the _novel tail per batch stays small_. The foundation: (1) a **persistent
  growing ontology** (cheaper per-item as it saturates), (2) **LLM as the precision decision**
  over the novel tail, (3) **embedding blocking** for recall (the deferral condition above is
  met — lexical blocking provably misses different-word synonyms).

  Layer it so cheap = candidate generation (recall), LLM = the merge DECISION (precision).
  **Blocking is a grouping step, never a merge signal** — relatedness is not equivalence
  ("spicy"/"mild" related but opposite; embeddings put antonyms close too), so auto-merging on
  any proximity (string OR vector) would over-merge. The LLM does ALL precision.
  - _Runtime (cheap, conservative):_ a collection attribute is created **`pending`/quarantined**
    — excluded from ALL reads (autocomplete, leaderboard, scoring) until adjudicated.
    **Quarantine is the key correctness guarantee** — it makes "dirty results between
    canonicalization runs" structurally impossible, decoupling correctness from cadence (timing
    only affects how fast a genuinely-new attribute becomes _visible_ — a latency knob).
  - _Blocking (cheap, high-recall):_ **embedding top-K nearest** canonicals per pending term.
    Catches different-word synonyms string blocking can't (`al fresco`≈`outdoor seating`). Tuned
    for recall (a real synonym must never be hidden from the LLM); false neighbors are fine — the
    LLM rejects them cheaply. Commits no merge.
  - _LLM placement (the intelligence):_ each pending term + its shortlist → `match` an existing
    canonical / `new` (distinct — `spicy ≠ mild`) / `reject` (junk). This is where "patio and
    seating are the same" gets _reasoned_. A second **canonical-dedupe pass** re-places each new
    canonical against the others to fold globals the per-batch step missed.
  - _Trigger shape (NOT a fixed schedule):_ all 4 collection types (chronological / archive /
    keyword / on-demand) converge on ONE unified pipeline — entity/attribute resolution is a
    single shared point (`unified-processing.service` `resolveBatch`, per batch). So hook the
    canonicalizer to that **one** convergence point, not per-type. Ideal end state = an
    **event-driven, queue-based canonicalization worker** (idiomatic — the codebase is all Bull
    queues): batches that produce `pending` attributes enqueue them; the worker drains
    **debounced/threshold-gated** (process N pending at once — the LLM batch has fixed prompt
    overhead, so don't fire per tiny batch). A **low-frequency scheduled sweep is a backstop
    only** (catch stuck items), not the primary mechanism. Scheduled-only is the wrong shape:
    it leaves a dirty window — but quarantine already removes the dirtiness, so the worker is
    optimized purely for cost/latency, not correctness.

**Payoff (why this gates other work):**

- **Solves the abstain/junk problem at the source** — junk never becomes a linkable entity,
  so the gazetteer's "don't link common words" need largely disappears (residual common-word
  _names_ are just low confidence in the shared matcher — no separate gate; see §6.5).
- **Prerequisite for the unified-relevance kernel (§8.2)** — clean vocabulary means
  popularity isn't split across synonym variants; retrieval precision + ranking signals
  sharpen. Garbage entities → garbage ranking; fix vocabulary first.
- **No extra per-resolution LLM cost** — LLM runs as periodic batches over the novel tail.

**Largely independent of polls** — this is core entity-pipeline cleanup; sequence it early
because the gazetteer, convergence, and ranking kernel all depend on a clean vocabulary.

---

## 7. Edit / delete

Because authoritative collection runs at close, only the **final** state of each comment
is ever processed → no incremental evidence reconciliation.

- **Active phase**: allow edit AND delete cheaply. Edit re-runs the on-submit gazetteer
  (re-highlight). Delete = soft-delete (`deletedAt`), excluded from close-time processing.
- **At close**: thread freezes; comments become read-only/archived.
- Soft-delete retained for moderation/audit.

---

## 8. Search / autocomplete integration

### 8.1 Polls as a new lane (no sections)

- Add a `poll` lane to the single mixed autocomplete list (per `plans/autocomplete.md`'s
  "single mixed list, no sections" mandate).
- Poll relevance score combines: text match to question, entity-in-poll match (typing
  "Joe's" surfaces polls where Joe's ranks), **market match** (current map-resolved
  market), and **activity/recency** (live > stale).
- **Zero reserved slots** — polls appear only when they out-score overflow.

### 8.2 Ranking evolution — toward Google-grade unified relevance

**Goal: the "that's exactly what I wanted" feel.** Google ranks autocomplete as a single
relevance prediction (relevance can beat popularity; personalization, locality, and a
freshness/trend layer all factor in) — **no per-type reserved slots.**

**Where we stand:** retrieval is strong (`EntityTextSearchService`: prefix + FTS + trigram

- phonetic + alias + market scope + quality tiebreak). The gap is **blending/ranking**:

1. `mergeAutocompleteLanes` is _reserved-prefix then overflow_ — forces a fixed lane order
   into the top slots, so the single most-relevant item can't always win #1.
2. The entity score is _lexical-confidence-first × small capped boosts_ (popularity/affinity
   capped ~+0.35), so a wildly popular / locally-perfect result can't overtake a marginally
   higher-lexical but irrelevant one. No freshness/trend signal at all.

**Direction (not floors):** a **unified relevance score across all candidate types**
(entity / query / poll), sorted purely by that score, blending lexical match + popularity +
personal affinity + **locality** + **freshness**, with at most _light diversity_ (avoid 10
near-duplicate restaurants) instead of hard per-type slots. Polls become just another
candidate type in this ranking. This replaces the reserved-lane merge; it is the
long-term-correct, Google-aligned shape. Tune to preserve current "feel" via the relevance
weights, not via reserved slots.

**Most signals already exist** (assembled ad-hoc with capped boosts in `rankCandidates`):
lexical (EntityTextSearch ✓), popularity (`getEntityPopularityScores` ✓), affinity
(`getUserEntityAffinity` + favorites + views ✓), locality (market presence ✓). **Freshness
is the gap** — but the seam-3 demand curves (surge/recency) give the primitives.

**What it takes:** (1) extract a **shared relevance-scoring kernel** (analog of the seam-3
curves kernel) mapping `candidate + signals → unified score`; (2) calibrate candidate types
onto one comparable scale; (3) replace the reserved-lane merge with score-sort + light
diversity; (4) wire in freshness. Steps 1+3 are the achievable big win; (2) is iterative.

**Scope correction (audited).** This relevance kernel's scope is **autocomplete only** — do
NOT over-claim it as one kernel for all ranking. The code shows ranking is already three
distinct concerns: **collection priority** = seam-3 demand-curves (`keyword-slice-selection`
imports `curves.*`); **main search results** = Crave Score (`ORDER BY pcs.display_score`);
**autocomplete** = relevance-prediction (this §). They _share signals_ (popularity, locality)
but have different objective functions — don't force them into one ranker. The poll feed
(browse) is a simple recency/activity sort, separate again; poll _suggestions inside
autocomplete_ are the part that rides this kernel. Reaching "Google-grade" (calibration +
freshness) is a real project scoped to autocomplete; phase it.

### 8.3 Browse vs find

Per-market poll **feed** (newest-first, optional more sorts) is the browse surface;
search bar is find. Both inside the poll sheet system. Poll search rides the `query_text`
index + entity graph. (Sheet/feed/map-resolver plumbing → the separate sheets-v4 pass.)

---

## 9. Moderation (REBUILD — currently a no-op)

**Finding (verified live):** the configured endpoint
(`contentmoderation.googleapis.com/v1beta/moderations:moderateText`) returns **404**, and
the API key is **invalid** against Google's real text-moderation endpoint (NL API
`language.googleapis.com/v2/documents:moderateText`). Because `ModerationService` fails
open on any non-200, **every text is allowed today** — moderation is silently a no-op.
The hardcoded non-exhaustive food allowlist ("bloody", "killer", "dirty fries") is a smell
regardless.

**Recommendation — replace with a food-aware Gemini moderation pass.** Empirically proven:
hitting Google's NL `moderateText` (with a working key) flags legitimate food language at
≥0.8 and you **cannot** threshold or allowlist around it:
| phrase | score | category |
|---|---|---|
| killer fries | 0.93 | Violent |
| killer tacos | 0.84 | Violent |
| these wings are the bomb | 0.92 | Firearms & Weapons |
| to die for pasta | 0.92 | Death/Harm |
| drunken noodles (a real dish) | 0.88 | Illicit Drugs |
"killer fries" (0.93) scores as high as a genuine violent control (1.0), and the offending
categories are exactly the ones real moderation must keep. The keyword API is unfit for a
food app. Use a tiny cheap-model prompt instead: "flag only genuinely hostile / sexual /
harassing content; treat culinary hyperbole (killer, bomb, sinful, crack, dirty, drunken,
to-die-for) as benign." Eliminates the allowlist by design and understands our domain.
The Google NL classifier takes **no prompt** (fixed categories) — it's the older paradigm;
LLM policy-as-prompt is the modern, context-aware approach (research-confirmed). A live
Gemini test (`gemini-3-flash-preview`, one batched call) classified all food phrases ALLOW
and all genuine threat/sexual/harassment controls BLOCK — exactly desired.

**Migration scope (lock in — app-wide, not just polls).** `moderateText` is called in 4
places: `username.service.ts` (usernames) + `polls.service.ts` ×3 (description, question,
option label). Migrate all of them + the new `poll_comments` surface to the Gemini pass.

- **DELETE the old plumbing (not just bypass it):** the `ModerationService` fetch +
  category-threshold logic + `allowlistPhrases`/`isAllowlisted`; the `GOOGLE_MODERATION_ENDPOINT`
  - `moderation.*` config wiring (`configuration.ts` default endpoint); and the now-unused
    `GOOGLE_MODERATION_API_KEY` env (Gemini moderation reuses `LLM_API_KEY`). **Keep only the
    `ModerationDecision` interface** so the 4 call sites are unchanged. New impl = a food-aware
    Gemini prompt (own prompt file, sibling to query/poll-subject prompts).
- **Fail policy for UGC**: do NOT fail fully open at scale — on outage, soft-hold
  (queue/pending) rather than auto-allow. Decide pending-vs-allow threshold before launch.
- **Scale path (later):** cheap classifier/heuristic pre-filter → Gemini only for ambiguous
  cases (cascade). Single call is fine at current scale.

---

## 10. Lifecycle / cadence

- `seeded` origin: weekly proposed questions. **KEEP `poll-scheduler`'s demand-driven topic
  selection** (it reads recent `SearchDemandService` demand + uses the seam-3 curves for
  surge/resurgence/cooldown to pick _what to ask_ — genuinely valuable, and uses _recent_
  demand so it doesn't resurface old data). Correction to earlier draft: do NOT gut the
  scheduler — most of its 1,000 lines ARE this selection logic and they stay. Remove only:
  (a) **option pre-seeding** (the demand-top-entities → pre-filled options path — violates
  cold-start) and (b) **lifecycle ownership** (state machine moves to per-origin control).
- `user` origin: event/activity-driven open/close, not weekly batch. (Weekly cadence applies
  to **seeded** origin only — user polls are always-on.)
- **No pre-seeding of options/leaderboard.** Cold start accepted (seeded polls launch with a
  question + empty leaderboard; options emerge from comments). Do not resurface old poll data.
- **Close trigger = the existing daily cron.** `poll-lifecycle.closeExpiredPolls`
  (`EVERY_DAY_AT_2AM`) flips `active → closed` by `launchedAt`+duration. The close-time
  authoritative pass (§6.3) hooks here; close granularity is daily-batch (fine).
- **Realtime is a near-rebuild, not an "extension."** `polls.gateway` (26 lines) only does a
  global `server.emit('poll:update', {pollId})` broadcast to ALL clients — no per-poll rooms,
  no granular events. Live leaderboard + live comments + live highlights need real **per-poll
  rooms** and granular event types (new comment, like delta, leaderboard shift, highlight ready).
- **`poll-entity-seed` converges into the shared matcher/resolution core** (§6.5): it already
  resolves option text → entities via Places + `EntityResolution` + `AliasManagement`; comment
  entity resolution should reuse the _same_ machinery rather than a poll-specific copy.

---

## 11. Restaurant profile surfacing (DEFERRED — stub only)

Later pass. Direction: split into a **Polls tab** (every poll this restaurant ranked in +
placement) and a **Mentions/Anecdotes tab** (every comment recommending it, sorted by
likes — the Google-reviews-search superpower). Different objects; don't share a list.

---

## 12. Phasing (proposed)

Per §1A, the **shared matcher + clean vocabulary are the foundation** under polls, the
gazetteer, and autocomplete — and much of it is **independent of polls**, so it sequences first.

0. **Cross-cutting standards + hygiene (start now):** LLM/model standards (§14 — model tiers,
   thinking cleanup, native `responseJsonSchema`); **moderation rebuild** (§9, app-wide,
   independent); **migration discipline** (§15 — real Prisma migrations, not `db push`).
1. **Entity vocabulary + matcher foundation (§6.5/§6.6 — early, mostly poll-independent):**
   AI-built attribute ontology (restaurant **and** food) + quarantine + queue worker; restaurant
   **un-merge** (name-agreement gate + cleanup); shared matcher core (calibrated confidence/
   abstain); **collection-prompt fixes** — holistic Step 3+4 merge for the ingredient/coconut
   bug, validated by **DB replay** (no regressions).
2. **Seam 1 cutover + data model:** delete the pseudo-mention bridge (§2.4); Poll evolution,
   comment/like tables, endorsement projection (§2).
3. **Creation + axis inference (§3):** poll-subject prompt (Lite), ranked/discussion split.
4. **Thread + voting (§4/§5):** comment CRUD (edit/delete), thread sort, leaderboard projection,
   endorsement dedup.
5. **Entity linking + sandbox (§6.1):** gazetteer highlighter (containment mode); poll-local
   provisional projection; close-time graduation + the conservative menu-plausibility gate.
6. **Likes / creation / abuse (§13A):** public like signal (separate from favorites);
   create-dish/restaurant flows (Place-gate + submit-time validation); the Lite **triage gate**
   (drop-list, default-keep — pending the recall test); rate limits.
7. **Autocomplete (§8):** poll lane + unified-relevance merge (score-sort + light diversity).
8. **Realtime** (§10 — near-rebuild), **metrics** (participation health).
9. **(Later)** restaurant-profile surfacing; sheets-v4 owns feed/market/sheet plumbing.

---

## 13. Open questions to confirm before/within implementation

- **Cross-surface likes ↔ poll endorsements — RESOLVED in §13A.** Likes are a _public_
  `(user, subject, source)` signal, separate from personal favorites; subject = entity or
  connection; the only non-poll like surface is the create-dish/restaurant flow; dedup per
  `(user, subject, poll)` prevents double-count. (See §13A for the full model.)
- **Subject granularity — RESOLVED (mirror the collection prompt's ask-supplies-category):**
  dish-axis leaderboard subject = the `(restaurant, axis-category)` Connection. Comment names a
  restaurant → endorses `(restaurant, axis-category)` (dish from the poll axis). Comment names a
  more-specific dish at a restaurant → rolls up to the same `(restaurant, axis-category)` row, the
  specific dish kept as evidence detail. Comment names only a dish with no resolvable restaurant
  (and none inherited from parent context) → NOT a leaderboard row (discussion/soul only).
- **Live leaderboard signal**: gazetteer-live (free, ~95%, finalize at close) vs.
  per-comment async LLM (exact-live, per-comment cost). Recommend gazetteer-live first.
- Endorsement projection: materialized table vs. SQL view (perf vs. freshness) — likely
  refreshed table updated on interaction + authoritative finalize at close.
- `EntityTextSearchService` containment mode: extend FTS path in place vs. small dedicated
  scan; and how far to push matcher convergence now vs. later.
- Unified-relevance autocomplete: feature/weight set (lexical, popularity, affinity,
  locality, freshness) + light-diversity rule to preserve current "feel"; migration off the
  reserved-lane merge.
- **Moderation is a no-op today** — rebuild (food-aware Gemini pass) is near-term work
  independent of polls; decide soft-hold-vs-allow on outage.
- Discussion-poll abuse (un-rankable spam) — rely on moderation + reporting initially.

---

## 13A. Likes, user-created entities & abuse resistance (NEW work — not existing today)

**Honest status (verified):** the abuse-resistance below does NOT exist yet. Today the resolver
**creates a new entity immediately** on first mention (`allowEntityCreation: true`), with **no
quarantine / pending / verified status** on entities or connections; junk is only _down-ranked_
by scoring (so it still exists + is findable, just low). Distinct-user counting exists only for
keyword-collection prioritization, NOT entity promotion. So the model here is **new build-work**
(consistent with the §6.6 quarantine pattern + the §6.1 poll-sandbox + global-boundary
plausibility gate, but not yet coded).

**Likes vs favorites (decided):**

- **Favorite/save** = personal (existing `UserFavorite` entity-level + `FavoriteList`/
  `FavoriteListItem` which already supports restaurant OR connection). Private; does NOT feed polls.
- **Like/endorse** = a _public_ `(user, subject, source)` signal, subject = entity OR connection.
  Lives **in polls** + **one** non-poll surface: the **create-dish / create-restaurant flow**.

**Abuse resistance — ground in REALITY, not in counting users (no trust scores).** Counting
users to gate "does this exist" is sybil-able, which is what forces account-trust scores /
new-account caps. Avoid it: gate **existence** on plausibility/reality; let user-count affect
only **ranking**, never existence.

- **Restaurants → Google Place-gated:** must pick a real Place (already how
  `poll-entity-seed.resolveRestaurant` works). Fake restaurants structurally impossible. No AI.
- **Dishes → AI plausibility-gated** (the dish analog of the Place-gate): a cheap check
  ("is this a real, specific menu item plausible for this restaurant/cuisine?") is the gate.
  Kills jokes / nonsense / inappropriate-but-passed-moderation / sabotage spray (all
  implausible or non-specific). Plausible dishes are **created + visible immediately** but
  **rank low** until real evidence (more mentions, Reddit, menu data) accrues. The only
  residual is a _plausible-but-fake_ dish — low harm, low incentive, low rank. **Nothing
  counts users as a gate → no sockpuppet payoff → no trust scores / account caps needed.**
- **Two distinct gates — keep them straight:**
  - **(a) Conservative dish-plausibility** (is it a real menu item?) — lives in the EXTRACTION
    prompt, reusing its existing _"could this appear on a menu?"_ bar (passes weird-but-real
    names like "rainbow unicorn wrap"; only filters clear gags). Rides the close-time bulk pass
    for free; covers Reddit + poll comments.
  - **(b) Triage gate** (skip junk / off-topic / joke / sarcasm / **abuse**) — a SEPARATE cheap
    **Lite triage pre-pass** that runs BEFORE the main extraction call, combining the existing
    intent/sentiment/quality gating with the new abuse gating (they're the same keep/skip
    decision — don't split them). **Output a DROP-list (with reasons); subtract from the
    deterministic mention list → default-KEEP**, so a genuine rec can only be lost if actively
    mis-flagged (never by omission), and a malformed response fails safe (drops nothing).
    Source-specific: polls need it (abuse), Reddit barely does. **Validate recall via DB replay
    before trusting it to replace integrated gating** (does Lite keep the genuine recs?).
- **Explicit create-dish/restaurant flows (not built yet):** a deliberate "add this now" action
  gets an instant Lite validation call (moderation + dish-plausibility, separate sibling prompts
  — see §9/§14). Rare path, so cost is negligible.
- **On rejection (surface-dependent):**
  - _Mention (poll comment):_ the **comment stays in the thread**, untouched (valid
    discussion/soul) — we just don't create the junk dish at close. Silent at the data layer.
  - _Creation (explicit flow):_ **user-facing feedback** ("couldn't verify that as a dish here")
    — it's a form action, so an honest answer is the right UX.
- **Poll = sandbox (KEEP live discovery — §6.1):** new entities (even junk) DO show live in the
  poll's discussion + projection; the gate is only at the **global boundary** (plausibility at
  close decides what graduates to real entities/scores). The win is global protection, not a
  clean live board.
- **Separate bug — ingredients mis-classified as attributes (collection-prompt fix):** the
  coconut/garlic/ginger-as-`food_attributes` issue is NOT a plausibility problem — it's a
  **circular dependency** in `collection-prompt.md`: Step 3 classifies attributes (peeling
  ingredients into `food_attributes`) _before_ Step 4 composes the dish, so it decides "is
  coconut an attribute?" blind to the dish. Ideal fix = **holistic merge of Steps 3+4** (compose
  dish + ingredients/categories + qualities in one reasoning step with full mutual context) — a
  rule alone is a patch; the merge fixes it by construction. **Validate via DB replay** of stored
  raw inputs (no regressions; coconut-class fixed). Distinct task from the gates above.
- **Likes vs favorites still:** rate limits cap volume; favorites stay personal (above).

---

## 14. LLM call & model standards (apply across ALL calls — new and existing)

**Model tiers by task complexity (pricing verified Jun 2026):** Lite $0.25/$1.50 ·
Flash $0.50/$3.00 · 3.5 Flash $1.50/$9.00 per M tokens. Lite is genuinely HALF of Flash.

- **`gemini-3.1-flash-lite`** → simple classify/parse: **moderation, poll-subject, cuisine**
  (currently overspending on Flash — downgrade), place-chooser (already Lite ✓).
- **`gemini-3-flash`** → complex extraction/judgment: **collection, ontology adjudication**.
- **`gemini-3.5-flash`** → reserve; not worth 3–6× for routine work.

**Thinking config cleanup (legacy removal; empirically verified):** `thinkingBudget` is the
Gemini-2.5 param; Gemini 3 uses `thinkingLevel` (setting both = API error). Measured on
`gemini-3-flash` (same prompt): no-config ≈ HIGH (≈377 vs 384 thought tokens), **LOW ≈ HIGH on
easy prompts** (levels are _allowances/ceilings_, not fixed — HIGH diverges only on hard/long
prompts like collection), and **MINIMAL is the real floor (~0 thought tokens, ~5× cheaper)**.

- **`thinking.enabled=false` is a footgun:** it sends NO level → uncontrolled HIGH-sized
  thinking; it does NOT give "low/no" thinking. You can only get low/medium with a level sent.
- **Cleanup: remove `thinking.enabled` + `thinking.budget`; ALWAYS send an explicit
  `thinkingLevel`** — **MINIMAL** for cheap classify/parse (moderation, poll-subject, cuisine,
  query) and the real cost-saver; **LOW** for collection/ontology. No hard "off" on Gemini 3,
  but MINIMAL ≈ off.

**Note — ingredients mis-classified as attributes (collection-prompt fix, not ontology):**
the food run created `coconut`/`coconut milk`/`coconut curry` as _food_attributes_ — those are
ingredients, not attributes. Root fix is upstream in `collection-prompt.md` (don't emit bare
ingredients as attributes); the ontology REJECT rule is a backstop, not the primary fix.

**Structured output:** rely on the **native `responseJsonSchema`** (deterministic) — define
the schema in `llm-response-schemas.ts`; the prompt describes field _meanings_, NOT a literal
JSON skeleton (matches query/cuisine/chooser convention). `reason` fields are debug-only.

**Prompts:** principles-first + a few targeted examples (NOT example-dumps) — model new
prompts (ontology, poll-subject, moderation) on `query-prompt.md` / `collection-prompt.md`.
Module-local under `external-integrations/llm/prompts/` (root duplicates deleted).

---

## 15. Database cleanup & migrations (get to ideal long-term shape, not incremental patches)

- **Drop unused tables:** `poll_category_aggregates` (pseudo-mention bridge) — gone with §2.4.
  Audit for others orphaned by this work.
- **Reshape/rename to ideal long-term names**, not just additive columns: e.g. `PollOption`
  → leaderboard-projection shape; `PollVote` → endorsement model; new `poll_comments` /
  `poll_comment_likes` / `poll_leaderboard_entries`. Rename where a clearer long-term name helps.
- **Use real migrations** — author and run proper Prisma **migrations** (`migrate dev`/`deploy`),
  not `db push`/ad-hoc table creation, so prod has a clean, ordered, reversible history.
  (Dev so far used `db push` against an expendable DB; productionizing needs migration files.)
- Same DB-cleanup discipline applies to the entity-vocabulary/identity work (junk-attribute
  purge, restaurant un-merge) — do it via migrations + one-time backfill scripts.
