# Search-Map Ideal-Shape Effort — State Brief (2026-07-01, strategic checkpoint)

Written at the owner's request as the anchor for a full stop-and-scrutinize review: where we were, where we
are, where we're going — so the path forward can be re-derived from the ground up and either confirmed or
replaced. Companion docs: `00-ISSUE-LEDGER.md` (issue IDs), `01-MASTER-PLAN.md` (the Stage-2 consensus plan),
`02-CONFIRMED-FINDINGS.md` (instrumented root causes + fix log), `SESSION-HANDOFF.md` (repo root; the merged
session's handoff).

---

## 1. WHAT WE WANT (the full wants-ledger, consolidated)

**Product bar:** Google-Maps-grade map presentation. Concretely:

- W1. ZERO dropped frames during the toggle pill animation (TR1) — nothing on the main thread competes.
- W2. ONE canonical fade (300ms Hermite smoothstep) shared by reveal / dismiss / toggle (TR4/X2). No
  snap-ins, no double-fades, no per-flow bespoke fades.
- W3. Press-up→fade-out→settle→re-grab→fade-in toggle flow, arbitrarily-fast toggling safe (TR2), fade-in
  synchronized with the results-card reveal (TR3).
- W4. Labels: live/granular side-picks during motion like the LOD (L3-want), SNAP-not-fade while promoted
  (L4-want), good positioning preserved (L5), no reveal flash (L1), one label per restaurant.
- W5. Collision↔basemap crossfade at reveal/dismiss edges (R3/Dis2): our objects fade in/out while basemap
  street names cull/return in sync — no pop, and basemap labels NEVER show mid-search (hard constraint).
- W6. Dots: dense thinning + full collision (with each other/pins/labels/basemap) + no artifacts at ANY
  zoom change (D1/D2).
- W7. Reveal: pins+dots+labels fade in together via the canonical fade, no mid-fade stall (R1), no
  double-fade (R2), starting from a clean covered state.
- W8. Dismiss: stays clean + canonical (Dis1 currently GOOD — protect).
- W9. **TR5 — the strategic centerpiece:** the toggle strip + flow extracted as a standardized, portable
  primitive (`useToggleCoordinator` + `declareToggle({kind:'refetch'|'inMemory'})` + `CompositorToggle`)
  reusable on favorites lists / profile shared-lists / future toggles. Byte-identical current behavior =
  acceptance gate.
- W10. **H1 — a durable map-object telemetry harness** (owner-requested, in the ledger): track what each
  pin/dot/label is doing (opacity, LOD role, side-pick, collision, presentation, source publish) so future
  issues attribute fast. NOTE: the current plan's "strip all probes" cleanup step is IN TENSION with this —
  resolve deliberately (promote the proven probes into a debug-gated harness rather than deleting them?).
- W11. The ideal LONG-TERM shape everywhere — no patches, delete non-ideal code (owner ethos; nothing is
  deployed, nothing to preserve).
- W12. SACRED (restated 2026-07-01 per the strategic review — the old "byte-intact" wording was already
  false in-tree): the pin↔dot LOD engine's decide/step/snapSettled/Fade SEMANTICS + pin↔dot complementarity
  are FROZEN; the LEA reporting seam (`takeSettledRoleChangeIfAny`/`lastReportedPromotedRole` — the RETARGET,
  now ratified: it is the landed dot-flash fix, consumed at SearchMapRenderController:8251/:8421) is
  amendable WITH validation. Dots+labels stay GL (collision). Writer-contract: one writer per
  opacity-product factor.

**Out of scope but adjacent (tracked elsewhere, don't silently absorb):** the 4.4s cold-search backend
latency; the page-switch/header redesign (separate effort, interleaved in this branch's tree!); cutout
skeletons; return-to-origin; Android pin restore (knowingly broken by owner choice — iOS-first).

## 2. WHERE WE WERE (genealogy, compressed)

- Good-LOD baseline: pin→CA overlay migration (`ed080fd9`) + LEA reparse-immune literals (`29670693`,
  `0a778178`) — pins CA / dots+labels GL, engine ideal.
- Two overlapping sessions then built on top: (A) reveal/LEA + label migration; (B) layer-level O(1)
  presentation + toggle rework. They started fighting (the `__lea_revealed__` two-writer stomp = L1; the
  lagged-literal vs CA-pin asymmetry = dot flash). Owner MERGED both into this session with full authority.
- The merged state's core wins (validated): O(1) layer-level presentation (8.6ms→0.17ms/tick), one canonical
  fade shared by all three flows, "second settle hangs" fixed, frost handoff floor.

## 3. WHERE WE ARE (current tree state — ALL UNCOMMITTED on `fix/map-lod-wiggle-dismiss` @ `0a778178`)

**Fixed + on-device validated this autonomous run (2026-07-01):**

- **L1 label reveal flash** — commit UNIONS `__lea_revealed__`; selector drops only demoted. Trace-verified
  stable (union grows 25→76, selector steady 75, no stomp). (Swift)
- **R1 reveal snap, partial** — animator clock re-anchors to first tick; the arm-vs-first-tick jump is gone.
  RESIDUAL: one ~148ms mid-fade main-thread stall, PROVEN NOT the label observation (empty log window);
  attributed to the reveal's source-data commit + Mapbox first tile/placement pass (~647 features) on main.
- **Toggle cluster (T4 + pin-disappear + transient) — FIXED + red-teamed (GO-WITH-FIXES, M1 applied).**
  Root (instrumented, decisive): the shortcut-coverage FEATURES were never cached — only resource metadata —
  so a toggle-back cache-hit restored the resource but left `shortcutCoverageDotFeaturesRef` on the prior
  tab's coverage (stale 236-on-restaurants, never recovers), and aborted terminals could never re-fetch
  (empty coverage → engine promoted=0 → pins vanish). Fix: sibling features cache by requestKey; cache-hit
  restores BOTH; success-only short-circuit (aborted/failed/superseded → delete + re-fetch); lockstep
  deletes at every non-success write; `publishAndFetch` restores coverage BEFORE projecting (kills the
  1-frame transient). Validated: toggle-back recovers 647; single toggle clean; rapid bursts settle correct;
  cards+map agree. tsc clean.
- (Earlier, merged session, validated): O(1) presentation, second-settle hang, dismiss Gate B clean, frost
  floor (code-verified; finger-test owed).

**Open issues (from the ledger, with current status):**

- **R1-deeper:** the 148ms stall. Direction: don't start the fade until the source commit + first
  tile/placement settles (the loading cover is already up — the extra ~150ms happens under cover, invisible).
  The reveal ALREADY has placement-gate machinery (`reveal_start_deadlock_placement*`,
  `labelPlacementReadinessSummary`) — the fade likely arms ~1 frame too early. Needs Metro↔native timestamp
  correlation first. TRADEOFF for owner: reveal begins ~150ms later (under cover) but perfectly smooth.
- **R2 double-fade:** believed subsumed by the R1 clock fix + L1; NOT re-verified on-device.
- **L3 label batch side-pick on twist:** confirmed 16→32ms moving-adaptive observation stretch. GENUINE
  TRADEOFF: restore 16ms cadence during motion = more live picks but more QRF main-thread cost (competes
  with W1). Owner decision + measurement needed.
- **L4 snap-not-fade:** the visible label fade is MAPBOX's native collision fade (our literal flip is
  instant). Requires a `fadeDuration→0`-class override (verify the knob exists in rnmapbox 11.16.6) — else
  not reachable without owning placement (forbidden). Owner decision.
- **R3/Dis2 collision↔basemap crossfade:** flipping OUR collision is FORBIDDEN (basemap would show
  mid-search + re-placement wiggle class). Candidate lever: crossfade the basemap import label opacity
  (`setStyleImportConfigProperty`) with presentation. Unbuilt, unmeasured. Owner decision + frame-step of
  the reveal/dismiss edges on video.
- **T1 at-click frame drop:** suspected stale-bundle artifact; NEVER re-attributed on fresh bundle. Quick
  probe owed. TR1 "zero dropped frames" also never re-MEASURED post-fixes.
- **Dis3 intermittent dismiss label snap:** likely was the L1 two-writer conflict; NOT re-verified.
- **D1 zoom-extreme dot artifacts:** red-team pass owed (ledger requirement); never run.
- **TR5 portable primitive:** not started (deliberately last).
- **H1 harness:** not started; in tension with the "strip probes" cleanup (see W10).
- **F1 frost:** fixed, finger-test owed.

**Tree/process state (RISKS):**

- EVERYTHING uncommitted, and the branch tree interleaves a SECOND effort (page-switch/header: deleted
  `OverlaySheetHeader.tsx`/`useHeaderCloseCutout.tsx`, polls panel changes) with the map work. ~650
  insertions / ~900 deletions pending. A bad edit/checkout loses months.
- Debug probes still in: JS `[tclur]/[t4dbg]/[SRCPROJ]/[TGLDBG-v2]/[pageswitch]`; native
  `[presramp]/[lbldbg]/[leamem]/[l3dbg]/[expodbg]/[srcdbg]/[reparsedbg]/[FCGATE]/[FADEDBG]` +
  `lodDebugLoggingEnabled=true`; LodEngine carries the additive `inFlightReparseExposure()` probe.
- `apps/api/.env` throttle relaxed (dev-only, gitignored — must restore).
- ALL validation is SIMULATOR-only. The 0.17ms layer-write, the 60fps ramps — none re-measured on a real
  ProMotion device. "Google-grade" cannot be declared from the sim.
- Android pin render+tap knowingly broken (iOS-first, owner choice) — must gate any beta.

## 4. THE PLAN OF RECORD (what this review scrutinizes)

Per `01-MASTER-PLAN.md` + `02-CONFIRMED-FINDINGS.md`: R1-deeper → [owner decides L3 / L4 / R3-Dis2] →
T1-if-reproduces → TR5 extraction → cleanup (strip probes, revert throttle) → commit.

**Known tensions the review must resolve:**

- (a) "Cleanup+commit LAST" vs the uncommitted-tree risk — should we strip/commit the validated map work NOW
  as a checkpoint, and how do we disentangle the interleaved page-switch work?
- (b) "Strip all probes" vs W10/H1 "build a durable harness" — delete or promote?
- (c) R1-deeper's under-cover settle gate vs reveal latency — is ~150ms later-but-smooth actually the ideal?
  Is there a mechanism that costs zero latency (e.g. pre-tiling during the fetch window)?
- (d) TR5 now vs after-commit; and is the `useToggleCoordinator/declareToggle/CompositorToggle` shape still
  the right abstraction given the toggle bugs turned out to live in the COVERAGE layer, not the coordinator?
- (e) Sim-only validation vs the Google-grade bar — what's the real-device acceptance gate?
- (f) Is anything MISSING from the wants-ledger entirely?

---

## 5. APPENDED VERIFICATION FACTS (main-session independent checks, 2026-07-01 — synthesis MUST fold these in)

- **F-A (R1 reframe):** the reveal ALREADY has an under-cover hidden-placement flow: `enter_mounted_hidden`
  drives the label-placement commit off a COMPLETED render frame (`onRenderFrameFinished` →
  `handleRenderFrameFinishedForHiddenPlacement`, scoped to `.preparingReveal` before the gate opens;
  SearchMapRenderController.swift ~10684-10700). So the ideal reveal state machine (mount hidden →
  placement-settled under cover → fade) EXISTS in skeleton. R1-deeper = "some heavy work still lands after
  the gate opens" — close the gap in the EXISTING gate, not add a new one. ALSO: the 148ms stall attribution
  is still open between (i) Mapbox tiling landing post-gate and (ii) the RESULTS-CARDS mount on the main
  thread (fade is synchronized with card reveal, TR3) — the empty lod-log window is consistent with both.
  Instrument before fixing (os_signpost / Time Profiler / RN commit correlation).
- **F-B (R3 mechanism):** the app uses a CUSTOM Studio style (`mapbox://styles/brandonkimble/cmhjz...`,
  apps/mobile/src/constants/map.ts:1), NOT Mapbox Standard-with-imports. If it's a classic layer style (very
  likely), basemap label layers are directly addressable → the collision↔basemap crossfade can be built by
  animating the basemap symbol layers' `text-opacity` with the SAME O(1) RMW layer-write machinery we already
  have, driven off the presentation ramp. The master plan's `setStyleImportConfigProperty` lever is likely
  WRONG (that's for Standard imports, and those are mostly BOOLEAN show/hide, not opacity). Verify at runtime
  by enumerating style layers; then R3/Dis2 becomes a cheap build-behind-a-flag → owner decides by looking.
- **F-C (SDK versions for L4 homework):** MapboxMaps iOS 11.16.6, MapboxCoreMaps 11.16.6, rnmapbox 10.2.9.
  Nothing in the codebase touches fadeDuration/style-import config today.
- **F-D (T1/TR1 partial data):** on the current fresh bundle, the toggle re-reveal presentation ramp shows a
  ~64ms first-tick gap then rock-solid 16-17ms (60fps) to 1.0 — no catastrophic at-click stall on the ramp
  path. The PILL (Reanimated) side is unmeasured (needs its own frame-pacing probe). T1 likely small/stale;
  needs one targeted pill measurement before closing.
- **F-E (toggle burst masking):** during rapid multi-tap bursts the wrong-count transients publish while
  `beginInteractionFadeOut` has the markers dimmed; final state always correct (validated). The masking claim
  is observational (screenshots + settled traces), not frame-proven.
