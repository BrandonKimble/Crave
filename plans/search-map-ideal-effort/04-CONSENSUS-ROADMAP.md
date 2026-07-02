# Search-Map Ideal-Shape — Consensus Roadmap (2026-07-01 strategic review)

Product of the 8-reviewer + synthesis-lead strategic review (4 ground-up derivations: blank-slate /
pragmatist / perceptual / risk; 4 adversaries: R1-mechanism / TR5-abstraction / owner-decisions /
completeness). **Verdict on the plan of record: AMEND, unanimous 8/8 — zero votes for REPLACE.**
The architecture (O(1) layer-level presentation + one canonical fade + LEA literals + CA-pins/GL-dots-labels)
survives blank-slate re-derivation and is the ideal shape; the landed fixes (L1, R1-partial, toggle cluster)
are real and validated. What was wrong: the plan's process spine and several factual premises.
This document SUPERSEDES `01-MASTER-PLAN.md`'s sequence; the fix content there remains historical context.

## The amendments (each forced by verified evidence)

- **A1 Commit+push FIRST, not last** (8/8). The branch has NO upstream — everything exists on one machine
  only. The two interleaved efforts are file-disjoint (verified). The LodEngine diff is load-bearing
  (`takeSettledRoleChangeIfAny` RETARGET consumed at SearchMapRenderController:8251/:8421 — it IS the
  dot-flash fix), so it commits with the map work.
- **A2 Probes → gated H1 harness, don't strip** (7/8). The old strip list names probes that don't exist and
  misses ones that do (incl. `[TGLDBG-v2]` in a COMMITTED file — any diff-scoped strip misses it). Promote
  the proven probes behind a RUNTIME default-off flag (deep-link toggle → Release-build acceptance possible);
  JS probes → the existing `logPerfScenarioAttributionEvent` channel; strip only true temps. Grep-derived
  strip list, not doc/diff-derived.
- **A3 R1-deeper reframed.** The fade start is ALREADY fenced (source-commit ack :2799-2810/:11429 +
  placement gate :6026/:10784). The 148ms stall's identity is STILL OPEN (tiling vs results-cards mount vs RN
  commit — the "empty log window" proof was structurally blind: emitVisualDiag goes over the RN bridge, not
  os_log). Two cheap universal fixes land first: (i) MID-FADE RE-ANCHOR — extend the first-tick anchor
  (:8906-8911) to any inter-tick gap >~2 frames, so ANY stall becomes a pause never a jump, all three flows,
  forever (budget-capped ~500ms); (ii) SETTLE-OFF-RAMP-COMPLETION — enter settle is a wall-clock timer
  (`enterSettleDelayMs=300`), now desynced from the tick-anchored fade → the LEA commit can land mid-visible-
  fade (the :6374-6381 promote-dip warning); drive it from the ramp's `progress >= 1` emit (:8983-8999),
  timer demoted to bounded fallback. THEN attribute with tools that see a main-thread block (recordNativeApply
  buckets :986-1023, Time Profiler, shared runId Metro↔os_log) and branch: parse-shrink (the
  `parseFeatureCollectionData` double-parse + per-feature re-encode :12722-12767 is a real, previously
  invisible cost — zero-latency class) OR arm-on-first-rendered-frame with bounded force (:10814 pattern —
  beware: idle maps stop producing render frames; unfenced wait = new hang class) OR JS pre-mount if cards.
  HONEST ACCOUNTING: gating the fade start ADDS real time-to-full-content (~148ms worst case), felt most on
  warm toggles (frosted empty basemap dwell +~25%). The pragmatist's "no real latency tradeoff" was WRONG.
- **A4 Zero-code re-verification drive BEFORE R1-deeper.** R2/Dis3/T1-pill/TR1/D1/Dis1/T2/T3 are all
  believed-never-re-verified; STEP-0 was declared mandatory and half-executed. Free information before the
  riskiest edit.
