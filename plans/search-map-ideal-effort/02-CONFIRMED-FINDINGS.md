# STEP-0 Confirmed Findings (owner mimic-flow drive, 2026-07-01 ~01:56)

All root causes confirmed on-device from the owner's drive (search → zoom → pan → twist → toggle → rapid toggle-back → dismiss). Native `[l3dbg]/[lbldbg]/[presramp]/[leamem]/[LODDBG]` + JS `[t4dbg]`.

## T4 — toggle-back staleness: CONFIRMED (worse than dedup — stale rankedCandidates upstream)

`[t4dbg]` on toggle-back: `{activeTab: restaurants, count: 236, keyHead: 236:2d542638, changed: false, published: false}`. i.e. active tab flipped to **restaurants** but the projected `rankedCandidates` are still the **dish** set (236, dish fingerprint). So the catalog fingerprint legitimately didn't change (data is stale) → publish skipped → native keeps dish markers. **The bug is upstream of the publish gate: the source projection produces the WRONG tab's candidates on toggle-back.** (Restaurant search was 647; dishes 236; toggle-back stays 236.) Fix must re-project the correct tab's data on toggle settle, not just force a re-publish of stale data.

## NEW pin-disappear: CONFIRMED — engine decides promoted=0

`[LODDBG] toggleSettled` after `toggle-intent:22`: **`promoted=0 tiles=30`** on every subsequent rapid toggle (intents 22,29,33,39,44). The engine decided zero promoted pins (pins fade out) while 30 stale overlay tiles linger, and never recovers. Same root family as T4 — a bad/empty/stale candidate catalog on rapid toggle-back → `decide` yields promoted=0. (`[t4dbg]` also showed `count:0 "0:empty"` frames.) Labels stayed because the label layer is GL-resident, not roster-driven.

## L1 — label reveal flash: CONFIRMED (two-writer stomp)

`[lbldbg]`: `SELECTOR revealed=10` → `REVEALCOMMIT promoted=30 revealed=2` (stomps to 2) → `SELECTOR revealed=71` (rebuilds). The reveal-commit commits a STALE small persisted-winner set (2) that wipes the selector's live set → ~500ms label dropout. `commitSettledLeaAuthorityUnderCover` and `applyLabelOneOfFourSelector` both author `__lea_revealed__`.

## R1 — reveal snap-in: CONFIRMED (presentation animator clock jump / main-thread stall)

`[presramp] reason=reveal_start`: `opacity=0.001` at t=…471, then **JUMPS to opacity=0.645** at t=…668 (a **~196ms gap with no intermediate ticks**), then ramps 0.645→1.0 smoothly at 60fps. So the presentation display link STALLS ~196ms at reveal start (blocked by the under-cover commit/decide/QRF/JS), and the fade effectively begins at 0.645 → the map appears at ~65% suddenly = the snap-in. **The animator's wall-clock start is set too early (at reveal_start / preroll) relative to when it can actually tick, OR heavy main-thread work blocks the link for ~196ms.** (This is distinct from — and dominates — the baked-FS shadow theory; both may contribute, but the presramp jump IS the visible snap.)

## L3 — label batch side-pick on twist: CONFIRMED (moving-adaptive cadence stretch)

`[l3dbg]`: during motion the observation refresh `normalized` delay is **32ms** (`adaptiveMs=32`) in ~470 samples vs 16ms baseline in ~500 — the moving-adaptive back-off doubles the cadence during pan/twist, delaying + coalescing the observation so side-picks batch. (Modest 2×; combined with QRF-async latency + the sticky-winner it reads as a settle-batch.) Owner wants live/granular like the LOD.

## L4 / R3-Dis2 — owner-decision (from Stage 2, to frame-step-confirm on the video)

The visible label collision _fade_ is Mapbox's native symbol fade (our literal flip is instant); "snap never fade" needs a Mapbox fadeDuration override. Collision↔basemap crossfade can't flip our ignorePlacement (forbidden). Deferred to owner decision + video frame-step.

## Implementation order (autonomous)

1. **L1** (cold-guard the winner-literal stomp) — clearest, lowest-risk. 2. **R1** (fix the presentation animator start clock) — high-value. 3. **L3** (drop the moving-adaptive stretch). 4. **Toggle-back cluster T4 + pin-disappear** (upstream projection re-select on toggle settle) — highest-value, needs care (focused panel). 5. R2 assess after R1. Each: implement → build → validate on-device → next. L4/R3-Dis2 left for owner.

## PROGRESS (autonomous implementation)

- **L1 (label flash): FIXED + on-device validated.** commit now UNIONS `__lea_revealed__` (never shrinks); selector skips no-observation passes + drops only DEMOTED winners. Trace: `REVEALCOMMIT commit=25 union=76`, selector stable `revealed=75 DROPPED=[] ADDED=[]`. No stomp. (SearchMapRenderController.swift: readSentinelLiteralKeys helper, commit union ~8429, selector guard+promotedSet ~9801.)
- **R1 (reveal snap): PARTIAL.** Animator clock now anchors to first tick (fixed the arm-vs-first-tick 0.001→0.65 jump). RESIDUAL: a ~148ms main-thread stall MID-fade (`presramp 0.026→0.535`) — the first label observation (QRF+selector on ~69 markers) blocks the display link during the fade. DEEPER FIX NEEDED: run the first label observation UNDER COVER (before the fade starts) so the fade is unblocked (also helps L1 — winners committed pre-fade). TODO.
- **NEXT: toggle cluster (T4 stale data + pin-disappear promoted=0)** — the source projection produces the WRONG tab's rankedCandidates on toggle-back (confirmed: activeTab=restaurants, count=236=dishes). Investigate use-direct rankedCandidates-vs-activeTab.

## TOGGLE CLUSTER (T4 + pin-disappear) — ⚠️ SUPERSEDED HYPOTHESIS (see "ROOT CAUSE FOUND + FIXED" below)

