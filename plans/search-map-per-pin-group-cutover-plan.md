# Search Map Per-Pin Group Cutover Plan

## Objective

Cut the search map marker runtime to a stable promoted-slot ownership model that preserves current UX while eliminating broad layer/source churn:

- live LOD promotion/demotion during pan and zoom
- native fades for dot/pin/label transitions
- sharp glyph dots
- four directional label candidates with Mapbox-native placement
- correct pin stack art and selected z-order
- native-first press targeting
- no settled dot+pin overlap for one location
- no labels, shared pin-collision obstacles, or pin interactions for demoted dot-only locations
- no solver-layer, placement-fade-only, or hidden placement-owner plumbing

The target is stable mounted groups with one authoritative role table. Visible pin/label art is slot-owned, while pin collision obstacles are a single shared Mapbox collision source mounted above all label layers.

## Current Repo Shape

- Dots are one shared glyph `SymbolLayer` (`restaurant-dot-layer`); there is no dot interaction source. Native dot taps query the rendered glyph layer so collided/culled dots are not tappable.
- Promoted pins use fixed slot mini-stacks: `shadow -> base -> fill -> rank`.
- Each promoted slot is one physical Mapbox source. That one slot source contains feature kinds for the pin visual, pin interaction target, and four label candidates.
- Pin collision obstacles are not slot-owned. They live in one shared collision source/layer band above every promoted label layer so all labels collide against the whole promoted pin set.
- The old logical source ids remain native role-table input ids only; they are not mounted Mapbox sources for promoted output.
- The old solver/placement-fade-only plumbing is deleted. Dot and label collision behavior comes from their real visible SymbolLayers plus the shared pin obstacle source, not from temporary layer-property mutation.
- LOD chooses the promoted set from visible ranked candidates in `buildMarkerRenderModel`.
- Labels are now slot-owned candidate layers: four candidate positions multiplied by preferred side, then scoped by `nativeLodZ`.
- The label interaction mirror is removed. Native press targeting queries visible label layers directly and applies the precise text hitbox.
- Native owns source admission, fades, presentation opacity, highlighted state, visible-dot press gating, and native press targeting.

## Target Shape

### 1. Stable Resident Data

The source/data lane owns real map objects:

- marker identity
- restaurant id
- coordinate
- rank
- label text
- score/color metadata
- selected/highlight identity

It should run on new search, coverage change, geometry change, text/rank change, or real result-set replacement. It should not run just because a visible marker promotes or demotes.

### 2. One Role Table

Every resident marker has one authoritative role row:

```txt
markerKey
visualIdentityKey
rank
role: dot | pin
slotIndex: null | number
selected: boolean
highlighted: boolean
labelPreference
pinOpacity
dotOpacity
labelOpacity
```

This role table is the only place allowed to say whether a location is a dot or a pin. Dot, pin, label, collision, and interaction output all derive from it.

### 3. Shared Dot Field

Dots stay shared because they are numerous and should remain cheap:

- visible dot: glyph `SymbolLayer`, not `CircleLayer`
- tap intent: native rendered-feature query against the visible glyph layer
- culled/collided dots are not tappable because there is no separate dot interaction source
- demoted dot-only locations must not have pin visuals, labels, pin collision obstacles, or pin interactions

### 4. Promoted Slot Groups

Promoted pins live in fixed slot-owned groups. Each slot is one physical Mapbox source family, not just a filtered layer over one shared source:

```txt
slot 0:
  one slot source containing:
    pin feature
    pin interaction feature
    4 label candidate features
  pin shadow
  pin base
  pin fill
  pin rank
  label candidates
  pin interaction target

slot 1:
  same group

...

slot 29:
  same group
```

Selected multi-location entries can use selected overflow slots above the normal 30 without stealing normal pin budget.

The important rule is grouping: each promoted slot owns the visual/interaction pieces for exactly one promoted marker. Pin collision obstacles are derived from the same promoted role row and published to the shared collision source. A role change should affect that marker's slot source plus its shared collision obstacle, not force a global promoted-family refresh.

Native still keeps logical `pins`, `pinInteractions`, `labels`, and `labelCollisions` collections as the role-table input. Before touching Mapbox, native partitions pin/interaction/label collections by `nativeLodZ` into physical promoted-slot sources and writes collision obstacles to the shared collision source. Any native Mapbox write to `restaurant-style-pins-source`, `restaurant-pin-interaction-source`, or `restaurant-source` during live LOD is a regression; `restaurant-label-collision-source` is the intentionally mounted shared obstacle source.

### 5. Pin Stack And Z Order

The pin art must remain grouped like the old-good slot stack:

```txt
slot N shadow
slot N base
slot N fill
slot N rank
```

