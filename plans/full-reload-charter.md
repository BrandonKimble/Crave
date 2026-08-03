# Full Reload Charter (2026-07-27)

The decision: a **from-scratch reload of Austin** — wipe the derived layer,
re-extract from stored inputs under the settled prompt. Worth it regardless
of price at this stage. NEW YORK IS NOT REPROCESSED: its raw corpus stays,
its 1,000-post catch-up is already banked, and we spend nothing re-running
it — but we must not open a chronological GAP for it either (see §5).

BECAUSE the reload costs real money, the prompt must be right BEFORE we
spend, not discovered wrong afterward. Iterate in LARGE spans: one big
audit, all issues found, one reload — not a loop of small loads each
costing the same as the full one.

## 1. MEASURED COST (pilot, 539 Austin docs, 7 runs, 27 min)

All-in $0.00382/doc — 9x the extraction-only ledger figure ($0.00043),
because that figure counts ONLY content.extract.

| caller                               | USD  | share | note                                              |
| ------------------------------------ | ---- | ----- | ------------------------------------------------- |
| content.extract                      | 0.69 | 34%   | input 92% CACHED (1.74M of 1.89M) — caching works |
| entity-resolution.match_batch        | 1.32 | 64%   | 432,727 OUTPUT tokens / 76 calls (~5,700 each)    |
| attribute.place + match + embeddings | 0.05 | 2%    |                                                   |

Projections at this rate: **Austin (39,495 docs) ≈ $151**; both metros
(71,528) ≈ $273. A FRESH-START wipe likely costs MORE than $151: this pilot
still had exact/alias matches to lean on (37 exact + 9 alias of 47); with
an empty entity table every string resolves cold.

AUDIT IN FLIGHT: entity resolution costs 2x extraction. Whether ~5,700
output tokens/call is necessary is being audited BEFORE we spend. Any
saving here compounds over every future collection run, not just this
reload.

## 2. DECISIONS RATIFIED (implement these)

a. **Category items count toward the RESTAURANT score only when no dish
exists under that category** — granular per category, not per
restaurant. A place can have burgers-with-dishes (excluded; the dishes
already carry the claim) and tacos-without (included). One claim,
counted exactly once, always.
b. **No support-vs-direct weighting, no split display.** Every endorsement
counts as one. The CATEGORY CARD is the explanation: "Tacos · 8" next to
"birria taco · 11" tells the story visually (the dish is always >= the
category under equal boost). No badge, no qualifier word.
c. **Fresh start scope:** wipe DERIVED — entities, connections + mentions,
signals, category edges, attribute evidence, adjudication tombstones.
KEEP raw truth — collection*source_documents, collection_extraction*
inputs, sources/lanes, users/polls/lists. VERIFY FIRST: count
user-generated references to entity ids (poll votes/targets, list items,
favorites, photos) — they FK to entities and will break.
RATIONALE for wiping tombstones specifically: archived entities are
resolution SINKS, so every junk/merge judgment made under the OLD prompt
is frozen and never re-adjudicated. A reload that keeps them inherits
the old vocabulary's mistakes.
d. **Keep archived entities in NORMAL operation** (FK safety + sink
efficiency); readers filter to active. The wipe is a one-time
fresh-start event, not a new policy.
e. **Tags reader filters entity.status='active'** (4,769 signal rows point
at archived entities today).
f. **Collection scheduler is PAUSED** (COLLECTION_SCHEDULER_ENABLED=false
on worker, 2026-07-27) so no collection interleaves with the reload.
MUST be re-enabled after.
g. **Prod attribute-evidence backfill MUST run before any prod projection
rebuild** — otherwise the derived array drops the ~78% of attributes
that came from Google/cuisine sources. (Moot if the fresh start wipes
attributes anyway — sequence deliberately.)

## 3. CADENCE (investigated, no fix needed)

Derived cadence is correct: austinfood 0.79 posts/day -> clamp(0.5\*1000/
0.79, 2h, 14d) = 14 days; foodnyc 12.29/day -> also 14d. The 14-day cap IS
the max interval (ARRIVAL_LOOKBACK_DAYS) — we never let a source go 633
days; the measurement horizon bounds it. Lanes still read cadence_days=1
because that's the BOOTSTRAP value and advanceLane only writes the derived
interval into due_at ON DISPATCH — last dispatch (2026-07-24) predates the
derivation shipping. Next dispatch self-corrects.
COSMETIC DEFECT: advanceLane updates due_at but leaves the cadence_days
COLUMN stale, so the column misreports the lane's real cadence. Scheduling
reads due_at so behavior is right; fix the column write for honesty.

