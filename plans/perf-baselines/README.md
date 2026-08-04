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

---

> **Correction 2026-08-03 (truth audit):** this gate is **inoperative as
> documented**. (1) The update flow's step 1 —
> `bash ./scripts/perf-shortcut-local-ci.sh record-baseline` — cannot run:
> `scripts/perf-shortcut-local-ci.sh` does not exist in the repo (the only
> remaining references to that filename are in plan docs). The sampler-lock and
> Node-22-auto-switch paragraphs describe that missing script. (2) The locked
> baselines have drifted past meaning: `runtime-owner-loc-baseline.json` pins
> `apps/mobile/src/screens/Search/index.tsx` at `baselineLoc 10634` with
> `maxDelta 0` — the file is **87 lines** today, and
> `use-search-submit-owner.ts` is 533 vs its pinned 1847. (3) Roughly nine of the
> paths named in `runtime-root-ownership-gates.json` no longer exist, among them
> `screens/Search/hooks/use-search-runtime-composition.ts`,
> `screens/Search/runtime/map/map-diff-applier.ts`,
> `screens/Search/runtime/map/map-presentation-controller.ts`,
> `screens/Search/runtime/profile/profile-runtime-controller.ts`,
> `overlays/panels/runtime/polls-runtime-controller.ts` and
> `navigation/runtime/use-navigation-bootstrap-runtime.ts`. Nothing here can go
> RED on a real regression; per the CLAUDE.md map-saga law an always-green (or
> un-runnable) gate is lying. Either re-derive the runner + baselines against
> today's tree or retire the directory — do not cite these numbers as a gate.
