# World-camera L1 — EntityGroup catalog: execution plan

**Status:** designed 2026-07-10 from a full terrain survey (below), for a FRESH focused
session. Parent design: `plans/world-camera-multilocation-foundation.md` §2/§3.1/§3.4/§4.
L2's pure half already landed (`resolve-focus-camera.ts` — anchor rule + focus fit, goldens,
commit 63a655a5); L1 consumes `resolveAnchorLocation` for the representative.

⚠️ This cut touches the SHIPPED map (best-in-class, precious). House rules apply in full:
composite-rig proof per slice, every metric must show RED, no cleanup edits beyond the cut,
LodEngine changes land with `swift test` goldens.

---

## Terrain (surveyed 2026-07-10; file:line current as of 790b8fe9)

**The flat catalog today**

- Contract: `MarkerCatalogEntry` — `src/screens/Search/runtime/map/map-viewport-query.ts:15-19`
  `{feature, rank, locationIndex}` — one entry = one PIN = one location; siblings are peers.
- Builder (the flattening): `buildMarkerCatalogReadModel` —
  `map/map-read-model-builder.ts:38-182`. Restaurants branch :111-177:
  `resolveRestaurantMapLocations` yields all locations; `shouldRenderAllLocations =
selectedRestaurantId === restaurant.restaurantId`; else `pickPreferredRestaurantMapLocation`
  picks ONE. **Binary today: representative-only vs all-as-full-pins; siblings are DROPPED
  from the catalog entirely (not even dots).**
- Pipeline: `computeMarkerPipeline` — `map/compute-marker-pipeline.ts:27-106` (off render path).
- Anchor de-facto: `restaurant-location-selection.ts` `pickClosestLocationToCenter:136` /
  `pickPreferredRestaurantMapLocation:170` — the seam `resolveAnchorLocation` replaces.
- Per-marker props: `RestaurantFeatureProperties` — `search-map.tsx:686-730`. No grouping key,
  no render-role enum, no z-lift channel.

**restaurantOnlyId/Intent (84 refs, 22 files)** — the degenerate profile world

- Producers: `use-search-root-search-primitives-runtime.ts:32` (state + the `ln` ref);
  `use-search-foreground-interaction-effects-runtime.ts:104-113` (the ONE derived-id producer).
- Heaviest consumer + `effectiveRestaurantOnlyId`: `use-direct-search-map-source-controller.ts`
  (~28 refs; 1211,1235-1241 computes the effective gate).
- Catalog filter: `map-read-model-builder.ts:12,45,61,113,121,128`.
- Profile-open matcher: `profile-open-presentation-plan-runtime.ts:24`
  (`matchesTarget = ln===id || restaurantOnlyId===id`) — **couples to L3**, see sequencing.
- `search-world-value-constructor.ts:161` hardcodes `restaurantOnlyId: null` (the new-path stub).

**Seeded markers (5 files)** — store `search-mounted-results-data-store.ts:242-263`;
publishers `profile-panel-hydration-runtime.ts` (+ camera focus
`profile-seeded-camera-focus-handler.ts`), clear `profile-shell-state-publisher.ts`; reader
`use-direct-search-map-source-controller.ts:1208-1229` (fallback when committedRestaurants==0).

**Native handoff**

- JS→native: `search-map-render-controller.ts:28-31` `setCandidateCatalog({entries:
[{markerKey,lng,lat,rank}]})` — **flat; no group key**. `setRenderFrame` :14-27 carries
  `highlightedRestaurantId/highlightedMarkerKey(s)`.
- LodEngine (`ios/MapLodKit/.../LodEngine.swift`, 264 lines): identity = `Anchor.markerKey`,
  flat competition; **`forcedKeys` (:132,140) = the existing budget-exemption seam** →
  §3.4's selection EXEMPT maps here. Golden-tested (`LodEngineTests.swift`).
- `SearchMapRenderController.swift` (~13k lines): `restaurantId` IS carried per marker
  (:648,1466,1897,3242-3256) but only for press-targeting/highlight — the grouping-key seam.
  Pins already go resident-invisible at `nativeLodOpacity==0` (:2158,5357-5359,6375) — the
  `invisible` role has an existing opacity-0 substrate. z via `lodZ`/SymbolLayer slots
  (search-map.tsx:719-720); no selected-group z-lift.

**Data**: multi-location rides `RestaurantResult.locations[]` + `displayLocation` (server
`locations_json` aggregates market-covered locations — verified in the parent doc §3.5).

**Selection today**: `highlightedMarkerKeys`/`nativeHighlighted` (6 files, ~25 refs) — color
swap + native forcedPromote only (search-map.tsx:1731-1774, 1949-1989;
direct-source :1848-1858, 2820-2846; Swift :172,212).

---

## Slices (each rig-proven before the next)

