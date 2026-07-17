# Geo/Demand Foundation Rebuild — From-Scratch Design of Record (v3)

Status: **RATIFIED (owner, 2026-07-16)** — v3 red-teamed (2 independent agents +
synthesizer pass), dispositions in §14. §13 resolved: (1) localized display +
local-script alias kept; (2) big-place polls feed-only at that zoom, no push;
(3) VOTERS_NEEDED = 15 ratified; (4) dual-write = one milestone, hard deletion
date. Derived from requirements only;
no decision preserves existing code; all data trashable. SUPERSEDES the market/
demand/minting/poll-scheduling sections of plans/viewport-only-location-centric-
plan.md; its Legs 1, 2, 6 are ratified inputs restated in §7–§8.

## §0 The story (requirements)

R1. The map is the query — whatever is in view, any zoom, anywhere on earth.
R2. The header always names where you look, or honestly says "this area"; never
    waits on a vendor; never confidently wrong.
R3. Nothing a user does is wasted — every act (including a paid vendor probe)
    permanently improves the app's knowledge. Retroactively.
R4. Polls bootstrap any place; Engines collect where attached. Same laws
    everywhere on earth.
R5. A place's first content is consensus content — and it must be content that
    gets ANSWERED, not just wanted (ghost polls are worse than none).
R6. No single act is loud; influence accumulates across distinct people.
R7. Equal collection effort; audience equalized by math; passion-per-audience
    is the signal.
R8. Solo-dev economics: TomTom cheap pool ~20k/mo (reverse/geocode), scarce pool
    ~2.5k/mo (polygons); Google Places per-verification; LLM costs; heavy work
    scheduled, never in-request.
R9. No arbitrary thresholds. Capacity + queues + control loops; constants are
    meaning-constants (scale-free statements about the product).
R10. Observe at write; judge at read — for judgments AND for identity. History
    survives every future re-weighting, re-definition, and merge.

---

## §1 Place Catalog: a containment DAG (no level enum)

**places**: { placeId, name (+localized alias policy §13.1), providerLevelCode
(OPEN vocabulary string: municipality, municipalitySubdivision, county,
subdivision, country, … — stored, never switched on), parentPlaceIds[] (edges
captured from the reverse-geocode response chain at creation — geometry is
never used to derive hierarchy), countryCode, subdivisionCode?, centroid, bbox,
timeZone (offline centroid→tz lookup at creation — load-bearing for §4 ticks),
provider, providerPlaceId?, createdAt }. Tier-2 geometry lives in a side table
**place_geometries** { placeId, polygon, providerBoundaryId, fetchedAt } — tier
is explicit, the hot naming row stays lean.

- **Identity law** (silent-fork prevention): placeKey = (countryCode,
  subdivisionCode?, providerLevelCode, normalized name); conflicting sketch
  upserts bbox-merge; the provider's stable boundary id becomes an alias at
  tier-2. Idempotent on placeKey.
- **Roles are attachments**: any place hosts polls; every place accrues demand;
  some places anchor sources/engines (§5). No place types, no capability flags.
- Neighborhoods/boroughs/wards are first-class (the geocode chain supplies
  them). Brooklyn exists. Chongqing's counties exist. French communes exist,
  and their near-zero audience is handled by §4's yield loop, not by excluding
  them.
- US pre-seed (~19.5k municipalities, ~$50): tier-2 entries + parent edges;
  ratified accelerant. The universal growth mechanism is §2.

## §2 Naming: observe every probe; judge subjecthood at read

**Probes are observations — every probe result is written.** (Red-team fix: the
old design discarded paid answers that failed the dominance test, causing
unbounded re-probing over rural/ocean/region-zoom views.)