> NOTE 2026-07-01: this section's `mountedResults`-staleness/re-fetch theory was my pre-instrumentation guess and is WRONG. On-device instrumentation proved the root is the shortcut-COVERAGE features cache (not `mountedResults`, which holds only the top-20 ranked). See the "TOGGLE CLUSTER — ROOT CAUSE FOUND + FIXED" section at the bottom. Kept for history.

The map projection (use-direct :1219) reads `mountedResults = getSearchMountedResultsDataSnapshot().results` — a single snapshot holding BOTH `.restaurants` and `.dishes`; `activeTab` selects which axis the catalog builder uses. `[t4dbg]` proved `activeTab=restaurants` while `rankedCandidates=dishes(236)` — so the builder used dish data with the restaurant tab active. Mechanism: a toggle is a RE-FETCH (dishes vs restaurants are different queries); on a rapid toggle-BACK the target tab's re-fetch didn't complete/commit into `mountedResults` (debounce-coalesced), so the projection ran on stale (dish) or empty (`EMPTY_RESTAURANTS`) data. Empty restaurants → engine `decide` yields **promoted=0** → the pin-disappear. So T4 (stale data) and the pin-disappear (promoted=0) are ONE root: the toggle-back target-tab data is not (re)committed to `mountedResults` on rapid toggle. This is the RESULTS-FETCH/COMMIT flow (the other session's open "toggle-back staleness" B), and it's precisely what the **TR5 portable toggle coordinator** (declareToggle refetch|inMemory + the settle→regrab→publish join) is meant to own. FIX belongs in that rework, gated by: on a toggle SETTLE, force the target tab's data to (re)commit into `mountedResults` before the map projects — verify via the `[t4dbg]` `changed:true published:true` on a dish≠restaurant dataset + `toggleSettled promoted>0`. Do NOT patch the projection to paper over stale upstream data.

## REMAINING WORK (specced; each own probe-gated pass)

- **R1 deeper** (reveal-sequencing, NOT trivial — attribution CORRECTED 2026-07-01): the residual mid-fade ~148ms stall (`presramp` 02:22:06.479 opacity=0.001 → .627 opacity=0.509, one 148ms gap then smooth 60fps) is **NOT** the label observation. PROVEN: a targeted `log show` of the exact 479→627 stall window captured **ZERO** lod-tagged events (no lbldbg/leamem/decide/commit/observation ran in it). So the block is un-instrumented main-thread work — at reveal that is the **source-data commit + Mapbox's first tile/placement pass** over ~647 features (GeoJSON setData + re-tile + first symbol placement, main-thread, easily 100-150ms). The dots/labels fade runs on the SAME main-thread display link, so it stalls during that pass. FIX (needs care, touches the committed reveal machinery): do NOT start the presentation fade until the source tiling/first-placement has SETTLED — i.e. gate `animatePresentationOpacity(reveal)` on the first rendered frame AFTER the source commit, so the heavy pass happens fully under cover and the fade begins unblocked. The reveal likely already has a rendered-frame enter-gate; the fade appears to arm ~1 frame too early (before the first heavy placement lands). NEXT attribution step before fixing: correlate the Metro `[SRCPROJ]`/source-publish timestamp + the map's first post-commit render with the 479→627 window to confirm it's the source/tiling pass (clocks differ between os_log and Metro — line up by relative order). Pins are immune (CA render-server, off main); this is inherent to dots/labels being GL-on-main. Validate: `[presramp]` monotonic 60fps with no >32ms gap.
- **L3** (owner tradeoff): the 16→32ms moving-adaptive stretch batches side-picks; reducing it makes labels more live but increases QRF cost during motion (perf risk). The L1 selector-stability fix already removed the mid-motion blink-out. Deeper "live like LOD" is observation-gated (QRF) — a genuine tradeoff for the owner: accept observation-gated live (reduce stretch, measure QRF frame cost) vs bigger placement-owning rework.
- **L4 / R3-Dis2** (owner-decision, needs video frame-step): label collision fade is Mapbox's native symbol fade (our literal is instant); basemap crossfade can't flip our collision (forbidden). Present options to owner after frame-stepping mimic-flow.mov.
- **R2**: the reveal double-fade appears subsumed by the R1 clock+block fixes (single ramp once the block is cleared); re-check after R1-deeper before any baked/stale-FS removeFeatureState.

## TOGGLE CLUSTER — ROOT CAUSE FOUND + FIXED + on-device VALIDATED (2026-07-01, autonomous)

INSTRUMENTED the real data flow (probes `[tclur] COV-SET/COV-CACHE-HIT/COV-REFETCH/CATALOG/TOGGLE-CB`, `[t4dbg]`) and drove the repro. The 647/236 map markers are NOT the raw response arrays (respR/respD=20 each) — they are the per-tab **shortcut COVERAGE** (`shortcutCoverageDotFeaturesRef`: ~647 restaurant coverage vs ~236 dish coverage), fetched per (activeTab,bounds) and merged into `rankedCandidateSources` (use-direct ~1638-1651).

**ROOT (proven on-device):** the coverage TERMINAL cache (`shortcutCoverageTerminalByRequestKeyRef`) stored only resource METADATA (status/counts); the coverage FEATURES were only ever written on a fresh network fetch (COV-SET ~3014), NEVER cached. So on toggle-BACK `maybeFetchShortcutCoverage` hit the terminal cache, restored the RESOURCE, and early-returned WITHOUT restoring the features ref → the map stayed on the prior tab's coverage. DECISIVE CAPTURE: `COV-CACHE-HIT {resTab:restaurants, resFeat:647, refFeat:236}` → `t4dbg {activeTab:restaurants, count:236, published:false}` = the stale-236-on-restaurants that never recovers (T4). And on RAPID toggles, in-flight coverage fetches get superseded/aborted (catch ~3060 caches an 'aborted' terminal); the cache-hit early-returned on ANY terminal, so an aborted tab could never re-fetch → empty coverage → engine promoted=0 (the pin-disappear).

**FIX (use-direct, tagged [tclur FIX]):** (1) added `shortcutCoverageFeaturesByRequestKeyRef` (Map<requestKey,FeatureCollection>), sibling of the terminal cache; (2) fetch-success caches the features by requestKey; (3) `maybeFetchShortcutCoverage` restructured to short-circuit ONLY on a SUCCESS terminal ('completed'/'empty') — restoring BOTH resource AND features from the cache — and for 'aborted'/'superseded'/'failed' it deletes the stale entry + falls through to a fresh fetch (COV-REFETCH); (4) reset clears the features cache. tsc clean.

**VALIDATED on-device:** toggle-back to restaurants now `COV-CACHE-HIT refFeat:647` → `t4dbg count:647 published:true` (was stuck 236). Bidirectional toggle is INSTANT via cache (no re-fetch). 8-tap RAPID burst self-corrects to the right coverage, never stuck/empty (pin-disappear does not reproduce). RED-TEAM in progress (wq5nxfzq1).

**RESIDUAL (minor, pre-existing, NOT my fix):** a ~1-frame transient on rapid toggle where the projection runs with the new activeTab but the not-yet-restored features ref (e.g. `dishes count:647` for one frame, then self-heals to 236) — the features ref lags the synchronous activeTab flip. Candidate follow-up: restore the coverage features ref SYNCHRONOUSLY when activeTab commits (or gate the projection on coverage-tab==activeTab). Low priority vs the STUCK bug now fixed.

### TOGGLE CLUSTER — RED-TEAM + FINAL VALIDATION (complete)

Red-team (4 adversaries + lead, wq5nxfzq1) verdict = GO-WITH-FIXES. MUST-FIX M1 (applied): the two coverage cache-hit READ paths were inconsistent — the main path was success-gated, but the bounds-unavailable path (~2677) restored features for ANY terminal, and the error `.catch` (~3077) + the bounds-unavailable-fail (~2714) overwrote a terminal to 'aborted'/'failed' WITHOUT deleting the features entry (orphan risk). FIX: delete the features entry in lockstep at every non-success terminal write; gate the bounds-unavailable read on success too. Aborted-refetch path CONFIRMED sound by the red-team (no loop: subscription-driven not per-frame; stale in-flight rejected by fetchSeq guard). Plus the TRANSIENT fix: `publishAndFetch` now restores coverage (`maybeFetchShortcutCoverage`) BEFORE projecting (`publishSourcesRef`), so a single toggle reads the current tab's coverage — no 1-frame wrong-count flash.
FINAL on-device validation: single toggle to dishes → `t4dbg dishes count:236` DIRECTLY (no 647 flash); toggle-back → `count:647` (T4 fixed); cards+map AGREE in settled states; rapid multi-tap settles correct (never stuck), residual brief burst-transients are masked by `beginInteractionFadeOut`. tsc clean. **STATUS: toggle cluster DONE (T4 + pin-disappear + transient), UNCOMMITTED, probes still in (cleanup last).**

---

# STEP-2 CONSOLIDATED RE-VERIFICATION DRIVE (2026-07-01 ~20:45-21:08, roadmap Step 2)

**Environment (important):** the MAIN tree was being live-edited by the page-switch session (its half-written
`presentationFrame` modules broke the main Metro bundle mid-drive). The drive was therefore run on an
ISOLATED RIG: APFS clone of the repo pinned at checkpoint `80eb10a0`, its own Metro :8083
(`/tmp/crave-metro-8083.log`), SECOND sim (7B0DD874, iPhone 17 Pro), the 02:12 native binary (has L1+R1
Swift fixes). All results below are from the pinned checkpoint — the exact committed state.

## VERDICTS (each with the trace evidence)

- **R2 (reveal double-fade): CLOSED — does not reproduce.** 10 consecutive search reveals: every presramp
  ramp strictly monotonic 0.001→1.000, exactly ONE ramp per reveal, zero opacity regressions. The old
  snap-out/snap-in signature is gone (subsumed by the L1 + R1-clock fixes as hypothesized).
- **Dis1 (dismiss protect): PASS.** 11/11 dismiss ramps strictly monotonic 1→0 (~300ms); map visually clean
  of our markers after dismiss (Gate B).
- **Dis3 (dismiss label snap): NOT REPRODUCED in 10 dismisses.** No SELECTOR churn in dismiss windows (the
  only non-empty DROPPED/ADDED events are once-per-cycle cold-start re-picks with identical sets, during
  reveals). Consistent with "was the L1 two-writer conflict". Intermittent by nature — harness stays in.
- **R1 residual: REPRODUCED + REFINED.** 6/10 reveals show exactly ONE >32ms inter-tick gap (102-123ms) —
  the known stall; 4/10 are fully clean (max gap 21-22ms). Also NEW: ramp durations cluster at ~185ms
  (clean) vs ~310ms (stalled) — actual animation time is ~190ms in both cases (the stall inflates
  wall-clock). Step-3's mid-fade re-anchor turns the stall into a pause; Step-4 attributes the ~110ms block.
- **POST-DISMISS BASEMAP SUPPRESSION: DEFECT CONFIRMED (the review's #2 find, now W5-certified).**
  Baseline home map: dozens of street names/neighborhoods/POIs. After search→dismiss: a GHOST TOWN (only a
  road shield + one label). Resident collision-bearing labels/dots at opacity 0 cull the basemap
  indefinitely. CONTRAST PROOF: after the EMPTY typed search ("tacos", 0 results → empty catalog published →
  sources actually cleared) the SAME region shows full basemap labels — resident-at-opacity-0 vs
  actually-cleared is the mechanism, confirmed end-to-end. FIX (Step 5.iii): dormant/clear label+dot render
  layers at dismiss-complete (`setLabelRenderLayersVisible(false)` exists ~:6764; re-wake on reveal — the
  reveal-deadlock watchdog :5958 covers the wake-failure risk).
- **T2 (toggle double-fade) + T3 (cutout white-strip flash): NOT REPRODUCED.** 6-tap toggle burst captured
  on video (380 frames, VFR): frame-by-frame analysis of the strip band + map band found ZERO
  frame-to-frame discontinuities (no transparency flash, no luminance double-fade). Pill motion smooth
  except ONE single-frame re-target across the whole burst (rapid re-targeting, not the old at-click drop).
- **T1/TR1 (at-click drop / pill pacing): SUBSTANTIALLY CLOSED on sim.** The armed perf scenario's frame
  samplers ran through the typed-search + toggle drives: 103/108 windows stallCount=0 (4×1, 1×2),
  97/108 droppedFrameRatio=0 (worst 0.4 in one window). No catastrophic at-click stall anywhere. Final
  verdict on REAL DEVICE at Step 10 (Instruments hitches during pill animation).
- **TYPED-QUERY (non-shortcut) TOGGLE-BACK: PASS.** "pizza" (respD:12/respR:20, natural path, no coverage):
  toggle to restaurants → `t4dbg {restaurants, count:20, changed:true, published:true}`; back to dishes →
  `{dishes, count:11, changed:true, published:true}`; stable dedup after. No T4-class staleness off the
  shortcut path. BONUS: the EMPTY-result edge ("tacos" 0/0) handles cleanly — both tabs settle at 0:empty,
  no stuck state, clean empty-state UI.
- **CROSS-SEARCH `__lea_revealed__` UNION LEAK: REFUTED.** After the Best-restaurants cycles union=64; the
  next different search's commits show union=37 (reset + re-grown from the new search's winners, not 64+new).
  The literal does NOT leak across searches. (Completeness finding #11 closed.)
- **BOUNDS-CHANGE COVERAGE (search-this-area class): PASS.** Re-searching from a panned viewport fetched a
  NEW coverage (COV-SET feats:1141 vs the prior 647), published `changed:true`, and subsequent cache-hits
  agree (refFeat=resFeat=1141). New bounds → new requestKey → fresh fetch; no stale cross-bounds restore.
- **D1 (zoom-extreme dots): STATIC PASS; transient check deferred to device.** Programmatic camera jumps
  z9↔z17↔z12 with results up: markers return correctly at every level (dots round, labels crisp, no
  double-ink/misplacement in stills); pin overlay roster stable (promoted=30 tiles=30 ×13) throughout.
  CAVEAT: the armed perf scenario's arming RESET the search session once (`catalogEmpty=true` noise) — arm
  BEFORE searching. Transient wiggle/flash class needs the 240fps device slo-mo (Step 10).
- **Load-more:** not driven (map effect = a catalog append re-publish, the dedup path already exercised);
  folded into map-accept.sh / Step 10.

## Incidental finds

- The empty-search state ("No dishes found") correctly CLEARS the map sources — and thereby proves the
  suppression-defect mechanism by contrast.
- Maestro coordinate taps are DEVICE-LAYOUT-SENSITIVE (the dismiss X is 92%,8% on the Pro Max sim but
  88%,11% on the Pro) — map-accept.sh should prefer id-based taps or per-device coordinates.
- `set_map_camera` deep links REQUIRE an armed perf scenario; arming mid-session resets the search session.

---

# STEP-3 IMPLEMENTED + VALIDATED (2026-07-01 late; the two universal fade fixes)

**Fix (i) — MID-FADE RE-ANCHOR (SearchMapRenderController.swift, animator + step fn):** any inter-tick gap

> 20ms shifts the fade clock forward by (gap − one nominal frame), budget-capped at 500ms — a main-thread
> stall now reads as a PAUSE, never a jump, in all three flows. VALIDATED: 53 re-anchor events across two
> drives; at the real 100-171ms reveal stalls the opacity delta is now 0.009-0.025 (was 0.3-0.5 = the visible
> snap); worst delta anywhere after the 20ms threshold = 0.083 < the 0.1 gate (the first build used 25ms and
> leaked 0.113 via sub-threshold 24ms gaps — the 20ms threshold closes that hole by construction:
> 19.9/300×1.5 ≈ 0.0995). Ramps under stall now run ~430-467ms wall-clock (300ms fade + paused stall) as
> designed.

**Fix (ii) — SETTLE-OFF-RAMP-COMPLETION:** the enter settle gate (guards → commit-fence → armNativeEnterSettle)
is extracted to `evaluateEnterSettleGate` and now fires from the presentation ramp's completion tick
(deterministically AFTER the fade); the old wall-clock timer is demoted to a bounded fallback at
enterSettleDelayMs+700ms. Kills the LEA-commit-mid-visible-fade window (the promote-dip class) by
construction. VALIDATED: 12/12 `[leamem] underCover` commits landed at opacity ≤0.001 (under cover) or
post-completion; ZERO mid-fade commits. Dis1 stayed monotonic throughout.

**NEW DEFECT (probe-grade, found the hard way): POISONED PERSISTED SESSION FREEZES PRESENTATION ACROSS
RELAUNCHES.** During the validation the backend died mid-drive (twice: a wedged nest tree, then a reaped
nohup). The app session persisted a mid-toggle presentation snapshot from that era, and EVERY subsequent
boot restored it: `contentVis: "frozen"`, pvck stuck on an old toggle-intent, native visual source
permanently `inactive/dismissing` — searches open at the JS level but the map NEVER reveals, across full
terminate+relaunch cycles. UNSTICK: arming a perf scenario (`crave://perf-scenario?...`) resets the search
session and restores normal reveals. This is a session-restore robustness gap (the restore should validate/
drop mid-transition snapshots); filed for Step 5/8 hardening. Rig note: sim-2's app data is still poisoned —
unstick before future drives or wipe app data (uninstall requires re-auth).

**Rig/process gotchas recorded:** backend must run harness-managed (a `nohup &` from a tool shell gets
reaped ~20s later = the graceful-shutdown mystery); a wedged nest child can hold :3000 answering /health
while failing real requests (EADDRINUSE for the new instance — kill the whole tree); install-over-running-app
can produce a bad boot (terminate first).

---

# STEP-4 ATTRIBUTION: the R1 mid-fade stall is IDENTIFIED (2026-07-02, `[applyslow]` probe)

Probe: `recordNativeApply` now lodLogs any instrumented section >30ms, scenario-independent (the armed
perf scenario's quiet measured loop INTERFERES with UI-driven reveals — that was the "poisoned rig"
mystery's second half; arming for attribution is self-defeating; the probe replaces it).

**The full reveal timeline (timestamped, one clean reveal):**

1. UNDER COVER, before the first fade tick: `set_frame.total|enter_requested ms=437` — the big block:
   `snapshot.parse_source_deltas ms=96` (the parseFeatureCollectionData double-parse) +
   `reconcile ms=80` + `presentation.apply ms=181`. All PRE-tick → absorbed by the R1 first-tick anchor,
   invisible. NOT the mid-fade stall.
2. First tick (opacity 0.001).
3. **THE MID-FADE STALL: a SECOND JS set_frame lands ~100ms into the fade — `set_frame.apply_interaction_mode|entering ms=100`,
   containing a FULL `reconcile.prepare_pin_label_output ms=41` + `reconcile.total ms=74` — for what is
   semantically an interaction-MODE-only change.** It blocks the main thread → the 142ms tick gap → which
   the STEP-3 RE-ANCHOR now converts to a 0.009 opacity step (pause-not-jump VISIBLY working in this trace),
   then a flawless 60fps ramp to 1.0.
4. Post-completion (live phase): another ~80ms set_frame — after the fade, invisible.

**Consequence:** the R1 SMOOTHNESS issue is fully resolved (Step 3); what remains is ~100-140ms of reveal
LATENCY (the fade pauses while the interaction-mode frame reconciles). THE FIX (specced, next session):
an interaction-mode-only set_frame should NOT re-run the full pin/label reconcile — either (b) native
skips `reconcile.prepare_pin_label_output` when the marker-bearing inputs are fingerprint-unchanged
(preferred; the snapshot-equality fingerprints exist), or (c) JS defers the interaction-mode frame to the
ramp-completion settle. Do NOT queue whole frames mid-fade (new mechanism, riskier).

**Rig resolution (the "poisoned session" saga closes):** the frozen boots were a compound: (i) an armed
MapLod scenario's quiet measured loop suppresses UI-driven reveals while active (arm-then-expire is the
only safe pattern), and (ii) a stale app-container state cleared by the reinstall-rotation + polls
bootstrap-cache removal. The freeze itself (boot → contentVis frozen → map never reveals) remains
probe-grade for the hardening step: the app container UUID rotates on reinstall, and the exact poison
vector was destroyed in the fixing — needs a controlled repro if it recurs.

---

# STEP-5(iii) POST-DISMISS BASEMAP SUPPRESSION: FIXED + VALIDATED (2026-07-02)

The label RENDER layers are now dormed to `visibility:none` at dismiss-complete
(completeDismissVisualLifecycle) — the one-edit fix the architecture was already built for: the reveal
preroll's wake call + its deadlock-guard comments were written expecting this dormancy ("dormant via
visibility:none while hidden"); only the dismiss side had been backed out (its old NOTE cited a reveal-gate
deadlock that the placement-gate watchdog + the 16ms query-after-wake self-retry now cover).

VALIDATED on-device: post-dismiss the basemap is FULLY RESTORED (all street names/neighborhoods/POIs — vs
the certified ghost town on the identical flow yesterday); polls sheet intact; the re-search reveal ramps
cleanly to 1.0. STRESS: 10 search↔dismiss cycles = 13 reveal ramps completing at 1.0, ZERO
deadlock_placement_forced fires across every dormancy→wake transition.

---

# STEP-5 R1-LATENCY FIX: interaction-mode reconcile skip — LANDED + VALIDATED (2026-07-02)

The suppressed→enabled interaction-mode flip no longer runs the full pin/label reconcile. Redundancy proven
by the code's own invariants before cutting: suppression "only disables query resolution" (mutates no
rendered state), data frames reconcile fully while suppressed (the snapshot reconcile is not mode-gated),
and marker transitions are gated by lifecycle state, not interaction mode. The two things the flip CAN
affect (highlight resolution, presentation opacity) are still re-applied directly.

