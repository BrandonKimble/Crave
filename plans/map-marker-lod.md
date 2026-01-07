# Map Marker Performance: Two-Tier LOD + Visible-Only Rendering

## Goal
Keep map pan/zoom FPS stable even after heavy pagination creates many result pins, while:
- Keeping **full pins as `MarkerView`** (required).
- Allowing **dots to be rendered as Mapbox layers** (preferred if fastest).
- Preserving the existing **pin styling + label logic** exactly for the “full” tier.
- Preserving **pin color semantics**: dot color must match the full pin color for that restaurant.

## Non-goals (for now)
- True clustering UI (tap cluster to zoom/expand).
- Changing pin UI (shadows, gradients, etc.) for the full pin tier.
- Hard-capping the number of dots (we’ll avoid an artificial limit for now).

## Strategy Overview
We’ll combine two techniques:
1) **Render only visible (plus padding)**: mount markers only for items inside current map bounds + a small padded margin to avoid pop-in.
2) **Two-tier level-of-detail (LOD)**:
   - **Tier A (Full)**: `MarkerView` pin + existing label behavior.
   - **Tier B (Dot)**: very cheap “dot” representation (CircleLayer / SymbolLayer).

At low zoom / high density we still show *some* full pins for the most important items:
- Choose up to **100 “full” pins** by **best rank** (and always include the selected one).
- Everything else becomes a dot.

## Implementation Plan

### 1) Determine “visible + padded” bounds
- Source bounds from current map view state (existing “current bounds” calculation in Search map code).
- Add padding to bounds:
  - Compute `latSpan = maxLat - minLat`, `lngSpan = maxLng - minLng`.
  - Expand by `PAD = 0.15` (15%) on each side (configurable), with reasonable clamps.
- Use this padded bounds for both full pins and dots.

### 2) Maintain a fast “visible candidates” list
- From the total result set (restaurants returned so far), filter to items within padded bounds.
- Keep the filter memoized and updated only when:
  - Bounds “meaningfully” change (use map idle event or throttled camera updates).
  - Results set changes (pagination appended).

### 3) Decide LOD mode (full vs dot)
We will support “mixed” mode:
- Always compute visible candidates.
- Determine if we should switch into dot-heavy mode when:
  - `zoom <= ZOOM_DOT_THRESHOLD` **OR**
  - `visibleCandidateCount >= DENSITY_COUNT_THRESHOLD`

Suggested initial constants:
- `ZOOM_DOT_THRESHOLD = 12` (tune by feel)
- `DENSITY_COUNT_THRESHOLD = 180` (tune by perf)
- `MAX_FULL_MARKERS = 100`

### 4) Choose which visible markers get full pins
- Sort visible candidates by **rank ascending** (best rank first).
- Select first `MAX_FULL_MARKERS`.
- Force-include the “selected” restaurant (if any) even if it’s not in the top 100:
  - If we’re at capacity, drop the worst-ranked to make room.

### 5) Render dots using Mapbox layers (preferred)
Use a `ShapeSource` + `CircleLayer` for dots:
- Each dot is a feature with properties:
  - `restaurantId`
  - `color` (computed from the same logic used to color the full pin)
- Circle styling:
  - `circleColor: ['get', 'color']`
  - `circleRadius`: small (e.g. 3–4 at low zoom, optionally scale by zoom)
  - `circleOpacity`: 1
  - Optional thin stroke at high contrast (only if needed visually).

Interaction:
- Handle `ShapeSource` `onPress`:
  - Extract `restaurantId` from tapped feature.
  - Trigger the same “select/open profile” flow as tapping a full pin.

### 6) Render full pins with existing MarkerView component
- Continue using current `MarkerView` pin+label component unchanged.
- Ensure props are stable (`React.memo`, stable callbacks) so pagination doesn’t cause mass re-renders.

### 7) Worth-it Add-on A: Hysteresis + throttled updates (recommended)
This avoids LOD “flapping” and repeated re-renders during gestures.
- **Update cadence**:
  - Prefer updating visible candidates on `mapIdle` (best) or throttle to ~150–250ms.
  - Avoid recomputing on every camera tick while the user is actively panning.
- **Hysteresis (enter/exit thresholds)**:
  - Zoom: enter dot-heavy mode at `<= 12.0`, exit at `>= 12.4` (tunable).
  - Density: enter at `>= 180 visible`, exit at `<= 150 visible` (tunable).

### 8) Worth-it Add-on B: Stable marker rendering + batched mounting (recommended)
If full pins are still expensive, reduce mount/unmount churn and spread work across frames.
- **Stable rendering**:
  - Ensure marker components are `React.memo` and props/callbacks are stable.
  - Precompute per-restaurant derived fields (`rank`, `color`, `coordinate`) once per results update.
  - Avoid sorting the full list on every pan; sort only the visible candidate list.
- **Batched mounting (optional)**:
  - If mounting up to 100 full pins still hitches, mount in chunks (e.g. 25/25/25/25) using `InteractionManager.runAfterInteractions` or short `setTimeout(0)` batching.
  - Keep dots always-on (layer-based) so the user never sees “missing” pins during batching.

## Data/Color Requirements
- Dots must use the exact same “rank color” mapping as full pins.
- If full-pin color is derived from server field(s), expose a shared helper:
  - `getMarkerColorForRestaurant(result): string`
  - Used by both the `MarkerView` pin and the dot layer feature properties.

## UX Details
- Labels remain governed by existing “enough room” logic and only apply to full pins.
- At low zoom/high density:
  - User sees mostly dots + up to 100 full pins (best ranked).
  - As user zooms in / density decreases, more pins become “full” automatically.

## Instrumentation (Recommended)
Add dev-only logs or overlay counters:
- Visible candidates count
- Full pins mounted count
- Dot features count
- Time to compute visible filter + full selection

This lets us tune thresholds quickly on real devices.

## Risks & Mitigations
- **Pop-in while panning**: mitigated by padded bounds.
- **LOD flicker**: mitigated by hysteresis thresholds.
- **Tap ambiguity on dense dots**: acceptable initially; can add clustering later if needed.

## Next Steps / Tuning Pass
After initial implementation:
1) Test iOS + Android with worst-case pagination.
2) Tune:
   - `ZOOM_DOT_THRESHOLD`
   - `DENSITY_COUNT_THRESHOLD`
   - `MAX_FULL_MARKERS` (start at 100; reduce if needed)
   - padding percentage
3) If still heavy: add grid-bucketing (cluster-like aggregation) for dots at very low zoom.
