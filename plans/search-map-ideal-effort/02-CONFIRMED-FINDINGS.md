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