## 3b. NESTED CATEGORY DOUBLE-COUNT — SUPERSEDED, DO NOT BUILD

Original plan: make banking symmetric (give category items their parent
categories) so a ROW-level rule could handle nested claims. That plan
assumed the row rule. It was replaced by CLAIM IDENTITY (d9e963da), which
resolves nested cases directly at the mention level.

VERIFIED SUPERSEDED 2026-07-28: same-document parent/child pairs still
counted twice under the shipped rule = **0**. The defect 3b existed to fix
does not exist. Its only residual effect would be letting a parent claim
boost a narrower CATEGORY item's score — a ranking nicety, not a
correctness fix — and it would require reordering projection-rebuild
(category items are deliberately built AFTER support attachment) for that
marginal gain. Building it now would be building on a stale plan.

## 3d. BATCH CACHE OVERLAP (found while red-teaming item 4)

There is no `caches.delete` anywhere in the codebase. The batch system
cache has TTL 30h and is replaced once it drops below 25h remaining, so
under continuous load a new cache is created roughly every 5h while the
previous ones keep billing storage to their full 30h — about 6 alive at
once, ~$0.10/hr (~$73/month at sustained load; less in practice because
load is bursty).

NOT simply a leak: the 30h TTL exists so an in-flight job cannot outlive
its cache under the Batch API 24h SLA, so deleting on replacement would be
unsafe while jobs reference it. The safe fix is retiring a cache once its
jobs are terminal, which needs job-lifecycle awareness. Recorded, not built
blind. It is now at least VISIBLE — this spend was unledgered until
03070df0.

## 3c. ASSERTED vs INFERRED CATEGORIES (designed, measured, DEFERRED)

Owner asked whether "Nixta has the best tacos - the duck carnitas taco is
unreal" should score +2 (the category claim respected in its own right)
rather than +1. Read the real text behind both shadow types:

- DISH shadows category (25 cases): 19 of 25 (76%) have the category word IN
  the document -- "Great coffee" + "their cold brew", "I ALSO recommend
  their cookies". These are genuine independent assertions. Owner is right.
- CATEGORY shadows category (731 cases): only 253 asserted. "I only buy
  Chilean Sea Bass" emits sea bass + seafood + fish -- ONE thing said, two
  ancestors INFERRED. Counting each would scale a comment by how deep a
  taxonomy the model happened to emit, and would systematically favor foods
  with deep category trees. That is noise, not signal.

So the distinction is ASSERTED vs INFERRED, not dish-vs-category. Ideal fix:
extraction MARKS the category the person actually named; inferred ancestors
never score alone.

DEFERRED, deliberately. Magnitude: 465 upvotes of 123,965 = 0.38% of score
mass, 152 restaurants, avg +3.1. And it is FULLY REVERSIBLE at zero cost --
shadowing is a QUERY-TIME rule, the category items and their mentions are
retained, and the raw documents survive the reload (§2c), so assertedness
can be computed later offline with no re-extraction and no reload. Against
that, building it now would add a NEW extraction obligation immediately
before we spend, and every prompt obligation examined this session has
leaked. Conservative under-count of 0.38% beats a new failure class at the
moment the audit is meant to be shrinking unknowns.

## 4. THE PRE-RELOAD AUDIT (the gate — do this BEFORE spending)

The prompt has NEVER been validated in full: the 13/13 replay predates the
two-axis parent rule AND the fusion rule. Required before the reload:

1. Re-run the 13-case regression under the CURRENT prompt (must still pass).
2. Large representative sample (>= 100 docs, random, all shapes) graded for
   EVERY failure class we know: menu-item labeling, fan-out, fusion
   compounds, two-axis parents, namespace leakage (dish nouns as
   attributes, meal-periods as categories), attribute emission, over-
   extraction/hallucinated dishes, wrong links, restaurant-name quality.
3. Hunt for classes we have NOT yet looked for — that is the point of "find
   ALL the issues now": sarcasm/negation, multi-restaurant comparisons,
   chains vs one-offs, non-English text, deleted/edited comments, bots,
   crossposts, very long threads, price/hours claims mistaken for dishes.
4. Only when the sample is clean do we wipe and reload.

## 4b. AUDIT CLASS RESULTS (2026-07-28)

NEGATION / SARCASM / MULTI-RESTAURANT COMPARISON — **CLEAN**, verified on
real cases where a document praises one venue and pans another. Extraction
attributed every one to the PRAISED venue:

