# Transition perf baselines (H3 / L-1 — Leg 5)

Protocol: `crave://perf-scenario?scenario=transition_baseline&jsSampler=1&uiSampler=1&
jsWindowMs=500&uiWindowMs=500` + marks, then: submit_shortcut_restaurants → toggle_tab
→ push_child_scene(restaurant). Dev lane reads Metro stdout; Release reads the os_log
[JSPERF] sink (scripts/rig/release-baseline.sh). Sim: iPhone Pro Max 7B0DD874 (x86_64 /
Rosetta — absolute numbers conservative; the dev↔release multiplier is the honest fact).

## Dev lane (2026-07-15, run baseline-dev-1784175826)

- JS task lag, steady-state windows: maxLag 13–26ms per 500ms window (already at/above
  the 16ms law — dev noise floor).
- SUBMIT window (shortcut press-up): maxLag **423ms / 543ms / 240ms** across the three
  windows spanning it — the press-up stall (P-12 class).
- CHILD PUSH (restaurant): maxLag **174ms**.
- TOGGLE: within noise (≤ ~30ms) — the R2-C1 co-mounted tabs + episode joint hold.
- UI thread during transitions: avgFps ~48–57, floorFps **25–30**, maxFrame 34–40ms,
  droppedFrameRatio up to 0.2 — the UI thread itself drops frames in dev transitions.

## Release lane

(to be filled by scripts/rig/release-baseline.sh — same flows, same windows)

## Judgment rules

- L-1 verdict is RELEASE-lane only. The dev/release ratio per flow becomes the "known
  multiplier" for future dev-lane triage (H3).
- If release UI-thread floorFps < ~55 during transitions → Fabric mount cost is real →
  the scheduler design's mount-reduction arm (pre-mounted shells + progressive
  hydration) joins the plan; JS scheduling alone won't fix it.
- If release JS maxLag ≤ ~50ms in the submit window → the remaining dev jank is
  dev-lane-only; the scheduler deprioritizes to hygiene.
