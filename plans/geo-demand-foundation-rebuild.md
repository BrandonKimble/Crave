# Geo/Demand Foundation Rebuild — Design of Record (CONSOLIDATED EDITION)

Status: **RATIFIED (owner)** — consolidated 2026-07-16 from the wave-1/2/3
design ledger (11 red-team passes, 3 exhaustive audits, cohesion pass,
year-one projection). Base text below IS current truth; the amendment history
is compacted in §20 (full ledger edition preserved in git history and the
session archive). Derived from requirements only; no decision preserves
existing code; all data trashable. SUPERSEDES the market/demand/minting/
poll-scheduling design everywhere; plans/viewport-only-location-centric-plan.md
survives ONLY as the execution spec for search-side Legs 1–2 (referenced §7).

## §0 Requirements

R1. The map is the query — whatever is in view, any zoom, anywhere on earth.
R2. The header always names where you look at the scale you're thinking, or
honestly says "this area"; never waits on a vendor; never confidently wrong.
R3. Nothing a user does is wasted — every act (including a paid vendor probe)
permanently improves the app's knowledge. Retroactively.
R4. Polls bootstrap any place; Engines collect where attached. Same laws
everywhere on earth.
R5. A place's first content is consensus content — content that gets ANSWERED,
not just wanted (ghost polls are worse than none).
R6. No single act is loud; influence accumulates across distinct people.
R7. Equal collection effort; audience equalized by math; passion-per-audience
is the signal.
R8. Solo-dev economics: TomTom cheap pool ~20k/mo, scarce polygon pool
~2.5k/mo; Google Places per-verification; LLM costs; heavy work scheduled,
never in-request.
R9. No chosen numbers. Every quantity is classified by the Constants
Constitution (§16); capacity + queues + control loops, never thresholds.
R10. Observe at write; judge at read — for judgments AND identity. History
survives every future re-weighting, re-definition, and merge. Corollary
(closed-loop measurement law, §16): any estimate whose consumer gates its
own observations must carry an exploration mechanism.

---

# PART I — Geography, Demand, Polls

## §1 Place Catalog: a containment DAG

**places**: { placeId, name (localized display + local-script alias),
providerLevelCode (OPEN string vocabulary — stored, never switched on),
parentPlaceIds[] (edges from the reverse-geocode response chain at creation;
geometry never derives hierarchy), countryCode, subdivisionCode?, centroid,
bbox, timeZone (offline centroid→tz at creation), provider, providerPlaceId?,
createdAt }. Tier-2 geometry in side table **place_geometries** { placeId,
polygon, providerBoundaryId, fetchedAt }.

- **Identity law**: placeKey = (countryCode, subdivisionCode?,
  providerLevelCode, normalized name); sketch conflicts bbox-merge; the
  provider's stable geometry id becomes an alias (LIVE-VALIDATED: identical id
  returned by reverse and forward geocode for the same neighborhood).
- **Roles are attachments**: any place hosts polls; every place accrues
  demand; some anchor sources/engines (§5). No types, no capability flags.
- Neighborhoods/boroughs/wards are first-class. LIVE-PROVEN: TomTom returns
  the full chain (neighbourhood "Upper West Side"/"Hells Kitchen"/
  "Williamsburg" → borough → city → county → state) with names, bboxes (via
  forward geocode), and stable geometry ids.
- US pre-seed: ~19.5k municipalities, ~$50 one-time (gazetteer names + TomTom
  polygons, geometriesZoom-tamed) — an accelerant; §2 is the universal growth
  mechanism. Neighborhoods are NOT in the seed; they enter lazily on first
  attention.

## §2 Naming: observe every probe; judge subjecthood at read

- Reconciler per settled viewport (background; reads NEVER wait):
  1. Stored places / no-place observations answer the anchors → done.
  2. Probe budget: ≤ ⌊1/ATTENTION_FRACTION⌋ = 3 anchors per view (center +
     largest-uncovered-region candidates).
  3. **Sketch mechanics (live-verified)**: 1 reverse geocode returns the full
     chain of names + geometry ids; +1 cheap forward geocode per
     PREVIOUSLY-UNKNOWN node supplies its bbox (≤5, once ever per node
     globally; all cheap pool). Every probe result is written — "no place
     here" is a region-scale observation (probed bbox, 30d TTL).
- **Subjecthood = read-time SYMMETRIC commensurability** (ATTENTION_FRACTION
  = 1/3, "a view attends to ≤ ~3 places"): too small (< 1/3 of view) → not
  the subject; too big (view < 1/3 of place) → descend the DAG to the
  commensurate node (street zoom in Chongqing names the ward); equal-
  commensurability descent tiebreak = coverage-of-view, then name-stability.
- **Header** = commensurate covering place's name; when no commensurate node
  exists, the smallest CONTAINING node (even over-scale); "this area" is
  reserved for multi-place straddles and unnamed ground. Hysteresis: commit
  on settle+dwell, enter/exit asymmetry (sim eye-check fixture).
- **Tier-2 polygon promotion (scarce pool) — earned moments**: (a) poll
  created there — the ONE blocking caller (spinner OK; in a cheap-pool
  drought the poll is created against "this area near (lat,lng)" or a
  creator-typed name, backfilled — never blocked); (b) source/engine
  attached; (c) derived pre-fetch: credit + creditRate × Δt_to_tick ≥ 1;
  (d) batch seed; (e) frequent header-answering joins the promotion queue
  (until promoted, the probe's point-answer beats bbox dominance on
  disagreement).
- **The reconciler is a registered pacer lane** (dueAt = viewport settle,
  latenessTolerance: "a header answer a day late is fine, a week is not" —
  K1; single-flight cell = batch key) — its probe volume rides the same draw
  ledger as everything else (no exceptions to one-pool-one-ledger).
- Negative region cache, single-flight per cell, idempotent upserts,
  graceful scarce-pool degradation. Viral stampede self-extinguishes:
  first probe sketches; later resolves hit the catalog.

