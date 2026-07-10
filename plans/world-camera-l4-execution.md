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