- Reconciler, per settled viewport (background; reads NEVER wait):
  1. If stored places / no-place observations already answer the anchors → done.
  2. Probe budget: at most ⌊1/ATTENTION_FRACTION⌋ = 3 anchors per view (anchor
     candidates: center + largest-uncovered-region points; the "remainder" is
     approximated by candidate anchors not covered by known bboxes — stated,
     not improvised).
  3. Each probe (cheap pool) returns the full chain (neighborhood → city →
     subdivision → country) + bboxes: **sketch every node in the chain
     unconditionally** (name+bbox+parents+tz). "No place here" is recorded as a
     region-scale observation (the probed viewport's bbox, 30d TTL) — not a
     1km disc.
- **Subjecthood is a read-time judgment** with SYMMETRIC commensurability:
  - too small (covers < ATTENTION_FRACTION of the view) → not the subject;
  - too big (view covers < ATTENTION_FRACTION of the place) → not the subject
    either — descend the DAG to the commensurate node (street-zoom inside
    Chongqing names the county/ward, not the 82,000km² municipality).
  - Header: commensurate covering place's name, else "this area". Hysteresis:
    commit on settle+dwell; enter/exit asymmetry so boundary zooms don't flap
    (sim eye-check case in §12).
- **Tier-2 promotion (polygon, scarce pool) — earned moments:** (a) poll
  created there (the ONE blocking caller — spinner OK; in a cheap-pool drought
  the poll is created against "this area near (lat,lng)" or a creator-typed
  name, backfilled later — never blocked); (b) source/engine attached;
  (c) DERIVED pre-fetch: credit + creditRate × Δt_to_next_tick ≥ 1 (no 0.8
  constant); (d) batch seed; (e) frequent header-answering by a sketch joins
  the promotion queue (the most-shown names earn precision first; until then,
  when bbox dominance and the probe's point-answer disagree, prefer the
  point-answer).
- Negative cache regions, single-flight per cell, idempotent upserts, quota
  ledger, graceful scarce-pool degradation (sketches keep working) carry over.
- Viral stampede property: first probe sketches; all later resolves hit the
  catalog. Self-extinguishing at every zoom by construction.

## §3 The Signals Ledger

**signals**: { signalId, kind, subjectType (entity | term | none), subjectId?,
subjectText?, geo bbox (ALWAYS a bbox; a point is a zero-area bbox), actorId
(pseudonymous; the actorId→user mapping is a separate severable table — the
deletion story), occurredAt, meta }. Append-only, IMMUTABLE (never updated,
never rekeyed), permanent, monthly partitions.

- **Kinds are ACTS, qualifiers are meta** (red-team fix — judgments were frozen
  into the enum): search {resultCount, restaurantCount, cached, resolvedEntity},
  autocomplete_selection, entity_view, favorite_added, poll_vote, poll_comment,
  poll_created, **viewport_dwell** (subjectless attention — browsing IS demand;
  geo + actor + dwell time). "Unresolved/low-result" are read-time derivations
  from meta, re-definable forever.
- **Identity is a judgment too**: entity merges never touch the ledger; readers
  resolve subjectId through entity_redirects at read (merge-reversible, R10).
- **Attribution law (written down, one law):** each signal is attributed to
  (i) the smallest place CONTAINING its geo (you're inside it — plus nothing
  else from the containment chain; ancestors get their mass via inherit-down,
  not duplicate rows), and (ii) the coarsest catalog level(s) that TILE the
  places CONTAINED in its geo (a US bbox → one `US` row; a Texas bbox → one
  `TX` row; a metro bbox → its handful of towns). Containment, never
  intersection — partial bbox clips credit nothing (kills sliver showers).
- **Read-time inheritance (owner-ratified weight-1 semantics, made cheap):**
  a place's demand = its own rows + ancestor rows at weight 1 (Waco = Waco
  rows + TX rows + US rows). Every town in a statewide search's view is
  influenced at full weight; storage is O(few) per signal; a place accrues
  OWN-level rows only from attention at its own scale (Texas-scale polls only
  from genuine Texas-scale attention — the hierarchy bomb is dead).
- **Aggregate**: day × actor × place × subject × kind rollup, **incrementally
  built** (append-only ledger ⇒ historical days immutable; only today rebuilds;
  redirects applied at read) — the 15-min full-window delete+insert dies.
- Ported readers (substrate swap, behavior kept): recent searches, autocomplete
  popularity/affinity, query suggestions. Signal writes are fire-and-forget
  (never fail the user action). Retention: permanent BY DESIGN; deletion =
  severing the actor mapping.

## §4 Demand readers

**Demand mass** per (place, subject, window): Σ_actors log2(1 + Σ signals ·
kindWeight · recencyWeight); kind weights = one read-side config (carried
initial values; viewport_dwell starts small); recency 7d flat + 14d half-life.
Curve kernel carried (saturating log per actor, gaussian cooldown recovery,
surge-over-baseline). Anonymous actors: bucketed per-device actorIds.

**Reader 1 — Poll seeder (per-place credit; a CONTROL LOOP, not a gate):**
- The meaning-constant: **VOTERS_NEEDED ≈ 15** — "a poll is consensus when ~15
  people answer it." Scale-free product sentence.
