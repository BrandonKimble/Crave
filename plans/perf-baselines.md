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

## Dev-lane re-measure after the pending-block cut (2026-07-18, run pb-dev)

Same protocol/sim as the 2026-07-15 dev baseline. Submit-window JS chunks:
**342 / 286 / 139ms** vs the baseline's **543 / 423 / 240ms** — the worst window
dropped ~37%. Consistent with the cut's deletions (pinned cover mount, per-row
rows-visibility Reanimated wrappers, stale-row renders under the cover). ONE run,
dev lane — directional only. UI maxFrame ~350ms still shows the reveal Fabric mount
cost: the L4 slicing decision still requires the RELEASE-lane burst re-measure with
a fresh Release build carrying the pending-block code (the installed Release binary
predates it).

## Release-lane re-measure with the pending-block code (2026-07-19, run baseline-rel-1784508888)

Fresh Release build (pending block + strip-immediate + truncation law), warm-binary +
fresh-session protocol. JS windows: **174.8 / 131.1 / 100.1ms**; UI p95Frame:
**189.8 / 169.3ms**; floorFps **5.3-9.3** in the burst windows. (Marks did not land in
the os_log capture this run — window attribution is by shape, matching the 7-15
baseline's reveal-burst signature.)

**VERDICT — THE L4 DECISION INPUT:** the reveal burst PERSISTS in release, essentially
unchanged (7-15: JS 164 + UI 172-180). Expected: the pending-block cut deliberately
did not move row-landing timing (the fence still lands ALL rows in one commit at the
reveal), and FlashList virtualization does not govern the visible-window mount cost.
**L4 law 2's sliced content landing (above-fold rows first, idle-slice remainder) is
WARRANTED — it is the load-bearing fix for this burst**, not optional polish. The
dev-lane press-up improvement (543→342ms) was real but was the COVER's cost, not the
mount's. Rosetta-sim caveat unchanged (absolute numbers conservative).
