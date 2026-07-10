# L4 execution — the selection overlay (plans/world-camera-multilocation-foundation.md §3.4)

Terrain agent report 2026-07-10 (~6:45AM), verified against source. Headline: a lightweight
overlay already half-exists — selection promotes ALL the group's in-catalog locations,
budget-EXEMPT (LodEngine forcedKeys appended after the budget set), with color activation and
clean deselect. The delta to §3.4 is three concrete gaps, not a new system.

## Adjudication: selection ≡ profile presentation (no standalone selection state)

§3.4 as written implies a select-without-profile state. Under the ACCEPTED L3 re-adjudication
(no ProfileBody world — profile = standard push + selection), the profile presentation IS the
selection presentation: pin tap → openProfileFromMarker → `highlightedRestaurantId` derives
from profile view state (profile-view-state-runtime.ts:60). Introducing a second, profile-less
selection state would rebuild the machine we just deleted. **L4 enriches the existing
projection; it does not decouple it.** (Reversible: if a select-without-open product need
appears, the enrichments below are all keyed off `highlightedRestaurantId`, which could then
be fed by a second producer.)

Camera-on-select is likewise ALREADY DONE: profile open runs resolveMultiLocationFocusCamera
through the arbiter's writers (L2 integration, 9fe4e25e) — same function §3.4 asks for.

## The three real gaps (from the terrain report)

1. **Invisible-resident role — the core substrate gap.** Out-of-searched-bounds market
   siblings get NO catalog entry today (map-read-model-builder.ts:148-150), and
   `LodEngine.decide` only promotes forcedKeys that exist in `ranking` (LodEngine.swift:151)
   — so "market locations fade IN on select" is currently a silent no-op. Fix at the
   builder: emit out-of-bounds siblings as catalog entries carrying
   `isInvisibleResident: true`; natively they render as opacity-0 residents (the existing
   binary model: promoted pin vs opacity-0 resident — invisibility is the DEFAULT resident
   state, no new render machinery), excluded from promotion by ranking order only, and
   because they are IN the ranking, forcedKeys promotion (fade-in already-activated) works
   unchanged. They must be excluded from the LABEL/dot visible layers (a dot for an
   off-screen location is meaningless — it is off-screen; in-viewport invisibility only
   matters after pan, where the dot-vs-invisible distinction = `isInvisibleResident`).
2. **Z-lift.** `updatePinVAPriorities` (SearchMapRenderController.swift:7929-7938) assigns
   `priority = Int(pt.y*10)` uniformly; labels sort by viewport-y. Fix: bump priority for
   `highlightedKeys` members by a large constant (Z_LIFT = 1_000_000) so the selected
   group's pins sit above all others; same bump in the label sort key.
3. **highlightedMarkerKeys collection must see the new entries** (search-map.tsx:1731-1774
   collects across four source stores) — invisible residents ride the same stores, so this
   follows from (1); verify, don't assume.

## Landmines (from the report — respect these)

- The `reason:"highlight_change"` re-projection clears the visible-set signature to force
  decide() past its guard — hook alongside it, never replace it.
- Two `groupId` namespaces: LodEngine.Anchor.groupId (LOD) ≠ the VA feature-batching groupId.
- Camera writes go through CameraIntentArbiter only.
- setHighlighted is textColor-only; promotion is forcedKeys; color is nativeHighlighted.

## Slices

- **A (JS): invisible-resident emission.** Builder: out-of-bounds siblings → entries with
  `isInvisibleResident` (property on the feature), still representative-first ordered.
  Goldens: out-of-bounds sibling present with flag; in-bounds sibling unflagged; selected
  restaurant's out-of-bounds sibling still emitted via shouldRenderAllLocations (dedupe —
  must not double-emit).
- **B (native): resident invisibility + forced fade-in.** Invisible residents join the
  ranking (so forcedKeys work) but are skipped for label/dot presentation opacity; on
  highlight they promote via the existing forcedKeys path (fade-in rides the standard
  promote crossfade). LodEngine golden: invisible-resident anchor never promotes by rank
  even at empty budget slack; promotes when forced.
- **C (native): z-lift.** Priority bump for highlighted keys in updatePinVAPriorities +
  label sort. Verify on-device: selected group's pins overlay neighbors; deselect restores.
- **D: rig + on-device verification.** Multi-location select (Gelateria Gentile) from a
  search world with competing pins; confirm market siblings fade in activated, z-order,
  deselect restore; the composite screenshot is the oracle.

## Progress (2026-07-10 ~6:55AM)

- **Slice A DONE (JS):** builder emits out-of-bounds siblings flagged `isInvisibleResident`
  (entry + feature property); goldens updated (out-of-bounds entry present+flagged; selected
  spread stays unflagged/no double-emit). Types widened (MarkerCatalogEntry,
  RestaurantFeatureProperties, SearchMapCandidateCatalogEntry, setCandidateCatalog payload);
  the flag rides the candidate-catalog payload to native.