## §3 The Signals Ledger

**signals**: { signalId, kind, subjectType (entity|term|none), subjectId?,
subjectText?, geo bbox (ALWAYS a bbox; point = zero-area), actorId
(pseudonymous; actorId→user mapping is a separate severable table = the
deletion story), occurredAt, meta }. Append-only, IMMUTABLE, permanent,
monthly partitions. A write failure never fails the user action.

- **Kinds are ACTS; qualifiers are meta**: search {resultCount,
  restaurantCount, cached, resolvedEntity}, autocomplete_selection,
  entity_view, favorite_added, poll_vote, poll_comment, poll_created,
  viewport_dwell (subjectless attention — browsing IS demand). "Unresolved/
  low-result" are read-time derivations, re-definable forever.
- **Identity is a judgment**: merges never touch the ledger; readers resolve
  subjectId through entity_redirects at read.
- **Attribution law**: each signal attributes to (i) the smallest place
  CONTAINING its geo, and (ii) the coarsest catalog level(s) TILING the
  places contained in its geo (US bbox → one US row; Texas bbox → one TX
  row; metro bbox → its towns). Containment, never intersection.
- **Read-time inheritance (weight-1 semantics)**: a place's demand = own rows
  - ancestor rows at weight 1 (Waco = Waco + TX + US rows). Every town in a
    statewide search is influenced at full weight; storage O(few) per signal. **The demand read is
    a CONTAINMENT read with SET semantics**: a place's demand = its own rows +
    its descendants' own rows + each DISTINCT ancestor row counted once
    (multi-parent DAG paths never double-count; lazily minting a neighborhood
    never steals its ancestor's stream — fixture: mint mid-window, city mass
    invariant). **The engine read** treats the territory as one derived place:
    Σ members' (own + descendants) + each distinct ancestor row ONCE for the
    whole engine (engines at different DAG levels stay comparable — golden:
    two engines, one statewide signal).
- **Aggregate**: day × actor × place × subject × kind, INCREMENTAL (only
  today rebuilds; history immutable; redirects applied at read). Recent
  searches, autocomplete popularity/affinity, and query suggestions are
  readers of this substrate. Anonymous actors: per-device actorIds.

## §4 The poll system (final form)

**Demand mass** per (place, subject, window): Σ_actors log2(1 + Σ signals ·
kindWeight · recencyWeight); recency 7d flat + 14d half-life; curve kernel
(saturating per-actor log, 28d gaussian cooldown recovery, surge-over-
baseline) carries throughout §4/§11.

**Credit (warranting)**: creditRate(place) = weeklyDemandMass ×
answerYield(place) ÷ viability(place).

- **answerYield**: observed answers-per-attention for the place, global
  conversion rate as prior. Demand-rich/audience-dead places asymptote to
  zero seeding (ghost towns structurally impossible); the poll_vote signals
  close the loop. Contraction-to-zero is its desired fixpoint (exempt from
  the exploration law).
- **viability(place)**: the participation level at which polls demonstrably
  produce strong content (graduation richness, discussion depth,
  settledness-at-close vs answer count) — measured globally, refined
  per-place (hierarchical prior). Day-one prior = 15, SELF-ERASING. Fixes
  the commune-vs-metro asymmetry at steady state; YEAR-ONE HONESTY: for
  ~2–4 quarters viability ≈ global ≈ prior — projections must model this.
  Bound by the closed-loop law: time-widening uncertainty + the controller's
  frontier dither supply below-bar observations.
- **Settledness** (per-poll, derived): leader stability vs trailing swing.
  Governs DISPLAY ("N votes · settled") and closure semantics — NEVER supply
  (a contested high-participation poll is engagement, not failure).
  Settled-but-nonviable displays honestly, never as consensus.
- Credit decays (14d half-life). Poll-only entities render "Community pick ·
  N votes" until they accrue any calibrated non-poll mention (a K6
  existence gate: one engine-corpus mention ends the badge).
- **Vote→mention mapping (K6, definitional)**: at graduation the BALLOT
  bypasses LLM extraction — each distinct voter mints ONE structured mention
  (m=1, no upvote term) for their choice, composing R6 into the score
  exactly as into demand; the discussion THREAD flows through standard
  extraction. Answers land as subjectText signals at vote time; the §13
  3-tier resolves them against the GLOBAL catalog immediately (T1/alias =
  free); unresolved winners mint at poll close via the enumerated
  verification draw (§14.4).

**Supply (the controller)**:

- **Warm start**: every place starts at max(1, predicted frontier), where
  predicted frontier = measured attention mass × conversion [prior→measured]
  × tail-concentration [prior→measured] ÷ viability. No "launch city"
  concept — big places warm-start because their mass justifies it; small
  places predict <1 and start at the exploration slot (1).
- **First-cohort correction**: re-run the prediction with the cohort's
  measured conversion/concentration and JUMP to the re-estimate (overshoot
  costs 1–2 Sundays of honestly-displayed sub-viability tails).
- **Steady state — the median test**: expand when P(weakest poll ≥
  viability) > ½, contract when < ½ (½ is definitional). NO dead zone; the
  frontier oscillates ±1 by design — bounded dither IS the exploration
  excitation. ±1/week is the slew limit for a LEARNED frontier only.
- **No caps exist.** Supply is bounded by demonstrated answering, never by a
  constant. (Deleted: flat 3/week, bank cap, 40-market budget, per-city
  topic caps, POLL_COST.)

