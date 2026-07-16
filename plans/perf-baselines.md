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

## Release lane (2026-07-15, runs baseline-rel-1784176936 / -1784177057, warm-binary)

- JS task lag, steady-state: ≤15ms (within the law).
- SUBMIT press-up: maxLag **~90ms** (one window) — a violation, but modest.
- THE REVEAL BURST (response lands → rows + mounts + frame apply, ~7s post-submit on
  the slow dev API): **~500ms of CO-STALLED threads** — JS 164/96/82ms tasks AND UI
  frames of 172/104/180/56/90ms in one cluster. This is the release-lane jank.
- TOGGLE: clean (≤ ~20ms p95 frames) — the episode joint + co-mounted tabs hold.
- Steady-state UI: ~46-48fps floor (the Rosetta sim's map idle ceiling).

## Verdict (2026-07-15)

- KNOWN MULTIPLIER (H3): dev/release ≈ **3.3x** on JS transition tasks (543→164ms).
  Use it for dev-lane triage; judge laws on release only.
- L-1 status: PRESS-UP is a modest violation (~90ms vs 16ms); THE REVEAL BURST is the
  real violation and it is BOTH-THREADS — JS scheduling alone cannot fix the 180ms UI
  frames (Fabric mount cost). The transition-work-scheduler design proceeds with BOTH
  arms: reveal-critical JS slicing AND mount reduction (pre-mounted shells +
  progressive hydration, R2-C1 precedent).
- The owner-felt sheet-switch jank = the reveal burst + dev's 3.3x inflation on top.
- Caveat: x86_64/Rosetta sim — absolute numbers conservative; re-baseline on device
  or arm64 sim before fine-tuning budgets.

## Judgment rules

- L-1 verdict is RELEASE-lane only. The dev/release ratio per flow becomes the "known
  multiplier" for future dev-lane triage (H3).
- If release UI-thread floorFps < ~55 during transitions → Fabric mount cost is real →
  the scheduler design's mount-reduction arm (pre-mounted shells + progressive
  hydration) joins the plan; JS scheduling alone won't fix it.
- If release JS maxLag ≤ ~50ms in the submit window → the remaining dev jank is
  dev-lane-only; the scheduler deprioritizes to hygiene.
