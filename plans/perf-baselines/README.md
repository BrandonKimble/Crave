# Perf Baselines

This directory stores locked local baseline reports used by the refactor perf gate.

Default local baseline path:

- `perf-shortcut-live-baseline.json`

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
- JS and UI metrics are both promotion-gated.

Local CI sampler lock (applied by `scripts/perf-shortcut-local-ci.sh`):

- `EXPO_PUBLIC_PERF_JS_FRAME_WINDOW_MS=120`
- `EXPO_PUBLIC_PERF_UI_FRAME_WINDOW_MS=120`
- `EXPO_PUBLIC_PERF_JS_FRAME_LOG_ONLY_BELOW_FPS=240`
- `EXPO_PUBLIC_PERF_UI_FRAME_LOG_ONLY_BELOW_FPS=240`

This ensures parser-required JS/UI window metrics are consistently emitted for baseline/candidate comparisons.