Do not collapse into global bands like:

```txt
all shadows
all bases
all fills
all ranks
```

Global bands let neighboring pins visually mesh. Slot mini-stacks keep each pin as a sandwich.

Z-order policy:

- normal promoted pins use top-ranked visible markers within the current viewport
- normal budget is 30
- selected marker(s) keep stable slot ownership and are elevated by the visual-order lane
- selected z-order does not rewrite the user-visible rank number
- normal slot ownership is stable: a marker keeps its physical group until it demotes
- viewport screen-Y depth is a separate native visual-order lane: lower-on-screen pin groups are moved above higher groups without changing source membership
- multi-location selected pins promote all selected restaurant locations known in the search market/viewport
- selected overflow slots do not reduce the normal 30-pin budget

The slot index is the physical ownership group only. JS owns stable slot assignment from the same
viewport LOD model that chooses the promoted set, and native applies that role table into stable
physical slot sources. Native owns a separate visual-order diff: it computes live screen-Y from the
current camera, compares the sorted promoted group list to the previous list, and moves only changed
existing pin mini-stacks. It must not remount sources, rewrite filters, or compact/reassign slots for
z-order.

### 6. Labels

Keep Mapbox-native four-candidate placement.

Labels should be tied to promoted slot groups:

- promoted pin: label candidates exist and fade with the pin
- demoted dot: no label candidates
- labels can switch sides while panning/zooming
- side switching should be native placement behavior, not JS remounting
- if all candidates are blocked, no label should render
- label candidate changes must not cause all dots/pins/labels to flash
- label observation is read-only readiness/visibility reporting; it must not feed observed sides back into source state

Native press targeting queries the visible label candidate layers directly and applies the precise text hitbox math. The label itself becomes the tap target.

### 7. Collision

Collision rules must derive from the same promoted role row:

- promoted pins create pin collision obstacles
- labels collide with pin obstacles
- labels collide with other labels through Mapbox placement
- dot glyphs collide/cull as glyph symbols
- dot tap intent does not override dot glyph collision
- demoted dots do not leave stale pin obstacles or labels behind

Layer order must keep pin collision obstacles authoritative before labels are placed.

### 8. Native Press Ownership

Keep the fast native press path.

Desired path:

```txt
native press
native rendered-feature query
native chooses pin / visible label / rendered dot
JS receives final restaurant target
```

Avoid reverting to:

```txt
React Mapbox layer onPress
JS receives raw features
JS decides target
```

Pins use slot-aligned interaction targets. Dots use rendered glyph queries only. Labels use visible label layers directly.

## Implementation Slices

### Slice 1 - Contract And Type Ownership

- Introduce a promoted slot group contract in TS.
- Make `nativeLodZ` / slot assignment the explicit group id.
- Add comments and assertions for the one-role-table rule.
- Add delete gates that reject bucket-only directions, logical promoted source mounts, stale interaction mirrors, and per-slot collision obstacles.

Exit:

- Typecheck passes.
- Static delete gate rejects known bad paths.
- No behavioral cutover yet.

### Slice 2 - Label Press Target Cutover

- Change native label press targeting to query visible label layers/source directly.
- Remove the duplicate label interaction source/layer from React if native visible-label hit testing is complete.
- Remove native label interaction preparation/update paths that only existed for the mirror.
- Keep exact text hitbox semantics.

Exit:

- Native press still resolves pins, visible labels, and dots.
- Hidden/collided labels are not tappable.
- No label interaction source remains unless a proven platform limitation requires it.

### Slice 3 - Slot-Owned Promoted Groups

- Move label candidates and collision obstacles under promoted slot ownership.
- Move promoted pin, pin-interaction, label, and label-collision data into one physical source per slot.
- Keep logical promoted source ids only as native-internal role-table ids.
- Keep pin stack slot mini-stacks.
- Keep shared glyph dots.
- Ensure selected overflow slots are derived from role state, not a hard-coded unrelated ceiling.

Exit:

- Promoted slot owns pin source data, pin stack, label candidates, collision, and pin interaction through one physical source.
- Native partitions logical role-table collections into physical slot source plans on iOS and Android.
- Native press targeting accepts only physical slot label/pin-interaction sources for promoted pin and label hits.
- Settled role invariant: no marker is both dot and pin.
- Demoted dot has no label/collision/pin interaction.

### Slice 4 - Native Role/Fade Lane

- Ensure native promotion/demotion uses per-marker role changes and feature-state opacity.
- Dot fade and pin/label fade must be paired.
- Finalize transition state without a broad reconcile that remounts families.

Exit:

