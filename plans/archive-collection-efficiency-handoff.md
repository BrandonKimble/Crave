# Archive Collection — Efficiency & Cost Handoff

**Date:** 2026-07-06
**Purpose:** (1) a durable record of the archive data work done this session, and
(2) a springboard for the **next** session, whose real topic is: _what is the
most ideal, cost-effective way to run archive collection?_ — with an explicit
mandate to **rethink the relevance / sentiment-gating design from the ground up**
(the owner is not sold on how we planned it).

> How to use this file: Sections 1–4 are the settled record (skim to get oriented,
> don't re-investigate). Section 5 is the **open design space** — that's where the
> next conversation begins. Nothing in Section 5 is a decision yet.

---

## 1. Where things stand right now (asset state)

- **Data lives OUTSIDE the repo, on local disk:**
  `~/crave-data/pushshift/archives/<subreddit>/<subreddit>_{comments,submissions}.zst`
  - **783 subreddits, ~70 GB** (the "CORE" tier — see §3).
  - Deliberately NOT under `~/Documents` / `~/Desktop` (those iCloud-sync; would try to upload 70 GB).
- **The pipeline reads it via one env var** in `apps/api/.env` (gitignored, machine-local):
  ```
  PUSHSHIFT_BASE_DIR=/Users/brandonkimble/crave-data/pushshift/archives
  PUSHSHIFT_LOCAL_BASE_PATH=/Users/brandonkimble/crave-data/pushshift
  PUSHSHIFT_LOCAL_ARCHIVE_PATH=/Users/brandonkimble/crave-data/pushshift/archives
  ```
  Verified: the service's real `path.resolve(baseDir, sub, file)` finds files there.
- **Git carries zero `.zst`.** The repo keeps only infra + docs
  (`apps/api/data/pushshift/README.md`, `S3_PRODUCTION_STRATEGY.md`, and the
  discovery manifest `candidate-subreddits.csv`).
- **S3 path already exists** for production: `PUSHSHIFT_S3_*` vars in
  `apps/api/src/config/configuration.ts` (~line 507). Local dir is the dev setup;
  flipping to S3 later is just config.

**Git caveat (shared tree):** this repo tree is worked by more than one session at
once (see project memory). During this session a branch `data/reddit-archives-2025-refresh`
was created for the two commits below, then removed by the concurrent session; HEAD
is back on `main`. The commit **objects still exist** and the on-disk end-state is
correct (no archives in git, data external, env wired), so nothing was lost — but
don't be surprised the branch is gone.

- `15dbc260` — refresh 12 subreddit archives through 2025-12
- `a1711be0` — move pushshift archives out of repo to external local store

---

## 2. The data problem we came in with

The repo's 12 food-subreddit archives (r/austinfood, r/FoodNYC, r/chicagofood, …)
stopped at **2024-12-31** — one year short of the intended "through end of 2025."
Coverage decays in value over time (places close, menus change), and the plan is to
ingest only a recent window per market anyway. So we needed fresher data AND a way
to scale the subreddit set worldwide.

---

## 3. What we did this session (settled record)

**A. Refreshed the 12 to end-of-2025.**

- Source: Watchful1's Academic Torrents dump `3e3f64de…` ("Subreddit
  comments/submissions **2005-06 → 2025-12**", top-40k subreddits, 3.97 TB total,
  zstd-compressed ndjson). The magnet the owner had _was_ the right (newest) one;
  the old local files were from the earlier 2024-12 dump.
- Tooling: installed **aria2** (`brew install aria2`); pulled only the needed files
  via `--select-file` against the torrent's file table (no full 3.97 TB download).
- Verified integrity + `created_utc` range on every file (first records unchanged,
  e.g. chicagofood 2011-01-12; last records now 2025-12-31).

**B. Discovered food-relevant subreddits worldwide (to scale beyond 12).**

- Key reframe: the download universe is a **fixed list of 40,101 subreddits** (the
  top-40k dump). The owner's manual method ("food in <city> reddit" on Google) only
  ever surfaces subs that are already in this list — so the task is **classification
  of a known list**, not open-ended web discovery.