- creditRate(place) = weeklyDemandMass × answerYield(place) / VOTERS_NEEDED ×
  conversionPrior, where **answerYield** is the observed answers-per-attention
  for THIS place with the global conversion rate as prior (poll_vote signals
  close the loop — the seeder reads outcomes, not just wants). A demand-rich,
  audience-dead place (remote trip-planner demand) asymptotes to zero seeding
  automatically; an answering town accelerates. Ghost-poll factories are
  structurally impossible — and it self-scales with any traffic volume (the
  conversion is measured, never tuned). No POLL_COST constant exists.
- credit decays (14d half-life); bank cap 3.
- **Daily tick at the place's local 09:00, spend ≤ 1 credit per tick** (rhythm
  is real, not a Sunday burst; ≤3/week emerges from cap + daily spend).
  Publish = atomic (spend + poll row + archived topic birth-certificate with
  factor breakdown) with idempotency key (placeId, localDate); per-place jitter
  within the minute. Subject choice: demandMass × cooldown(28d gaussian) ×
  resurgence (kernel constants §9). Credit with NO ranked subject publishes the
  structural bootstrap poll ("Best restaurants in {place}") — browse-only towns
  cold-start (viewport_dwell feeds their mass).
- Seeded polls: 7-day window stored; origin seeded; allowUserAdditions (options
  are user-added and Google-verified per-add — engagement-priced, no publish-
  time vendor spend). User poll creation unchanged (2/user/place/week).
- Notifications: devices whose home place (placeAt of device location) is the
  poll's place or a descendant — never a city-string match; big-place (state+)
  polls notify nobody by default (§13.2).
- Traces (factor breakdowns incl. answerYield) written AND readable (ops
  endpoint) from day one.

**Reader 2 — Engine collector:** slices as capacity allocation (unmet 5 /
refresh 10 / demand 8 / explore 2 per community tick; hot-spike hourly ≤10).
Unmet input: read-time-derived unresolved/low-result signals attributed to
member places. **Deficiency**: rep(term, engine) = calibrated term mass ÷
engine's aggregate room (per-source g, §8); deficiency = max(0,
median_over_engines(rep) − rep) × askerBreadth × recency. **Degenerate law at
n=1 engine (launch state): deficiency falls back to raw attributed demand mass
+ result-count severity** — the ranking is alive from day one. Attempt ledger
(cooldowns, 45d no-results recovery ramp) is collector state.

**Reader 3 — Expansion analytics:** same aggregate at subdivision/country rows
(native under the tiling law): which subjects, which geographies, which place
gets the next source/engine. First-class ops view.

## §5 Sources and Engines (source = the calibration room)

**sources**: { sourceId, platform (reddit | poll_surface | facebook | …),
handle, anchorPlaceId, engineId?, cadence, createdAt }. **A(τ) and g are
per-SOURCE** (a room is a room): each mention divides by ITS OWN source's g.
Adding a source never re-weights other sources' mentions (monotone).
- **Every place's poll surface IS a source** (platform poll_surface, anchored
  to the place): graduated threads are its documents; its A is its poll
  audience. Poll-sourced mentions are calibrated from day one — the old
  "deferred poll-A" item does not exist. Rule: poll threads ALWAYS belong to
  the place's poll source, never to a territory engine's Reddit sources.
- **engines**: { engineId, memberPlaceIds[], sources[] }. Territory = derived
  union (read-time / materialized view), never stored fact. Overlap is a
  discrete membership question (default: disjoint membership enforced).
  Operator-attached (collection costs money). Everything "collectable" keys
  off engines; scoring provenance + fame-pin derive from membership.

## §6 Polls surface (carried, restated)

Feed = polls of places in view (+ descendants of the commensurate subject);
CURSOR PAGINATION prerequisite. Header per §2 dominance ("Polls in this area"
multi-place state). Slicer chip: options ranked by feed contribution,
searchable sheet, subdivision section headers. Per-poll place labels: batch
lookup. Graduation + poll option entity-creation carried (geo-bias from place
geometry). **Cold-start promise state** (empty poll feed in a seeded town):
"Polls drop daily at 9 — this town's first unlocks as people search and vote"
— dead reads pre-natal, not abandoned. Poll-only entities render as
**"Community pick · N votes"** (no score number) until they accrue calibrated
corpus — uncertainty = absence, honestly.

## §7 Search-side interfaces (ratified inputs; unchanged)

