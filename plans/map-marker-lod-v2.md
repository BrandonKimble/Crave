# Map Marker LOD v2: Visible-Only Mounting + Dot/Pin Transitions (Implementation Guide)

## What “good” looks like (requirements recap)

### UX
- Pins and dots update seamlessly while **panning and zooming** (no global “flash off/on” refresh).
- Pins near the screen edge can **fade out/in smoothly** as the viewport passes over them.
- Pins must stay “visible” until the **entire pin art** (especially the tip) is fully off-screen.
- Dots do **not** animate; they **snap** on/off.
- When switching tiers:
  - **Dot → Pin:** dot disappears, then the pin **grows up/out from its coordinate** while fading in; rank text appears late.
  - **Pin → Dot:** rank text fades out early; pin **shrinks back into its coordinate** while fading out; dot appears after pin finishes.
- The **results list never changes** when panning/zooming; only the map rendering changes. (List updates only on “Search this area”.)

### Perf
- Markers outside **viewport + small padding** truly **unmount** (not just opacity=0).
- Dot-heavy density thresholds are computed from **visible candidates**, not total catalog.
- Avoid expensive parent re-renders on camera ticks.

## Lessons learned / hard guardrails (do not skip)

### Guardrail A: Treat the existing edge-fade system as a black box
- Do **not** modify the current “screen edge fade” math or thresholds until it is fully understood and documented.
- In particular, avoid touching any of these unless the work item is explicitly “edge fade changes”:
  - `visibleMarkerKeys` computation
  - any `getCoordinateFromView` / view-geometry polygon logic
  - any MapView layout insets/overscan tricks (negative padding/margins)
- Why: a small change here can cause pins to fade too early (anchor crosses the edge while the art is still visible) or cause subtle drift/jitter that ruins the effect.

### Guardrail B: Map marker work must not regress overlay sheet/list smoothness
- Keep all camera-tick work inside `SearchMap` and keep it **throttled**.
- Avoid `runOnJS` loops that toggle React state at high frequency (common source of “sheet unresponsive” or “list flashing” symptoms when JS is busy).
- Do not introduce new “fresh object every render” props at the `SearchScreen` → overlay boundary; memoize specs/props that feed the results sheet to avoid remounts.
- If any changes are needed outside `SearchMap`, they must be strictly minimal and measured with Profilers/Perf logs.

### Guardrail C: Keep transitions local and never duplicate keys
- Never build pin/dot render lists by concatenating arrays unless you de-dupe by key first.
- Any dot↔pin handoff must be controlled by a per-key transition phase so we never render both (duplicate key) or neither (gap/flash).

## Current code landmarks

### Core map rendering component
- `apps/mobile/src/screens/Search/components/search-map.tsx`
  - `MarkerView` pins (React components)
  - `SymbolLayer` labels (Mapbox style-based)
  - Dot layer (CircleLayer) if `dotRestaurantFeatures` provided
  - Edge fade logic driven by `visibleMarkerKeys` (computed via `getCoordinateFromView`)

### Marker catalog and rank ordering
- `apps/mobile/src/screens/Search/index.tsx`
  - Builds `markerCatalog` sorted by `(rank, locationIndex, id)`; this order should be treated as canonical for “top N full pins”.
  - Today, “visible candidates” is effectively the full catalog (no bounds filter).

### Bounds + padding utilities (use, don’t re-invent)
- `apps/mobile/src/screens/Search/utils/geo` (bounds conversions)
- `apps/mobile/src/screens/Search/utils/marker-lod` (`padMapBounds`, `isCoordinateWithinBounds`)

## Architecture: Separate the three concerns

1) **Visibility fade (edge niceness)**: “Is this already-mounted pin inside the exact viewport polygon?”
   - Implemented via `visibleMarkerKeys` and opacity.
   - This should *not* decide mounting; it only controls opacity/pointerEvents.

2) **Candidate mounting (true perf)**: “Is this marker close enough to be worth mounting at all?”
   - Implemented via `candidateKeys` computed from **viewport bounds + small pixel padding**.
   - Markers outside candidates are not rendered at all.

3) **Tiering (LOD) + transitions**: “Within candidates, which are full pins vs dots?”
   - Uses zoom + candidate count with hysteresis.
   - Adds a tiny per-marker transition state so dot/pin handoff never gaps or duplicates.

This separation is what prevents the common failure modes:
- “Everything rerenders during pan” (LOD tied to parent state updates).
- “Pins are invisible but still mounted” (visibility used as mounting).
- “Pins flash/jitter” (mounting churn without hysteresis/holds).

