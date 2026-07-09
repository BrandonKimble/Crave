# One World, Many Bodies — camera, multi-location, and profile-flow foundation

**Status:** designed 2026-07-08 from the owner's full behavioral brief (shared lists, profile
flows, per-trigger camera policy, multi-location/LOD rules, market roll-up). Companion to
`plans/trigger-nav-ideal-verdict.md` (the trigger/nav strides S-A..S-F) — this doc adds the
presentation-side foundation layers those strides plug into. Ground rule (owner): foundation
first, most-ideal shape only, effort excluded from every judgment.

---

## 0. Direct answers to the owner's open questions

**Q1 — poll-discussion DISH search: move the map to a "canonical market viewport," or hold it?**
**Hold it. You talked yourself into the right answer.** Three reasons beyond simplicity:
(a) the map is context the user owns — moving it un-asked breaks their mental model of "I am
looking at this area"; (b) Search-this-area already exists as the exact recovery lever when the
current viewport isn't what they wanted — the user corrects with one tap instead of us guessing;
(c) it makes poll-dish searches byte-identical to search-bar dish searches, which collapses the
camera algebra to exactly three intents (below) — every camera case we don't create is a case
that can't regress. The "canonical market viewport" idea survives in a better, non-automatic
form: a zero-results empty state MAY later offer "Search all of {market}" as an explicit action
(which is just an STA with market bounds) — an affordance, never automatic movement.

**Q2 — is the autocomplete restaurant tap already doing the profile flow?** Yes it exists, no it
is not ideal. Today: a ~30-line warm-seed choreography (`openRestaurantProfilePreview`,
`pendingRestaurantSelectionRef`), a seeded-marker side channel (`setSeededMarkerRestaurants`), an
84-reference `restaurantOnlyId/Intent` special-case web, and a private 7-file
"prepared-presentation transaction" family that no other flow uses. It works; it is exactly the
accreted shape this doc dissolves (§4).

**Q3 — the multi-location zoom-out logic.** Designed in §3.3: an _anchored robust-cluster fit_ —
center the anchor location, grow a radius greedily over the distance-sorted siblings until the
next sibling is an outlier (median-ratio cut), fit that radius into the safe region, clamp to a
city-scale zoom floor so mega-markets never produce a ridiculous zoom-out. Pure function,
golden-testable like the LodEngine.

**Q4 — LOD for multi-location restaurants inside a normal search.** Your answer is adopted and
formalized: one _representative_ location per restaurant (chosen by the same anchor rule)
competes for a promoted slot; sibling locations are dots (in-viewport) or invisible (in-market,
out-of-viewport). A restaurant can never eat multiple budget slots.

**Q5 — selection budget: extend or displace?** Extend, as you recommended — formalized as a
_selection overlay_: the selected restaurant's whole location group becomes budget-EXEMPT
(outside the competition) rather than competing, so promoting 30 locations cannot demote a
single unrelated pin. On dismiss the exemption ends and the policy re-applies.

**Q6 — lists and LOD.** LOD stays ON for lists (your call). Because presentation is a per-world
_policy value_ (§3.4), "all list members always promoted" later is a one-line policy change, not
a feature flag bolted anywhere.

---

## 1. The patterns the brief implies (extraction)

Reading every flow in the brief, six patterns repeat:

