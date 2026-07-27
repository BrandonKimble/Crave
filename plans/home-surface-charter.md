# Home surface charter (ratified decisions — 2026-07-26)

The persistent page becomes HOME: a Spotify-browse-style surface of
app-curated lists (global-with-rotation + made-for-you). Polls demotes to a
regular page/tab. This file records the owner-ratified decisions that the
build must honor; the full build plan comes later.

## Ratified decisions

1. **Header**: home shares the polls header law EXACTLY (finest place whose
   polygon covers ≥2/3 of the viewport; straddle → "this area"). Fully
   dynamic — it says "Upper West Side" when that is true. The place-verdict
   must be extracted to a shared seam when home is built (it currently rides
   inside the polls feed response) — never forked.
2. **Home content granularity**: shelves floor at CITY. Header may name a
   neighborhood while shelves say "Best of Austin" (scoped to the containing
   city). Zoomed out beyond city: home shows the user's home city's shelves
   plus a pick-a-city shelf of live cities. PLUS: one dedicated dynamic
   section keyed to the user's current location/viewport — when it sits
   inside a neighborhood with sufficient mention density, that section
   builds more-granular lists best-effort ("Best near you in the Domain").
   The architecture must be prepared to handle ANY granularity; the city
   floor is a content-quality policy (a list must be earned by data — the
   no-fake-estimates law applied to curation), not a structural limit.
   Neighborhood shelves generally unlock when measured mention density
   supports them — an earned unlock, not a config toggle.
3. **Polls granularity**: stays fully granular (presence facts + cold-start
   promise). The §6 place-selector's deferred server-side leg (areas with
   polls + counts under the viewport, GROUP BY place_id — no schema change)
   upgrades as a fast-follow of this arc, sharing the "what's under this
   viewport" primitive home needs anyway.
4. **Lists are first-class**: app-curated lists reuse the ListDetail surface
   (toggle strip: open now, price, sort) via viewerRole: 'viewer' + a system
   owner; savable to the user's lists, shareable, showable on profile. No
   sorting controls on home itself; possibly a restaurants/dishes toggle.
5. **Passive location inference** (from the onboarding session's ratified
   rule): home city and travel mode are INFERRED from behavior (search/map
   dwell), never asked. Away-from-home detection flips the dynamic section
   to the visited area.

## TomTom neighborhood capability (proven 2026-07-26)

Reverse geocode with entityType=Neighbourhood returns real neighborhoods
with own bbox + stable geometry id (live-verified: 40.787,-73.9754 →
entityType Neighbourhood, "Upper West Side", geometry id 0000554e-…).
The catalog's lazy sketch-on-first-attention already consumes exactly this
shape; neighborhoods appear in the header as attention reaches them. A
grid-probe audit of nameable neighborhoods in NYC + Austin lives in the
ledger entry of the same date.

## Prep work (before the home build proper)

- Lane generalization: the docked lane is scene-agnostic; ONE registry
  constant names its target (polls today, home later). No poll-named
  identifiers in the runtime layer.
- Deny-list metadata-derived; parentSceneKeys single constant.
- Sequencing decision owner still owes: build home on the current lane
  architecture vs wait for the one-track substrate (an active prototype).
- Polls' legacy FrostedFilterStrip conversion lands with its demotion.

## Curation recipes (constructible from existing data; build subset first)