## Data flow (recommended)

### Make `SearchMap` own camera-driven state
Goal: avoid re-rendering the entire `SearchScreen` on every camera tick.

1) `SearchScreen` continues to own only the **result catalog** (changes on search/pagination) and passes:
   - `markerCatalogEntries` (sorted; stable between pages)
   - `selectedRestaurantId`
   - `buildMarkerKey`
   - existing Mapbox props/callbacks + `restaurantLabelStyle`

2) `SearchMap` maintains internal camera state (throttled):
   - `cameraBounds` (MapBounds)
   - `cameraZoom`
   - `isMapMoving` (derived from camera events + map idle)
   - `mapViewportSize` from `onLayout`

3) `SearchMap` computes:
   - `candidateKeys` from `(bounds + paddingPx)`
   - `candidatesInOrder` from `markerCatalogEntries.filter(key ∈ candidateKeys)` (keeps rank order)
   - dot-heavy mode from `candidatesInOrder.length` + zoom (hysteresis)
   - `fullKeys` as top N from `candidatesInOrder` (force-include selected)
   - `dotFeatures` as `candidatesInOrder - fullKeys - transitionHiddenDotKeys`
   - `pinDisplayMap` which contains full pins + demoting pins during transitions

## Step-by-step implementation

### Step 0: Baseline lock-in + document the edge-fade contract (no new behavior yet)
- Keep `search-map.tsx`’s existing MarkerView fade behavior working and stable (do not “improve” it during LOD work).
- Write down the concrete contract we are preserving:
  - A pin should not start fading out until its art is effectively off-screen (at minimum: the pin tip should be off-screen).
  - A pin should fade back in when it re-enters, without jitter or remount flashing.
- Add dev-only overlay counters/logs (optional) to measure:
  - `candidateCount`
  - `fullPinCount`
  - `dotCount`
  - compute time for candidate filter
- Add a tiny, repeatable manual test script (notes-only) for edge fade:
  - Place a handful of known pins near each edge; pan slowly; verify fade timing.
  - Repeat on iOS/Android if behavior differs.

### Step 1: Camera state in `SearchMap` (throttled)
Use `onCameraChanged` + `onMapIdle` to set:
- latest bounds/zoom candidate
- `isMapMoving` (true after camera changes, false on idle)

Implementation detail:
- Throttle updates to ~80–120ms (`setTimeout` gate), not every tick.
- Prefer Mapbox-provided bounds from camera events when reliable; otherwise fall back to `mapRef.getVisibleBounds()`.
- Keep camera state entirely inside `SearchMap` so `SearchScreen` doesn’t re-render on camera ticks (protects results sheet/list perf).

### Step 2: Candidate bounds = viewport bounds + small pixel padding
Goal: unmount markers when they are “safely off-screen”, without breaking the edge fade.

Algorithm:
1) Take raw `cameraBounds` (MapBounds).
2) Convert `padPx` → ratios:
   - `latRatio = padPx / viewportHeightPx`
   - `lngRatio = padPx / viewportWidthPx`
3) `paddedBounds = padMapBounds(cameraBounds, { lat: latRatio, lng: lngRatio })`

Constants (start small; increase only if necessary):
- `padPx = 12` (target: ≤ 20px as you requested)
- leave-hold while moving: 200–300ms (prevents churn during fast pans)

Candidate key set:
- Each update recomputes `nextInsideKeys` from catalog coordinates.
- While the map is moving, if a key was previously a candidate and just left bounds, keep it in candidates until `now > expiresAt`.

Why this is crucial:
- Visibility fade works as the viewport edge passes over a marker, because the marker stays mounted slightly beyond the edge.
- True unmount happens only after it’s well outside the viewport (past the padding), so there’s no “pop”.
- This should not require touching the existing edge-fade computation; candidate unmounting is a separate, wider gate.

### Step 3: Dot-heavy mode from visible candidates (with hysteresis)
Inputs:
- `candidateCount`
- `zoom`

Hysteresis:
- Enter dot-heavy if `zoom <= 12.0` OR `candidateCount >= 180`
- Exit dot-heavy if `zoom >= 12.4` AND `candidateCount <= 150`

Cap full pins:
- Start with `MAX_FULL_MARKERS = 25` (you asked to reduce from 100 → 25)

Selection rule:
- If `selectedRestaurantId` is in candidates but not in top 25, force-include it (drop worst-ranked full if needed).

