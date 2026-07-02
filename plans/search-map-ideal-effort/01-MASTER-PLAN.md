# Search-Map Ideal-Shape — Master Plan (Stage 2 consensus)

> **⚠️ 2026-07-01: SEQUENCE SUPERSEDED by `04-CONSENSUS-ROADMAP.md`** (8-reviewer strategic review,
> unanimous AMEND). In particular: (1) the T4 fix below ("force publishCandidateCatalog /
> forceUnderCoverReproject") is SUPERSEDED — the shipped fix is the coverage FEATURES cache in
> `maybeFetchShortcutCoverage` (see 02-CONFIRMED-FINDINGS "ROOT CAUSE FOUND + FIXED"); do NOT implement the
> text below. (2) The R3/Dis2 `setStyleImportConfigProperty` lever is DEAD (the active style is classic, no
> imports) — the real lever is per-layer basemap `text-opacity`. (3) Cleanup/commit moves FIRST, probes get
> PROMOTED into a gated harness (not stripped wholesale), and §CLEANUP's strip list names probes that don't
> exist. Fix content otherwise remains valid historical context.

Derived from 4 independent holistic designs, each red-teamed + implementation-mental-modeled in real code. **Consensus winner: "Minimal-Surgical-From-Foundation"** — the layer-level O(1) presentation + one canonical fade + LEA is the right foundation; the issues are targeted fixes, NOT a rearchitecture. The blank-slate/state-machine/director abstractions scored lower (they re-describe existing machinery — `stepPresentationOpacityAnimation`, `applyPresentationOpacity`, the arbiter — adding surface area for no new mechanism).

## PRESERVE (sacred / confirmed-good)

The LOD engine (`LodEngine.swift` Fade/step/decide/snapSettled/takeSettledRoleChangeIfAny + its INVARIANT), pin↔dot complementarity, dots-GL/pins-CA split, the writer-contract (one writer per opacity-product factor), and the layer-level O(1) canonical fade (reveal/dismiss/toggle share it). Every fix below only reads `lastPromotedInOrder` / calls existing seams — the engine stays byte-intact.

## STEP 0 — INSTRUMENT FIRST (MANDATORY GATE; all 4 designs agree)

**4 of the 5 source fixes are hypotheses the CODE CONTRADICTS. Shipping any on static reasoning repeats the confident-wrong failure CLAUDE.md warns about.** On the owner's mimic flow (search → zoom all-in → all-out → pan → twist → toggle → rapid toggle-back → dismiss), gated by `lodDebugLoggingEnabled`, Metro `:8082` (`/tmp/crave-metro-8082.log`) for JS, `simctl log stream` for native:

1. **R2 stale-FS proof** — at `commitSettledLeaAuthorityUnderCover` (:8408), read back the current Mapbox `nativeDotOpacity`/`nativeLabelOpacity` FS for ~8 in-flight demoted markers on a FRESH search BEFORE mutating. Value≈1 present → the stale-STEPPER-FS shadow is real (not the baked property, which is filtered out of Mapbox at `applyFeatureStates` :13355). Nil → re-attribute R2.
2. **T4 catalog-publish gate** — log `candidateCatalogKey` change at use-direct `:1653` + `didPublishSourceFrame` on the FULL projection path (`:2279`, not just cache-replay `:1510`) + native push key at `:3264`, on a dish≠restaurant dataset. `keyChanged:false` on toggle-back → the fingerprint dedup skips `publishCandidateCatalog` → `pendingUnderCoverReproject` never set → stale map = the T4 root.
3. **L3 twist cadence** — log `{moving, bearingDelta, movingAdaptiveRefreshMs, committedSetChanged, revealedCount}` each tick during a sustained twist at `performLabelObservationRefresh` (:9562). Cadence lengthens + batches on settle → confirmed. Streak stays 0 / cadence stays 16ms yet still batches → the batch is QRF-async latency or a settle-commit debounce, NOT the back-off.
4. **T1 at-click drop** — FIRST force a fresh full bundle (memory: this drop WAS a stale-bundle artifact once). Then `[TGL-CLICK]` timestamp at `beginToggleInteraction` (:130) + first `searchRuntimeBus.publish`. If no drop on fresh bundle → T1 closed.
5. **L1 cold-vs-warm** — `revealedCount` at the commit (:8435, `[lbldbg] REVEALCOMMIT`) vs the selector (:9792, `[lbldbg] SELECTOR`) across a cold search then a warm toggle-back. Confirms cold=commit-empty→selector-fills (stomp), warm=commit-nonempty.
6. **R3/Dis2 + L4 basemap/label-fade truth (frame-step video)** — screen-record reveal + dismiss + a pan/twist label collision. Decides two contradictions below: does basemap POP or CROSSFADE at the fade edges, and is the visible label collision-fade **Mapbox's native ~300ms symbol fade** (independent of our instant `__lea_revealed__` flip)?

## TARGETED FIXES (probe-gated, ONE-AT-A-TIME, each device-validated before the next)

- **R2/#5/T2 (reveal double-fade / snap-in) — ONE root:** if STEP-0 #1 confirms a stale stepper FS, then in `commitSettledLeaAuthorityUnderCover` BEFORE the `__lea_lod__` swap, `removeFeatureState(nativeDotOpacity)` for the demoted set + `removeFeatureState(nativeLabelOpacity)` for the promoted∪demoted label features, directly on the map (reuse the `clearKnownFeatureStates` loop shape :13300-13319). Runs at both entry points (:1549 reproject + :6381 reveal). **Do NOT clear the baked property** — it's filtered from Mapbox, a no-op. LOW risk once probed.
- **L1 (label flash) — single authority, no writer deleted:** keep `commitSettledLeaAuthorityUnderCover` as the SOLE cold-start/under-cover author of `__lea_revealed__`; guard it to SKIP the swap when `winners.isEmpty` on a cold enter (so the async selector is first author, no 10→2→71 stomp). Make `applyLabelOneOfFourSelector` the SOLE steady-state author, and guard it to only swap when its set DIFFERS from the last-committed set (a stale/empty early QRF result can't stomp the under-cover commit). ~10-line guard, no new async (QRF is async — a synchronous selector is IMPOSSIBLE). LOW-MEDIUM risk.
- **T4 (toggle-back staleness) — force the reproject:** once STEP-0 #2 attributes it, force `publishCandidateCatalog` when the active tab/intent changed even if `candidateCatalogKey` matches (add intent to the fingerprint OR a native `forceUnderCoverReproject` @objc bridge called on every toggle settle). Re-inserts `pendingUnderCoverReproject` → reproject fires on toggle-back. MEDIUM risk (needs a dish≠restaurant dataset to even reproduce). Build the code-correct native-flag way, not a JS-only key stamp.
- **T1 (at-click drop):** likely already-resolved (stale bundle). If STEP-0 #4 shows a residual on fresh bundle, defer the NON-visual publish one frame via rAF (keep the pill + `beginInteractionFadeOut` synchronous). Attribute before touching.

## OWNER-DECISION-REQUIRED (two contradictions STEP-0 #6 will confirm)

- **R3/Dis2 collision↔basemap crossfade:** the requested "flip our dots/labels collision on/off with the fade" is **FORBIDDEN** — `search-map.tsx:2254-2255` documents that `ignorePlacement:true` was already tried and reverted because it "let basemap labels show mid-search" (a HARD constraint: basemap must never show mid-search), and flipping re-runs placement on the tiled sources = the wiggle class. The achievable crossfade is: our objects fade via the presentation ramp (already happens), and basemap names naturally cull/release as our symbols cross opacity thresholds. If STEP-0 #6 shows a POP (not crossfade) at the edges, the ONLY safe lever is crossfading the **basemap import label opacity** (`setStyleImportConfigProperty`) with presentation — NOT our collision. Likely ~zero code. **Decision: accept the presentation-fade crossfade, or pursue the basemap-import-opacity lever?**
- **L4 "snap never fade" + L3 "live re-pick":** our `__lea_revealed__` literal flip is ALREADY instant (a snap). The visible label collision _fade_ the owner sees is **Mapbox's native symbol-collision `fadeDuration` (~300ms), which we do not control** via LEA. So "labels snap, never fade" is NOT reachable by our literal swaps — it needs a Mapbox symbol `fadeDuration→0` override (verify such a knob exists in 11.16.6 / rnmapbox) or owning placement (contradicts no-basemap-overlap). STEP-0 #6 frame-step confirms this. **Decision (after confirm): accept Mapbox's collision fade, or pursue a fadeDuration override?** L5 (good positioning) is preserved regardless; L3 faster observation only moves our literal sooner, not Mapbox's fade.

## STRATEGIC — TR5 PORTABLE TOGGLE PRIMITIVE (LAST, after fixes device-validated; the real long-term win)

Extract `useToggleCoordinator({settleMs=300})` + `declareToggle({id, kind:'refetch'|'inMemory', fetcher, awaitVisualSync})` + `<CompositorToggle>` (equal-width, translateX+opacity, per unified-fade-toggle memory) from `use-results-presentation-toggle-state-runtime.ts` — it's welded to `searchRuntimeBus` only at 4 sites (:84/:111/:154/:158); replace with an injected `onInteractionStateChange`; move `beginInteractionFadeOut` (tab-toggle :70) into an `onPressUp` hook; keep the runner→`awaitVisualSync` + `notifyIntentComplete→finalizeInteraction` settle-join as `onSettled(intentId)`. The map fade + card reveal become subscribers, not the root. Favorites/profile `declareToggle` with their own runner. **Byte-identical segment-pill behavior = the acceptance gate.** LOW risk, purely JS, independent of the native fixes.

## CLEANUP (final pass, before commit)

Strip `[FCGATE]/[FADEDBG]/[presramp]/[SRCPROJ]/[TGLDBG-v2]/[R2probe]/[T4probe]/[L3probe]/[TGL-CLICK]/[lbldbg]/[expodbg]/[srcdbg]/[reparsedbg]`; revert `lodDebugLoggingEnabled→false`; delete dead mutex consts + `stackRank` live pre-pass (use-direct ~893-947, grep-confirm no reader) + mutex `<Images>` + orphaned `nativePresentationOpacity` baked seeds; demote `redrawCoverWatchdog` to Android-fallback-only. KEEP the sentinel-integrity guard + `[PRESENTATION-WATCHDOG]`. Remove temp Maestro flows.

## SEQUENCE

STEP 0 (instrument, mimic flow) → R2 → L1 → T4 → [owner decides R3/Dis2 + L4] → T1 (if reproduces) → TR5 → cleanup + commit. One change, one probe, one device-validate, each.