> **ADJUDICATION 2 (2026-07-10): L1.a MERGES INTO L1.b.** After the role-emission re-scope
> below, standalone L1.a reduces to introducing a group contract with ZERO consumers (the
> builder already picks one representative via the P5 pair, which IS
> `resolveRestaurantLocationSelectionAnchorFromBounds` + `pickClosestLocationToCenter` —
> discovered on read; the focus-fit was de-duplicated to consume it, 640e98f5). Dead
> plumbing violates the house rule. L1 is therefore ONE joint cut — contract + native group
> budget + role emission — in a fresh focused session, slices below read as its internal
> stages.

**L1.a — EntityGroup catalog contract + anchor-rule unification (JS only, output-parity).**
New `EntityGroupCatalogEntry {restaurantId, rank, locations[], representativeLocationId}`
built in `computeMarkerPipeline` via `resolveAnchorLocation` (replacing
`pickPreferredRestaurantMapLocation` — DELETE it + `pickClosestLocationToCenter` after; note
the anchor RULE changes subtly: user-inside-viewport-else-viewport-center replaces
closest-to-anchor-coordinate — finger-check which representative wins on a real
multi-location search). The flat `MarkerCatalogEntry` output stays ONE representative per
group — **byte-parity except the anchor-rule delta**.
⚠️ RE-SCOPED 2026-07-10 (adjudicated against the builder code, pre-implementation): the
original L1.a emitted sibling-dot/invisible-resident entries JS-side — WRONG SEQUENCE. Any
entry added to the catalog competes in today's FLAT LOD as a full pin candidate; a sibling
must never be promotable, which requires the native group-aware budget FIRST. The role
emission (`renderRole: 'representative' | 'sibling-dot' | 'invisible-resident'`, siblings as
dots, in-market invisible-residents) moves INTO L1.b, landing in the same cut as the
LodEngine group competition. RED probe unchanged: a group whose representative is filtered
must bark, not silently promote a sibling.

**L1.b — native grouping key + group-slot competition.**
`setCandidateCatalog` entries gain `groupId` (=restaurantId); `LodEngine.Anchor` gains it;
`decide()` dedupes slots per group (one slot per group, occupied by the representative).
Land WITH new LodEngine goldens (`swift test`, no sim): two same-group anchors never eat two
slots; forcedKeys exemption unchanged. Then on-sim composite proof vs a human-blessed
baseline recording.

**L1.c — the deletion: restaurantOnly + seeded markers.**
Order: producer (`ln`/`n`, interaction-effects resolver) → consumers (builder filter,
`effectiveRestaurantOnlyId` web in direct-source, profile-open matcher) → plumbing/contract
fields → the seeded-marker store + publishers + camera-focus handler (its camera intent is
L2's `focus`). ⚠️ SEQUENCING (survey flag): `profile-open-presentation-plan-runtime.ts:24`
and `use-search-submit-owner.ts:328,346` (single-restaurant collapse feeding profile
auto-open) couple this to **L3's ProfileBody worlds** — L1.c's profile-adjacent arms land
WITH L3, not before. L1.c proper = the search-path consumers only.

**L1.d — policy value + selection overlay substrate (rides into L4).**
`WorldPresentationPolicy` on the world value ('search' | 'list' | 'profile'); the roles in
L1.a read it. The z-lift channel + full-group promotion are L4; L1 only guarantees the
catalog SHAPE supports them (group residency + roles).

## Progress + discovered constraints (2026-07-10, same night)

- **SHIPPED f9e2e44f: the native group budget.** `Anchor.groupId` (nil = own group),
  `promotedInOrder`/`decide` dedupe per group, controller maps `restaurantId → groupId`
  (the transport already carried it). 5 Swift goldens (39/39); on-sim composite canonical
  (roundtrip + STA flows; settled frame = ranked pins + labels + dots, byte-baseline —
  inert for one-location catalogs as designed). forcedKeys exemption untouched.
- **Sibling-emission slice (NEXT) — two constraints found pre-implementation:**
  1. Group members share one rank, and the engine promotes the FIRST on-screen member in
     ranking order — so the JS catalog must order the REPRESENTATIVE first within its
     group (today's `orderByEntry` sorts rank → locationIndex, and the representative is
     closest-to-anchor, not locationIndex 0). Either bake representative-first into the
     intra-group sort or carry an explicit flag the native sort respects. Note the
     off-screen-representative case is DESIRED behavior: an on-screen sibling takes the
     group's slot (golden testGroupRepresentativeIsBestRankedOnScreen).
  2. Sibling entries must join the DOT source membership (dotSourceStore) — map where the
     dot GL source derives from the catalog before emitting, or siblings will be
     LOD-resident but dot-invisible.
  3. The invisible-resident role (market-wide far locations must NOT become dots when
     panned over) needs the SEARCHED-viewport membership fact at catalog build time
     (committedBounds into the builder) — a role the render honors, not a screen test.

## Verification style

- Goldens: LodEngine group competition (Swift), catalog builder role derivation (jest).
- Composite rig: markers:N counts per role from the native ack; the eye blesses the baseline.
- RED self-mutations: drop the group key on one entry → the invariant barks; force an
  invisible-resident to render → pixel-diff catches it.