### Step 4: Dots as a fixed-size CircleLayer (snap only)
Implementation:
- `ShapeSource` containing dot features for candidate markers not in full pins.
- `CircleLayer` style should use a constant radius:
  - `circleRadius: 4.5` (tune)
  - `circleColor: ['get', 'pinColor']`

Interaction:
- `ShapeSource.onPress` selects the restaurant (same as pin tap).

### Step 5: Dot↔Pin transitions (tiny per-marker state machine)
Objective: no jitter, no flashes, no duplicate keys, and pin grows/shrinks from coordinate.

State per key:
- `phase`: `'steady' | 'promoting' | 'demoting'`
- `startedAtMs`
- `expiresAtMs` (startedAt + transitionMs)

Transition rules (only for keys that remain in `candidateKeys`):
- Promoting = key becomes full pin.
  - Immediately hide dot for this key.
  - Render pin with `tierProgress` from ~0.05 → 1 over `transitionMs`.
  - Render rank text opacity with delayed fade-in (e.g. start at 55% of transition).
- Demoting = key leaves full pins but is still a candidate.
  - Immediately fade out rank text.
  - Shrink/fade pin `tierProgress` 1 → 0 over `transitionMs`.
  - Keep dot hidden until demotion completes; then dot becomes visible again (snap).

Rendering sets:
- `pinRenderKeys` come from:
  - all current full keys
  - plus all demoting keys until their timer expires
- `dotKeys` come from:
  - candidates minus full keys
  - minus keys in transition phases (both promoting and demoting)

**Important:** Use a map keyed by `buildMarkerKey(feature)` to build the pin render list (no concatenating arrays without de-dupe).

### Step 6: Anchor-correct pin grow/shrink (no coordinate drift)
Constraints:
- `MarkerView` anchor is `{ x: 0.5, y: 1 }` (bottom-center).
- The wrapper view must keep a constant layout size (`PIN_MARKER_RENDER_SIZE`) so Mapbox anchor math stays stable.

Implementation:
- Apply scale/opacity transforms to an inner “pin art” container (base + fill images), not the wrapper.
- Bottom-origin scaling without `transformOrigin`:
  - `translateY = (1 - scale) * (PIN_MARKER_RENDER_SIZE / 2)`
  - `transform: [{ translateY }, { scale }]`
  - This keeps the **bottom** of the art glued to the coordinate while scaling.
- Rank text is rendered in a sibling overlay so it’s not scaled.

### Step 7: Keep existing visibility fade behavior (but now it matters)
- Continue computing `visibleMarkerKeys` using the existing `getCoordinateFromView` polygon logic (no refactors).
- For pins that are mounted (in `pinRenderKeys`):
  - `isVisible = visibleMarkerKeys.has(key)`
  - opacity animates in/out as it enters/leaves the true viewport
  - pointer events disabled when invisible

This makes the edge fade feel great, while Step 2 ensures off-screen pins are actually unmounted.

## Validation checklist (must pass before “done”)
- Panning quickly: no “all pins disappear” moments; pins near edge fade smoothly.
- Zooming in/out continuously: dot-heavy toggles without flapping; no visible jitter at the threshold.
- When under threshold (e.g. 20 results): no pins flashing/remounting while touching map.
- Selected restaurant is always a full pin when it is a candidate.
- Dots snap; pins animate; labels stay aligned with pins.
- No React warnings about duplicate keys.
- Results sheet list remains unchanged when panning/zooming.
- Results sheet/list remains responsive (no intermittent touch-blocking, no periodic toggle flashing, no “blank list” at end-of-page).

## Suggested rollout strategy
1) Land Step 1–2 behind a dev flag (candidate unmounting only).
2) Add Step 3–4 (dots) once candidate counts are correct.
3) Add Step 5–6 (transitions) last; keep transitionMs small (180–240ms).
4) Tune constants on device; only then adjust padding if needed.

## Why this approach is the best fit for our app
- It preserves what already feels great (edge fade) and makes it actually performant (true unmount outside padded bounds).
- It avoids the two biggest sources of jitter:
  - camera-driven state updates in `SearchScreen` (moved into `SearchMap`)
  - list concatenation / unstable ordering (map keyed state machine)
- It uses Mapbox layers for what they’re best at (cheap dots + labels) and `MarkerView` only where required (full pins).
- It guarantees “no dot+pin duplicates and no gaps” during tier transitions by explicitly controlling dot visibility per key.