MEASURED (10-cycle drive): `set_frame.apply_interaction_mode` dropped **~100ms → ~31ms**; the mid-fade
reveal stall census dropped from 100-171ms to **24-66ms max**; every remaining >30ms section sits in the
under-cover phases (invisible by the first-tick anchor); 7 reveals completed at 1.0, zero deadlocks. The
remaining ~31ms (highlight+presentation re-applies) is sub-2-frames and invisibly absorbed by the Step-3
re-anchor — a future micro-win at best.

**FALSE ALARM RESOLVED (worth keeping):** a post-stress screenshot appeared to show returning basemap
suppression — it was the SEARCH CAMERA-FIT kept after dismiss (wider zoom → naturally fewer street labels).
Proven by: fresh-boot pre-search at the tight camera = full labels; zoom-in on the post-dismiss wide camera
= fully alive basemap (streets + POIs everywhere). The dormancy fix holds under multi-cycle stress.

**BOOT-FREEZE ATTRIBUTION SHARPENED:** the recurring frozen boots are the PAGE-SWITCH host refusing to hand
ownership to search (`[pageswitch] host {in:"search", out:"polls", searchOwns:false}`) — the other session's
committed WIP bug-family (0ef2d26d), ~50% of boots on this tree, NOT map-effort code and NOT persisted
state. Workaround: relaunch until healthy (verify with a probe search → presramp>0). Their in-flight
redesign owns the real fix.