- "Uchi is the best sushi I've ever had, but Uchiko isn't even on the same
  level" -> Uchi Austin (not Uchiko)
- "Shogun in Pflugerville. Kobe is bland as hell." -> Shogun (not Kobe)
- "Austin has the worst Whataburgers. P Terrys and ask for crispy fries"
  -> P. Terry's (not Whataburger)

DETECTOR FALSE POSITIVES — three of my own detectors measured themselves
rather than the system, which is why every number here is checked against
real text before it is believed:

- CLASS 1 flagged dessert/coffee/beer as illegal categories (they are
  legitimate "what" words) -> 7.5% and 15.8% were both artifacts.
- CLASS 3 graded inferred parent categories and ask-inheritance replies as
  hallucinations -> 36.5%, then 19%, both artifacts; real rate 3.4%.
- CLASS 6 flagged "community garden" and "Terrible Love" as junk restaurant
  names. Both are REAL Austin coffee shops. Real rate: 0.

STILL UNEXAMINED: chains vs one-offs, non-English text, deleted/edited
comments, bots, crossposts, very long threads, price/hours claims mistaken
for dishes. Minor open item: "crisp" extracted as a food from "ask for
crispy fries" (adjective fragment).

## 4c. PHASE-2 AUDIT CYCLE COMPLETE (2026-07-30) — THE GATE IS GREEN

The dedicated audit cycle ran as its own plan per the re-sequencing:

- UNEXAMINED CLASSES, now examined: CHAINS — one finding, In-N-Out exists
  as THREE entities (In-N-Out Burger / In-n-out / In N Out; a resolution
  class for the post-reload sweep, the same-name normalizer does not fold
  a differing word). NON-ENGLISH — clean; accented Spanish/Italian text
  extracts correctly. LONG THREADS — clean; the two zero-event 200+
  comment threads are a roach complaint and a price rant, and zero
  endorsements from complaints is CORRECT. PRICE/HOURS-AS-DISHES — real:
  "tuesday special", "lunch deal", "happy hour tasting menu" minted as
  foods; fixed with the predicts-the-food test applied to special/deal/
  menu heads (a head whose only food-content is special/deal/menu is no
  dish; "chicken special" survives, "tuesday special" does not).
- DIETARY EMPHASIS (owner ruling): lifestyle claims are never dropped —
  normalized to canonical terms, emitted on the appropriate side(s),
  because the hard toggles' entire coverage comes from these claims.
- FINAL COHORT under the final prompt (281 docs / 760 events): occasion
  leakage 0/243; ungrounded 1/130 (0.8%); attribute leakage 3/339 (0.9%,
  two being 'bbq' — an explicitly legitimate venue style); junk names 0.
- Vocabulary curation (dinner date → romantic alias) DEFERRED post-reload:
  the wipe erases current entities, so pre-reload alias curation is work
  thrown away.

## 7. EXECUTION RECORD (2026-07-30) — THE RELOAD IS RUNNING

- Prod deployed at 31da01ca (final prompt + all migrations), then worker at
  6bfb8107 with the FullReloadRunner.
- §2c verified ON PROD: 3,630 poll targets, 3,231 curated items, 646
  photo/list refs, 2 on-demand links — NOT negligible, so the wipe
  preserves user-anchored rows.
- INSURANCE: pg_dump of the four derived tables taken pre-wipe (90MB,
  session scratchpad) on top of the raw-truth re-derivability guarantee.