- **Slice B DONE (engine + presentation):** LodEngine.Anchor += isInvisibleResident;
  promotedInOrder skips them (never rank-promoted, never consume the group slot; forcedKeys
  = the only door) — 2 new goldens, 41/41. Dot presentation: a property-based layer FILTER
  on the dot SymbolLayer (not opacity-0 — an opacity-0 dot still collides/suppresses
  basemap labels in its footprint). VA pins/labels only exist for promoted keys, so no other
  presentation lane needs a gate.
- **Slice C DONE (native z-lift):** updatePinVAPriorities adds selectedPinZLift (1e6) for
  highlightedKeys; applyPinVAHighlight re-runs the priorities pass so a stationary
  select/deselect re-stacks immediately (previously only roster/camera-motion re-stacked).
- **BONUS FIX — group rank inflation (latent since b441771c):** the unified re-rank was
  `rank = index+1` over ALL projected candidates, so a multi-location group's members
  inflated every later restaurant's badge number; L4's invisible residents would widen it.
  Fixed with ONE shared `assignUnifiedGroupRanks` (dense per-group position; members share
  the group's rank — the engine's equal-rank group model) used by BOTH re-rank sites
  (candidate catalog + badge/reveal seed), preserving their identity contract.
- Camera-on-select: already live via the profile-open focus path (L2, 9fe4e25e) — selection
  ≡ profile presentation per the adjudication above.
- NEXT: iOS build + on-device slice D (multi-location select: market siblings fade in
  activated; z-order; deselect restore; badge numbers not inflated).

## L4 EXECUTED (2026-07-10 ~7:20AM — 9a589c05, 4ca51f39, 4eabb2ea)

- **On-device composite verified** (dish world 'gelato' → autocomplete Gelateria Gentile):
  world pins retained, the 5-location group promoted ADDITIVELY in activated color, all
  members sharing the group-dense rank badge, labels placed, z-lifted, camera focus-fit.
- **Additive rule** (4eabb2ea): the seeded/hydrated restaurant appends to ANY presented
  world when it is the active selection (no longer gated on an empty committed world);
  the builder's selection spread is TAB-AGNOSTIC (restaurant-axis emission on the dish
  axis too). Pure-seed profile-from-home = the degenerate union — the seeded channel's
  special-casing is now one rule.
- **REVEAL-DEADLOCK RACE root-caused + fixed** (4ca51f39) while gating this slice: pins
  had stopped painting APP-WIDE (every reveal whose U2 direct enter-start token raced the
  label-collision source's sourcedata ack deadlocked at reveal_preroll/opacity 0.001 —
  the fence guard bailed WITHOUT recording the block, and the ack-side promote only fires
  for recorded blocks). Predates tonight (stash-baseline byte-identical); this was the
  standing "pin paint unverified" probe item. Fix records the block when the fence is the
  sole blocker. RED→GREEN typed repro; final binary re-verified diagnostics-off.
- Remaining L4 nits (owner feel checks): deselect restore on-device, z-lift overlap eyeball
  vs neighbors, invisible-resident fade-in from a PAN (the pre-pan invisible member never
  dots). The §3.4 'policy value' as an explicit World field stays deferred until a second
  policy consumer exists (today policy is fully derived — a value would be dead plumbing).

## World-camera close-out adjudication (2026-07-10 ~7:22AM)

**L2/L3.d camera-in-origin is OWNER-GATED, not buildable-now.** The plan's "camera absent
from OriginSnapshot" gap has shrunk to one product question: natural searches HOLD the
camera (nothing to restore), profile pops already restore via the pop-teardown writer's
savedCamera, and lists (fitAll) aren't built yet. The only unserved consumer is "terminal
search dismiss after the user panned / ran STA / visited profiles — should X restore the
pre-search camera?" — an owner-feel decision. Widening OriginSnapshot with a camera field
before that answer (and before listDetail lands, its natural second consumer) would be a
contract without a consumer — dead plumbing by the house rule. The mechanism is proven
(the profile lane); the widening is a small mechanical slice once decreed.

**Scoreboard: the world-camera plan's executable surface is COMPLETE.**
L1 ✅ (group competition, sibling emission, restaurantOnly deletion, Phase D
closed-by-reshape) · L2 ✅ pure + profile integration (camera-in-origin owner-gated) ·
L3 ✅ (machine dissolved, direct presentation, pop-teardown, dismiss matcher source-only) ·
L4 ✅ (invisible-resident, z-lift, group-dense rank, additive tab-agnostic overlay,
on-device) · L5 ✅ (roll-up + market-wide aggregates verified). Plus the app-wide reveal
deadlock found and fixed en route (4ca51f39).