---

# STEP-5 L3 FREE WINS — LANDED + VALIDATED (2026-07-02)

1. **Telemetry-only dot QRF gated** (was ~half the per-observation-pass cost): the rendered-dot observation
   (an extra queryRenderedFeatures over the dot layers + a bridge emit EVERY pass) is consumed ONLY by the
   perf-attribution channel, which JS drops unless a scenario is armed. Now gated on
   `nativeApplyAttributionEnabled` (set exactly by the scenarios that consume it).
2. **The back-off wrong-signal fixed**: with hit-commits ON, the moving noop-streak compared the STICKY
   SETTLED set across passes (slow-changing by design) → the ladder maxed to 96ms during motion →
   observations 6× sparser → grace streaks took 6× longer wall-clock → side-picks batched harder (the
   compounding L3 feedback loop). The streak now ALSO reads the LIVE per-pass QRF delta (sorted, stable),
   and tier-1 requires TWO consecutive quiet passes (single quiet passes between Mapbox placement updates
   are normal during motion).

MEASURED (sustained pan drives): deep tiers (64/96ms) ELIMINATED during motion; base-16ms share tripled
(13% → 39% of passes); remainder at 32ms. **The residual IS the genuine ceiling:** Mapbox's own placement
clock changes slower than 32ms — observing faster re-reads identical results. Further liveness requires
owning placement (forbidden by the collision constraints) or Mapbox exposing placement events. This is the
data for the owner's L3 residual decision (roadmap Step 6): the observation-gated architecture is now AT
its ceiling.

