# One-Ground charter — killing the stored bbox (from-scratch design)

Owner directive 2026-07-26: "uncompromising idealism, from-scratch mentality,
only accounting for requirements and constraints and the ideal behavior."
This file is the ideal END STATE and the ordered path to it. It supersedes
the bbox halves of home-surface-charter registry items 13 and 15.

## The law

**A place has ONE ground: its real polygon. Everything else is derived.**

## THE UNDERLYING ABSTRACTION (named 2026-07-29, after the dual red team)

Every defect in this arc — all of them — was one substitution, with two faces:

**GEOMETRY WAS STANDING IN FOR FACTS.**

1. **Geometry answering NON-geometric questions.** The vendor STATES identity
   (the geometry id), hierarchy (the reverse-geocode chain → `parent_place_ids`),
   level, and name-at-id. Everywhere the system re-derived one of those from
   shapes instead, it broke — because shapes are approximations and the
   re-derivation inherits the approximation error:
   - identity from name/bbox overlap → the San Juan corruption, 363 shared polygons
   - WHERE-of-an-act from a rectangle → Austin bleeding into 31 places (P5b)
   - ancestry from `ST_Covers` → 10.85% of towns skipping their state (Washington)
   - names from a point probe → the fake "TomTom is coarser" tail, 726 wrong renames
   - a geometric PREFILTER gating a non-geometric predicate → anchored acts dropped
     The rule: **geometry answers only geometric questions** — what is in view,
     what contains this point/box. Identity, hierarchy, naming and attribution
     come from the vendor's stated facts. (What remains legitimately geometric:
     `placesInView`, `smallestContaining`, viewport-signal tiling, probe memory.)

2. **Derived values decoupled from their source's writes.** A derived value
   that is not written AT the write of its source drifts into a lie with no
   event to catch it: the grow-only bbox outlived its polygon (P4 fixed it —
   bbox is SET when the ground is written); the centroid was born from a
   vendor/census position and never re-checked when the real outline arrived —
   564 off-ground points, repaired one-off, and the class was REGENERATING
   until 2026-07-29, when the promotion write gained the same coupling
   (centroid := ST_PointOnSurface(ground) whenever the written ground does not
   cover the stored point). The rule: **a derived value may only be written by
   the write of its source.** One-off repairs treat the symptom; the coupling
   removes the disease.

### The abstraction beneath the abstraction (named 2026-07-30)

"Geometry standing in for facts" is the DISEASE. The healthy form it points
at deserves its own name: **A PLACE IS A MIRRORED VENDOR ENTITY.** TomTom
holds complete entities — id, name, level, parent chain, polygon — and every
defect in this arc came from us RE-DERIVING one field of that entity from
fragments (a name from a point probe, ancestry from polygon nesting, identity
from a name string, an extent from a stored rectangle) instead of copying the
field from the entity itself. The fixes each converged one field onto the
mirror; stated up front, they would have been ONE design rule instead of five
recoveries.

THE FINAL DISSOLUTION — LANDED 2026-07-30 (commit 75752693). Identity is the
vendor's own composite key (geometry id, entityType) — migration
20260730090000 replaces the simple-unique id, so the coincident-boundary case
is REPRESENTED instead of hacked around, and promotion's entity exclusivity
is per (id, level). The county-axis decision table, findIdentityCandidates,
bboxNear and the level-guard id-strip are DELETED with their ~15-test
describe. Three lanes remain: id-carrying (composite lookup), fallback (the
one non-vendor tuple lane), and REFUSED (id-less, loud warn — if that warning
ever fires, the vendor changed its contract; investigate, never resurrect the
table). All three lane laws were proven RED against the pre-dissolution code
first. The paragraph below records why it was deferred and then done:

WHAT THAT VIEW EXPOSED AS THE FINAL DISSOLUTION (as written when deferred):
the name-identity machinery — resolveIdentity's county-axis decision table
(rules c/b'/a/u1-u4), bboxNear, the disjoint-bbox guard, the level-guard
fall-through — exists to reconcile PARTIAL observations, i.e. chain nodes
that arrive without a vendor id. Measured 2026-07-30: **that case has never
occurred** — 0 of 22,769 places lack a vendor id, 0 fallback-provider mints
exist, and every mint since P3 carried its id (the adapter emits null only if
the vendor omits dataSources.geometry.id, which live traffic has never
shown). The decision table is defense code for a world that no longer exists
— and it is where this week's only CRASH bug lived (the level-guard P2002
loop). The dissolution: an id-less node updates nothing and mints nothing
(log it loudly; the fallback "this area near…" lane stays as the one honest
non-vendor path). Open it in a fresh session with a RED-provable spec that an
id-less observation is REFUSED, then delete the table. Until then the table
stands, correct but dead weight.

### THE NEXT DISSOLUTIONS — the abstraction docket (dual audit, 2026-07-30)

STATUS 2026-07-30, same session: #1, #2, #3, #4 and #8 LANDED (commits
88c74330, ea7aca32, c279db18, 6cd1e271, 46ef7792 — geo nullable with the
anchor-or-geo CHECK; birth-synchronous outline with the earned-moment
triggers, header memory, census cheap-step and anchorless span guard all
deleted; per-minute pools with terminal refusal; the residue columns dropped
along with uq_places_identity's name-uniqueness law and the entire
resolveGeometryId lane; act-identity SQL stated once). #6 and #7 LANDED
next session (commits 2bf1213d/aa9e4b41, deployed): the owner ruled the
aggregate IS the law — the fresh ledger arm (the second dialect) is deleted
everywhere (entityDemandScores, querySuggestions, territoryEntityDemand,
demand-mass place/subject/by_actor), the aggregate includes today and the
15-min rebuild cadence is the freshness contract; territoryUnmetAsks keeps
its ledger read by design (it reads ask CONTENT, not demand mass). #7: the
reconciler's asked-region memory moved from a per-process array to the
probed_regions table (migration 20260730140000, disc|box CHECK, 30d TTL
pruned lazily at read); the scale judgment stays in TS. REMAINING: #5's
widen-shrink revisit only (post-#1 the sketch lane is tail-only — fallback
mints and refused claims — so widenSketchGround/the disjoint guard now
serve only that tail; shrink when next touched).