- `dot -> pin` fades dot out while pin+label fade in.
- `pin -> dot` fades pin+label out while dot fades in.
- No broad source replacement during live gesture LOD.

### Slice 5 - Contracts And Runtime Validation

Add or tighten perf/runtime contracts:

- initial search: dots, pins, labels, and collisions all agree with role table
- live pan/zoom: LOD updates while moving, not only after finger-up
- settled state: no dot+pin overlap for the same visual identity
- promoted pins have labels/collision/interaction
- demoted dots have no labels/collision/pin interaction
- rendered dot interaction count never exceeds rendered glyph dot eligibility
- selected pin promotes immediately and changes color on press-up
- selected pin centers in the area above the middle sheet snap
- no whole-family flashes during label side change
- no source replace for live role-only frames

Validation commands:

```bash
yarn tsc -p apps/mobile/tsconfig.json --noEmit
yarn app-route:delete-gate
git diff --check
```

Runtime validation:

- `search-map-lod-pan-zoom` Maestro/perf flow
- pin selection/profile flow
- iOS rebuilt native client first
- Android parity after iOS is proven

Latest runtime proof:

- `search-map-lod-pan-zoom` on iPhone 17 Pro:
  - report: `/tmp/perf-scenario-scenario-search_map_lod_pan_zoom-20260529T042852Z-78b4.json`
  - zero same-key dot/pin overlap in 42 contract probes
  - initial shortcut frame aligned promoted slot families: pins=30, interactions=30, labels=120, collisions=30
  - resident map coverage stayed preserved: accepted=36, pins=30, dots=6
  - promoted pins matched the top ranked visible normal pins for the active viewport; the contract compares expected and actual rank fingerprints for every LOD frame
  - live LOD role patches stayed source-clean: `sourceBaselineKind=ack_delta`, source deltas=0, source feature upserts/removes=0
  - promoted output used the `promotedSlots` physical source family with feature-state application
  - live LOD fades stayed synchronized: pin transitions=30, dot transitions=6
  - rendered labels were collision-locked against promoted pins
  - rendered glyph dot hit testing is active with no dot interaction source family
  - the expensive native screen-Y `moveLayer` lane is deleted; live z-depth is now owned by viewport-Y slot assignment in the role model
- `search-pin-selection-profile-open` on iPhone 17 Pro:
  - report: `/tmp/perf-scenario-scenario-search_pin_selection_profile_open-20260529T043217Z-49af.json`
  - selected frames stayed source-clean: one owner epoch, no native owner detach/attach during the measured loop, `ack_delta`, source deltas=0
  - selected pin camera centering used top-area padding: paddingTop=120, paddingBottom=557
  - selected frames preserved promoted slot family alignment and collision-locked visible labels
  - selected overflow slots are preallocated from resident restaurant-location coverage, so selecting a pin no longer changes the native owner topology
  - the remaining perf caveat is JS promise delivery/route work during profile open, not a map source replacement

The current map runtime behavior contracts are clean. Further smoothness work should target the
remaining native role-lane preparation cost (`live_role.prepare_pin_label_output`,
`live_role.apply_parsed_batch`) and route/sheet JS scheduling during profile open, not a native
style-layer z-order lane or a return to source rebuilds for LOD.

## Delete Gates

Delete or reject:

- bucketed symbol-layer patches as final architecture
- label interaction mirror if visible label querying replaces it
- sticky/fallback label observation writers
- global pin art bands
- source rebuilds caused only by LOD role changes
- native broad camera-time style-layer reordering for pin z-depth (`slot_layer_order` / `applyNativePinSlotLayerOrderIfNeeded`)
- slot assignment from viewport Y; viewport Y belongs only to the native visual-order diff
- mounted logical promoted Mapbox sources (`STYLE_PINS_SOURCE_ID`, `PIN_INTERACTION_SOURCE_ID`, `RESTAURANT_LABEL_SOURCE_ID`)
- per-slot label-collision obstacle sources or layers
- native Mapbox writes to logical promoted source ids
- pin/dot role overlap in settled state
- labels/shared collision obstacles/interactions for dot-only markers
- JS-owned raw Mapbox press target decisions on iOS/Android

## Non-Goals

- Do not change ranking/scoring semantics.
- Do not switch dots to `CircleLayer`.
- Do not remove four directional label candidates.
- Do not freeze LOD while the user pans/zooms.
- Do not defer profile open timing for performance.

## Open Risks

- Per-slot label candidate layers may increase static layer count. This is acceptable only if mounted layers stay stable and runtime evidence shows no frame regression.
- Cross-platform native visible-label hit testing must be equivalent before deleting label interaction mirrors.
- Mapbox collision behavior across many slot layers must be verified on-device, not assumed.