---

# STEP-5 L4/R3 LOOK-AND-PICK KIT — LANDED + LIVE-VALIDATED (2026-07-02, `062254f4`+`66ac374e`)

The dev knob for the owner's Step-6 label-edge sitting, working end-to-end (unarmed, while browsing):

    crave://perf-scenario-command?action=set_label_transition&transitionDurationMs=100&placement=on

- **Config A** (status quo / Google-authentic): `transitionDurationMs=300&placement=on` (or never fire it).
- **Config C** (shortened fade): `transitionDurationMs=80..120&placement=on`.
- **Config B comparison** (eliminated by ruling; drivable for the on-device look): `placement=off`
  (labels SNAP — style-global, basemap snaps too).
- **Config D** (ours-snap share): NO new code — from one browse drive's logs, SELECTOR ADDED/DROPPED lines
  = our literal snaps; live-observation deltas without a selector change = Mapbox fades. The share =
  selector-changes / total-visibility-changes.

Mechanics: MapboxMaps style-global `TransitionOptions` (the only snap lever the SDK exposes), remembered
natively + re-applied on every style load. Dispatches ABOVE the perf-command arming gate (discovered live:
`executeCommandEvent` ignores everything unarmed — which also retroactively explains the D1-era
set_map_camera mystery).

**STEP 5 IS COMPLETE** (suppression defect, R1-latency reconcile-skip, L3 free wins, the kit).
Next: Step 6 (the owner sitting), Step 7 (TR5 expanded), Step 8 (hardening), Step 9 (cleanup+harness),
Step 10 (device battery).