- Pipeline: 40,101 names → gazetteer (GeoNames cities≥15k + countries + regions) +
  food/travel token filter → **5,558 candidates** → 12 parallel LLM classifiers →
  **1,218 relevant** → web audit across 60 metros (added 22; note: WebSearch can't
  scrape live reddit SERPs, so that stage leaned on model knowledge) →
  **1,240 relevant, downloadable subreddits.**
- Manifest saved: **`apps/api/data/pushshift/candidate-subreddits.csv`**
  (columns: `subreddit, category, place, relevance, reason, dl_bytes`).
- Size reality by tier (compressed): **metro-food 37 subs ≈ 1 GB**; **CORE 783 subs
  ≈ 70 GB**; **everything 1,240 subs ≈ 187 GB**. General _city_ subs are huge and
  noisy (r/vancouver ≈ 1.4 GB, mostly non-food); dedicated _-food_ subs are tiny and
  pure. There are also ~30 hyper-local food subs (bangkokfood, melbournefood, …) that
  exist on Reddit but are **not** in the top-40k dump — unobtainable via this torrent.

**C. Downloaded the CORE tier (owner's choice) and moved it out of the repo.**

- CORE = high-relevance `city + metro-food + travel + expat` = **783 subs, 70 GB**,
  now at `~/crave-data/...` with `PUSHSHIFT_BASE_DIR` pointed at it (§1).

---

## 4. How archive collection works TODAY (grounded map — don't re-investigate)

Flow: `.zst` files → **ArchiveIngestionService** loads _all_ posts (merges comments
under their post by id), chunks by 20, enqueues to Bull → **RedditBatchProcessingService**
→ **ExtractionPipelineService** chunks for the LLM → **one Gemini call per chunk**
runs the whole extraction prompt → mentions persisted as evidence → projections rebuilt.

- **Model:** `gemini-2.5-flash-preview-09-2025` (Flash, temp 0.1, maxTokens 65536).
  `apps/api/src/modules/external-integrations/llm/llm.service.ts:193`. Extraction call
  at `llm.service.ts:870` (`processContent`). **Prompt is already cached** (Gemini
  prompt cache, ~3h TTL).
- **Chunking:** ~35k tokens / 80 comments / 12k chars per chunk, comments sorted by
  score; first chunk `extract_from_post:true`, later chunks false.
  `apps/api/src/modules/external-integrations/llm/llm-chunking.service.ts:7`.
- **The extraction prompt is one big 6-step pass** that does relevance + entity
  extraction + **sentiment gate** in a single call:
  `apps/api/src/modules/external-integrations/llm/prompts/collection-prompt.md`
  - Step 1 = eligibility (needs a restaurant anchor + a quality/recommendation signal
    - timeliness) — this is the **relevance/positivity gate**, done by the expensive model.
  - Step 6 = sentiment & output; it **emits positive mentions only** and _discards_
    negative/neutral ones.
- **Pre-LLM gates today** = only **freshness** (skip if processed <21d ago) and
  **comment-delta** (skip if no new comments):
  `apps/api/src/modules/content-processing/reddit-collector/reddit-batch-processing.service.ts:317`.
  **Both are for incremental re-runs. On a first-time archive load they are no-ops —
  100% of the corpus is sent to the expensive model.**
- **Config:** `apps/api/src/config/configuration.ts:480` (`pushshift.*`, incl.
  `PUSHSHIFT_QUALITY_MIN_SCORE`, `EXCLUDE_DELETED/REMOVED`, S3 vars).
- Ingestion entry: `apps/api/src/modules/content-processing/reddit-collector/archive/archive-ingestion.service.ts`
  (`loadArchivePosts` currently loads the whole file — no date bound). Manual kick:
  `yarn workspace api ts-node scripts/archive-collect.ts --subreddit austinfood --wait`.

**The core inefficiency:** the model reads the full text of every comment just to
decide (in Step 1) that most are ineligible. You pay premium extraction tokens to
reject ~80–95% of content, and Step 6 then _throws away_ everything non-positive that
you already paid to read.

---

## 5. OPEN DESIGN SPACE — start here next session

The owner's launch economics: **launch Austin first, then NYC; ingest only a recent
window (~5 years) per market.** The goal is the most _ideal AND cost-effective_
collection design — and the current sentiment/relevance approach is **explicitly up
for a ground-up rethink** (consistent with the project's "uncompromising ideal"
ethos: design the best shape as if starting over, don't patch the existing one).

### 5a. Draft thinking from this session (NOT decided — a starting foil)

A cost-cascading funnel was sketched: cheapest filters first, so the expensive model
only sees dense residue. Filter at **thread** granularity (a "their brisket is unreal"
reply only resolves with its parent's restaurant).

- **Stage 0 (free, ingestion):** 5-year date window (biggest free win; nothing enforces
  it today), structural drops (bots/AutoModerator, deleted/removed, score floor),
  and the owner's rule — _0-comment posts survive only if the post body itself carries
  food + a recommendation_.
- **Stage 1 (free):** lexical thread gate — drop threads with no restaurant-shaped
  token AND no food-lexicon word.
- **Stage 2 (cheap):** a small model (Gemini Flash-Lite, already wired as
  `gemini-3.1-flash-lite-preview`) or embeddings — binary "does this thread contain a
  real recommendation?" gate.
- **Stage 3:** the current extraction prompt, on survivors only.

### 5b. Why the owner isn't sold — the real questions to resolve

Treat these as the agenda, not settled answers:

1. **Positive-only gating throws away paid-for reads.** Step 6 discards
   negative/neutral mentions after the model already read them. Is a _binary positive
   gate_ even the right model? Alternative: **collect mentions with a polarity/sentiment
   SCORE** (not a filter) and let downstream scoring (Crave Score) decide — richer
   signal, nothing wasted. What's the ideal contract between "collection" and "scoring"?
2. **Where should sentiment/relevance intelligence live** — folded into the one big
   extraction call (today), a separate cheap pre-stage (the funnel), or **not an LLM
   job at all** for the bulk (embeddings + heuristics), reserving the LLM strictly for
   structured entity extraction on high-signal spans?
3. **Judge vs. extract split.** Is the ideal a clean two-model separation — cheap model
   does relevance+sentiment tagging at scale; expensive model does _only_ entity
   extraction on what survives — and if so, should the cheap stage's judgment be
   _passed into_ extraction so it isn't re-derived?
4. **Granularity & unit of work.** Thread vs. comment vs. span. What's the right atom
   for gating vs. for extraction vs. for the sentiment signal?
5. **Batch economics.** Archive load is offline → Gemini **Batch API (~50% off)** is a
   natural fit but unused. Also revisit the **thinking-token budget** on the extraction
   call (reasoning tokens bill as output and may dominate).
6. **Is the extraction prompt itself the cost driver?** The 6-step prompt is elaborate.
   Would a leaner extraction contract on a pre-qualified, dense set be both cheaper AND
   higher-precision?

### 5c. Suggested first moves (once the design is settled)

- Lock the _free_ wins regardless of the sentiment redesign: **5-year window +
  structural gate** at ingestion (unblocks the Austin load, zero LLM cost).
- **Measure before committing:** run a Stage-1/Stage-2 prototype over a real 5-year
  Austin slice from `~/crave-data` and report keep-rate + projected token deltas.
- Then decide the sentiment/relevance architecture (§5b) with real numbers in hand.

---

## 6. Quick reference

- **Data:** `~/crave-data/pushshift/archives/<sub>/<sub>_{comments,submissions}.zst` (783 subs, 70 GB)
- **Manifest of all 1,240 relevant subs:** `apps/api/data/pushshift/candidate-subreddits.csv`
- **Env:** `apps/api/.env` → `PUSHSHIFT_BASE_DIR` (+ two local-path vars)
- **Torrent (for pulling more subs later):** academictorrents `3e3f64dee22dc304cdd2546254ca1f8e8ae542b4`
  (2005-06 → 2025-12). Tool: `aria2c --select-file=<idxs> <hash>.torrent`. To expand
  coverage, pick names from the manifest, map to file indices from the torrent's
  `aria2c -S` file table, download, drop into `~/crave-data/...`.
- **Key code:** `collection-prompt.md` (Steps 1 & 6 = relevance + sentiment),
  `reddit-batch-processing.service.ts:317` (gates), `llm.service.ts:193/870` (model/call),
  `llm-chunking.service.ts:7` (chunk limits), `archive-ingestion.service.ts` (loader —
  add the date window here), `configuration.ts:480` (`pushshift.*`).
  </content>