Viewport-only search + coverage (no market filter anywhere; dots
one-per-location; 50k LIMIT deleted; DTO page-size validation; label purge +
attachMarketNames deletion; 3-step coverage-dto deploy). Location-centric
interaction (single-location selection; profile = all locations distance-
sorted collapsed; cache key restaurantId; locations array ~30 nearest;
See-locations mode; favorites/history locationId hard cutover; fame-pin =
location inside score-provenance territory). Search needs nothing synchronous
from the catalog.

## §8 Score calibration (ratified, upgraded to per-source rooms)

A_source(τ) = Σ its gate-passing documents · 0.5^(age/τ), lanes {365d, 21d};
g_source = max(A, A_floor)/A_ref (pinned A_ref; floor clamp). Calibrated
counts: each mention ÷ g of ITS source, inside log1p; v3 pipeline unchanged
downstream. Build items: g primitive (shared with §4 deficiency);
source_document_id on item mentions; retention invariant. Fixture-gated +
kill condition; old fixture suite resurrected. Timing: with this wave.

## §9 Meaning-constants (complete; anything else is derived, measured, or a
## capacity allocation)

365d/21d mention half-lives · 7d cycle + 14d demand half-life · 28d poll
cooldown gaussian · 21d/0.35 resurgence credit · 0.7/+0.5 resurgence boost ·
baseline floor 3 · surge knee 1 doubling · 45d no-results recovery ramp ·
ATTENTION_FRACTION 1/3 (probe budget 3 + commensurability, both directions) ·
VOTERS_NEEDED ≈ 15 · bank cap 3 + daily spend ≤1 (⇒ ≤3/place/week) ·
2 user-polls/place/week · 7-day poll window · slice portfolio 5/10/8/2 +
hot-spike 10 · A_floor/A_ref (fixture-set) · no-place observation TTL 30d ·
kind weights (read-side config). POLL_COST does not exist; the 0.8 pre-fetch
does not exist (derived); the 40 and flat-3-eligibility do not exist.

## §10 Kill list

Market model + type enum + raw-SQL type lists · level enum (open codes + DAG) ·
minted/named/collectable vocabulary · display-market election + 5% tie band ·
mint-in-read-path + blob anchor + US-only gate + write-gating subjects test ·
1km negative-cache discs (region observations) · 40 budget · flat-3
eligibility · ready-topic pool + draft + nightly cron · server-local tz gate ·
4-day seeded-window accident · per-kind demand tables + 15-leg aggregation +
full-window rebuild + dead term legs/methods · on_demand request/cooldown
tables · ledger rekeying on merge (redirects) · raw userId on ledger rows
(actor mapping) · notification city string-match · geo union type · POLL_COST ·
marketKey on rows/profile/coverage (Legs 1–2) · write-only traces.

## §11 Migration (tear-down; data trashable)

Phase A — substrate: places DAG + signals + redirects + actor mapping; signal
writes on all acts (dual-write beside old logging for ONE milestone, deletion
date set); US seed import; g primitive + mention provenance.
Phase B — consumers, one at a time with fixtures: resolution/header →
catalog + read-time subjects; aggregate → incremental tiled rollup;
autocomplete/recent/suggestions → ledger readers; poll seeder → credit control
loop (both old crons + ready pool die); collector → slices/deficiency;
expansion view; score calibration with per-source g.
Phase C — drop everything in §10. Old-plan Legs 1–2 execute independently
(search-side) and may precede or parallel Phase A.

## §12 Verification stance

RED-provable fixtures: ghost-town yield loop (demand-rich/audience-dead place
stops seeding); one-searcher town never seeds; modest town monthly; Austin
≤3/wk; ×50-traffic supply sanity; retroactive-credit golden (late-sketched
place); tiling/inheritance goldens (US/TX/metro/point signals); subjects cases
(two towns / continental / city+slivers / street-zoom-in-Chongqing / enclave);
boundary-zoom header hysteresis (sim eye-check); region-zoom stampede
self-extinguishing; quota-drought degradation incl. poll-creation fallback;
score suite + kill condition; deficiency n=1 law. Every scheduler trace has a
reader.

## §13 Owner decisions still open

1. Name locale policy: store local script + request app-locale alias (same
   free call) — display which? (Recommend localized display, local alias kept.)
2. Big-place polls (subdivision/country level): seedable at genuine state-scale
   attention — but who gets notified/sees them by default? (Recommend: feed
   at that zoom only, no push notifications.)
3. VOTERS_NEEDED ≈ 15 — ratify the number.
4. Dual-write milestone length (recommend: one milestone, hard deletion date).

## §14 Red-team disposition (for the audit trail)