---

# OWNER FINGER-TEST PUNCH LIST (2026-07-02 — supersedes my trace-level "closed" verdicts where they conflict)

The owner drove the landed state and reports. THE SCREEN OVERRULES THE TRACES. Itemized (P = punch):

- **P1 REVEAL SNAP (after heavy pan/zoom + search):** pins/labels/dots SNAPPED in, no fade. My R1/R2
  validations used clean COLD cycle reveals; the owner's flow hits the WARM/instant path — which I
  OBSERVED on the rig ("searches took the instant path, only dismiss ramps, presentation reaches 1 with no
  animator") and WRONGLY wrote off as session-state weirdness. It is a REAL path real usage hits: the
  cache-replay / warm re-search reveal sets presentation directly instead of arming the canonical ramp.
  PRIME SUSPECT + first attribution target.
- **P2 CLOSE BUTTONS DEAD (intermittent, after search + heavy pan/zoom):** both X buttons no-op. Cluster
  with P8/P9 — smells like the searchOwns/ownership family (the page-switch WIP) OR an enter that never
  settled (if the instant path skips the ramp, my settle-off-completion relies on the +1000ms fallback —
  verify the fallback actually fires on the instant path).
- **P3 LABEL DOUBLE FADE-IN (still):** my R2 "closed" was PRESENTATION-level (presramp) — label opacity is
  a 4-factor product (presentation × nativeLabelOpacity × **lea_revealed** × base); the double-fade can
  live in the label factors I did not measure. Needs a label-factor trace on a real reveal.
- **P4 L3 BATCH SIDE-PICK after BIG twists (still, sometimes):** beyond cadence — the settle-batch on large
  twists persists. Cadence is at the ceiling; the batch likely = QRF-async + placement-clock alignment at
  settle. Needs the deeper look (or the owner's snap policy P13 makes it moot: snapping culls removes the
  visible batch-fade).
- **P5 RAPID-TOGGLE APP FREEZE:** "the whole app freezes for a moment; map and results disconnected from
  the toggle." My TR1 sampler windows were clean on MY drives — measure on the OWNER's flow shape (rapid
  hand-speed toggling, warm state). JS-thread stall suspect (the samplers measured UI thread mostly?).