Two independent architecture audits (Opus 5 + Fable 5), each asked "what are
we building on without questioning?", one measuring the live DB, one reading
the code's own testimony. Ranked by cost of keeping; convergence noted.

**1. The earned-moment promotion apparatus (BOTH, + owner's own measurement).**
Built for scarce paid polygons. Dead three ways: the pools are 100k catastrophe
backstops that honest work cannot bind; the queue is 100% drained (22,766
promoted, 0 pending); trigger counts are paid_seed 19,505 / birth 3,239 /
credit_prefetch 17 / header_answers 5. Charter P0's SECOND HALF ("polygon at
birth becomes synchronous-by-default; the queue survives only as the retry
lane") NEVER LANDED — birth still waits for the hourly cron, so a newborn
answers headers from a fat envelope for up to an hour, the exact judged-by-
rectangle class this arc killed. Also inside it: the two-step cheap-geocode
flow is UNREACHABLE (every enqueueable place is tomtom with an id), and the 3
sketch-grade stragglers (the Peru chain) have NO queue row and nothing sweeps
for them — a live gap. DISSOLUTION: birth fires an immediate governed fetch;
queue = retry lane with attempts; triggers a/c/e, the header-answer memory,
credit_prefetch's ritual coupling, and the cheap-draw step all delete. Entity
exclusivity moves to the birth write.

**2. Month-as-backoff + no terminal state (BOTH).** The month window neither
rations (backstop) nor matches the vendor (~5 QPS per-minute is the real
grain, named in governance.service as the KNOWN BETTER SHAPE). Distortions:
retry latency is a function of the CALENDAR DATE of failure (a miss on the
1st waits ~30 days, on the 30th ~1 day); a refused claim (vendor doesn't
model the place separately — a FACT) retries forever, re-spending monthly;
a runaway burns 100k in ~5.5h then blocks all work for ~25 days. DISSOLUTION:
per-minute admission pool (registry already supports it), month stays as
meter+alarm, failure-kind backoff, and a terminal 'refused' status.

**3. signals geo columns NOT NULL (BOTH — and the window is NOW).** Post-P5b
there are three honest shapes (rectangle / point / place-anchor) and the
constraint forces anchored rows to manufacture a centroid — the apparatus
that already caused the silently-dropped-poll-acts bug. DISSOLUTION: nullable
geo + CHECK (place_id IS NOT NULL OR geo_min_lat IS NOT NULL);
centroidGeoFromPlace deletes; the aggregate's exclusion becomes the positive
statement; pullDemandWatermarkBack gets the null-aware form. Prod has ZERO
poll-kind signals, so this migration is free today and costs more every day
after launch.

**4. Residue columns (BOTH).** localScriptAlias: write-only, zero readers
anywhere — delete. places.promoted_at: zero readers (the drain reads the
queue row's) — delete. county: sole consumers are the unreachable census-
resolve lane — dies with docket #1; until then mergeSketch gap-fills fuel
for an engine with no road. provider: a varchar serving as the boolean
"is this a mirrored vendor entity". KEEP: subdivisionCode (display region),
timeZone (poll local-time) — load-bearing.

**5. SKETCH-GRADE (the productive disagreement).** One auditor: dissolve it —
birth writes the real outline or nothing; the envelope is the LAST rectangle
that can judge, and every widen/TOCTOU/disjoint-guard scar exists only
because a rectangle can be re-widened. The other: the representation must
stay for the honest tail (fallback mints and vendor-doesn't-model-separately
places have no outline to fetch). SYNTHESIS: both are right — ordinary births
go straight to outline (docket #1), the envelope survives ONLY for the tail
lanes, and the widen law shrinks to tail-only code. Revisit widen deletion
AFTER #1 lands.

**6. The dual-arm demand read (ONE auditor; a real design question).** The
attribution law exists in two dialects: the aggregate's containing/contained
CTEs and the fresh arm's predicates — and they have ALREADY diverged once
(the midnight step-discontinuity, caught by red team). The aggregate rebuilds
today's slice every 15 minutes and the readers then DISCARD it (day <
today), re-deriving today per-query through the second dialect. Proposed:
one law, one implementation — readers read the aggregate for ALL days,
today's slice on a tightened cadence; the fresh arms delete. The other
auditor judged the aggregate sound without flagging the fresh arm; this one
needs an owner decision (staleness budget for today's demand: minutes vs
live).

**7. The reconciler's asked-region memory (ONE auditor).** Per-process,
unbounded array, linear scan, lost on restart. The ideal home became obvious
after P5a: ProbedRegion is disc|box and PostGIS represents both natively
with a GiST index — a small table turns the spend-avoidance memory durable
and indexed. Low urgency; cents at stake.

JUDGED SOUND by both, with live constraints: the day-rebuild aggregate +
watermark (re-attribution seam is real), the DAG ancestry walk (10.85%
measured), derivedBboxSelectSql + viewArms (measured), entity exclusivity
per (id, level), ProbedRegion's union, the UTC transaction law, the advisory
locks, simplify-at-write/read constants. One drift seam to close cheaply:
DEDUPE_KEY_SQL / EVENT_COUNT_SQL / first-occurrence are duplicated verbatim
between the aggregate and read services — extract to shared SQL like
ground-containment.

Corollary for review: when a bug appears in this domain, ask FIRST "is
geometry answering a question the vendor already answered?" and SECOND "is a
derived value being written anywhere other than its source's write?" Both
red teams' findings, and every fix this arc, reduce to one of the two.

Known residue, documented not hidden: `pickBboxAgreeingCandidate` (adapter
forward-geocode fallback) still disambiguates by bbox agreement — reachable
only for anchor-less rows, of which prod has zero; dies with the P3/P4 tail.
`mergeSketch` still gap-fills centroid from the observed position for
outline-less rows — that IS the best available fact there, and the promotion
coupling re-derives it the moment a real ground lands.

There is no stored bbox. There is no second, weaker shape that can drift,
be merged wrong, or silently judge. When code needs a rectangle it derives
one from the ground at the moment of use.

## Why the bbox exists today (the honest history)

Polygons used to be SCARCE — a rationed, paid, "earned moment" resource, so
a place was born with a cheap approximate box and _maybe_ got its real shape
later. Every bbox mechanism in the codebase is scaffolding for that world:
sketch envelopes, the promotion queue's earned triggers, the "no geometry →
judge by bbox" fallbacks, box-vs-box identity matching.

That world is gone (owner ratified 2026-07-22, "off the free tier"):

- The stable geometry id arrives FREE inside every geocode response
  (live-verified vendor fact, adapter header).
- A polygon costs ~$0.0025 (10,000/mo pool ≈ $25).
- 22,424 / 22,758 places (98.5%) already carry a real TomTom outline.

The scaffolding outlived the scarcity it was built for. That is the whole
defect — and the San Juan corruption (a municipio spanning 45° of longitude)
was its first real bill.

## What survives as a rectangle (requirements, not habits)

1. **The viewport.** A phone screen is a rectangle. It is the clip target of
   the coverage law and the shape of every "what is in view" request.
2. **Camera fits.** Fitting a camera to any geometry reduces it to that
   geometry's envelope — so a fit needs an envelope, DERIVED from the ground
   (`ST_Envelope`), never a stored column.
3. **Vendor request formats.** Google's API accepts a circle (point+radius)
   or a rectangle for search bias; it cannot accept a polygon. This is a wall
   at the vendor edge only — it never justifies storing a shape.

Nothing else. Every other bbox use is scaffolding.

## The five dissolutions (from-scratch re-derivation)

| Today                                                                | Ideal                                                  | Why                                                                                                                                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity/merge compares BOXES of a new observation vs a stored place | Compare GROUNDS                                        | Boxes are fat and overlap; two different Springfields look like one. Real shapes never do. The polygon is available at observation time (id is free, polygon ¼¢). **This is the corruption's root.** |
| Negative probe memory stored as a SQUARE                             | Store the CIRCLE it actually is (point + radius)       | TomTom's reverse geocode speaks for a 100m RADIUS. We squared a circle and claimed ~27% corner area we never searched.                                                                               |
| Wrong-entity guard validates a polygon against the stored box        | Validate against the ANCHOR POINT the lookup came from | "Does this polygon contain the spot we asked about?" is strictly stronger and needs no box. A mislabeled San Antonio 200 miles away fails instantly.                                                 |
| Duplicate vendor candidates picked by box overlap                    | Pick the candidate whose polygon contains the anchor   | Same dissolution.                                                                                                                                                                                    |
| Signals store WHERE as 4 flat floats (a place's rectangle)           | Store the placeId (+ point for point-events)           | A poll "in Austin" currently carries Austin's bounding rectangle — which includes chunks of Round Rock and Pflugerville, so attribution leaks into towns the poll is not in.                         |

## The prefilter question (12 sites)

Splitting "cheap find" from "exact judge" is correct engineering and STAYS.
What is wrong is the implementation: four float columns plus FOUR
hand-copied versions of the wrap-around-the-globe arithmetic, when the
database has a spatial index (GiST) that does exactly this job natively.

Ideal: `ST_Intersects(geometry, view)` on a GiST index — one line, correct at
the seam, and it deletes the "crossing places can't be range-tested, so drag
them ALL into every query" catch-alls.

## Ordered path

Each phase is independently shippable and leaves the tree green.

**P0 — 100% ground coverage (THE GATE).** Nothing downstream is legal while
a "place with no ground" state exists.

- Root fix: resolve a census place's geometry id by REVERSE-GEOCODING ITS
  CENSUS INTERNAL POINT (an authoritative coordinate guaranteed to lie inside
  the real place; 334/335 stragglers carry one) instead of name-matching a
  string like "Switzerland, Baker, FL" and then disambiguating by box. Point
  identity has no ambiguity to disambiguate. This is the same dissolution as
  the wrong-entity guard, applied one step earlier.
- Then: polygon AT BIRTH becomes synchronous-by-default rather than an
  hourly earned drain; the queue survives only as the retry lane.
- Exit: zero places without a ground; the drain's straggler backlog is empty.

**P1 — delete the fallback branches. LANDED 2026-07-26** (the curated-builder
collapse; the aggregate spec asserts the old arm's ABSENCE). Verified
2026-07-30: zero `NOT EXISTS place_geometries` disjuncts remain in runtime
code.

**P2 — prefilters to GiST. LANDED 2026-07-30** (commit ab6826f1). The
aggregate's containing CTE collapsed to ONE `ST_Covers` arm — PostGIS itself
expands it to `&&` on the geometry GiST plus the exact test, so the hand-built
machinery (bbox-envelope expression index, materialized crossing-place
catch-all, UNION of wrap-arm branches) was re-implementing the index by hand
on a derived rectangle. The four fresh-arm sites prefilter on
`ground && geoEnvelopeSql(signal)`. lng-intersect.ts deleted whole (every
export runtime-dead). Proven equivalent live: a real prod day rebuilds with
identical row counts (14,232/14,230).

**P3 — identity is the VENDOR ID, not the name.** LANDED 2026-07-26, and the
answer turned out stronger than "compare grounds": TomTom stamps every entity
with a STABLE geometry id (live-validated: identical across reverse and
forward geocodes). So identity is exact and free — no name normalization, no
county axis, no geometric comparison, no extra vendor call:

- an observation carrying a vendor id matches the row with that id, directly;
- a same-name candidate carrying a DIFFERENT id is disqualified (the vendor
  says it is another entity) — the homonym is minted as its own place;
- an id disagreement can no longer reach the merge, so the old
  warn-and-widen-anyway branch is gone.
  This is where the San Juan corruption class actually dies: names were never
  identity ("Scotland" is a Georgia town AND a country), and the widen-only
  union could only destroy an extent because a name collision let two entities
  meet in the first place. Remaining P3 tail: `bboxUnion`/`widenBbox` survive
  until P4 makes bbox derived — with identity exact, they can no longer merge
  across entities.

**P4 — bbox becomes derived, then unstored.**

- P4a LANDED 2026-07-26: `placesInView`, the hot path, finds candidates with
  `geometry && view` (PostGIS's INDEX-ONLY bbox overlap — the same cheap-find
  /exact-judge split, expressed by the GiST index instead of four
  hand-maintained columns) and returns each candidate's view-simplified
  ground in the SAME query. The crossing-row catch-all is gone. Measured:
  world-zoom find+simplify 27ms vs the 1,442ms the NY attribution recorded.
  Ground-read failure now yields NO candidates rather than bbox envelopes —
  the §2.6 law stated plainly.
- P4 COMPLETE 2026-07-30 (commit 708ef389): the four columns and the bbox
  expression index are DROPPED, on the local dev DB and on prod. NO mobile
  leg was needed — the insight that unlocked it: the law forbids STORED
  shapes, not wire rectangles, so `PlaceInView.bbox` stays on the wire and is
  derived from the ground IN THE SAME QUERY that fetches it
  (`derivedBboxSelectSql`, wrap-aware: a crossing geometry reconstructs the
  min>max convention from per-arm extents via ST_Dump — live-verified on
  prod: the US derives 172.5→-66.9). The merge law's widen now GROWS THE
  SKETCH GROUND ITSELF (ST_Envelope∘ST_Collect against the live row, outline
  rows guarded); writeSketchGround takes the observed envelope as a
  parameter; launch camera, enrichment bias, the county decision table, the
  promotion span guard and catalogKnowsBbox all derive at use. The sim leg of
  the non-negotiable is OWED: the wire shape is byte-identical and pinned by
  the controller spec, but the home surface has not been eyeballed since the
  drop.

**P5 — the honest shapes.**

- P5a LANDED 2026-07-27: probe memory is a DISC (centre + radius in metres),
  not a squared circle. `ProbedRegion` is a discriminated union because the
  memory genuinely holds two shapes — a probe's disc and a probed VIEWPORT's
  rectangle — and forcing them into one was the defect. Squaring cost ~21%
  false "already asked" area (4r² vs πr²), which could suppress discovery of
  a real place in a corner for the whole 30d TTL. RED-provable spec asserts
  the square answers a 1.27r corner and the disc does not.
- P5b LANDED 2026-07-28 (commit c6c8a7ee). `signals.place_id` is the anchor;
  when set, attribution is ground-to-ground (`ST_Covers(candidate, anchor)`) —
  the place and its ancestors, and NO tiling arm, because a poll is not a
  viewport. The aggregate drops anchored signals from `geos` entirely and joins
  them to their own place through a LATERAL. `bboxFromPlace` is retired for
  `centroidGeoFromPlace`, so an anchored act's geo columns assert no extent.
  Proven RED (sabotage → `["BigCity","State","Suburb"]`) then GREEN against
  real PostGIS, and the LATERAL was executed against a real DB on both
  branches because its unit spec only string-matches. The attribution below is
  the record of what was wrong and why.

- P5b BACKGROUND — RE-ATTRIBUTED 2026-07-28 against PROD. The earlier framing here
  ("876 of 955 signals carry a place-derived rectangle", "32 call sites across
  7 files") was measured on the DEV database and was wrong in both directions.
  The truth is worse in effect and far smaller in scope.

  WHAT IS ACTUALLY WRONG — exactly one producer. `polls.service.pollSignalGeo`
  calls `signals.bboxFromPlace(placeId)`, which stuffs the place's stored
  BOUNDING RECTANGLE into the signal's geo. `bboxFromPlace` has exactly ONE
  consumer (that function, 4 call sites). Every OTHER signal geo is HONEST and
  must not be touched: `bboxFromBounds` is a real viewport, `entity_view` and
  the user-lists/restaurant paths are true points. Charter §"what survives as a
  rectangle" item 1 says a viewport IS a rectangle — a blanket "signals store a
  placeId" would have DESTROYED correct data. P5b is a poll-signal fix, not a
  signals-wide migration.

  THE MEASURED EFFECT (prod, all 22,778 places with a ground + bbox). The
  attribution law is `placeCoversGeo OR geoCoversPlace`:
  - arm (i) `ST_Covers(ground, geo)` fails for **22,774 / 22,778 = 99.98%** —
    a polygon never covers its own bounding rectangle (the 4 passes are
    rectangular/degenerate grounds). So a poll does NOT attribute to its own
    place through the containing arm at all.
  - arm (ii) `ST_CoveredBy(ground, geo)` rescues it — but OVER-FIRES, matching
    every OTHER place whose ground fits inside that rectangle. Measured:
    **Austin bleeds into 31 other places**, Denver 9, Portland 9. One poll
    created in Austin registers demand in 32 places.

  NOT YET LIVE ON PROD — the fortunate part. Prod signals are only
  `viewport_dwell` (465), `search` (282), `entity_view` (77); zero poll-kind
  signals exist because prod's 17,941 polls were seeded, not created through
  the API. So this can be fixed BEFORE it writes a single bad row. Fix it
  before poll acts start flowing.

  IDEAL: a poll signal's WHERE is its placeId — a nullable `place_id` on
  `signals`, preferred by the attribution when present, with the geo columns
  retained for the genuinely-rectangular and genuinely-point kinds.
  `ground-containment.ts` is already fully polygon-native on the place side
  and is the reference implementation. Open by writing the bleed into
  `places-containment.integration.spec` as a RED-provable case (the Austin-31
  number is the assertion) BEFORE changing the law.

## NAMES ARE RESOLVED BY ENTITY (owner ratified 2026-07-28)

**A place's name is what TomTom calls the entity whose id we hold.** TomTom is
canonical, across the board. Applied: 692 renames, 2 index collisions skipped.
End state: 22,767 places, 22,767 tomtom, 0 census designators.

The owner's correction that got us here, recorded because I argued the wrong
side twice: two DIFFERENT places spelling their names differently is not an
inconsistency. `De Soto, MO` vs `DeSoto, TX`, and `St. Paul, OR` → "Saint Paul"
vs `St. Paul, MO` → "Saint-Paul", are different towns entitled to different
spellings. The only thing that would matter is ONE place getting contradictory
names, and no evidence of that exists. Do not re-open this to chase
cross-place consistency; there is no rule to find and the search wastes days.

THE QUESTION MUST BE ASKED BY ENTITY, NOT BY POINT. "What municipality is at
this point?" can answer with a NEIGHBOUR or the containing town — that is where
the whole fake "TomTom is coarser" tail came from (Jacksonville NC, Lake Ozark
MO, Absecon NJ). `resolve-entity-names.ts` probes the place's own on-ground
point and compares the RETURNED GEOMETRY ID against `providerPlaceId`; a name
is a candidate ONLY when the ids match. Coarser answers are then excluded by
construction, not by judgement.

SCAR — read before touching that script. Its first version chose the name with
a fallback chain (`municipality ?? countrySecondarySubdivision ?? ...`) instead
of keying to the place's OWN LEVEL. When the level-appropriate field was absent
it silently took a COARSER name: Austin's `Bouldin Creek` neighbourhood became
"Austin", `Alexander, AR` became "Saline" (its county). It wrote 726 production
rows before being caught. 687 were reverted by replaying the log; the rest were
repaired by the corrected run (reading the right field returns the true name
regardless of what is stored). **A matching geometry id does not license
reading an arbitrary field off the response.** Two guards limited the blast
radius and both were pre-existing, not care taken at the time: the identity
index rejected 30 collisions, and the geometry-id check meant only genuinely
-ours entities were touched. The process lesson: `--execute` was run on 22,767
rows off a script written minutes earlier, spot-checked on 12 rows, skipping
the dry-run to save 80 minutes. The 80 minutes got spent anyway.

VERIFIED after the corrected run — swept for the bug's signature catalog-wide
(a place carrying the name of a coarser place that CONTAINS it): 206
Municipality-in-same-named-county hits, all legitimate US geography (county
seats: Kalamazoo, Racine, Missoula, Tuscaloosa, Santa Clara, Providence), plus
Arkansas/Iowa/Oklahoma/Utah counties in their states and Virginia's independent
cities. No damage remains.

## Catalog verdict — FULL audit, all 22,726 places (2026-07-28)

`audit-catalog-vs-vendor.ts` with no `--sample`, level-pinned, every place's own
anchor reverse-geocoded against TomTom:

```
agree=22307  levelDiff=0  countryDiff=0  nameDiff=407  noVendor=12
```

**Zero structural error in the entire catalog.** This closes the "should we scrap
and re-seed?" question with a measurement instead of a hunch: there is nothing to
re-seed. It also makes the cost of a wipe the only remaining variable, and that
cost is severe — TEN tables carry a `place_id` and only ONE
(`curated_lists.city_place_id`) has a foreign key, so a truncate would SILENTLY
orphan ~34k rows (polls 17,941; poll_place_supply 16,236; poll_topics,
poll_weekly_ticks, signal_demand_daily, engines.member_place_ids,
notification_devices.home_place_id, sources.anchor_place_id). Silent, not loud.

READING THE LOG IS PART OF THE MEASUREMENT: only DIFFERENCES are logged, agreements
are silent. A raw `wc -l` of the log reads as a ~93% failure rate; converting the
last alphabetical name into a real denominator showed 5,552 places behind 73 lines
(~1.3%). Nearly shipped the opposite conclusion off the raw count.

### The 407 name diffs are NOT a defect count — do not sweep them

Classified: 123 are ours = vendor + a census legal designation (78 `Municipio`,
11 `Census Area`, 11 `Borough`, 9 `Planning Region`, 4 `City and Borough`,
2 `Municipality`); 284 are genuinely different names. In the second group WE are
frequently correct — "Ashville" vs vendor "Harrison" is the vendor modelling a
coarser township (the Glen Echo Park / Normandy class, already guarded), and
"Baltimore" vs "Baltimore County" is better as ours on a county row. A blanket
"adopt the vendor name" would DESTROY correct data, and would turn
"Carmel-by-the-Sea" into "Carmel" — the wrong name for that town.

DONE (superseded by the entity-name law, 2026-07-29): the 115 designators were
stripped, and then the whole name question was resolved permanently by
`resolve-entity-names.ts` — a place's name is what the vendor calls the entity
whose id we hold. This paragraph's class-by-class caution stands as history.

### The representative point must be ON THE GROUND (found 2026-07-28)

Chasing "should we just adopt TomTom's coarser names?" surfaced a real defect
that had been masquerading as a naming disagreement: **564 of 22,715 places
(2.48%) had a centroid that did not lie inside their own polygon.**

Cause: a plain centroid of a CONCAVE or MULTI-PART polygon falls outside it (a
C-shaped town; a town with islands). Consequence: every probe that used the
centroid as "a point in this place" was asking about somewhere else — which is
precisely why the audit reported a neighbouring town's name for those rows.
The "113 places where TomTom is coarser" figure was substantially an artifact
of probing the wrong spot, not a vendor disagreement.

FIX: `ST_PointOnSurface(ground)` — guaranteed to lie inside the geometry, and
DERIVED from the one ground, exactly as the law wants. Applied to the 564
broken rows only; 0 remain outside. Re-probing the affected names with correct
points moved 131 of 210 from "disagrees" to "agrees". A fresh 300-sample audit
after the repair: **agree=291, levelDiff=0, countryDiff=0, noVendor=0,
nameDiff=9** — and all 9 are the classes we deliberately keep.

DO NOT "fix" this by adopting the vendor's coarser name. Verified on real rows
(Ashville OH, Blanchard LA, Hochatown OK, Dennis TX): each has a DISTINCT
TomTom entity id and its OWN, much smaller polygon — the vendor models them
individually. The coarse answer comes from the QUESTION ("what municipality is
at this point"), which can return a neighbour or the containing town; it is not
the vendor lacking the place. Renaming Ashville to Harrison would leave a place
called "Harrison" holding Ashville's boundary while the real Harrison exists
separately — re-creating the exact duplicate-identity class P3 eliminated.
The name and the polygon answer different questions: the polygon comes from the
entity's own id (specific and correct), the coarse name from a point lookup.

### Names — the catalog is now 100% vendor-sourced (2026-07-28)

END STATE: **22,767 places, every one TomTom-identified with a vendor id.** The
census is gone from the data as well as the code.

The 11 vendor-less rows were DELETED (owner call): organic minting only ever
creates what a reverse-geocode chain returns (`sketchChain` upserts every node
of the chain and nothing else), so a place TomTom does not model would never
come into existence. Those 11 could only have arrived from the census seeder.
Their only content was 10 machine-generated "Best restaurants in X" polls with
zero votes, zero comments and no human author; deleted with them, and an
orphan sweep across polls / supply / topics / demand / weekly ticks confirmed 0.

NAME CLASSES, decided by measurement rather than a sweep (407 diffs):

- **115 census legal designators STRIPPED** — Municipio (78), Borough (13),
  Census Area (11), Planning Region (9), City and Borough (4), Municipality (2),
  all at CountrySecondarySubdivision. Verified first that the vendor's measured
  name EQUALS the stripped form for all 115 (0 mismatches), so this adopts the
  vendor rather than guessing. Collision-checked against the identity index
  (0 collisions) before applying. "Polls in Anchorage Municipality" now reads
  "Polls in Anchorage".
- **2 EXCEPTIONS kept** — `Kodiak Island Borough`, `Lake and Peninsula Borough`:
  the vendor's own name includes "Borough". A blanket regex would have broken
  these, which is exactly why the class was verified per-row.
- **5 census "official (common)" artifacts ADOPTED from the vendor** —
  `San Buenaventura (Ventura)` → `Ventura`, `El Paso de Robles (Paso Robles)` →
  `Paso Robles`, etc.
- **160 St./Saint: WE KEEP OURS, against the vendor.** House style is "St."
  (184 rows vs 1) and it is the friendlier form; the lone `Saint Edwards`
  outlier was normalized to `St. Edwards`. The vendor is authoritative on
  IDENTITY, not on typographic house style.
- **14 vendor-appends-a-designator LEFT ALONE** — vendor "Baltimore County"
  vs our "Baltimore" on a county row: ours is cleaner in context.
- **113 genuinely-different entities LEFT ALONE** — vendor "Harrison" for our
  "Ashville" is the vendor being coarser, not a correction.
- **9 parentheticals KEPT** — `Bath (Berkeley Springs)`, `Addison (Webster
Springs)` … probed live: TOMTOM ITSELF carries the parenthetical. Not our
  artifact, so not ours to rewrite. If editorial display names are ever wanted,
  the right shape is a separate display-name concept, NOT overwriting the
  vendor's `name` — that is the open question, deliberately not hacked.

DURABILITY (checked, not assumed): `mergeSketch` never writes `name` — it only
gap-fills nulls — so these edits cannot be reverted by a later observation.

### Census retirement — measured 2026-07-28, 11 rows left and they are honest

Code: ZERO load-bearing census references remain in `apps/api/src` or
`packages/shared/src` — every hit is a comment describing history.

Data: probed all 22 remaining census-GEOID rows against TomTom at their own
anchors. 21 returned an entity, but only 11 returned THEMSELVES; the other 10
returned the NEIGHBOURING municipality that contains them (Glen Echo Park →
Normandy, Sweetwater → Miami, Mule Barn → Cleveland, Rentiesville → Checotah,
Cherokee Ridge → Union Grove, Cimarron City → Crescent, Lone Chimney → Pawnee,
Vernon → Hanna, Viola → Morrison, Holt → Kearney). Those 10 plus Keansburg NJ
(no entity at all) are places TomTom does not model individually — claiming
those geometry ids would be exactly the entity-exclusivity violation the
promotion guard exists to prevent, and would put two towns on one outline.

Applied: the 11 self-matching rows adopted their TomTom identity (their
outlines were ALREADY TomTom-sourced — `place_geometries.provider_boundary_id`
was the TomTom geometry id; only `places.provider_place_id` still held a census
GEOID), and Texas + United States had their stale `provider='census'` label
corrected. Result: **22,767 tomtom / 11 census**.

The 11 are not a debt to pay down — they are the honest tail. They keep a
census-derived approximate outline because no better source exists for them
today, and organic discovery will replace any of them the moment TomTom starts
modelling it.

### The coarse-grid onboarder — BUILT 2026-07-29 (`apps/api/scripts/seed-region.ts`)

Shipped as a SCRIPT, dry-run by default. Not a cron, not an endpoint: opening a
region is rare, deliberate, expensive and human-initiated, and the two
alternatives both invite an unattended or accidental continent-scale spend.

    npx ts-node scripts/seed-region.ts --region "France" --spacing-km 15
    npx ts-node scripts/seed-region.ts --region "France" --spacing-km 15 --execute
    npx ts-node scripts/seed-region.ts --bootstrap 48.85,2.35   # region unknown yet

It CREATES NOTHING. It chooses WHERE to look and hands each point to the same
path organic discovery uses (`probe()` → `sketchChain()`), so one call mints the
whole ladder with a vendor id per rung. That is the design, not an
implementation detail: the census seeder was a PARALLEL creation path with
different rules and every defect in this file's history came from it. If that
script ever grows its own upsert, that is the bug.

MEASURED (dry runs against prod):

| region        | spacing | cells on ground | already covered | probes  | wall clock |
| ------------- | ------- | --------------- | --------------- | ------- | ---------- |
| Rhode Island  | 15 km   | 12              | 1               | ≤11     | ~1 min     |
| United States | 100 km  | 941             | 450             | ≤491    | ~2 min     |
| United States | 15 km   | 41,671          | 19,528          | ≤22,143 | ~82 min    |

Incidental finding worth acting on someday: coverage is SPARSE even in the US —
Rhode Island holds 8 of ~39 municipalities, 11.8% of the state's area, and 47%
of US cells at 15 km are uncovered. This tool is useful for filling in existing
territory, not only for new continents.

THREE RED-TEAM FINDINGS AGAINST MY OWN FIRST DRAFT, all fixed:

1. **The seam guard was DEAD CODE.** I refused regions where
   `min_lng > max_lng`. A polygon whose parts straddle 180° (the US, via the
   Aleutians) stores XMin=-179.15 / XMax=179.78, so the test is FALSE and never
   fired. The sweep therefore spans the long way round the globe — a SUPERSET —
   and `ST_Covers` clips it back to exactly the right cells. Correctness comes
   from the CLIP, never from the extent. Guard deleted, reasoning written down;
   a guard that cannot fire is worse than none because it reads as protection.
2. **Array-shipping does not scale.** Grid generation moved into SQL
   (`generate_series` + a per-row LATERAL lng step, because longitude degrees
   shrink with latitude and one fixed step would under-sample exactly where the
   region is widest). Verified byte-identical output before/after.
3. **`ST_Covers` against one country-sized MultiPolygon is the real wall.**
   US @ 15 km did not finish in 10 minutes: a single huge geometry cannot be
   helped by an index (it is one row) and its bbox is useless as a prefilter
   when the region straddles the seam. Fixed with `ST_Subdivide` into
   GiST-indexed pieces inside ONE interactive transaction — temp tables are
   per-connection and Prisma pools, so the transaction pins them. This is the
   canonical PostGIS answer to point-in-large-polygon, not a workaround.

### P5b BUG — ANCESTORS MUST COME FROM THE DAG, NOT FROM GEOMETRY (found 2026-07-29)

**Measured: 2,111 of 19,452 (10.85%) municipality→state links that the DAG
asserts are MISSED by P5b's geometric ancestor test.** A poll in any of those
towns attributes to the town and the country, silently skipping its state.

The cause is a wrong claim in my own P5b note. I wrote that ancestors are
resolved geometrically "because `places.parent_place_ids` holds DIRECT edges
only, so a DAG walk would need recursion per row; `ST_Covers` answers the same
question in one GiST-indexed predicate." **It does not answer the same
question.** `ST_Covers(candidate, anchor)` asks which grounds geometrically
CONTAIN this ground; that coincides with the hierarchy only when polygons nest
perfectly, and they do not. `ST_Covers` is all-or-nothing, so a single sliver
outside the parent breaks the link — and slivers are the norm, not the
exception: municipal outlines include bays, barrier islands and coastal water
that the state outline generalises away. The >20% spill cases cluster in
AK (63), FL (62), NY (25), NJ (25), CA (20) — coastlines, not errors.

The worked example that exposed it: TomTom's `Washington` Municipality is
159.5 sq mi with only 42.8% inside the District (36.6% Maryland, 21.1%
Virginia) — the metro agglomeration, not the city. So the District's ground
does not cover it, and the geometric walk yields `Washington → United States`.
The DAG, built from the vendor's own reverse-geocode chain, has it right:
`Washington → District of Columbia (county) → District of Columbia (state) →
United States`. The vendor's STATED hierarchy is a fact; the polygon nesting is
an approximation. Identity already follows that principle (P3: the vendor id,
not a geometric comparison) — ancestry must too.

FIXED 2026-07-29, the way this section prescribed: the Washington case was
written into `places-containment.integration.spec` as a RED-provable
assertion first ("ANCESTRY IS THE VENDOR CHAIN, NOT POLYGON NESTING"), then
`placeAnchoredAttributionSql` (ground-containment.ts) was rewritten to walk
`parent_place_ids` — a bidirectional recursive chain walk (anchor's
ancestors OR candidate's chain reaching the anchor), no ST_Covers anywhere
on the anchored path. The aggregate rebuild routes anchored acts straight
to the anchor tile with no geometry consulted; read-time lineage supplies
ancestors. Full-alignment audit 2026-08-01 (two independent sweeps over
every containment predicate and every level-code touch) found and fixed
the three stragglers: (1) polls' `engineIdForPlace` derived engine
membership from ST_Covers over the place centroid — now a
`parent_place_ids` chain walk, nearest rung wins, mirroring
`resolveEngineTerritoryPlaceIds`; (2) the user-lists City chip filtered on
lowercase `'municipality'` — matched NOTHING (canonical stored label is
`'Municipality'`, TomTom's global vocabulary), so the chip had returned
zero cities since birth; (3) the probe adapter recorded a malformed
vendor response (rungs named, country slot empty) as a §2 "nothing lives
here" negative observation — now throws `tomtom_missing_country_code` as
an operational fault. Judged legit and kept: the promotion guard's
point-in-polygon refusal (geometry is the thing ON TRIAL there, not the
declared fact), the adapter's bbox pick (no vendor id declared yet), and
`isSubdivisionOrBigger`'s depth judgment (structural, not a label switch;
short-chain city-states read "big", fails safe — edge documented in
place-dag-read.ts). Geometry now answers only geometric questions;
level codes are labels on a variable-length vendor chain everywhere.

### THE CATALOG IS AN INCORPORATED-PLACES LIST, NOT A MAP (measured 2026-07-29)

We hold **19,451 US municipalities covering 47.7% of US land**. 19,451 is
almost exactly the count of US INCORPORATED PLACES (~19,500) — which is what
the census seeder loaded. The US additionally has ~16,000 CIVIL TOWNSHIPS plus
thousands of unincorporated communities, and TomTom models those as
municipalities too. We have none of them.

Probed 20 random points that lie inside a state but inside NO municipality we
hold. **20 of 20 returned a TomTom municipality** — Waterboro and East Hancock
(ME), East Keating and Millcreek (PA), Ridgefield (OH), Exeter and Glocester
(RI), and, in the places you would most expect a genuine void, Mojave /
Tranquillity / Thermal (CA) and Tonopah / Battle Mountain (NV). There was no
"genuinely unincorporated" result anywhere in the sample. The sparseness is
OUR GAP, not the vendor's model.

Per-state coverage confirms the mechanism rather than any geography:

| lowest        |       | highest  |       |
| ------------- | ----- | -------- | ----- |
| Maine         | 3.0%  | Delaware | 93.2% |
| New Hampshire | 5.1%  | Oklahoma | 90.5% |
| South Dakota  | 7.1%  | Georgia  | 88.9% |
| Pennsylvania  | 8.5%  | Texas    | 79.3% |
| Rhode Island  | 13.3% | Florida  | 72.0% |

The floor is New England (ME/NH/VT/RI/CT/MA — land is organised into TOWNS, and
almost nothing is an "incorporated place") plus the township belt
(PA/OH/MI/IN/WI/MN/ND/SD). The ceiling is states whose incorporated places
genuinely do cover the land. Size is irrelevant: Rhode Island is not sparse
because it is small, and California sits at 36.6% for the same reason as
Pennsylvania — a whole class of vendor-modelled place was never loaded.

CONSEQUENCE: `seed-region.ts` is not only a new-continent tool. Running it over
the US at 15 km is ~22k probes / ~82 min and would roughly double municipality
coverage. Deferred pending an owner call on the spend — but this is the real
reason a user standing in half the country resolves to a county instead of a
town, and the reason parts of the map will feel empty.

### Seeding new regions going forward — grid, not census

Owner direction 2026-07-28, and it is the right shape: onboard a new
country/state with a COARSE grid of reverse-geocode probes, and let organic
discovery supply everything finer. The strength is that it is NOT new machinery —
`probe()` returns the WHOLE ladder (neighbourhood → … → country) with vendor ids
per node, so a grid probe mints everything above it through the exact path organic
discovery uses. One creation path means one set of rules; the census's real sin was
being a PARALLEL creation path with different ones. Spacing is DERIVED from the
guarantee (§16: "every county gets ≥1 probe" → spacing under the smallest county's
width), never picked. Retire the census seeder with this.

## Non-negotiables while executing

- No phase lands without the sim proving the surfaces it touches.
- No invented numbers (§16): every threshold is a measured fact, an owner
  choice, or a derivation.
- The seam (antimeridian) must stay correct at every phase — it is the place
  every bbox shortcut has historically broken (5 latent bugs found and fixed
  2026-07-26 in one audit).