Per-cuisine/per-dish best-ofs (onboarding-seeded) · context/job lists from
extracted attributes (date night, business lunch, group/kids) · price-band
variants · Trending (21-day rising component) · Hidden Gems (high score,
mention count below city median) · New on the Scene (recent first-mentions)
· "Because you love X" (sibling co-inclusion edges) · weekly personal
rotator ("Your Weekly Tasting" — Discover-Weekly analog: untried dishes
from loved cuisines, refreshes Mondays) · global monthly rotation ("Best
breakfast taco in Austin — July") · programmatic cover art: photo collages

- per-list-type color extraction from existing Cloudinary assets.

## Pick-a-city = explicit intent, soft fallback (decided in execution 2026-07-26)

A tapped pick-a-city card records the pick and flies the camera to the city
bbox. The pick rides every feed fetch as `pickedCityId`, a SOFT FALLBACK
only: the viewport verdict wins whenever it honestly resolves a live city;
the pick fills exactly the broader-than-city gap (a city-bbox camera fit
leaves the city under the ⅔ header law on tall screens, so without it the
tap landed straight back on pick-a-city — observed in the sim pass). No
thresholds were invented and no verdict law changed; explicit user intent is
the only new fact. Re-tapping the same city refetches (pickSeq edge).

## Open items registry (2026-07-26 — the durable deferral log)

Every item here is DELIBERATELY deferred with its trigger; nothing below is
forgotten work.

1. Result-row Save pills show no live hearted-state — needs ONE batched
   membership read for the visible rows (per-row reads would be dishonest
   jank). Trigger: first UX polish pass post sim-verification.
2. No one-tap dish heart on dish surfaces — the hook/routes support it;
   the affordance placement is a design decision. Same trigger as (1).
3. Send-in-app (messaging) share for curated lists — the share-package
   resolver speaks user-list ids only; extend it to curated ids. Trigger:
   messaging share usage exists.
4. Programmatic list artwork (photo collage + color extraction) — V2;
   V1 is the ratified cutout+icon system.
5. Curated recipes/cron ground-up scrutiny + onboarding-seeded
   personalization (first-session made-for-you + first Weekly Tasting from
   the revamped onboarding answers) — THE NEXT ORDERED LEG; starts as a
   design conversation with the owner.
6. Sim visual pass for the whole arc (cutout seams under rubber-band,
   house icon, shelves, plus-modal, pinned Favorites) — blocked on the
   owner's one-time sim sign-in after the Clerk live-key cutover.
7. Strip action-row still on raw MaskedHoleOverlay (non-scrolling,
   renderWhenEmpty — deliberately left); unify onto CutoutBand only if it
   ever needs the edge illusion.
8. Server favorite* HTTP route paths (@Controller('favorites')) kept for
   client compatibility — rename to /lists/* alongside a mobile release
   once the app ships through a store channel.
9. The 8-per-axis shelf caps are GONE (earn-it); the /home/feed response
   carries EVERY earned shelf with no shelf-count bound or pagination —
   dormant at 2 cities, real at a 40-cuisine metro (red team 2026-07-26).
   Trigger: before onboarding a large-cuisine-roster city, add a feed
   presentation bound or lazy shelf loading (presentation concern, not a
   data cap — earn-it stays).
10. ~~Synthetic connectionId composite fallback~~ — RESOLVED AT ROOT
    2026-07-26 (owner-ordered): `curated_list_items.connection_id` is now a
    BUILD FACT (migration 20260727010000; builder writes it, FK cascade keeps
    it live, detail/save read it directly, the adapter's composite fallback
    is deleted and a null-connection legacy dish row is dropped, never faked).
    No synthetic ids exist anywhere to reject.
11. Corrupt Puerto Rico municipio polygons (San Juan, Río Grande, Jayuya —
    place_geometries areas 799–913, world-spanning garbage that "covers" any
    viewport at 1.000). Currently benign for the finest-place law (their
    areas are so huge the finest pick still wins) but they caused the
    "Polls in Jayuya Municipio" headers over Miami and they inflate every
    verdict's candidate set. Trigger: next geometry-pipeline touch — delete
    or re-sketch those rows and add an area-sanity gate at sketch time.
12. /home/feed verdict latency on the New York viewport: 14–17s observed
    (sim pass 2026-07-26) vs ~1.5s for Austin — the coverage SQL against the
    big NYC-area polygons (and the corrupt PR rows in the candidate set) is
    the suspect. Attribute before fixing (per the attribution law).
    Trigger: before NYC onboarding is real; likely falls out of (11).