**The weekly ritual**: one tick per place at Sunday 09:00 LOCAL (timeZone on
the catalog row), publishing the controller-approved cohort TOGETHER — a
deliberate product ritual (appointment behavior, one notification moment,
concentrated same-cohort participation; 7-day windows close together =
weekly results day). Publish = atomic (spend + poll rows + archived topic
birth-certificates carrying factor breakdowns) with idempotency key
(placeId, weekOf-local); per-place jitter within the minute. Subject choice:
demandMass × cooldownAvailability × resurgenceBoost. Credit with no ranked
subject publishes the structural bootstrap poll ("Best restaurants in
{place}") — browse-only towns cold-start via viewport_dwell.

**Topics are birth certificates written AT publish, already archived** — no
ready pool, no draft state, no nightly refresh cron.

**Boundaries**: user poll creation unchanged (2/user/place/week anti-spam —
a per-USER rule, deliberately separate from place supply). Notifications
target devices whose home place (placeAt) is the poll's place or a
descendant; big-place (subdivision+) polls are feed-at-that-zoom only, never
push. Graduation: the closed thread flows through the standard extraction
pipeline as a document of the place's poll_surface source (§5); durable
retry via the daily lifecycle cron.

## §5 Sources and Engines

**sources**: { sourceId, platform (reddit | poll_surface | …), handle,
anchorPlaceId, engineId?, createdAt } — **the source is the calibration
room**: A(τ) and g are per-source; every source's documents feed its A and
its mentions feed mass (source-complete rule). Every place's poll surface IS
a source (graduated threads = its documents; its poll audience = its A).
Poll threads always belong to the place's poll_surface source, never to a
territory engine's Reddit sources.

**engines**: { engineId, memberPlaceIds[], sources[] } — operator-attached
(collection costs money; a deliberate act). Territory = derived union, never
stored. Overlap is a membership question (default: disjoint). Deficiency and
slices key off engines. **Scoring provenance and the fame-pin key off
SOURCES** (anchorPlaceId; an engine territory is the derived-union case) —
one law covering engineless poll-bootstrapped towns and engine metros alike.
poll_surface rows carry NO engineId (the field is reddit-class only): poll
evidence reaches collection ONLY as demand through the ledger (C3), never as
corpus — so §11's rep numerator and denominator always draw from the SAME
source set. A place inside a territory still has its own poll credit (polls
are place-scoped; collection engine-scoped; the two never sum over each
other).

## §6 Polls surface

Feed = polls of places in view (+ descendants of the commensurate subject);
CURSOR PAGINATION is a prerequisite (kills the hard take-25). Header per §2
("Polls in this area" is a first-class multi-place state — no tie band, no
display-market election exists). Slicer chip (same SelectorChip primitive):
options ranked by CONTENT CONTRIBUTION to the current feed, searchable sheet
for the tail, subdivisions as section headers only — geography is never
enumerated, so state-wide views cannot overwhelm the control. Per-poll place
labels via batch lookup. Cold-start promise state on an empty seeded town:
"Polls drop Sundays — this town's first unlocks as people search and vote."

## §7 Search-side ratified inputs (execution spec: old plan Legs 1–2)

Viewport-only search + coverage: no market filter anywhere; dots
one-per-location; 50k LIMIT deleted; DTO page-size validation; market-label
UI + attachMarketNames deleted; 3-step lockstep deploy for the coverage dto
field. Location-centric interaction: location = unit of interaction
(restaurant = unit of data); single-location selection; profile = ALL
locations, distance-sorted, collapsed tail, cache key = restaurantId;
row locations array ~30 nearest; See-locations autocomplete mode ("See
locations", never a count); favorites + recently-viewed carry locationId
(hard cutover, no backfill); representative pin = fame rule (a location
inside the score-provenance territory, anchor tiebreak). Search needs
nothing synchronous from the catalog.

## §8 Score calibration (per-source rooms)

A_source(τ) = Σ its gate-passing documents · 0.5^(age/τ), lanes {365d, 21d},
**normalized per OBSERVED day within τ** (coverage intervals, §10 — cadence
variability cannot masquerade as room size; for push-complete poll_surface
sources the lane row's coveredThrough = the closed-poll watermark, advanced
at graduation extraction-run creation, observed days = watermarked existence
days, heartbeat = graduated-docs-per-closing-poll — C8 holds for zero-pull
sources). g_source = max(A, A_floor) /
A_ref — **A_ref and A_floor are PER-LANE constants**, pinned per
scoreVersion epoch (re-pin only with a version bump). Calibrated counts:
each mention ÷ g of ITS OWN source, INSIDE log1p; v3 downstream unchanged
(log1p(m + 0.7u) → geometric dish discount 0.5 → praise 2× → global
percentile per subject type → truncated-normal display; rising = fast −
stable). One global pool per subject type — the purpose of calibration.

- **sourceClassInfluence**: read-side per platform class, DEFAULT 1.0 —
  launch = a poll vote ≈ a Reddit mention; the Reddit→polls transition
  happens by decay + accumulation (owner's design). The floor clamp means
  only "refuse amplification of unmeasurable rooms," never a boost.
- Conditions (fixture-gated, with the kill condition — calibrated must beat
  raw v3 on the named scenarios or calibration is deleted): per-lane
  constants + rising-flap fixture · fake-elite closure
  (sparse_market_winner_not_fake_elite pins the poll-vote exchange at the
  1.0 default) · upvote-linearity named gate (adoption path pre-agreed:
  u_i/ū_source, measured share, never a fitted exponent) · Phase-0 dial
  re-probe (praise 2×, ρ=0.5) on CALIBRATED masses · author-concentration
  fixture for doc-count A · two-cadence coverage-normalization fixture.
- Outcome observations carry a FEED-ALGORITHM VERSION binding (a feed deploy
  shifts capacity/viability readings; version-bind them like model probes).
- Build items: the g primitive (shared with §11 deficiency);
  source_document_id on item mentions (provenance unification); retention
  invariant (every mention's document persists). Scoring runs via the
  singleton rescorer (§12).

---

# PART II — Collection

## §9 Collection laws

C1. An engine keeps its territory's corpus fresh, complete, and
demand-responsive, at equal effort per source, inside pools.
C2. Platform ADAPTERS declare each platform's lanes, cadences, and costs;
collection behaviors attach to sources.
C3. Demand reaches collection only through the signals ledger/aggregate.
C4. Per-source OBSERVED-COVERAGE INTERVALS are first-class facts — the one
primitive under cursoring, archive coverage, gap recovery, and score
normalization.
C5. Evidence = event-sourced projections (documents → runs → events →
active-pointer projections). Re-derived and kept.
C6. Extraction machinery kept with §12 fixes.
C7. Money is gated where committed: preflight price tags + explicit operator
approval (NO caps, NO auto-approve lines — owner ruling); routine
baseline spend is METERED against the projection model, never gated.
C8. Every lane has an output-derived heartbeat that can show RED, proven RED
in staging before being trusted. Legit-zero ≠ broken-zero.

## §10 The source-centric collector

- **Adapters declare lanes**: reddit → chronological (unbiased sample),
  keyword (pull, biased), archive (one-shot backfill); poll_surface →
  push-complete, zero pull lanes. Cadence rows per (sourceId, lane); lane
  state (e.g. the chronological cursor) lives on the lane row.
- **Coverage intervals**: the chronological cursor advances AT EXTRACTION-RUN
  CREATION ("this window entered the evidence system" — a fact, not intent).
  archiveCoveredThrough is a recorded fact. An hourly expectedBatches
  reconciler (parents record expected fan-out; extraction runs prove it)
  alarms on shortfall — also the migration drain instrument.
- **Saturation law**: near-miss trigger = fill fraction at cursor-reach (act
  BEFORE loss); interval headroom = measured per-source burst variance (K2);
  AIMD as outer loop; a detected miss writes a first-class C4 COVERAGE GAP,
  which spawns a derived, money-gated recovery task (targeted window sweep —
  honoring the no-standing-resweeps ruling at gap granularity). Detector:
  timestamp semantics with ≥1 strictly-older overlap confirmation, never
  fullname anchoring; coveredThrough means visible-at-fetch-time
  (mod-approved backfill caveat stated).
- **docsPerDay sampling law**: derived only from adapter-declared unbiased
  lanes, computed over COVERED days (a dead lane cannot read as a quiet
  room). Keyword hits never feed it. Cold start: archive sweep or adapter
  prior. Cadence clamps 7–60d are pacing bounds (K1-able sentences).
- **Archive = one-shot seeding per source, EVER** (pre-launch bulk; per-city
  at engine onboarding), enqueued as a `proposed` sweep with a preflight
  price tag (doc count × measured per-doc cost from the usage ledger)
  requiring explicit approval (C7). No exclusive mode exists — archive makes
  ZERO Reddit calls (pushshift files; audit-verified); its Gemini/internal
  demands interleave through the governor at seeding-class lateness
  tolerance. Chronological runs regardless.
- Onboarding verb = engine (member places) + sources + adapter-seeded lanes
  - proposed archive sweep with its price tag.

## §11 Selection: term due-times

- **The schedulable unit is (engine, term) with a nextDueAt.** Judgment
  families are due-time WRITERS: unmet, refresh, demand, explore, and SURGE
  (an hourly reader over the aggregate — no hot-spike lane, sentinel row, or
  job cap exists; urgency is ordering). The pacer (§14) batches due terms
  per source into dispatches.
- **Merge law**: families PROPOSE due-times; the expected-new-content model
  floor-CLAMPS; renewed demand may PIERCE the clamp (world-changed
  evidence).
- **Expected-new-content model** (replaces the cooldown constants, which
  survive as its cold-start priors): revisit when expected new matching
  content ≥ 1, from the source's measured arrival rate × the term's measured
  hit rate; dead terms' hit rates drift toward the MEASURED global
  term-resurrection base rate (no Beta-prior back door). Attempt ledger =
  collector state.
- **Portfolio**: TWO floors only, each a K1 sentence — UNMET ("user-expressed
  gaps always get attention," a product promise independent of yield) and
  EXPLORE ("insurance for the unmeasurable"). Refresh + demand compete for
  all remaining capacity by measured yield via within-family percentile
  normalization (cross-family weights do not exist). Family yield under
  competition is bound by the closed-loop law (optimistic selection).
- **Deficiency (continuous)**: deficiency = localDemand × (1 +
  crossEngineGap × evidenceWeight), evidenceWeight growing with peer count
  and corpus maturity (0 at n=1 — launch behavior falls out; an empty engine
  #2 barely perturbs #1). The ×askerBreadth factor is load-bearing (prevents
  cross-market taste homogenization). rep(term, engine) = calibrated term
  mass ÷ engine's per-source-summed room (the §8 g primitive).
- Keyword recall limit = a RECALL parameter (~25–100, fixture-set): one
  search request returns up to ~100 ids regardless; cost is bounded by
  UNCOVERED posts only (coverage makes covered results free; post-archive
  most results are covered — deep recall is cheap BECAUSE archive seeded
  first). The planner prices dispatches by estimated uncovered fetches.

## §12 Evidence & extraction

KEEP (re-derived): source-document persistence; prompt-hash extraction
coverage + thread trimming; SRC-ref chunking (35k/80 — K5, model-bound);
batch machinery (leases, 5-min poller, 30h = SLA + measured-overrun cache,
purpose-keyed ingest registry); per-chunk quarantine; stale-run reconcilers
(EXTENDED to crave-score runs); one-generation compaction + replay;
mentionKey dedupe; projection full-replace; usage + decision ledgers WITH
minimal ops readers.

FIXES (all ratified):

1. **Persist first; relevance is an ADMISSION judgment** — every fetched
   document is stored (the fetch was paid); the verdict is promptHash-scoped,
   consulted at chunk-plan time, re-derivable by replay. Prompt changes
   re-judge lazily on re-encounter plus a money-gated, preflight-counted
   backfill queue. (The one destructive write-time judgment is dead.)
2. **The CHUNK is the coverage/commit unit**; the run is provenance. The
   reconciler re-enqueues exactly the missing chunks. Active-run pointer
   advances only on coverage-superset (monotone, completion-order-proof).
   Stage handoff is DERIVED from persisted state (docs lacking verdicts;
   admitted chunks lacking coverage; succeeded batches lacking ingestion) —
   completion events are a fast path, never the guarantee.
3. **Rate-limit results are ERROR outcomes, never empty successes** — fetched
   pages are kept; a rate limit can never brand a term no_results.
   Governance denial is a third, distinct outcome ("not now" — requeue;
   never a cooldown; never trips a fail-open judgment layer — staging
   fixture: close the gate pool, assert zero ungated passes, lane goes
   late-not-dead).
4. **Always-green liar purge**: success:false-as-completed → real job
   failures; hardcoded-green health → measured; mentionsExtracted fiction →
   expectedBatches reconciler; deferred-by-capacity → alarmed; surge-reader
   input-liveness check; per-(source, lane) OUTPUT-DERIVED heartbeats (new
   documents per due-tick vs own baseline; freshness = post occurredAt →
   mention-row latency) — each proven RED in staging (C8).
5. **Reddit client**: retry loop THROUGH the governor (retryAfter honored
   globally); single makeRequest path; token minted on expiry only; durable
   per-source request ledgers; at ≥10 engines, sources shard across multiple
   registered apps ((vendor, credential) pools); owner item: official-API
   contract evaluation before ~40 engines.
6. **Scoring decoupled from collection**: collection sets a dirty flag; a
   SINGLETON debounced rescorer (hourly-if-dirty, advisory-locked) owns
   global rebuilds — kills racing rebuilds, the final-batch proxy bug, and
   swallowed rescore errors; creates the scoreVersion seam.
7. Dead code purge: legacy hardcoded-subreddit client methods,
   RedditDataExtractor, ContentRetrievalMonitoring (after its signal has a
   replacement reader), 'on-demand' collectionType ghost, volume-tracking
   lane (stats derive from documents), community↔market link columns, env
   fail-policy switch, dead coordinator LLM config, requestsPerSecond field,
   in-memory costMetrics, per-call authenticate.

## §13 Entity resolution & graph

3-tier resolution (exact → alias → recall K=8 [K5, probe-bound] + LLM
judge), tombstone sink, intra-batch overlay judge, attribute 'pending'
quarantine + ontology adjudication, alias banking, merge machinery, dish
knowledge: KEPT. Changes: **identity is GLOBAL; territory is a retrieval
PRIOR, never a filter** — T1/alias unscoped; recall geo-biased by the
source's territory; creation anchors to the geocode/verification result
(source territory = zero-evidence provisional); lanes key on GEOMETRIC
presence. Cross-territory duplicates and engine-attachment merge-debt waves
die as a class. Enrichment bias from place geometry. The immutable ledger
(redirects at read) shrinks merge rehome to projections + product tables.

---

# PART III — Resource Governance

## §14 The Resource Governor

1. **Adapter-registered pools** (no enum): vendor adapters declare their
   client CHOKEPOINT (lint boundary — the SDK is importable only inside its
   adapter) and their POOLS (windows, units, fail policy), keyed
   (vendor, credential). Provider status/poll calls are enumerated draws.
   INTERNAL capacity is pooled too: db.ingest, host.cpu — the seeding
   campaign binds there, so the registry sees there.
2. **The draw primitive: reserve → act → reconcile** (absorbing the existing
   TPM reservation engine as the gemini pool's implementation). Admission =
   TTL-bounded reservation of declared demand; chokepoints record actuals;
   reconcile refunds/debits; leaks expire. Declared-vs-actual pairs are
   PERSISTED — the estimator-drift instrument; the estimator-refresher has
   its own heartbeat.
3. **Pull-model pacer — the sole dispatcher**: selects the highest-priority
   job whose declared pools all reserve; workers never consult the governor.
   **Priority = normalized lateness = (now − dueAt) ÷ latenessTolerance
   (lane)** — the owner's "days late is fine, months is not" as the
   scheduler; chronological declares ≈ its cadence, seeding declares months
   → bulk archive yields to live lanes structurally while consuming all idle
   capacity. **Ordering applies at EVERY stage boundary** (dispatch, batch
   submit-resume, status-poll, ingest — no FIFO funnels; poller take-N caps
   become paced, ordered selections). Pacer due-queue state lives in
   Postgres; Bull is transport only.
4. **The second admission surface** (enumerated, never general): synchronous
   user-facing draws — poll-creation TomTom promotion, moderation LLM,
   poll-winner entity verification at close (Places) — via
   synchronous reserve-draw with the emergency window as their fail-closed
   customer.
5. **Per-pool fail policy** (declared in the registry): minute-window pools →
   bounded per-replica emergency fraction (derived share of the window),
   duration-capped, journaled to PG for ledger replay; day/month/dollar/
   enqueued pools → hard closed. Upstream-429 window poisoning kept.
6. **Money = grants, vendor-agnostic**: each approval mints a bounded pool
   instance covering LLM sweeps, gate re-judge backfills, Places
   verification campaigns, TomTom scarce draws; chunk-granular draws via the
   same primitive (refund-on-failure free; mid-grant exhaustion = ordinary
   backpressure). Routine baseline spend metered vs the projection model,
   alarmed on divergence, never gated.
7. **Governor RED taxonomy** (each staging-proven): exhaustion (zero headroom
   - rising lateness + zero 429s) / misconfiguration (429s despite headroom,
     or chronic-full-never-429) / estimator drift (actual÷declared outside
     guardrails). Root-cause RED for governance-store-down annotates the
     heartbeat cascade.
8. Migration race rule #4: **one pool, one ledger, at every instant** —
   shadow mode first, ungoverned clients cut first (gate, embeddings, batch
   submit, TomTom — governance where none existed), per-pool atomic cutover
   with 429-reporting moved in the same deploy, LLM interactive last.
9. **Gemini batch quota discovery** (owner-approved procedure): console
   first; if empirical, pre-campaign ramp on sacrificial jobs in a quiet
   window (enqueue 429 is harmless by construction), disambiguate the axis
   (jobs vs tokens vs bytes; ~20MB inline cap), register measured × safety
   with provenance; never probe mid-campaign.

---

# §15 Migration

Phase A — substrate: places DAG + signals + redirects + actor mapping;
signal writes on all acts (dual-write beside old logging for ONE milestone
with a hard deletion date); US seed; g primitive + mention provenance;
governor in shadow mode.
Phase B — consumers cut one at a time, each with old-vs-new fixtures:
resolution/header → catalog primitives; aggregate → incremental tiled
rollup; autocomplete/recent/suggestions → ledger readers; poll seeder →
§4 (both old crons + ready pool die); collector → §11; expansion view;
score with per-source g as ONE frozen scoreVersion cut (freeze the
rescorer, ship g + per-lane constants + re-pin together, one global
rebuild, unfreeze) — SEQUENCED AFTER the poll-seeder cut so poll_surface
sources + their coverage watermarks exist inside the pinned epoch;
fame-pin/provenance re-key (market → source anchor) is an explicit Phase B
line; governor per-pool cutovers per §14.8.
Phase C — drop everything superseded (the union of all kill decisions in
§4–§14).
Race rules: (1) dual-WRITE ≥ the longest read window (21d) before any
dual-READ cutover; (2) cadence rekey = pause planner → drain (expectedBatches
reconciler is the instrument) → snapshot cursors → atomic swap; poll
graduation cutover sequenced WITH poll_surface source creation; (3) the
score cut as above; (4) one pool, one ledger, at every instant. Stated RPO:
signal rows between backup and failure are non-re-derivable — pin backup
cadence accordingly. Old-plan Legs 1–2 execute independently (search-side),
before or parallel to Phase A.

# §16 The Constants Constitution

**The law: every number is exactly one of six kinds, defined by WHAT CHANGES
IT. Unclassifiable numbers are not allowed to exist.**

- K1 (owner ratification) — falsifiable product sentences: 365d/21d mention
  half-lives; 7d cycle + 14d demand half-life; 28d cooldown gaussian; 45d
  no-results recovery (as prior, see K2); ATTENTION_FRACTION 1/3;
  the two portfolio floors (unmet promise, explore insurance); 2 user-polls/
  place/week; 7-day poll window; cadence clamps ("no source unvisited
  longer than 60d"); 30d no-place TTL; controller gains stated as
  mini-sentences.
- K2 (data; self-erasing priors; closed-loop law applies where the consumer
  gates its own observations): viability(place) [prior 15]; answerYield;
  conversion + tail-concentration [warm-start inputs — instrument from the
  FIRST Sundays]; expected-new-content model [cooldown constants as priors];
  per-source thread-activity half-life [21d as prior]; per-reader kind
  weights; per-source burst variance; measured overruns; prior strengths &
  shrinkage (inventoried).
- K3 (controller cycles): poll supply (warm-start → cohort re-estimate →
  ±1 median test); saturation-adaptive chronological cadence; pacer-derived
  dispatch sizes and worker counts.
- K4 (vendor facts): Reddit 1000/100-per-min; Gemini 24h SLA + TPM; Places
  quotas; TomTom pools.
- K5 (version re-probe): matcher K=8; chunk 35k/80; gate pack 20k/25 —
  model-version-bound with auto re-probe flags; settledness window
  (feed-version-bound); outcome observations carry feed-algorithm versions.
- K6 (definitional — nothing changes them): majority = ½ (median test,
  3-of-5 delta probe); minimal step ±1; the exploration slot (+1 / start
  floor 1).
  **Closed-loop measurement law**: any K2/K3 quantity whose consumer gates the
  observations that update it carries exploration — time-widening uncertainty,
  optimistic selection, frontier dither. (Bound: viability knee, term hit
  rates, kind weights, family yield. Exempt: answerYield.)

# §17 Verification stance

Fixtures first, RED-provable, eye = oracle for feel. The suite (union of all
waves): credit/supply (warm-start overshoot recovers in ≤2 Sundays; Waco
invariance; one-searcher never seeds; ghost-town yield termination; seasonal
regain; capacity ramp; frontier dither samples the bar), attribution
goldens (tiling + inherit-down + retroactive credit), subjects/header cases
(two towns / continental / city+slivers / Chongqing descent / boundary-zoom
hysteresis sim check), quota-drought degradation + poll-creation fallback,
score suite + kill condition + per-lane rising-flap + two-cadence
normalization + fake-elite at influence 1.0 + author concentration,
deficiency n-growth continuity, saturation-adaptive recovery + gap-recovery,
expected-new-content vs old cooldowns on the Austin corpus, governance
denial vs fail-open (zero ungated passes), estimator-drift injection (2× →
alarm fires), Redis-down walks (root-cause RED; graduation completes after
recovery), ×50-traffic supply sanity, projection re-run at each fleet step.
Every scheduler trace has a reader; every heartbeat is staging-proven RED.

# §18 Owner items (current, complete)

1. Fixture-gated values to ratify when proposed: keyword recall limit;
   viability day-one prior (15) confirmation; sourceClassInfluence 1.0
   confirmation via the fake-elite fixture; the two portfolio floor
   FRACTIONS (unmet promise + explore insurance shares of each dispatch).
2. Per-pool fail-policy TABLE ratification (§14.5).
3. Gemini batch quota discovery — approved procedure, run pre-campaign.
4. Ops readers for usage/decision ledgers (minimal endpoints) — confirm.
5. Reddit account strategy before ~10 engines (multi-app sharding; official
   API contract evaluation before ~40).
6. WEEK-ONE BUILD PRIORITY: instrument conversion + concentration from
   Austin's first Sundays (the warm-start predictor's direct inputs).
7. RATIFIED 2026-07-19 (owner docket, one-by-one): (a) COVERING_FRACTION =
   1 − ATTENTION_FRACTION = 2/3 (one-knob law); (b) lone commensurate
   non-covering place IS the header ('this area' reserved for genuine
   straddles/unnamed ground). Both are now §2 law.
8. §1 identity-law amendment — BUILT 2026-07-19 (county-axis leg): places
   grew `county` (provider county NAME, normalized — no stable cross-provider
   code exists); identity index rebuilt as UNIQUE (country_code,
   subdivision_code, lower(county), provider_level_code, lower(name)) NULLS
   NOT DISTINCT (migration 20260720050000); merge law = the resolveIdentity
   decision table in places-catalog.service.ts (c exact-county match / b′
   county-disagreement-on-overlapping-ground merges with stored county
   winning — the multi-county-Houston law / a gap-fill adoption, disjoint-
   veto, race-safe conditional update / b distinct sibling / u1–u4
   county-less rules); TomTom adapter threads countrySecondarySubdivision
   onto below-county-rung nodes and county-qualifies forward geocodes; seed
   joins Census national_place_by_county2020.txt + a geocoder-resolved
   principal-county cache (internal-point county for the 1,110 multi-county
   places). 30 of the 35 skip-listed towns now seeded distinct; 5 remain
   organic-only (WI city/village twins Pewaukee ×2, Superior ×2 sharing
   name+state+county, and Waukesha village — county unknown in the 2020
   relationship, inc. 2021). Disjoint-bbox guard RETAINED as defense in
   depth.
9. RATIFIED 2026-07-19 (owner docket, one-by-one): conversion 1.0 +
   tail-concentration 1.0 warm-start priors (strength 1, self-erasing);
   portfolio floors 0.20 unmet / 0.08 explore; score pins aRef=median(A>0),
   aFloor=p10(A>0) per epoch; containment + ancestors-at-weight-1 is THE
   territory read algebra (poll-supply swap onto it = MANDATED unification
   leg); cached reveals COUNT in suggestion demand (judge-at-read).

# §19 Projection record (2026-07-16; Austin ~250 DAU vs Waco ~8 DAU, year 1)

Model survives real numbers: Reddit ~0.01% of ceiling; ~$3/mo steady LLM;
Austin warm-starts ≈8 polls and corrects off cohort 1; Waco first poll wk
2–3 then oscillates at the bar (the median test is load-bearing exactly at
this size — a band rule would have frozen it); ~150–250 community-pick
restaurants/yr at zero collection spend; viability coarsely measured Q2–Q3;
year-one honesty clause holds. Re-run the projection at each expansion step.

# §20 Changelog (compacted; full ledger in git history + session archive)

Wave 1 (Part I): places DAG replaced the market model; observe-every-probe;
signals ledger with tiled weight-1 attribution (owner overruled 1/N);
credit/yield seeding replaced the 40-market budget (rejected: global
capacity queue; subjects-scoped demand — both would have reversed owner
laws). Wave 2 (Part II+score): platform adapters; coverage intervals;
persist-first gate; chunk commit unit; global identity; per-source rooms;
score re-ratified w/ six conditions. Wave 3 (Part III): governor
(pools/reserve-reconcile/normalized lateness); archive-exclusive-mode
retracted (audit: archive = zero Reddit calls); money = grants (no caps —
owner). Constants constitution + amendments (closed-loop law; median test
replaced the uncertainty band ratchet; six kinds). Poll-supply evolution:
flat 3 → capacity formula → min-clears controller → viability dissolution
(VOTERS_NEEDED=15 → self-erasing prior) → weekly ritual restored (owner;
deliberate clumping) → warm-start (launch-crawl resolved). Header fallback +
neighborhood naming live-proven (probe mechanics corrected: +1 geocode per
unknown node). Superseded-and-dead vocabulary (grep-clean in this edition
outside this section): market types, minted/collectable flags, display-
market election + 5% tie band, hot-spike lane, ready topics, POLL_COST,
bank cap, KIND_COST/budget-12, backfill weights, VOTERS_NEEDED-as-constant.

---

# §21 Build Primitives (wave-4 unification — the patterns become code once)

1. **Estimator** — THE primitive behind all ~14 adaptive quantities:
   registerEstimator(name, { statistic, prior{value,strength}|{parent},
   hierarchy (none | placesDAG | sourcePlatform | termGlobal), observe
   (ledger/aggregate query, coverage-normalized denominator?), decay,
   exploration (none | dither | optimisticSelection | timeWidening),
   versionBindings[] }) → read(name, subject) = { estimate, uncertainty,
   nEffective, priorWeight }. Consequences: the closed-loop law is enforced
   at registration (no excitation source → cannot register when the consumer
   gates its own observations); C8 heartbeats and version-widening are
   uniform properties, not per-estimator code; **the places DAG IS the
   shrinkage tree** for place-keyed estimators. Library + registry (hot
   consumers read local caches, never a service call). Quantile-shaped
   estimators (burst variance, overruns) may be a second config family under
   the same registry/heartbeat/version contract. First clients: conversion +
   tail-concentration (§18.6). **The registry is also the staging surface:
   estimators register with readers ON or OFF (§23).**
2. **Pacer lanes are the ONLY recurring-verb mechanism.** Every background
   verb — expectedBatches reconciler, rescorer (dirty-flag debounce), surge
   reader, graduation retry, stale-run reapers, promotion queue, gap
   recovery, re-judge backfill, §2 naming reconciler, and THE WEEKLY POLL
   TICK (minutes-tolerance lane: normalized lateness explodes at due+ε, so
   the ritual structurally preempts months-tolerance seeding; clumping +
   jitter are job-row properties) — is a self-rescheduling pacer job. No
   crons. One dispatcher, one trace reader, one RED taxonomy.
3. **Reconciler registry**: { expectationQuery, observationQuery, comparator,
   action: enqueueRecovery | alarm | correct }, each a pacer lane
   auto-carrying a staging-proven heartbeat — C8 becomes a property of
   registration; an unreconciled lane fails lint.
4. **One draw ledger**: the governor's persisted (declared, actual, pool,
   credential, job, class-dimensions) pairs ARE the quota ledger, usage
   ledger, and per-source request ledgers (preflight price tags read
   measured per-unit costs from it). Kept separate: attempt ledger
   (collector state), decision ledger (judgment record).
5. **Two immutable fact stores, by law**: user acts (signals) and paid
   documents (evidence); everything else — demand mass, mentions, scores —
   is a re-derivable judgment over one of them. (A poll vote is a fact in
   signals AND later part of a document; demand reads the signal, scoring
   reads the mention — not double-counting.) Shared components: ONE
   redirect-resolver library; ONE dirty-flag→debounced-singleton-rebuilder
   (clients: signals aggregate, global rescore).
6. **One coverage CONTRACT over separate mechanics** (time intervals / geo
   regions / promptHash verdicts / chunk coverage): coverage is a fact
   written transactionally with the act it claims; a detected gap is a
   first-class row spawning a recovery pacer job; every domain has a
   registered reconciler.
7. **One "proposed sweep" verb** (archive seeding, re-judge backfill, gap
   recovery, Places verification campaigns): proposed item + count × measured
   per-unit cost + price tag + owner approval → grant mint → jobs under the
   grant pool. One at-most-once-by-natural-key helper serves single-flight /
   weekOf / mentionKey / ingest / rescorer-lock.

# §22 Staged execution (wave-4 — supersedes §15's internal sequencing; the

# phases and race rules stand)

**The deferral law (R10 cashed): defer ESTIMATOR READERS, never
observations.** Launch = the priors edition: every K2 quantity at its
inventoried prior with its observation stream RECORDING; each deferred
reader carries an explicit turn-on trigger so deferral cannot rot into
deletion. Behaviorally identical for ~2–4 quarters by §19's own math.

Launch-critical measurements (write-side, all cheap): signals + attribution;
coverage intervals + poll_surface watermarks; conversion + tail-concentration
(§18.6); poll_vote yield inputs; declared-vs-actual pairs; the draw ledger.
Deferred readers (trigger): per-place viability shrinkage (Q2 viability
data); measured expected-new-content (engine cadence data); crossEngineGap
(engine #2 attached); saturation AIMD live trigger (volume near clamps);
estimator-refresher + drift alarms (estimates stop being hand-set); surge
lane (a fixture shows a missed surge); promotion paths (c)/(e) (fleet
pressure); every-boundary pacer ordering (first real cross-class
contention); grant-minting flow (manual pool rows until a fleet);
multi-app sharding (≥10 engines).

**Value-ordered cut**: 1. search Legs 1–2 (parallel, start now) · 2. Phase A
minimum: places DAG + US seed + signals dual-write + redirects/actors +
Estimator registry (readers off) + TomTom pools governed FIRST (the one
ungoverned money) + existing Gemini reservation engine registered as pool #1
· 3. header/resolution → catalog · 4. poll seeder at priors + weekly ritual
(old crons + ready pool die) · 5. polls feed + cursor pagination + basic
slicer · 6. aggregate + autocomplete/recent/suggestions readers · 7.
collector at priors (4 writer families, dispatch-level pacer) · 8. score cut
(after 4; own fixture gate; weeks post-launch OK). Archive-campaign flow =
an engine-#2 onboarding deliverable.

**Fixture triage** — launch-blocking RED set (8 families): attribution
goldens (tiling + inherit + retroactive + mid-window mint invariance + CDP
set-semantics + two-engine read golden); one-searcher-never-seeds +
ghost-town termination + warm-start-overshoot-recovers; quota-drought
degradation + poll-creation fallback; governance-denial-never-fail-open;
header straddle/containment-fallback + hysteresis eye-check; live-lane
heartbeat RED-proofs. All other §17 families travel WITH their deferred
machinery (they gate the deferred code, not the launch).

**Alarm hierarchy** (makes 50+ RED conditions solo-operable): THREE pageable
roots — (1) money leaking (spend diverges from projection, or any ungated
draw), (2) a user-blocking path failing (poll-creation promotion; header
probe lane lateness), (3) worst-lane normalized lateness > its tolerance
(one number summarizing every heartbeat — the §14.3 primitive as the
universal severity scale). Everything else → daily digest, drill-down after
a root fires. Root-cause governance-store-down RED annotates/suppresses the
cascade.

# §23 Wave-4 disposition record

Adopted (simplicity lens): deferral law + priors edition w/ turn-on
triggers · value-ordered cut · fixture triage · 3-root alarm hierarchy ·
bought-complexity cuts (surge lane, promotion (c)/(e), every-boundary
ordering, grant flow — all trigger-deferred, none deleted). Adopted
(unification lens): Estimator primitive (+DAG-as-shrinkage-tree) · all
recurring verbs = pacer lanes incl. the poll tick (minutes tolerance) ·
draw-ledger collapse (quota/usage/request) · reconciler registry ·
facts-vs-judgments law + redirect resolver + singleton rebuilder ·
coverage contract · proposal verb + idempotency helper. Adopted (seams
lens, base-text patched): vote→mention K6 mapping (one distinct voter = one
mention; ballot bypasses LLM) · poll_surface coverage watermark (A defined
for push-complete sources) · containment demand read w/ DAG set semantics
(mint-invariance) · engine read law (distinct ancestors once) ·
vote-time global resolution + close-time verification draw (enumerated) ·
provenance/fame-pin re-keyed to SOURCES (engineless towns covered) · rep
same-source-set rule (poll evidence = demand only, no engineId on
poll_surface) · reconciler probe lane registration · descent tiebreak ·
badge gate = K6 existence · Phase B order (seeder before score cut) +
fame-pin re-key line. Adopted (synthesizer): registry-as-staging-surface
synthesis (unification × simplicity). Rejected this wave: nothing — the
three lenses were complementary by construction. Convergences with the
synthesizer's pre-registered pass: estimator zoo, tick/pacer overlap, DAG
plural-parent leak, two-store question (resolved KEEP by the
facts-vs-judgments argument), operability concern (resolved by staging, not
redesign).
