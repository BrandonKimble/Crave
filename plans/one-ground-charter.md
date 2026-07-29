# One-Ground charter — killing the stored bbox (from-scratch design)

Owner directive 2026-07-26: "uncompromising idealism, from-scratch mentality,
only accounting for requirements and constraints and the ideal behavior."
This file is the ideal END STATE and the ordered path to it. It supersedes
the bbox halves of home-surface-charter registry items 13 and 15.

## The law

**A place has ONE ground: its real polygon. Everything else is derived.**

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

**P1 — delete the fallback branches.** The two `NOT EXISTS place_geometries
OR ST_Covers` disjuncts (curated builder, home near-you) collapse to one
`ST_Covers`. Legal only after P0.

**P2 — prefilters to GiST.** Replace the 12 bbox-arm prefilters with
`ST_Intersects` on the geometry index; delete the hand-written wrap arms and
the crossing-row catch-alls; drop the partial bbox GiST expression index.

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
- P4 REMAINING: `PlaceInView.bbox` / `PlaceLike.bbox` is now purely a
  CAMERA/transport envelope (nothing judges with it). Derive it from the
  ground and drop it from the wire — needs the mobile leg (two jumps + the
  launch-zoom derivation) in the same change. Then the merge law's
  `bboxUnion`/`widenBbox`/`upsertSketchEnvelope` collapse into "the ground is
  written once, the envelope is derived", and the four columns DROP.

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

DEFERRED, scoped: strip the ~115 census legal designations only (they are visible
in the UI — "Polls in Anchorage Municipality"), class by class, leaving the 284 and
the `by-the-Sea`/`Village`/`Lake`/`City` stragglers to a human read.

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