**P1 — Everything is "present a world."** Natural search, shortcut, list (yours or someone
else's), poll-dish tap, restaurant profile from anywhere — each is: a Desire resolves to a WORLD
(sheet content + map catalog + camera intent), revealed as one synchronized joint, dismissed
back to a captured origin. The profile flow is not a sibling of the search flow; it is a search
flow whose world has a different BODY. ("Profile flows are essentially search flows" — the
brief, verbatim.)

**P2 — The camera is part of the world value.** Every trigger's map behavior is one of exactly
three intents, decidable at resolve time from the desire kind. Camera is data on the world, not
imperative calls scattered at trigger sites.

**P3 — The return trip includes the camera.** "Zoom back to where it was before the profile
search ran" = the OriginSnapshot must carry `{center, zoom}`. One origin concept covers sheet,
scroll, segment, AND camera; dismissal restores all of it, from any depth.

**P4 — Map items are entity GROUPS, not flat markers.** A restaurant is one catalog entry with a
location SET and one rank; which locations render, how, and at what LOD role is a per-world
POLICY plus a SELECTION overlay — not per-flow special cases.

**P5 — One anchor rule everywhere.** "Closest location to the user if the user is inside the
searched viewport, else closest to the viewport center" decides: which location is the LOD
representative, which location centers the camera, and which location is 'the' pin for a
single-location treatment. One pure function, three consumers.

**P6 — Pageless surfaces are pushes.** Shared lists and profiles "don't belong to any page" =
they are child scenes pushable over anything with origin capture (exactly S-B in the verdict
doc), reachable identically from a deep link (cold start ⇒ origin = home; warm ⇒ origin =
wherever you were) or from in-app taps. The brief confirms the trigger/nav strides rather than
adding to them.

---

## 2. The foundation: ONE WORLD, MANY BODIES

The world value generalizes (this is the load-bearing move):

```
World = {
  body:    ResultsBody | ProfileBody | (ListBody = ResultsBody + list chrome)
  catalog: EntityGroup[]            // §3.1 — grouped, market-wide
  camera:  CameraIntent             // §3.2 — hold | fitAll | focus
  policy:  WorldPresentationPolicy  // §3.4 — how groups render in this world
  meta:    constraints, resolvedAt, failure/empty states (existing)
}
```

- A **restaurant profile** is a world: `body = ProfileBody(restaurantId)`, `catalog = [that
restaurant's group]`, `camera = focus(anchor)`, `policy = profile` (all promoted, LOD off,
  normal colors). "Skipping the results sheet" is not a skip — the world's body IS the profile;
  there is nothing to skip.
- A **list** (yours or shared) is a world: `body = ResultsBody(list rows)`, `camera =
fitAll(members)`, `policy = search` (LOD on, for now).
- A **normal search** is a world: `camera = hold`, `policy = search`.
- The resolver ladder, the reveal joint, failure/offline/retry, the dismiss/origin machinery —
  all UNCHANGED and shared, because they operate on worlds, not on flow kinds.
- The reveal joint gains a third synchronized track: **camera motion starts at ramp start** with
  matched duration — sheet content, pin fade-in, and camera arrival land as one moment, for
  every world kind identically.

---

## 3. The four new primitives

### 3.1 EntityGroup catalog (the multi-location model)

```
EntityGroup = {
  restaurantId, rank, score/color,
  locations: [{locationId, lng, lat, ...}],   // MARKET-WIDE (see §3.5)
  representativeLocationId                     // anchor rule, computed at frame build
}
```

- The LOD engine competes on GROUPS: one slot per group, occupied by its representative.
- Per-location render role is derived: `role(location) = f(group rank, representative?,
in-viewport?, policy, selection)`.
- Search/list policy: representative → promoted-if-ranked; in-viewport siblings → dots;
  out-of-viewport (in-market) siblings → **invisible but resident** (data present, zero render;
  the "they won't even show up as dots" requirement).
- The current flat-marker catalog, `restaurantOnlyId` (84 refs), and the seeded-marker side
  channel all dissolve into this one shape: a profile world's catalog is simply one group.

### 3.2 CameraIntent (the whole camera algebra — three values)

```
CameraIntent =
  | hold                                     // natural, shortcut, poll-dish, chip reruns
  | fitAll(members, safeRegion)              // lists: EVERYTHING fits, top-third, no exceptions
  | focus(group, safeRegion, clusterParams)  // profiles + in-search selection
```

- `safeRegion` = the map area between the search bar and the mid-snap sheet top (the top ~third)
  — already derivable from the snap-point geometry.
- Executed by ONE camera choreographer as a single `easeTo` (center+zoom simultaneously),
  synchronized with the reveal ramp.
- **Camera enters the OriginSnapshot** (`{center, zoom}` captured at push). Dismissing a
  profile-only world restores the pre-search camera; dismissing a profile pushed over a search
  restores the search's camera; dismissing a list restores wherever you were. One rule, no
  cases.

### 3.3 The focus-fit function (the zoom logic, precisely)

```
resolveFocusCamera(group, userPos, searchedViewport, safeRegion, currentZoom):
  A = anchorLocation(group, userPos, searchedViewport)        // P5 rule
  ds = sortAscending(distance(A, sibling) for each other location)
  k  = largest k such that ds[k] <= max(D_FLOOR, ALPHA * median(ds[1..k]))
       // greedy cluster growth with a robust outlier cut:
       // nearby clusters get included; one cross-market outlier never drags the zoom
  zoom = clamp( fitZoomFor(center=A, radius=ds[k], region=safeRegion),
                Z_CITY_FLOOR,      // never more zoomed-out than "city scale" (~25–30km span)
                currentZoom )      // never zoom IN to show context — center only
  return { center: A, zoom, includedCount: k+1 }
```

- Tunables (`D_FLOOR ≈ 2km`, `ALPHA ≈ 2.75`, `Z_CITY_FLOOR`) live in one table.
- Properties: anchored (motion is always "center on the nearest one, breathe out"), predictable
  (single center+zoom animation), honest about the brief's intent — the zoom-out _conveys that
  options exist_; it does not promise to show all of New York.
- Pure and golden-testable (the LodEngine precedent): feed location sets, assert
  center/zoom/includedCount. Edge cases in the goldens: single location (center, no zoom
  change); tight cluster + one far outlier (outlier excluded); uniform sprawl (floor clamps);
  everything already visible (no motion beyond centering).
- Lists deliberately do NOT use this: `fitAll` is exact by decree ("no exceptions").

### 3.4 WorldPresentationPolicy + the selection overlay

```
policy 'search' | 'list':  representative competes in LOD; siblings dots/invisible;
                           normal colors
policy 'profile':          every location promoted; LOD competition off; normal colors

SelectionOverlay (tapping a restaurant inside a presented search/list world):
  - the selected group leaves the budget (EXEMPT — additive, never displacing others)
  - ALL its locations promote (including formerly-invisible market ones, which fade IN
    already-activated), activated color, z-lifted above everything
  - camera = focus(group) — same function as profiles
  - deselect/dismiss: exemption ends, roles recompute from policy (market ones → invisible,
    in-viewport siblings → dots), z restored, camera restores from origin
```

- Native contract additions: a grouping key on markers, an `invisible` render role, a z-lift
  channel for the selected group, and the temporary budget exemption in the LOD engine. All are
  extensions of the existing VA/GL substrate — the collision + LEA rules apply unchanged to
  whatever is promoted.

### 3.5 Market roll-up + market-wide data

- **Rule:** resolve the market by rolling UP: the market containing the anchor point whose
  geometry is not covered by any larger active market ("keep rolling up until it doesn't fit
  within another market" — the brief). No market ⇒ fall back to a viewport-derived radius.
- **Data:** the search response's per-restaurant `locations_json` already aggregates
  market-geometry-covered locations (verified: `buildLocationAggregatesCte` joins
  `core_markets.geometry` with `ST_Covers`) — the market-wide group data RIDES THE EXISTING
  RESPONSE; in-search selection needs NO new API call. To finish: (a) confirm the aggregate is
  market-wide rather than viewport-trimmed in all lanes, (b) implement the roll-up rule
  server-side where `activeMarketKey` is resolved, (c) the profile-world resolver (entity
  desire) must return the same group shape.

---

## 4. The honest audit — where current code is NOT this shape

1. **Profile flow is a parallel machine.** The 7-file `app-route-profile-prepared-presentation-*`
   transaction family, `CameraIntentArbiter` scoped to the profile-transition contract,
   `openRestaurantProfilePreview` warm-seeding, `pendingRestaurantSelectionRef`. None of it is
   the world pipeline. **Dissolves entirely** into `ProfileBody` worlds (§2).
2. **`restaurantOnlyId/Intent` (84 references) + seeded markers (4 sites)** — the degenerate
   hand-rolled version of the EntityGroup profile world. **Deleted by §3.1.**
3. **The catalog is flat.** Markers are locations; multi-location grouping, representatives,
   invisible-resident roles, selection overlays, z-lift, budget exemption — none exist. The
   LodEngine (pure, single-authority — the right home) competes on flat markers today.
4. **Camera is imperative and scattered.** No CameraIntent value on the world; the favorites
   lane does its own fit; profile transitions carry CameraSnapshots through their private
   contract; **camera is absent from OriginSnapshot** — "zoom back to where it was" currently
   has no home.
5. **Selection-in-search exists as `highlightedMarkerKeys`/`nativeHighlighted`** — color
   activation only; no group promotion, no market fade-in, no z-lift, no budget exemption, no
   camera focus. The brief's "we implemented it before, maybe not the best shape" is confirmed.
6. **Shared lists**: `/l/<slug>` outbound links exist with NO inbound route (verdict doc GAP E);
   `getShared` has zero UI consumers. The listDetail scene is a stub. Blocked on S-B/S-E — this
   doc adds nothing new there; it confirms them.

None of these are patchable toward the target — each is the accreted alternative TO the target.
Per the ethos: they get dissolved by the foundation, not bent toward it.

---

## 5. Build order (foundation-first; merges with the verdict doc's strides)

Each layer is only built on the one below it; nothing lands on the old shapes.

- **L1 — EntityGroup catalog + anchor rule + policy value** (JS catalog contract + LodEngine
  group competition + native grouping/invisible/z-lift/exemption). The deepest cut; everything
  else reads these values. Includes deleting restaurantOnly/seeded-markers.
- **L2 — CameraIntent + focus-fit + camera-in-origin + camera track in the reveal joint.**
  (Golden tests for `resolveFocusCamera` land with it.)
- **L3 — ProfileBody worlds**: the entity desire resolves to a profile world; dissolve the
  prepared-presentation family; autocomplete/poll-restaurant taps become the one-line
  entity-desire push. (Rides S-A trigger deletion.)
- **L4 — Selection overlay** inside presented worlds (tap pin/card/label → focus + promote-all +
  activate + z-lift + exemption; dismiss reverses).
- **L5 — Market roll-up rule** server-side + profile-world group data + confirm market-wide
  aggregates in all lanes.
- **S-B/S-C/S-D/S-E from the verdict doc run alongside** (entries-as-values → de-special search
  → one Desire + EntityLink → addressability). Shared lists ship when S-B (listDetail page) +
  S-E (inbound `/l/<slug>`) + L1/L2 (its fitAll world) meet. The pretty Spotify-style share
  page is a launch-polish item (product/), not architecture.

**Verification style (house rules):** LodEngine-style goldens for group competition and
focus-fit; composite rig proof for the joint (sheet+pins+camera land together, mach-clocked);
RED self-mutation for each new contract (a group that loses its representative, a selection that
never deselects, a camera intent nobody executes — all must bark).