- WIPE EXECUTED on prod (scripts/reload/wipe-austin-derived.sql, rehearsed
  on local first): single clean transaction — 1,952 entities + 1,686
  connections preserved (counters zeroed), ~20,400 entities wiped
  INCLUDING tombstones (the charter's point), locations/edges/signals/
  events/mentions/scores wiped, non-reddit attribute evidence kept only on
  preserved restaurants.
- RELOAD RUNNING prod-natively (worker boot runner, RUN_AUSTIN_FULL_RELOAD
  =1): 39,463 docs across 47 runs, submission via Gemini BATCH (default,
  half price), every submission through the unified spend gate. First
  progress: 10/47 runs / 1,614 docs / 0 failed in ~30s. A deploy-overlap
  twin instance emitted a duplicate "starting" line and died before
  meaningful submission (single progress stream confirms one runner; any
  sub-run duplicate is ledger-visible and bounded).
- INCIDENT DURING INGEST (2026-07-30, resolved): one 53-item batch job went
  terminal-failed on `check_restaurant_attributes_exist` — preserved
  restaurants' attribute ARRAYS still referenced wiped attribute entities,
  and the CHECK re-fires on any later update. Fixed live: 1,654 preserved
  restaurants pruned to surviving ids, the failed job revived to
  'submitted' (provider results already paid; re-ingest clean), and the
  pruning step folded into the wipe script so the class cannot recur.
- SUBMISSION DONE 2026-07-30 07:39 UTC: 47/47 runs, 0 failures, 39,463
  docs; flag disarmed immediately (a crash-restart with it set would
  re-submit); ~50 batch jobs / ~2,000 chunk items draining.
- ~~OPERATOR TAIL~~ **EXECUTED — THE RELOAD IS COMPLETE (2026-07-30 ~13:20
  UTC).** Queue drained with ZERO failed jobs (both constraint-hit jobs
  revived and ingested clean); flag disarmed at DONE; scheduler re-enabled
  and worker redeployed.

  FINAL GRAPH (prod): 9,404 active entities (4,202 restaurants, 3,847
  foods), 11,694 connections, 4,673 category items, 79,871 events, 27,580
  mentions — rebuilt from 39,463 documents under the final prompt.

  GATE VERDICTS AT FULL SCALE:
  - occasion-as-category: 102 / 31,396 events = 0.32% (breakfast 915 and
    brunch 94 are RATIFIED categories, not leaks) — matches the audit's
    predicted ~0.4%.
  - plural splits: 5 pairs (was 186) — cross-batch creation-race residue;
    the dedupe sweep's number-variant lane clears them (calibration tail).

  MEASURED COST — CORRECTED against the Google billing export (owner
  asked; first-ever ledger-vs-invoice reconciliation): **~$143 all-in**.
  - Gemini ~$25 (extraction $7.30 at 91% cache hit + batch discount;
    resolution ~$14 cold-start volume at ~100 out-tokens/call — pre-fix
    this line alone would have been ~$150+; gate $0, verdicts reused).
    Billed $26.3 incl. same-key morning replays — within 5%.
  - PLACES ~$118 — the line every projection missed, mine included: the
    wipe deleted ~20k restaurants, the reload re-created ~4,200, and each
    re-creation triggered Places enrichment (2,773 details enterprise-
    atmosphere + 2,447 text searches). The LEDGER recorded it perfectly
    and TO THE CENT against the bill ($69.33 and $42.84 exact); the error
    was reporting the gemini column as "all-in". Pilots never wiped, so
    re-enrichment never appeared in any cost model.
  - Cache storage $5.37/day billed — VALIDATES the previously un-sourced
    $1.00/M token-hour rate and confirms charter 3d's overlap math.
    RECONCILIATION VERDICT: the meter matches the till.

  NEXT: the search calibration tail against this graph (linker re-sweep,
  ~44-name placement curation, richness threshold, junk sweep, dedupe
  number-variant pass, gazetteer cutover).

## 5a. INCIDENT (found 2026-07-31): the premise below was WRONG — the wipe was GLOBAL

The §5 plan assumed NY was untouched, but the executed wipe's deletes had no
community scope: NY's derived graph (43k+ events, its restaurants below the
place-grounding cutover, its connections) was destroyed as collateral on
2026-07-30. Nobody noticed because "NY continuity" was only verified as a
COLLECTION-cadence fact. Then, when the scheduler re-enabled, the foodnyc
keyword lane fired and — because extraction coverage is keyed to the PROMPT
HASH, and the reload changed the prompt — saw every thread its terms
surfaced as uncovered and re-extracted 20,563 NY docs (06:10–07:05 UTC
2026-07-31): 32 batch jobs, 7,577 interactive resolution calls, and ~4,792
Places detail enrichments re-creating NY restaurants the wipe had deleted
(it predated the restaurant law). Ungoverned spend, roughly $100–200 —
reconcile against BigQuery when the export lands (~24h lag).

CONSEQUENCES ENCODED (all landed 2026-07-31):

- Wipes are COMMUNITY-SCOPED forever: scripts/reload/wipe-city-derived.sql
  (ledger deletes by source-doc community; orphan-only entity deletion;
  REFERENCED-MEANS-ALIVE retires the stale-array bug class; user-anchor set
  shared with the anchor audit via preserved-anchors.sql).
- Deliberate re-runs go through CityReextractRunner, which REFUSES to start
  without an owner-approved spend campaign and threads the campaignId so
  batch spend meters the envelope.