Adopted from abstractions lens: DAG + open level codes (Brooklyn/Chongqing/
communes) · kind=act+meta · per-source rooms (dissolves poll-A deferral) ·
engine=member set · sketch identity law · VOTERS_NEEDED derivation · dwell
kind + bootstrap poll · redirects + actor severing · geo-always-bbox · daily
tick spend ≤1 · deficiency n=1 law · header point-answer preference +
promotion-by-header-frequency · derived pre-fetch · §9 completeness fixes.
Adopted from behavior lens: answer-yield control loop · observe-every-probe +
region-scale no-place observations + probe budget · symmetric commensurability
· publish atomicity + tz sourcing + jitter · geo-join predicate written down ·
header hysteresis · cheap-drought poll-creation fallback · poll-source
identity rule · cold-start promise state · community-pick badge.
REJECTED (owner-ratified grounds): attribution-by-subjects-only (would reverse
weight-1-everywhere; replaced by tiling + inherit-down which achieves the same
hygiene) · global poll-seeding capacity queue (the 40-budget reborn; replaced
by the per-place yield loop which self-scales without starvation). Corrected:
"Google spend at publish" claim (options are user-added, priced per
engagement).

---
---

# PART II — Collection & Score (v2, red-teamed 2026-07-16; dispositions §25;
# RATIFIED by owner 2026-07-16)

## §15 Collection story (extending §0)

C1. An engine keeps its territory's corpus fresh, complete, demand-responsive,
    at equal effort per source, inside API budgets.
C2. Sources are first-class rooms; collection behaviors attach to sources via
    PLATFORM ADAPTERS (each platform declares its lanes, cadences, costs).
C3. Demand reaches collection only through the signals ledger/aggregate.
C4. Selection judgments are scheduler-side reads; per-source OBSERVED-COVERAGE
    INTERVALS are first-class facts (the primitive under cursoring, archive
    sweeps, and score normalization).
C5. Evidence = event-sourced projections (documents → runs → events →
    active-pointer projections). RE-DERIVED AND KEPT.
C6. Extraction machinery (chunking, batch leases/cache, quarantine) KEPT with
    §18 fixes.
C7. **Money is gated wherever it is committed** (LLM spend gets the same
    budget-object treatment Part I gave TomTom): preflight estimates, approval
    states, monthly budget line, degradation instead of silent commitment.
C8. **Every lane has an output-derived heartbeat that can show RED** — proven
    RED in staging (kill credentials, wipe a queue) before being trusted.
    Legit-zero and broken-zero must be distinguishable.

## §16 The source-centric collector (v2)

- **Platform adapters declare lanes.** reddit: chronological (unbiased sample),
  keyword (biased/pull), archive (backfill). poll_surface: push-complete, zero
  pull lanes (no cadence rows — no exemption needed). Future platforms declare
  theirs. The planner iterates cadence rows knowing nothing about kinds; the
  closed KIND_COST map and the '__global__' sentinel row die.
- **Cadence rows per (sourceId, lane)**, seeded by the adapter at attachment.
  Lane state lives ON the lane row (chronological cursor is chronological-lane
  state).
