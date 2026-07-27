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

1. ~~Save pills show no live saved-state~~ — SUPERSEDED + RESOLVED
   2026-07-26 by the owner's plus/saved pill design: the card heart is DEAD.
   Save pill = circled plus → circled check + "Saved" once the item lives in
   ANY of the viewer's lists (batched POST /lists/memberships, one request
   per screenful via the saved-membership store's ensure queue; save-modal
   and heart mutations mark optimistically; removals re-ask the server).
   Tapping "Saved" re-opens the save modal to reorganize.
2. ~~One-tap dish heart~~ — DISSOLVED by the same design: cards use the
   plus/saved pill, not hearts. (The heart VERB survives server-side as the
   favorites-kind routes; profile-surface hearts unchanged.)
3. ~~Send-in-app share for curated lists~~ — RESOLVED 2026-07-26: the
   share-package resolver's 'list' kind falls through user_lists →
   curated_lists (global visible to all; personal owner-only; no author
   gate — the system owns curated content), and the preview carries
   listSource:'curated' so the DM bubble tap runs the curated fetch seam.
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
8. ~~favorite\* HTTP route paths~~ — RESOLVED 2026-07-26 (owner: no installed
   clients exist): @Controller('lists'), /lists/share, /users/:id/lists;
   mobile client paths updated in the same commit. The favorites-KIND routes
   live at /lists/favorites/items (the kind, not the old name).
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
11. ~~Corrupt place bboxes/sketches~~ — ATTRIBUTED + HEALED 2026-07-26.
    They were NOT leftover polygons: place_geometries holds exactly two
    designed tiers (TomTom outlines + bbox-envelope sketches). The corruption
    was the §1 MERGE LAW's widen-only bbox union joining DISTINCT same-named
    entities (San Juan Municipio PR ∪ a western "San Juan"; also Delcambre,
    Hoover, Osage Beach, San Antonio… 25 rows + 36 outlined rows drifted).
    Healed from factual sources only via
    scripts/data-fixes/heal-place-bboxes.ts (idempotent; run on local +
    prod): outlined places ← TomTom envelope; census sketch-only places ←
    the exact seed law recomputed from the census gazetteer by GEOID; sketch
    envelopes refreshed. See item 14 for the make-it-impossible fix.
12. ~~NY verdict latency~~ — ATTRIBUTED (phase timers, live repro) + FIXED
    2026-07-26: 17,082ms total, of which descendants=16,863ms — the subtree
    walk's `= ANY(parent_place_ids)` recursive join seq-scanned the catalog
    per level for a country-scale subject. Fix: `@>` join + GIN index
    (migration 20260727030000) — same subtree 13,267ms → 28ms. Residual
    (secondary, logged): a WORLD-zoom viewport admits all ~21k census places
    as candidates (placesInView ≈ 1.4s); acceptable today, revisit if globe
    zoom becomes a hot path.
13. Merge-law cross-entity widening (the item-11 root): resolveIdentity can
    match a probe of one entity onto a stored row of a DIFFERENT same-named
    entity, and the widen-only bbox union then destroys the stored bbox.
    Make it impossible at the law: a merge whose bboxes are DISJOINT (no
    overlap between stored bbox and incoming bbox) is a distinct-entity
    signal, not a widen. Owner note 2026-07-26: keep it minimal — no
    speculative gates beyond the law fix. Trigger: next places/identity
    touch; the heal script re-run detects any recurrence in the meantime.
14. List COVERS, Spotify album-cover model (owner-ratified direction
    2026-07-26): kill the 2×2 photo collage on user lists; the owner curates
    ONE cover image per list ("list cover") — creative, vibe-first, never
    forced. Curated home lists stay on the icon system at scale (collages
    read as messy/crowded — the anti-goal); V2 artwork explores a cohesive
    commissioned/AI-consistent icon set beyond lucide. Trigger: the lists
    UX pass after the recipes/onboarding leg.