- **A5 L4 + R3/Dis2 = ONE coupled decision; the plan's R3 lever is DEAD.** SDK-source-verified: the only
  snap knob (`TransitionOptions.enablePlacementTransitions`, MapboxMaps 11.16.6) is STYLE-GLOBAL — L4-snap
  makes basemap labels snap during ordinary browsing and destroys the R3/Dis2 crossfade. The
  `setStyleImportConfigProperty` lever targets a style architecture the app doesn't use (live style fetched:
  CLASSIC style, zero imports). Replacement lever: per-layer basemap symbol `text-opacity` +
  `textOpacityTransition` (~100 lines, our existing RMW machinery). Build A/B/C configs behind a dev flag →
  owner decides BY LOOKING. ALSO: W5 as written ("basemap NEVER shows mid-search") CONTRADICTS the owner's
  2026-06-27 ruling ("basemap labels MUST stay VISIBLE during search, suppressed only under our markers")
  AND current shipped behavior — owner must restate before any R3/Dis2 build ships.
- **A6 TR5 re-scoped.** The weld is ~3× the claimed 4 sites + a 13-file type fan-out. The named second
  consumers are PHANTOMS: favorites already launches AS search (BookmarksPanel:541-556); profile shared-lists
  don't exist; the polls feed is deliberately coordinator-free (a 300ms debounce would HARM it). The real
  duplicate is `SegmentedToggle.tsx` (hand-copied pill, live consumer). "Byte-identical" is incoherent for a
  cross-file move — replace with a BEHAVIORAL gate. The coverage cache stays OUT of the primitive (it lives in
  the map-source projection layer the coordinator never sees; a generic data-cache would re-create the
  two-cache-coherence bug class); the T4 lesson transfers as an INVARIANT CONTRACT TEST (success-only caching,
  lockstep delete, restore-before-project). Re-scoped TR5 = pill unification (absorb SegmentedToggle) +
  mechanical coordinator extraction + contract test; `declareToggle` kinds = documented seam, unbuilt until a
  real consumer exists. Pill geometry: the record contradicts itself (equal-width "DECIDED" vs "owner chose
  content-width, reverted" — reversion reads later); owner confirms.
- **A7 Doc corrections.** 01-MASTER-PLAN's T4 fix text is superseded by the shipped coverage-cache fix
  (annotated in place). W12 "LodEngine byte-intact" is ALREADY FALSE in-tree — restate as
  "decide/step/snapSettled/Fade SEMANTICS frozen; the LEA reporting seam is amendable with validation";
  ratify the RETARGET. L3's tradeoff was misstated: the back-off ladder reaches 96ms not 32 (:9391-9398), and
  HALF the per-pass cost is a telemetry-only dot QRF running unconditionally (:9563-9591) whose only consumer
  is gated perf attribution — a FREE DELETION that may dissolve the owner decision entirely.
- **A8 A finish line exists now**: regression guards + whole-flow acceptance battery + a REAL-DEVICE gate
  (every current number is simulator-only; W1 — the #1 want — has never been measured post-fixes).

## THE ROADMAP (supersedes all prior sequences)

- **Step 0 — Checkpoint commits + push (~30-60min, risk ~0).** Three commits on
  `fix/map-lod-wiggle-dismiss`, then `git push -u origin`:
  (a) MAP EFFORT: LodEngine.swift, SearchMapRenderController.swift, search-map.tsx, use-direct,
  use-search-submit-response-owner.ts, both presentation runtimes, frost runtime, 2 Maestro flows,
  SESSION-HANDOFF.md (folded into the effort dir), effort docs. Message: probes in, cleanup owed, Android
  broken by choice. (b) PAGE-SWITCH WIP: src/overlays/_ (incl. 2 deletions), app-route-polls-scene-runtime,
  plans/page-switch-_.md, transition-pillars. (c) SEARCH-ROUTING DOCS: search-system-ideal.md +
  search-routing-redesign.md deletion. Gate: tsc + swift test + xcodebuild green per commit; push succeeds.
  Optional: move page-switch to its own worktree/branch.
- **Step 1 — Regression guards (~half day, low risk).** (i) MapLodKitTests locking the RETARGET;
  (ii) Jest: lift the coverage terminal policy into pure `resolveCoverageCacheDecision()` + spec (=the TR5
  contract test); spec `areSearchMapSourceFrameSnapshotsEqual` field-sensitivity; (iii) promote the Maestro
  flows into `map-accept.sh` asserting on probe output. Gate: suites green + deliberate-mutation check.
- **Step 2 — Consolidated zero-code re-verification drive (one instrumented session, risk 0).** Fresh
  bundle+binary: R2 (×10 cold reveals monotonic), Dis3 (×5), T1-pill + TR1 (pill-side frame pacing — only
  unmeasured half), D1 (z9↔z17 torture + `[reparsedbg]`/`inFlightReparseExposure` read), Dis1-protect,
  T2/T3, POST-DISMISS BASEMAP SUPPRESSION CHECK (10min: search→dismiss→street names return? code implies NO
  `false` caller of `setLabelRenderLayersVisible` exists → resident collision-bearing labels at opacity 0 may
  cull basemap indefinitely — converts Dis2 from taste to DEFECT if confirmed), burst-masking correlation
  (opacity ≤0.05 at each transient publish), NON-SHORTCUT typed-query toggle-back (the whole T4 fix lives in
  the shortcut coverage path :2652 — never validated off it), load-more + search-this-area artifacts. Gate:
  every item CLOSED or REPRODUCED in 02-findings with a trace line.
- **Step 3 — Small universal fade fixes (~1 day, low-med risk).** The A3 pair: mid-fade re-anchor +
  settle-off-ramp-completion. Also fixes backgrounding-mid-fade snap for free. Gate: no inter-tick opacity
  delta >0.1; `[leamem]` commit lands only at opacity ≤0.05 or ≥0.999; Dis1 re-checked (mandatory on every
  reveal-touching step hereafter).
- **Step 4 — R1-deeper: attribute → branch (medium risk).** Attribution first (recordNativeApply dump, Time
  Profiler, shared runId). Then EXACTLY ONE of: (a) parse-shrink/off-main (PREFERRED if snapshot parse —
  zero latency, W1-aligned, helps toggle+dismiss too); (b) arm-on-first-rendered-frame-post-fence + bounded
  force + watchdog, exempting the empty-frame path (:6076); (c) JS pre-mount if cards. If R2 reproduced,
  land its fix in the same pass. Gate: `[presramp]` monotonic no->32ms gap ×10 cold reveals AND ×10 toggle
  settles; zero watchdog fires; measured cover-extension reported to owner; Dis1 clean.
- **Step 5 — Feasibility spikes + free wins (~1-2 days, nothing ships un-flagged).** (i) L4/R3 coupled kit:
  dev-flag `enablePlacementTransitions` (RMW in onStyleLoaded — it resets on style load) + the per-layer
  basemap text-opacity crossfade lever (~100 lines) → configs A (status quo) / B (snap + owned basemap fade)
  / C (shortened global fade ~80-120ms). (ii) L3 free wins: delete/gate the telemetry-only dot QRF
  (:9563-9591); fix the noop-streak back-off wrong-signal during camera motion (:9386-9401); measure
  handler/selector cost + Mapbox's own placement-change cadence (hash QRF results per pass — the liveness
  ceiling no cadence beats). Decision rule: p95 ≤2ms + zero attributable >8ms gaps → ship, no owner decision.
  (iii) Fix post-dismiss suppression if Step 2 confirmed (:6764 exists; the watchdog that motivated
  always-awake now exists :5958). (iv) Probe the cross-search `__lea_revealed__` union leak (likely fix:
  union last-wins per markerKey).
- **Step 6 — Owner package (one sitting).** F1 finger-test; coupled L4+R3/Dis2 look-and-pick on device +
  slo-mo; W5 restatement; R1 latency ratify with the measured number; L3 residual only if measurement says
  so; TR5 scope + pill geometry; device/harness policy. Gate: rulings recorded in the ledger.
- **Step 7 — TR5 re-scoped (low-med risk).** (a) Pill unification (absorb SegmentedToggle.tsx, owner's
  geometry ruling); (b) coordinator extraction (`useToggleCoordinator({settleMs})`, injected
  `onInteractionStateChange`/`onPressUp`/telemetry; the runner/awaitVisualSync/settle-join STAYS PUT);
  (c) the Step-1 contract test as the primitive's acceptance spec; document the readiness-machine gap
  honestly (the ~1,100-line settle-join is what makes the toggle good — the primitive alone doesn't grant it);
  (d) `declareToggle` kinds: documented seam only. Gate: BEHAVIORAL — identical finalize-event sequences on
  single/rapid-burst/net-zero/metronome-350ms drives; 647/236 recovery; 8-tap burst; zero watchdog fires;
  map-accept.sh green before/after.
- **Step 8 — Hardening smalls (low risk).** Coverage-cache eviction (reset on searchRequestId change or LRU
  cap — currently unbounded within a session); offline fetch backoff (non-success terminals refetch every
  viewport tick :3168-3174); give the canonical fade its OWN duration constant (today
  `durationMs ?? enterSettleDelayMs` :8865 — retuning the settle would silently retune all three fades).
  Gate: airplane-mode drive bounded; 20 pan/search-area cycles memory-steady.
- **Step 9 — Cleanup + H1 finalization (grep-driven, low risk).** Strip list by repo-wide grep per tag
  (catches committed `[TGLDBG-v2]`); JS probes → gated attribution channel; native probes stay as the
  `[maptel]`-class harness behind a RUNTIME default-off flag; delete true temps
  (`[FADEDBG]/[expodbg]/[srcdbg]`; `[reparsedbg]` + `inFlightReparseExposure` after D1 closes); deferred
  pin-overlay deletions (pinInteraction stream, dead pin setFeatureState write, unused locals); fix the wrong
  ignorePlacement comment (:6761) + stale FCGATE comment (:8940); orphaned nativePresentationOpacity seeds;
  RESTORE `apps/api/.env` throttle — recorded dev defaults live at .env.example:649-656 (the gitignored file
  is the only copy of the relaxed values; the checklist is the memory). Do NOT touch `[pageswitch]` (other
  effort). One doc page: event → meaning → healthy signature. Amend 01-MASTER-PLAN stale text; consolidate
  the three "remaining work" lists into one. Gate: grep per tag returns only harness-owned sites; tsc+build;
  RE-DRIVE the rapid-toggle burst WITH PRODUCTION THROTTLE (the relaxed throttle exercised the exact
  aborted/failed terminal paths the fix handles — validation validity gap).
- **Step 10 — EXIT ACCEPTANCE BATTERY: sim + REAL DEVICE (the finish line).** Release-config build (hence
  the runtime flag), one ProMotion iPhone (+ ideally one 60Hz device): 20 cold reveals (0 no-show, 0
  double-fade, presramp monotonic at device refresh), 20 toggle bursts (0 stuck cover / stale tab / watchdog),
  z9↔z17 torture (D1), 10 dismisses (Gate B + Dis3), Instruments Animation Hitches during 10s rapid-toggle
  torture (gate: ZERO app-attributable hitches while the pill animates = W1/TR1 finally measured), 240fps
  slo-mo of reveal/dismiss edges (doubles as the L4/R3 decision evidence), backgrounding-mid-fade,
  tap-pin-mid-fade, pin-vs-basemap shear watch at 120Hz. "Google-grade" is declared HERE or not at all.

## FUTURE-WORK REGISTER (durable; not scattered comments)

- **Android restore — BIGGER than "pins broken":** the entire presentation/LEA write path is iOS-Swift-only
  (JS element [1] is a literal `1` — search-map.tsx:2271/:2370). Android has NO presentation writer at all.
- Coverage derive-by-key / backend coverage-in-search-response (kills the abort/supersede coordination class).
- The 4.4s cold-search backend latency (bounds every "Google-grade" claim on cold paths; out of scope here).
- `declareToggle` kinds — when a real consumer exists.
- Marker-absent-dwell budget as an H1 metric.
- The native expression cache — only if device Step 10 regresses.
- `2dc8f6fa`'s multi-effort contents inventoried in the eventual PR description.

## NEW FINDINGS THE REVIEW SURFACED (validated or probe-owed; see synthesis for full list)

1. Branch unpushed (no upstream) — worst single risk, fixed by Step 0.
2. Post-dismiss basemap label suppression — probable DEFECT, 10-min check in Step 2.
3. Settle-timer vs tick-anchored-fade desync — LEA commit can land mid-visible-fade (may be perceived-R2).
4. W5 contradicts the owner's own June-27 ruling — restate before R3/Dis2.
5. L4+R3 coupled (global knob); R3's planned lever dead (classic style, no imports).
6. `parseFeatureCollectionData` double-parse + re-encode — real main-thread cost, zero-latency fix candidate.
7. `SegmentedToggle.tsx` — the real pill duplicate; TR5's named consumers were phantoms.
8. Probes exist in COMMITTED history — diff-scoped cleanup impossible; grep-driven only.
9. Relaxed dev throttle partially invalidates the toggle-cluster validation — re-drive at production throttle.
10. Telemetry-only dot QRF = half the L3 cost, free deletion.
11. Cross-search `__lea_revealed__` union leak (probe-grade).
12. Coverage cache unbounded in-session; offline refetch has no backoff; non-shortcut path unvalidated.
13. Canonical fade duration is a borrowed constant (W2 footgun).

## CONFIDENCE

**Solid (verified):** everything in the amendments list marked verified; the landed fixes + traces.
**Provisional (probes owed):** the 148ms stall's identity (the most consequential unknown); post-dismiss
suppression; union leak; burst-masking race; R2/Dis3/T2/T3 subsumption; EVERY perf number is simulator-only;
D1 unknown until torture run; toggle fix under production throttle; the A3 pair (designed, not implemented).

---

## OWNER RULINGS (2026-07-01, recorded verbatim-in-substance — these bind the steps above)

**R-1 Checkpoint:** commit + push all 3 split commits. APPROVED (executed below).

**R-2 W5 RESTATED:** basemap street labels stay **VISIBLE during search, suppressed only under our markers**
(the 2026-06-27 ruling stands; the ledger's "never show mid-search" is dead). Consequences: (a) the
post-dismiss suppression check in Step 2 is now a **defect check with a defined expected behavior** —
street names MUST return after dismiss; (b) R3/Dis2 work shapes only the reveal/dismiss EDGES.

**R-3 Label edges — preference ORDERING (kit still built, decided by looking):**

1. **IDEAL: ours-snap / basemap-fades.** Our labels snap between candidate positions on collision while
   basemap labels keep their native fade. The style-global knob can't do this — but our ARCHITECTURE
   partially can: the one-of-four selector's `__lea_revealed__` literal flip IS an instant snap; Mapbox's
   native fade shows on our labels only where Mapbox culls before our selector reacts. So the path to the
   ideal = maximize selector authority/liveness (ties directly into L3) and measure how much of our labels'
   visible transitions are our-snap vs Mapbox-fade today. Add **config D** to the Step-5 kit: selector-
   authority snap (ours) + untouched native fade (basemap) — i.e., quantify + maximize what we already own.
2. Second choice: all-fade (config A status quo — ours fade AND basemap fades natively).
3. Config B (global snap) is effectively ELIMINATED (basemap must keep fading). C (shortened global fade)
   stays in the kit as a data point only — it shortens basemap's fade too, which cuts against the ruling.

**R-4 TR5 EXPANDED-AND-RATIFIED (supersedes the review's narrower re-scope):** content-width pill,
NOT equal-width (owner explicit). The owner wants the ideal long-term shape where **all toggles behave
exactly the same**, applicable to the other toggles **immediately in this session** — and he NAMED the
consumers the review thought were phantoms:

- **Coordinated** (full flow: press-up → markers fade out → settle debounce → re-grab → fade in synced with
  cards): the search dish/restaurant segment (today's behavior = the reference).
- **Instant** (in-memory swap, no debounce, no map): the polls Live/Results pill (currently the hand-copied
  `SegmentedToggle.tsx` — the real duplicate to absorb).
- **DEFERRED-APPLY (NEW standardized variant, owner-specified):** toggles/filters with a DROP-DOWN
  (e.g. the results filter chips): opening + choosing inside the dropdown does NOTHING to the map; on
  **submit/apply** the standard coordinated flow runs (markers fade out → re-grab → fade in). Dropdowns are
  a secondary variant LAYERED ON the standard flow — and this dropdown-apply pattern should itself be THE
  standardized pattern for all future dropdown filters.
  So the "kinds" ARE justified now — not speculative: `instant | coordinated | deferredApply` with three real,
  present-day consumers. Step 7 scope becomes: (a) one content-width pill component absorbing SegmentedToggle;
  (b) coordinator extraction with the kind variants; (c) the coverage contract test; (d) the dropdown-apply
  variant wired to the existing filter chips. Behavioral gate unchanged (identical finalize-event sequences,
  647/236 recovery, burst safety); polls pill must NOT gain a debounce (kind=instant).