- **Observed-coverage intervals** per (source, lane): the chronological cursor
  advances AT EXTRACTION-RUN CREATION (the honest "this window entered the
  evidence system" fact — enqueue-time advance recorded intent as outcome);
  archiveCoveredThrough is a fact, and archive sweeps are DERIVED whenever the
  archive index extends past it (never "once at attachment"); a coverage-gap
  reconciler (expectedBatches per parent vs extraction-run rows, hourly)
  alarms on shortfall — it is also the migration drain-check.
- **Planner reads measured budget**: cycle capacity = rate-coordinator headroom
  over the horizon; each dispatch declares its expected request count (keyword:
  terms × sorts; chronological: listing pages + observedDocsPerDay detail
  fetches). Static budget-12/KIND_COST die. Deferred-by-budget is a counted,
  alarmed condition, not a log line.
- **docsPerDay sampling-frame law**: derived only from adapter-declared
  unbiased lanes (chronological pull, push-complete). Keyword hits never feed
  it. Cold start: archive sweep or adapter prior. And it is computed over
  COVERED days (coverage intervals), so a dead lane cannot masquerade as a
  quiet room (kills the safeInterval self-soothing loop).
- **Archive sweeps are money-gated (C7)**: onboarding returns a preflight
  estimate (doc count × measured per-doc cost from the usage ledger); the
  sweep enqueues as `proposed` and requires explicit spend approval above the
  monthly LLM budget line; chronological runs regardless (degradation, not
  blockage).
- Onboarding verb = engine (member places) + sources + adapter-seeded lanes +
  proposed archive sweep with its price tag.

## §17 Selection (v2): term due-times are the schedulable unit

- **The unit is (engine, term) with a nextDueAt**, written by the judgment
  families as due-time writers under portfolio capacity: unmet/deficiency,
  refresh (staleness), demand, explore, and SURGE (hourly reader over the
  aggregate — the hot-spike lane, its sentinel row, and its ≤10 cap dissolve
  into surge-written due-times). Cooldowns become due-time arithmetic
  (success → +7d, error → +1d, no_results → gaussian-recovering horizon).
  The planner batches due terms per source into dispatches (1200ms spacing,
  limit=1 mechanics unchanged — ratified cost levers).
- Slice quotas (5/10/8/2 of 25) remain the portfolio CAPACITY; backfill
  weights (1.2/1.1/1/0.65) are demoted to PRIORS PENDING MEASUREMENT (each
  gets a meaning sentence; measured per-slice yield — new calibrated mentions
  per dispatched term — may drift them within guardrails later).
- **Deficiency is one continuous formula**: deficiency = localDemand × (1 +
  crossEngineGap × evidenceWeight), evidenceWeight growing with peer count
  and peer corpus maturity (0 at n=1 — the launch behavior falls out as the
  zero-evidence limit; an empty engine #2 barely perturbs #1; no branch).
  The ×askerBreadth local factor is load-bearing (it is what prevents
  cross-market taste homogenization) — stated, not decorative.

## §18 Evidence & extraction (v2)

KEEP: source documents, prompt-hash extraction coverage + thread trimming,
SRC-ref chunking (35k/80), batch machinery (leases, 5-min poller, 30h cache,
purpose registry — best crash-safety in the codebase), per-chunk quarantine,
stale-run reconciler, one-generation compaction + replay, mentionKey dedupe,
active-run pointer, projection full-replace, usage/decision ledgers (each
gains a minimal ops reader).

FIXES (all red-team-driven; dispositions §25):
1. **Persist first, gate as ADMISSION.** Every fetched document is stored
   (the fetch was paid for); the relevance verdict becomes an extraction-
   admission judgment keyed by promptHash, consulted at chunk-plan time,
   re-derivable via replay. The one destructive write-time judgment in the
   system dies. Prompt changes re-judge lazily on re-encounter, PLUS a
   money-gated backfill queue (capped N docs/day) with a preflight count.
2. **The CHUNK is the coverage/commit unit** (run = provenance/reporting).
   Whole-run failure discarded nine good chunks' coverage and re-billed them;
   correctness never needed run atomicity (mentionKey + quarantine already
   hold it). The reconciler re-enqueues exactly the missing chunks.
3. **Rate-limit results are ERROR OUTCOMES, never empty successes.** The
   getChronologicalPosts/searchByKeyword swallows die; a rate-limited fetch
   fails the Bull job (dead-letter alarm for free); pages already fetched are
   kept, not discarded. A rate-limit can never brand a term no_results (60d
   cooldown) — only error (1d).
4. **Always-green liars purged**: worker success:false-as-completed →
   real job failures; getHealthStatus's hardcoded 100% success → measured;
   mentionsExtracted-never-updated → expectedBatches reconciler (C8);
   planner deferred count → alarmed; surge-reader input-liveness check
   (ledger rows > 0 while app traffic > 0, else RED).
5. **Reddit client**: retry loop implemented THROUGH the rate coordinator
   (retryAfter honored globally, no per-call stampedes); searchEntityKeywords
   routed through makeRequest; **token minted only on expiry** (per-call
   authenticate dies — the account-suspension signature); per-source daily
   request ledgers (TomTom-quota analog); at ≥10 engines, sources shard
   across multiple registered apps with per-app coordinators (one suspension
   degrades, not kills). Owner item: honest official-API contract evaluation
   before 40 engines (§24.4).
6. **Scoring decoupled from collection completion**: collection sets a dirty
   flag; a SINGLETON debounced scheduled rescorer (hourly-if-dirty, advisory
   lock) owns global rebuilds. Kills: 50–100 racing unserialized rebuilds/day
   at scale, the final-batch-is-a-proxy bug (batch 12/12 completing while 7
   retries), swallowed rebuild errors, and it creates the scoreVersion seam
   §20/§23 require. Crave-score runs get the stale-run reaper.
7. Dead code purge (unchanged from v1) + ContentRetrievalMonitoring deleted
   only after its signal has a replacement reader.

## §19 Resolution & graph (v2)

- **Identity is GLOBAL; territory is a retrieval PRIOR, never a filter.**
  T1 exact/alias lookup unscoped (name+geo already discriminative); recall
  ranks with geo-bias from the source's territory; creation anchors to the
  geocode/verification result, source-territory anchor only as the
  zero-evidence provisional. Resolution lanes key on GEOMETRIC PRESENCE
  (where the restaurant is), not creation market. The Dallas-restaurant-in-
  r/austinfood case creates one entity, correctly anchored — cross-territory
  duplicates and every-engine-attachment merge-debt waves die as a class.
- Everything else KEPT as v1 (3-tier + tombstones + overlay judge + ontology
  quarantine + merges + dish knowledge; ledger immutability shrinks merge
  rehome to projections + product tables).

## §20 Score — RE-RATIFIED with SIX conditions

Conditions 1–5 as v1 (per-lane A_ref/A_floor; poll fake-elite closure +
vote↔upvote exchange-rate ratification; upvote-linearity named gate with
u/ū_source path; Phase-0 dial re-probe on calibrated masses; author-
concentration fixture). NEW:
6. **A is coverage-normalized** — activity per OBSERVED day within τ
   (documents ÷ covered days from §16's coverage intervals), so per-source
   cadence variability cannot masquerade as room size; fixture: two synthetic
   rooms with identical activity at 1d vs 60d cadence must calibrate equal.
Stated for the record: poll_surface documents are gate-exempt and count in A
by construction (food-framed); the denominator definition is platform-declared,
not implicit.

## §21 Kill list (Part II, v2)

v1 list PLUS: KIND_COST + static cycle budget · '__global__' sentinel +
ensureGlobalHotSpikeRow + the hot-spike lane as a lane · the n=1 deficiency
branch · gate-before-persist ordering · rate-limit empty-success swallows ·
hardcoded-green getHealthStatus · per-final-batch rescore trigger ·
per-call authenticate · collectableMarketKey in collector job payloads +
attempt-history keys (verify the Legs 1–2 purge covers collector-side) ·
"capacity" labeling on the backfill judgment weights.

## §22 Constants (v2 corrections)

750 = Reddit 1000-post ceiling × 0.75 safety (stated as derived) · the two
21d constants (chrono freshness / fast score lane) are UNRELATED — renamed
distinctly · 5/3 delta probe + boost ≤2.5 get meaning sentences or priors
labels · slice quotas = capacity; backfill weights = priors (see §17) ·
everything else per v1 inventory.

## §23 Migration (v2 — the race rules)

1. **Ledger-window rule**: dual-WRITE runs ≥ the longest read window (21d)
   before any reader cuts over; readers cut one at a time with old-vs-new
   comparison fixtures on the same window.
2. **Cadence rekey rule**: pause planner → drain parents AND batch fans
   (expectedBatches reconciler is the drain instrument) → snapshot cursors
   into lane rows → atomic swap → resume. Poll graduation cutover is
   sequenced WITH poll_surface source creation, not after.
3. **Score cut rule**: freeze the rescorer; ship per-source g + per-lane
   A_ref/A_floor + re-pin as ONE scoreVersion bump; one global rebuild;
   unfreeze. (The §18.6 decoupling is what makes this possible.)
4. Stated RPO: signals-ledger rows between backup and failure are
   non-re-derivable observations — pin the backup cadence accordingly.
   Batch double-submission after restore = bounded duplicate spend (ingest
   registry holds correctness).
Safe order: A (substrate + dual-write) → 21d soak → B readers one-by-one →
drain+rekey → score as one versioned cut → C drops.

## §24 Part II owner items

1. Vote↔upvote exchange-rate sentence (§20.2) — ratify when fixtures propose.
2. Keyword limit=1 — re-affirm or raise with load evidence.
3. **Monthly LLM budget line** (the C7 budget object) — set the number; archive
   sweeps and gate re-judge backfills draw against it via approval.
4. **Reddit strategy** — two separate decisions (owner-corrected framing
   2026-07-16): (a) THROUGHPUT: multi-app sharding around ~10 engines (per-
   client rate limits parallelize per-minute contention; isolates client-level
   failures; one account, multiple registered apps = normal practice). Sharding
   is NOT an enforcement shield — same IP/fingerprint/behavior correlates, and
   multi-account evasion converts a rate problem into ban-with-cause.
   (b) ENFORCEMENT (the existential one, earlier): official API contract
   evaluation (paid tier/data terms) and/or source-mix diversification via the
   platform-adapter design, so Reddit is not a single point of existential
   dependence.
5. Ops readers for usage/decision ledgers — minimal query endpoints ok?

## §25 Disposition record (wave-2 red team)

Adopted (systems lens): persist-first admission gate (F1) · global identity /
territory-as-prior (F2, converged w/ synthesizer) · coverage-normalized A =
condition 6 (F3) · cursor at extraction-run creation (F4a) · platform
adapters + lane rows + sentinel death (F5) · derived archive sweeps +
coverage-intervals primitive (F6) · continuous deficiency (F7) · planner
reads coordinator headroom (F8) · docsPerDay sampling law (F9, converged) ·
chunk-as-coverage-unit (F10) · weights demoted to priors (F11) · term
due-times dissolve hot-spike (F12, drastic-adopted per owner mandate) ·
constants sweep (F13) · kill-list additions + instrument-replacement caution
(F14). Adopted (ops lens): rate-limit-as-error + heartbeat + liar purge
(SEV-1a) · archive money gate (SEV-1b, converged w/ synthesizer) · singleton
scheduled rescorer (SEV-1c, converged) · Reddit account plan + request
ledgers + token reuse (SEV-2a) · three migration race rules (SEV-2b) ·
re-judge budget (SEV-2c) · expectedBatches reconciler (SEV-3a) · RPO + restore
statements (SEV-3b) · graduation sequencing note (SEV-3c). Adopted
(synthesizer): docsPerDay scope, scheduled rescorer, archive money gate,
geometric-presence lanes, poll-A-by-construction sentence, deficiency-flip
concern (superseded by F7's continuous form). Rejected this wave: nothing —
the three passes converged or complemented on every finding; one correction
recorded (ops agent's Google-at-publish cost claim from wave 1 does not
apply to seeded polls — options are user-added, priced per engagement).

## §26 Owner session addendum (2026-07-16, ratified rulings + redesigns)

1. **Document structure**: this doc = THE master. The old plan survives only as
   the execution spec for search-side Legs 1–2 (§7); its Leg 6 is superseded
   by §20. Implementation order stands (§11/§23; Legs 1–2 parallel to Phase A).
2. **C7 revised (owner)**: no budget cap / no auto-approve line. EVERY archive
   seeding and gate-re-judge backfill arrives as preflight price tag +
   explicit operator approval. Careful cost projection replaces caps.
3. **Archive = one-shot seeding MODE (owner correction, supersedes §16's
   derived re-sweeps)**: runs once per source EVER (pre-launch bulk; per-city
   at engine onboarding), in an EXCLUSIVE mode owning the full Reddit budget
   while all other lanes pause. archiveCoveredThrough remains a recorded fact,
   not a trigger.
4. **Keyword limit=1 REPLACED (owner: inherited overreaction)**: limit becomes
   a RECALL parameter (~25–100, fixture-set). Cost is bounded by UNCOVERED
   posts only (freshness-gate coverage makes covered results free), and
   post-archive most results are covered — deep recall is cheap BECAUSE
   archive seeded first. The planner prices dispatches by estimated uncovered
   fetches, not by the limit.
5. **Deadline-free paced scheduler (the scaling strategy, owner insight
   "nothing is actually on-demand")**: due-times are targets, not deadlines.
   One global pacer drains the due queue at a smoothed steady request rate
   (well under 100/min), degrades by lateness (days = non-event), catches up
   when idle, never bursts. Urgency = ordering, never bursting.
6. **Projection model = named build item**: real per-sub post-rate data →
   requests/day at 10/100/500 sources → fixture proving the free tier holds;
   re-run at each fleet growth step. First-order math recorded: modest sub
   ≈ 40 req/day; 500 sources ≈ 14% of the 144k/day ceiling; keyword recall
   adds search requests + uncovered fetches only.
7. **§24.1 candidate sentence (owner's time-decay vision)**: "a poll vote
   counts like a Reddit mention — no room amplification for poll surfaces"
   (poll-source g clamps to 1). Reddit dominance fades by decay; poll
   influence rises by volume + freshness; no constant pushes. Fixture:
   sparse_market_winner_not_fake_elite should pass trivially. Ratify after
   fixtures confirm.
8. Clarifications recorded: ranking is NOT removed — judgment families rank
   candidates and ranks map to due-time proximity; hot-spike dissolution =
   urgency as ordering in one queue; historical Reddit rate-limit denials are
   unknowable (no durable instrument existed) — the heartbeat closes that
   permanently.
