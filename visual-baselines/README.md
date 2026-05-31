# Map visual-regression baselines

Approved reference screenshots for the map at canonical **settled, seeded** states.
The visual-regression tool (`scripts/visual-regression.js`) diffs fresh captures
against these to catch _gross_ visual regressions the property/trace layers can't
see (blank map, broken results sheet, major layout shift, large marker loss).

## What's here

| Baseline               | State                                                      |
| ---------------------- | ---------------------------------------------------------- |
| `validate-enter.png`   | initial seeded results (Austin, zoom 11.6), camera at rest |
| `validate-twist.png`   | bearing 80° (rotated), settled                             |
| `validate-zoomin.png`  | zoom 13.4, settled                                         |
| `validate-zoomout.png` | zoom 10.6, settled                                         |

All four come from `maestro/perf/flows/search-map-validate.yaml`, which pins the
camera to a fixed Austin coordinate, runs the "best restaurants" shortcut against
the local API (deterministic DB rows), and waits for animations to end before
each `takeScreenshot`. Same input → same picture → a stable baseline.

## Run the check

```bash
# 1. Capture fresh screenshots (writes /tmp/validate-*.png)
unset IOS_DEVICE_UDID IOS_DEVICE_NAME IOS_PREFER_DEVICE IOS_REQUIRE_DEVICE
IOS_SIMULATOR_NAME='iPhone 17 Pro' IOS_RUN=0 PERF_SHORTCUT_USE_SIMULATOR=1 \
  yarn perf:scenario:ios maestro/perf/flows/search-map-validate.yaml search_map_lod_pan_zoom

# 2. Diff against these baselines (diffs written to /tmp/vr-diffs)
yarn visual:regression:map
```

Re-approve baselines after an intentional visual change: `yarn visual:regression:map --update`.

## Tuned tolerances (and why)

`visual:regression:map` runs with `--pixel-threshold 0.3 --max-mismatch 0.03`.

The Mapbox **basemap** (vector roads + street labels) renders with sub-pixel /
anti-aliasing jitter run-to-run even at an identical camera — full-frame diffs
floor at ~5-6% with pixelmatch's default per-pixel threshold. Raising the
per-pixel threshold to **0.3** ignores that AA noise (floor drops to ~1.6-1.8%)
while keeping structural sensitivity: a real regression is a large color delta
and survives. `--max-mismatch 0.03` leaves margin above the noise floor.

## Honest scope

This is the **gross-visual smoke layer**. Subtle LOD correctness — single-pin
promote/demote, no-flicker, top-N selection, slot stability — is owned by the
deterministic property tests (`apps/mobile/src/screens/Search/utils/map-render-model.spec.ts`)
and the perf-scenario trace contracts, which assert exact behavior without pixels.
A single missing pin (~0.2% of frame) sits under this tool's threshold by design;
do not rely on it for marker-level precision.