- **P6 FILTER TOGGLES (Open now etc.): no active-color change + results reload behind a WHITE COVER
  instead of the skeleton sheet.** Scope note: filter chips were never wired to the fade flow (they are the
  deferredApply consumers-to-be). The white-cover-vs-skeleton question may be TREE contamination (the
  cutout-skeleton work lives UNCOMMITTED in another session's tree — if the owner drove the rig, the
  skeletons simply aren't in this branch). VERIFY which tree the owner drove.
- **P7 MARKERS DON'T FADE OUT on filter toggles** (only on restaurant/dish): known scope gap → TR5.
- **P8 TOGGLE FADE-OUT ≠ CANONICAL:** slower than the canonical fade, not-on-press-up feel, "some
  overridden fade-out still around." Owner wants ONE fade everywhere (TR4/X2). Audit
  beginInteractionFadeOut/applyInteractionFadeOut duration + trigger timing vs the canonical 300ms ramp.
- **P9 TOGGLES INTERMITTENT/UNRELIABLE; sometimes NO PINS just labels:** pin-disappear-like recurrence
  under real toggling. Also "UI change lands after the fact." Cluster with P2/P5.
- **P10 GRABBER DISMISSES RESULTS:** tapping the sheet header grabber closes the whole search like a
  dismiss. Should never happen. (Sheet/page-switch territory — verify tree.)
- **P11 DOTS MISSING IN SPARSE AREAS:** dots absent where plenty exist and culling should not explain it.
  Owner explicitly asks to CONFIRM whether culling alone accounts for it (it should not, in sparse areas).
- **P12 (verify) which sim/tree the owner drove** — sim-2 rig (pinned to this branch only) vs sim-1 (main
  tree incl. the page-switch WIP). Forks the triage of P2/P6/P10.
- **P13 OWNER LABEL-POLICY RULING (NEW, supersedes the A/C look-and-pick):** "labels only SNAP when
  changing position or being culled (collision-driven), and only FADE during promote/demote with the
  pins/dots (LOD-driven). Standardize on that and remove any other option, if viable."
  VIABILITY: YES — this is exactly `placement transitions OFF` (config B: all collision-driven
  appear/move/disappear SNAP) while our LOD promote/demote + presentation fades are OUR OWN feature-state/
  literal opacity writes, UNAFFECTED by the placement-transition knob (they keep fading). The ONE caveat
  (SDK-verified, style-global knob): the BASEMAP's street labels also snap on collision changes during
  panning. The owner should drive config B knowing that's the trade; if basemap snapping offends,
  config C at ~80ms is the closest non-global-snap compromise. There is NO per-layer placement knob.

---

# OWNER RULINGS ROUND 2 + CORRECTED MODELS (2026-07-02)

**R-5 LABEL POLICY, FINAL FORM:** config B's behavior for OUR labels (collision-driven changes SNAP) but
basemap street names MUST keEP their native fade. The global knob can't split — but the ARCHITECTURE can:
**the collision-twin design.** Our label RENDER layers become `allowOverlap+ignorePlacement` (never
placement-culled, never placement-faded → their visibility is 100% our literal = SNAP always, and our
LOD/presentation fades keep working — they're our own opacity factors). The invisible label COLLISION twin
layers (a `labelCollisionSourceId` already exists in the state!) carry the obstacle role: allowOverlap=false
(they compete + get culled → QRF-observable so the selector still learns outcomes) + ignorePlacement=false
(they still SUPPRESS basemap names under our labels — preserving the June-27 W5 ruling). Basemap keeps
placement transitions ON (native fade). DELIVERS EVERYTHING: ours-snap / basemap-fades / suppression intact /
LOD fades intact. DEEP-DIVE REQUIRED before building: what labelLayerIds vs labelCollisionLayerIds do TODAY
(the twin may be partial), what the selector QRF actually observes (must observe the TWINS after the flip),
and the history of why ignorePlacement was "forbidden" (that ruling was about flipping collision on the
tiled sources MID-FLOW — a static twin split is a different thing; verify).

**P4 CORRECTED (owner): the batch is a batch of SNAPS, not fades** — groups of labels snap in TOGETHER at
settle after being culled during motion. Owner's hypothesis: labels wait for "the free side to be free long
enough" then all commit at once when the settle criterion is met. MENTAL-MODEL SUSPECTS (trace in code, in
order): (1) the settled-visible machinery (`settledVisibleLabelMissingGraceStreak` + commitVisibleLabelHits)
— grace-streak thresholds convert into WALL-CLOCK latency that expires en masse at settle; (2) **MY L1 FIX
ITSELF** — the selector now "drops only DEMOTED winners," so a promoted label colliding on its current side
KEEPS its stale side (Mapbox culls the render → the perceived fade-out) until an observation pass commits a
new winner — re-picks may be gated during motion and flush together at settle; (3) `commitVisibleLabelHits`
gating during motion. The L1 stability fix and L3 liveness may be IN TENSION — resolve by design, not
tuning (the collision-twin flip may dissolve this whole class: with renders never placement-culled, the
"wait for free side" dance becomes purely selector-driven and immediate).

**P12 ANSWERED: the owner drove SIM-1 (iPhone 17 Pro Max) = the MAIN TREE** = my committed work + the
page-switch session's LIVE half-built WIP + MISSING the uncommitted cutout-skeleton work. Therefore: P2
(dead close buttons), P10 (grabber dismisses results), P6-cover (white cover instead of skeletons) are
STRONGLY suspected page-switch-tree contamination — re-verify on the pinned rig before treating as map
regressions. P1/P3/P4/P5/P8/P9/P11 remain real map-effort signals.

**TR5 SCOPE PULLED FORWARD (owner):** design the toggle system for ALL toggles + the dropdown variants NOW
— the restaurant/dish-first framing shouldn't gate generalization. (= the ratified R-4 expanded scope:
content-width pill + instant|coordinated|deferredApply kinds; the filter chips get active-state + the
coordinated flow via deferredApply.)

**METHOD DIRECTIVE (owner):** MENTAL-MODEL DEEP DIVE against the actual code FIRST for every punch item —
form targeted hypotheses by running the implementation mentally and hunting smells; instrument only to
CONFIRM those hypotheses. Owner wants ME (the context-holder) doing this directly; delegate only
context-independent pieces.

---

# P1 MENTAL MODEL (code-dive, 2026-07-02): the warm-reveal snap has THREE stacked mechanisms

1. **Native short-circuit:** `animatePresentationOpacity` no-ops when |current − target| < 0.001 — any
   "reveal" requested while presentation already sits at 1 applies instantly, zero ramp. Correct for true
   no-ops; a SNAP AMPLIFIER whenever an upstream path fails to drop presentation first.
2. **The `live_update` lane (the big one):** the set_frame pipeline has exactly FOUR fade entry points
   (interaction_fade_out, dismiss_start, presentation_preroll, reveal_start). A frame arriving with
   transaction kind `live_update` (also `bootstrap`/`hidden_preload` when ready) calls
   applyPresentation()+applySnapshot() DIRECTLY — sources swap at whatever presentation currently is. If a
   WARM re-search (from results state, search-this-area, or any flow where JS doesn't arm an enter/redraw
   transaction) lands as live_update at presentation=1, the ENTIRE marker set snap-swaps. No native guard
   exists against a full-catalog swap on the live lane.
