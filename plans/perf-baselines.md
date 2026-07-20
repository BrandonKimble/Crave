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

## Landing-clock release verification (2026-07-19, builds 2+3)

Three warm-binary release runs, one submit each (marks did not capture — window
attribution by shape; single-run variance is REAL, judge by the spread):

| | pre-clock | clock v1 (2 beats) | clock v2 (progressive 4/+6) |
|---|---|---|---|
| JS worst / 2nd | 174.8 / 131.1 | 153.4 / 109.3 | 155.3 / 117.6 |
| UI p95 worst / 2nd | 189.8 / 169.3 | 184.7 / 101.1 | 170.3 / 162.7 |
| floorFps worst | 5.3 | 5.4 | 5.9 |

HONEST VERDICT: the clock delivered a MODEST, consistent improvement over pre-clock
(JS worst -11%, UI worst -10%; one run showed a burst window halved) — but v1 vs v2
cannot be discriminated at n=1 (101 vs 162 on window 2 = variance), and the residual
~160-185ms UI windows + floorFps 5-9 persist across ALL runs. ROW-MOUNT SLICING IS
SATURATED as a lever: the remaining burst is likely NOT the list (candidates: the
MARKER/pin reveal ramp + camera work on the native side — which connects to the
owner's known "pins SNAP instead of fading" reveal regression — and the world-commit
fan-out). NEXT: attribute the residual window (map-side instrumentation) BEFORE any
further slicing; do not add clock complexity on an unattributed cost.

## THE RESIDUAL BURST — ATTRIBUTED (2026-07-19, map-side attribution run)

One dev run, samplers + full timeline logs + 10fps video. The ONE bad UI window
(maxFrame **255.3ms**, window ending now=9140729) contains, in order:
`[CATALOG] push n=713 invisible=43` → the txn's `join:mapFrame` ack (t=9140458) →
`revealed` (t=9140458.6) → the landing clock's above-fold beat (t=9140461). JS worst
windows (384/285/215ms) bracket the same instant (submit fan-out + landing beats).

**VERDICT: the residual reveal burst is the NATIVE APPLICATION OF THE 713-ENTRY
CANDIDATE CATALOG + frame at the reveal joint** — not row mounting (saturated, as
measured). The catalog legitimately carries the full coverage set (dots need it);
the cost is applying it in one transaction ON the reveal frame.

**THE FADE REGRESSION IS THE SAME ROOT**: the pin ramp starts inside that ~255ms
stall — most of the fade's frames drop, so pins read as SNAPPING in. Video: green-px
series 0→138→500→617→648 at 100ms samples — the ramp's first half compressed into
one step. Explains the owner's "occasionally fades on back-to-back searches" (warm
resubmits have small native deltas → no stall → visible fade).

**FIX DIRECTION (the next map arc — NOT executed; the map is a concerted-effort
surface and the proper mach-clock instrument gets built as part of it):** the
invisible-resident machinery already exists (43/713 were warm this run) — pre-stage
the FULL catalog as invisible residents DURING THE PENDING WINDOW (the pending block
buys seconds of idle), so the reveal joint applies no native mutations and the ramp
is opacity-only — the exact co-mounted-toggle precedent (toggle reveals measure
clean for exactly this reason). Confirmation step when that arc opens: flip
lodDebugLoggingEnabled for the native-side timing narrative.

## Catalog arc, step 1: THE RAMP HOLD (2026-07-19) + the native decomposition

Native truth via the always-on [applyslow] instrument (no rebuild needed — any
main-thread section >30ms logs in every configuration), canonical Austin run (n=713):
- `covered` frame apply: 83ms (parse_source_deltas 39.7)
- `enter_requested` frame apply: **217.5ms** (parse 39.2 + prepare_pin_label_output
  57.2 + prepare_dot_output 32.6 + reconcile rest) — ends ~130ms BEFORE
  directEnterStart (the ramp)
- `live` frame apply: 62ms, landing ~390ms into the ramp
Total ≈ 360ms of main-thread native work clustered at the reveal.

LANDED: the landing clock's post-above-fold beats now hold on the map's
presentation_enter_settled signal (one producer in the render owner; 700ms bounded
fallback for map-less episodes) — Fabric row mounts can no longer land during the pin
fade. Dev-proven: above-fold at reveal → "ramp hold released (enter_settled)" at
+676ms → remaining beats after. Matrix 21/21.

HONEST VISUAL VERDICT: the fade is still front-compressed (0→~68% of plateau in one
50ms video sample — marginally better than pre-hold, not fixed). The dominant frame
eater is the 217ms enter_requested apply block adjacent to the ramp, NOT the row
mounts. THE REMAINING LEVER (the arc's deep half, a concerted map change): split the
prepare pipeline (parse_source_deltas / prepare_pin_label_output / prepare_dot_output
— pure data transforms currently taking `inout state` on main) off the main thread,
leaving only the Mapbox apply calls on main; plus coalescing the covered/enter/live
triple-apply. Build the mach-clock event log as part of that change per the map
methodology. Release re-measure rides that change, not this one.

## Catalog arc, deep half step 1: THE ENTER-FRAME DEDUP (2026-07-19)

[FRAMEDBG] (new dev probe in the render controller) proved the mechanism: the
hidden_preload|covered frame applies the sources (rev v1 across all four families),
then the enter frame RE-CARRIES the identical delta at identical revisions — the
217ms enter block was a byte-duplicate re-apply. The pre-staging design ALREADY
EXISTED (hidden_preload); the enter frame just couldn't know its sources were
resident.

LANDED (Swift): a revision-dedup gate in the enter case — when every family's
incoming revision is non-empty and equals the applied-revision ledger, the enter
frame rides the existing battle-tested resident-unchanged fast path
([applydedup] NSLog in every configuration, mirroring [applyslow]).

MEASURED (dev, n=713): enter block **217.5 → 111.4ms (-49%)**; reveal cluster total
**362 → 250ms (-31%)**. The remaining 111ms = presentation.reveal_preroll_reconcile
(~99ms pin/label/dot output prep — the legitimate ONE-TIME roster work, no longer
duplicated). Matrix 21/21; pins/badges/dots/cards content-verified on screen.

REMAINING LEVERS (recorded, not built): off-main the preroll prepare pipeline (the
true threading arc — inout-state split); defer the live_update frame (53ms mid-ramp)
behind enter-settled; the 160ms canonical fade + STEP-3 re-anchor mean the snap
verdict now needs the OWNER'S EYE on device — sim video at 50ms sampling cannot
adjudicate a 160ms ramp under recording load.
