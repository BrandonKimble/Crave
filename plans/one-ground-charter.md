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
- P5b OPEN — signals store a RECTANGLE, not a place: measured on the dev DB,
  876 of 955 signals (92%) carry a place-derived rectangle, ALL of them wider
  than 1 km. A poll "in Austin" literally carries Austin's bounding box, so
  attribution leaks into Round Rock and Pflugerville. Ideal: store the
  placeId (+ a point for point-events) and let the attribution join the
  place's real ground — `ground-containment.ts` is already fully polygon-
  native and is the reference implementation.
  SIZE, honestly: 32 call sites across 7 files, all in the hot demand/supply
  path (search ranking, poll supply, demand aggregation) plus a schema
  migration and a backfill. This is its own arc, not a tail — and it should
  open by writing the attribution law into the new
  `places-containment.integration.spec` harness so the behaviour is proven
  against PostGIS BEFORE and AFTER the change.

## Non-negotiables while executing

- No phase lands without the sim proving the surfaces it touches.
- No invented numbers (§16): every threshold is a measured fact, an owner
  choice, or a derivation.
- The seam (antimeridian) must stay correct at every phase — it is the place
  every bbox shortcut has historically broken (5 latent bugs found and fixed
  2026-07-26 in one audit).