3. **Sim-1 aggravation:** the page-switch WIP's ownership failures can break the JS enter/redraw ARMING,
   downgrading what should be enter transactions into live-lane swaps (and its searchOwns:false family also
   explains the dead close buttons / grabber-dismiss cluster the owner hit).

**FIX DIRECTION (design-level, = the owner's "one canonical fade" want):** a full-catalog swap must NEVER
ride the live lane bare. Every catalog-replacing trigger (re-search, search-this-area, filter apply,
toggle) routes through the SAME coordinated shape the toggle uses: fade-out (or cover) → swap → canonical
fade-in. Implement as (a) JS: all catalog-replacing flows arm a redraw/enter transaction (this IS the TR5
coordinated flow, generalized — one more reason to build TR5 for ALL toggles + triggers now, per the owner);
(b) native GUARD: if a non-incremental snapshot swap arrives on the live lane while visible at
presentation>0.5, run the interaction-fade shape around it (belt-and-braces so no future JS path can
reintroduce the snap).

# DIVE STATE (what's modeled vs owed)

- P1: modeled (above) — next: confirm via one instrumented warm re-search (which lane the frame takes), then
  build the JS arming + native guard.
- P4: modeled (the snap-batch = settled-grace machinery + possibly my L1 drops-only-demoted stickiness
  flushing at settle; recorded in Rulings Round 2). The collision-twin design likely dissolves the class.
- P3 (label double-fade): dive OWED — trace the 4-factor label opacity product on a real reveal (which
  factor dips: nativeLabelOpacity stepper vs **lea_revealed** churn vs Mapbox placement fade).
- P8 (toggle fade ≠ canonical): dive OWED — audit beginInteractionFadeOut/applyInteractionFadeOut duration +
  curve + trigger timing vs the canonical ramp; unify to ONE fade (the fade-out on press-up should be the
  same 300ms Hermite the dismiss uses).
- P5/P9/P11 (freezes, no-pin toggles, sparse dots): dives owed after P1/P8 (P5 likely JS-thread; P11 verify
  whether the culled-count actually accounts for the sparse-area gaps — QRF the dot layer over a sparse
  region and compare against the source's features there).
- R-5 collision-twin: dive owed — today's labelLayerIds vs labelCollisionLayerIds roles, what the selector
  QRF observes, and the exact overlap/ignorePlacement flags per layer, then the twin-flip design doc.

---

# R-5 COLLISION-TWIN AUDIT + BUILD SPEC (2026-07-02 code-dive)

**Today's shape (audited):** ONE render label layer (`restaurant-labels-layer`) that is ITSELF
collision-participating (textAllowOverlap:false, textIgnorePlacement:false, textOptional:false — asserted by
the labelCollisionConfigured contract, search-map.tsx:2130-2132). Mapbox's placement fade therefore applies
DIRECTLY to our label text = the fade-on-cull half of the hybrid + the second fade system overlapping our
ramp during swaps (P8's "overridden fade" feel). The existing invisible collision layers are PIN/DOT
obstacles (`restaurant-labels-pin-collision`, `restaurant-pin-dot-collision`) — there is NO label-text twin.

**THE BUILD (medium, JS layer defs + native id switches):**

1. NEW `restaurant-labels-collision-layer`: same source + same data-driven per-side text
   field/size/offset (collision boxes must match render geometry exactly); textAllowOverlap:false,
   textIgnorePlacement:false; text opacity 0 (opacity-0 symbols still place + collide + suppress — PROVEN by
   the post-dismiss suppression saga).
2. FLIP the render layer to textAllowOverlap:true + textIgnorePlacement:true — never culled, never
   placement-faded; its visibility = purely our opacity product (presentation × stepper × **lea_revealed**)
   = SNAP on every collision-driven change, FADE on LOD/reveal (the owner's exact policy).
3. Switch the OBSERVATION (the one-of-four selector's QRF resolvedLayerIds) to the twin — placement
   outcomes live there now.
4. Switch the reveal placement gate (isActiveFrameLabelPlacementReady QRFs) to the twin.
5. Dormancy: the twin joins the dismiss dorm/wake set (it is the basemap-suppressor now); render dorm
   stays harmless.
6. Suppression parity: placed-but-literal-hidden loser candidates behave the same as today (placed
   opacity-0 candidates already collide/suppress).
7. Then DELETE the global-knob configs (the owner standardizes on this; the labelkit knob stays as a dev
   toy or gets stripped at cleanup).

**EXPECTED TO DISSOLVE:** L4 (hybrid gone — ours always snap), P8's overlap feel (one fade system left),
most of P4 (visibility stops negotiating with Mapbox's placement clock; the selector snaps winners live),
likely part of P3 (one fewer fade source during reveal).

**HISTORY CHECK (owed 1 grep before building):** the old "ignorePlacement forbidden" ruling
(search-map.tsx ~2254 comment) was about flipping collision on tiled sources MID-FLOW (the wiggle class) +
letting basemap show through when OUR layer stopped competing — the twin design keeps a competing,
suppressing layer at all times (the twin never flips), so neither objection applies. Verify the comment's
exact wording once more before the flip.

---

# P14 (owner, 2026-07-02): TOGGLE RESIDUE MUST NOT COMPETE

On tab toggle, the previous tab's map objects (labels, pin obstacles, dots) must be fully OUT of the
collision system, not merely invisible — invisible-but-colliding residue would suppress the new tab's
labels and the basemap (the same resident-at-opacity-0 class as the post-dismiss defect). Model: the toggle
publish REPLACES source feature collections (a true swap), so residue should not persist — but VERIFY: (a)
all five families swap atomically (labels + label-collision + pin obstacles + dots + pins) with no
lingering-family tick; (b) the pin OBSTACLE layer keyed to lastPromotedInOrder updates on the toggle
re-decide, not lazily; (c) during the covered swap window, old collision features don't briefly suppress
the new tab's first placement pass. Verify during the collision-twin build (the twin makes label collision
explicit + directly QRF-checkable).