- NY is currently PARTIALLY healed (20,563 of 47,963 extracted docs carry
  the new prompt; the remainder's derived data is gone until re-extracted).
  Remaining scheduled keyword/chronological cycles will keep trickle-healing
  it ungoverned. OPEN OWNER DECISION: finish NY deliberately via the
  re-extract pattern (~27k docs ≈ $12–15 LLM; Places ≈ already re-spent).

## 5. NEW YORK — no reprocessing, no gaps (SUPERSEDED BY §5a)

NY's raw corpus and its 1,000-post catch-up stay as they are. The risk is a
CHRONOLOGICAL GAP: with collection paused, new NY posts age out of the
1,000-post window (foodnyc runs ~12.3 posts/day, so the window covers ~81
days — ample, but not infinite). Before/after the reload, confirm foodnyc's
chronological lane resumes with a due date that does not skip arrivals. If
the pause runs long, run foodnyc's chronological lane ALONE (cheap, ~11
docs/run at Austin rates; NY is denser) to keep the window fresh without
touching the reload.

CONTINUITY VERIFIED 2026-07-30 (read-only, prod): foodnyc chronological
last ran 2026-07-25, due 2026-08-08 (the derived 14d cadence), newest doc
2026-07-25. Elapsed pause ≈ 5 days against the ~81-day window — ample
headroom; the lane resumes cleanly on re-enable with no skipped arrivals.

## 5b. RE-SEQUENCED INTO THE THREE-PLAN PROGRAM (owner 2026-07-30)

This charter is now PHASE 3 of a larger order: (1) the search rebuild's
STRUCTURAL work (plans/search-from-scratch-derivation.md) lands first —
it is graph-content-independent; (2) a dedicated FULL DATA AUDIT + PROMPT
REVIEW cycle (its own plan) produces the final prompt; (3) THEN this
charter executes (verify §2c, wipe, reload, re-enable, NY continuity),
followed by the search plan's calibration tail against the fresh graph.
Pipeline fixes are DEPLOYED (8961ef71, 2026-07-30) so prod already runs
the corrected prompt, scoring, and spend governor.

## 6. SEQUENCE

1. DONE 2026-07-27. Resolution-cost audit found thinking config lost at the
   callLLMApi seam (28af1b38) AND absent entirely in the relevance gate,
   whose ledger was also blind to thinking tokens (f12f4126). One shared
   resolver now owns thinking level for every assembler. All-in cost/doc
   $0.00382 -> $0.00045 (8.5x); Austin reload ~$151 -> ~$18; replay ~18x
   faster. Applies to every future collection run, not just the reload.
2. DONE 2026-07-27 (1b58d1d5): §2a per-category rollup admission (1,191 of
   1,706 category items are sole carriers and now count; 515 stay
   suppressed), §2e tags filtered to active (4,892 archived signal rows no
   longer surfaceable as tags), §3 cadence_days column now honest. §2b was
   already a no-op — no weighting exists to remove.
3. Run the §4 audit; iterate the prompt in LARGE spans until clean.
4. Verify user-reference counts (§2c), then wipe + reload Austin.
5. Re-enable collection; confirm NY continuity (§5).

---

## CORRECTION 2026-08-03 (truth audit F1245) — appended, nothing above altered

**This charter is HISTORY, not a runbook — three of the code paths it names
in the present tense no longer exist.** Verified 2026-08-03:

- `scripts/reload/wipe-austin-derived.sql` → **does not exist.** The successor
  is `apps/api/scripts/reload/wipe-city-derived.sql` (community-scoped, and it
  encodes the preserved-anchors / place-grounded-restaurant laws). The old
  filename survives only as a mention inside that file.
- `FullReloadRunner` → **0 hits.** The successor is `CityReextractRunner`
  (`city-reextract.runner.ts`).
- `RUN_AUSTIN_FULL_RELOAD` → **0 hits.** Re-extraction is now driven through
  `scripts/rig/reextract.sh` and the `/reextract` skill; see
  `plans/reextract-choreography.md` and `plans/austin-reextract-handoff.md`.

`preserved-anchors.sql`, `anchor-audit.sql` and `COLLECTION_SCHEDULER_ENABLED`
are all still real. The §7 completion figures and the "~$143 all-in" cost are
prod/billing facts and were NOT re-verified here (use
`./scripts/rig/cost-reconcile.sh` and the BigQuery export).

Also note: the "NEXT: search calibration tail" item predates the 2026-08-02
search cutover, which deleted the relaxation ladder and both mode flags and
made the pooled gate + gazetteer canonical. The tail that actually remains is
in `plans/search-from-scratch-derivation.md` §4 and
`plans/search-calibration-prebuild-handoff.md` (which now carries its own
correction note — two of its instructions point at the reversed answer).
