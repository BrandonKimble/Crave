# Perf Baselines

This directory stores locked local baseline reports used by the refactor perf gate.

Default local baseline path:

- `perf-shortcut-live-baseline.json`
- `runtime-root-ownership-gates.json` (S7+ strict root ownership/function-block deletion checks)

Update flow:

1. `bash ./scripts/perf-shortcut-local-ci.sh record-baseline`
2. Validate the generated report + compare summary output.
3. Commit the refreshed baseline only when a deliberate baseline reset is approved.

Node runtime note:

- Use the direct script entrypoint above for local baseline/gate runs.
- No Yarn alias is provided for this flow; Yarn enforces root `engines` before script execution on Node 24 shells.
- `scripts/perf-shortcut-local-ci.sh` auto-switches to Node 22 (via `nvm` first, then `volta`) when launched directly.

Promotion-quality baseline policy:

- baseline and candidate reports must each satisfy expected/completed run minimums (default via `PERF_MIN_RUNS=3`),
- baseline/candidate harness signature parity (`harnessSignatureStable`) and environment parity (`launchTargetMode`, `runtimeTarget`, `launchPreferDevice`) are required,
- JS and UI metrics are both promotion-gated,
- S7+ promotions pass strict root ownership checks (`runtime-root-ownership-gates.json` via `scripts/search-runtime-root-ownership-gate.sh`), including specific root function/block ownership bans for decomposition slices.
- S9A promotions also enforce map-runtime budget thresholds (`PERF_S9A_*` env thresholds, with `PERF_S6_*` fallback defaults),
- S9B promotions require directional stage-pressure improvement for `results_list_ramp` on both JS and UI stage histograms.
- S9C/S9D/S9E promotions require mechanism telemetry counters in parser reports (`mechanismSignals.*`) to prove coalescing/cancellation/event-driven observer behavior.
- S9A-S9F promotions enforce root complexity budgets via `runtime-root-ownership-gates.json` hook-pressure ceilings.

Local CI sampler lock (applied by `scripts/perf-shortcut-local-ci.sh`):

- `EXPO_PUBLIC_PERF_JS_FRAME_WINDOW_MS=120`
- `EXPO_PUBLIC_PERF_UI_FRAME_WINDOW_MS=120`
- `EXPO_PUBLIC_PERF_JS_FRAME_LOG_ONLY_BELOW_FPS=240`
- `EXPO_PUBLIC_PERF_UI_FRAME_LOG_ONLY_BELOW_FPS=240`

This ensures parser-required JS/UI window metrics are consistently emitted for baseline/candidate comparisons.
