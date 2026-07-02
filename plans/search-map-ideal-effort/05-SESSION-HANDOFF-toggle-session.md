# Session handoff — map-LOD-v6 toggle fade rework

Branch `fix/map-lod-wiggle-dismiss`, HEAD `0a778178`. **Everything below is UNCOMMITTED** in the working tree.

## What this session was doing

Owning the map-LOD-v6 **unified-fade toggle** (dish/restaurant segment toggle + filter chips on the search
results sheet, over the Mapbox map). Started by finishing assigned hardening on top of the map-merge, then the
user reported 6 concrete fade/behavior bugs and approved a **full architectural rework** (with explicit
permission to edit the committed reveal/LEA machinery freely, red-teamed).

## Reference material we were working out of (READ THESE — they hold the deep context)

Project memory lives at `/Users/brandonkimble/.claude/projects/-Users-brandonkimble-Crave/memory/` (shared
across all sessions — directly readable):

- **`layer-level-presentation-rework.md`** — THIS session's design + the 6 user issues + attributed root causes
  - the validated STATUS. **Start here.**
- **`toggle-label-dot-unification.md`** — the shared opacity/reveal **WRITER-CONTRACT** (one writer per factor of
  the opacity product). Read before touching LEA/presentation/reveal.
- **`unified-fade-toggle-architecture.md`** — the toggle genealogy, the Google-grade "no dropped frames" bar, the
  300ms restarting-debounce commit clock.
- **`map-lod-render-substrate-decision.md`** — why pins are on a CA overlay and dots/labels stay GL; the
  reparse-immune LEA scheme; the wiggle history.
- **`MEMORY.md`** — the index of all of the above.

`CLAUDE.md` (repo root) — working discipline that saved/cost me time: **instrument the running app, don't
static-guess runtime bugs**; the LOD harness; the cold-launch / stale-bundle traps; the Metro-log gotcha.

Workflow artifacts (I ran two multi-agent workflows this session). I copied them to durable project-level paths
because the originals under `/private/tmp/claude-501/…` may be cleaned:

- **`/Users/brandonkimble/.claude/projects/-Users-brandonkimble-Crave/handoff-redteam-layer-level-presentation.json`**
  — the 7-agent RED-TEAM of the rework: 6 adversarial verdicts + the integrator's **ordered Edits A–H** (the
  actionable plan, incl. the double-fade fix, the frost Edit H, the "WHAT MUST BE PRESERVED" list, the cache
  mitigation, and the validation gates). **This is the most useful doc for the two remaining fixes.**
- **`/Users/brandonkimble/.claude/projects/-Users-brandonkimble-Crave/handoff-fade-machinery-map.json`** — the
  6-reader map of the canonical dismiss vs reveal fade machinery (file:line for each), which grounded the design.
- Live workflow transcripts (durable):
  `/Users/brandonkimble/.claude/projects/-Users-brandonkimble-Crave/236922bc-9995-429c-94d1-088316ae1914/subagents/workflows/`

Task tracker (this session): 7 tasks — #1 (core rework) + #2 (second-settle-hang) DONE; #3 watchdog→degraded,
#4 cleanup, #5 acceptance+reusable-primitive, #6 double-fade, #7 staleness (frost done) PENDING.

## DONE + validated on-device

### 1. "Second settle hangs" — FIXED (earlier in session)

Rapid toggling would hang the reveal forever (cover up, no pins). Root cause was NOT the key-desync theory
(`map_sources_key_mismatch=0`, keys matched). It was two things:

- The prepared-frame-**cache-replay** path (`use-direct-search-map-source-controller.ts` ~1510) reused resident
  data but logged `didPublishReadinessState:false` → a toggle onto unchanged data never published `ready:true`
  for the new key. **Fix:** it now `publishVisualState({ready:true, key})` regardless of the source-data dedup.
- `armSearchSurfaceResultsPending` (`use-results-presentation-surface-transaction-runtime.ts`) published
  `ready:false` **after** its own transaction-key publish synchronously re-triggered the source projection to
  `ready:true`, clobbering it. **Fix:** reset `ready:false` **before** re-keying so the source's `ready:true`
  is the final word.
- **Validated:** rapid-toggle reveal watchdog fires went **16 → 0**; native settle fires; markers visible.

### 2. Layer-level O(1) presentation — THE CORE REWORK, validated

Presentation opacity was a per-feature `setFeatureState` sweep over ~800 features every fade tick (**measured
8.6ms/tick, p95 15.5ms — dropping frames**). It is a UNIFORM global fade, so it's now written **once per layer**
as element `[1]` of the `['*', <presentation>, <lea…>]` icon/text-opacity product.

- **Measured 8.6ms → 0.17ms/tick** (p95 0.19, max 0.20) on the real 433-marker scene, WITH the per-tick
  `getLayerProperty` read. The red-team feared that read; it's actually cheap, so **no native expression cache
  was needed** (documented as a future optimization only if a real device regresses).
- 7-agent red-team GO. `swapLeaLiteral`/`replaceSentinelLiteral` preserve element `[1]` byte-for-byte; the new
  writer preserves LEA elements `[2+]`; both run serially on the main runloop → no clobber.
- **This structurally fixes 4 of the 6 user issues:** dots now fade WITH pins+labels (same layer-write, same
  tick, same scalar; pins via the CA overlay off the same value); no single-tap frame drops; fade acts on ALL
  markers on press-up (incl. the ~400 coverage dots that the old restricted sweep skipped); reveal+dismiss+
  toggle all reuse the same `applyPresentationOpacity` → same canonical 300ms Hermite-smoothstep fade.
- **Validated on-device:** reveal renders all pins+dots+labels; **dismiss leaves a completely clean map**
  (coverage dots fade — the 2026-06-22 coverage-dot regression does NOT reoccur, this was the key Gate B check);
  tsc + native build clean.

### 3. Frost/cutout flash — FIXED (needs finger-test)

Added `FROST_HANDOFF_FLOOR_MS = 50` delay to the interaction-frost fade-**OUT** only (fade-in stays immediate)
in `use-search-root-search-scene-interaction-frost-runtime.tsx`, so the reveal cover is on-ramp before the frost
drops. It's a 1-frame artifact so I couldn't screenshot-verify it — **needs a human eye.**

## NOT done (remaining, root-caused)

### A. Reveal double-fade-in (snap-in → snap-out → fade-in)

Red-team proved this is **INDEPENDENT of presentation** — it's the baked `nativeDotOpacity`/`nativeLabelOpacity`
feature-state racing the `__lea_lod__` literal + `resetLiveMarkerEnterState` under cover, NOT the presentation
ramp. **Proposed fix (unimplemented):** in `commitSettledLeaAuthorityUnderCover` (SearchMapRenderController.swift
~8396), before `updateLeaMembershipLiterals`, clear the baked `nativeDotOpacity`/`nativeLabelOpacity` for the
promoted set so the coalesce fallback (`feature-state` nil) aligns atomically with the fresh literal. Touches the
committed LEA commit path — do it on its own validation pass. Note: it's now partly masked by the presentation
ramp (the flicker × low-presentation early = barely visible).

### B. Toggle-back staleness (map keeps old-tab markers while cards switch)

**Confirmed reproduced:** toggling to Dishes rendered the _restaurant_ markers even though `srcGate` computed
dishes (`cat=16`). This is a **source-frame publish/dedup** issue, NOT presentation. The dedup
(`search-map-source-frame-port.ts` `areSearchMapSourceFrameSnapshotsEqual` ~134-146) is subtler than length-only
— it keys on `visualCycleKey` + `sourceRevision` + `idsInOrder` + `semanticRevisionById` + `markersRenderKey`.
Since `visualCycleKey` differs per intent, the dishes frame _should_ publish, so the bug is either
published-but-not-rendered OR a coincidence (dish/restaurant top results may genuinely coincide in this test
dataset). **NEXT STEP: add `didPublishSourceFrame` logging to the FULL projection path** (not just the
cache-replay path where `[SRCPROJ] cacheReveal` already logs it) and re-test on a dataset where dishes ≠
restaurants, then fix. **NOT started** — `search-map-source-frame-port.ts` is unchanged.

### C. transientVisualPropertyKeys cleanup — needs a native rebuild to take effect

I removed `"nativePresentationOpacity"` from the `transientVisualPropertyKeys` set (SearchMapRenderController.swift
~122) but the **currently-installed binary was built before that edit**. Harmless meanwhile (nothing writes the
key now), but rebuild native to make it real.

## What I changed (per file — all uncommitted)

- **`apps/mobile/ios/cravesearch/SearchMapRenderController.swift`** (my big one):
  - Added `setLayerPresentationOpacity(layerIds:property:value:)` (RMW element [1], preserves LEA [2+]).
  - `applyPresentationOpacity`: **deleted** the O(N) sweep body + `useFullCatalogSweep`/`onScreenMarkerKeys`/
    `targets` machinery; replaced with the layer-write for `restaurant-dot-layer` (icon-opacity) + label layers
    (text-opacity). Kept the recovery + readiness gates ABOVE it, and `recordNativeApply`/diag below.
  - Removed the `FCGATE2` prototype block from `stepPresentationOpacityAnimation`.
  - Removed `nativePresentationOpacity` from `transientVisualPropertyKeys`.
  - **Left in (scaffolding to strip):** `[FCGATE]` timing block in `stepPresentationOpacityAnimation`,
    `[FADEDBG]` in `applyInteractionFadeOut`, and `lodDebugLoggingEnabled = true` (~11123 — normally false).
- **`apps/mobile/src/screens/Search/components/search-map.tsx`**: retired `nativePresentationOpacityExpression`;
  dot `iconOpacity` (2275) and label `textOpacity` (2377) element [1] → plain `1`; dropped the memo deps.
- **`apps/mobile/src/screens/Search/hooks/use-direct-search-map-source-controller.ts`**: the "second settle
  hangs" cache-replay readiness publish. **Scaffolding to strip:** `[SRCPROJ] entry`/`cacheReveal`,
  `[TGLDBG-v2] srcGate`, `early=shortcut-noSri/covNotReady` logs.
- **`apps/mobile/src/screens/Search/runtime/shared/use-results-presentation-surface-transaction-runtime.ts`**:
  the "second settle hangs" arm-order reorder (ready:false before re-keying).
- **`apps/mobile/src/screens/Search/runtime/shared/use-search-root-search-scene-interaction-frost-runtime.tsx`**:
  the frost handoff floor.
- **NOT mine:** `apps/mobile/ios/MapLodKit/Sources/MapLodKit/LodEngine.swift` is modified in the tree but I did
  NOT touch it — that's the map-merge/reveal-LEA session's uncommitted work (`inFlightReparseExposure`,
  `lastReportedPromotedRole`, `takeSettledRoleChangeIfAny`). Leave it / it's yours.
- New Maestro flows (mine, disposable): `maestro/perf/flows/rework-validate.yaml`, `toggle-back-staleness.yaml`.

## NOT tested / caveats

- The **double-fade** and **staleness** fixes are NOT implemented, so obviously not tested.
- The **frost flash** fix is applied but only code-verified (1-frame artifact — needs a human finger-test).
- The layer-write cost (0.17ms) was measured on the **simulator** with the per-tick `getLayerProperty` read —
  if a real ProMotion device regresses, add the native expression cache (red-team's mitigation: cache the two
  product expressions in `InstanceState`, invalidate on LEA membership change, mutate `[1]` without a read).
- The `transientVisualPropertyKeys` removal isn't in the installed binary yet (needs rebuild).
- Testing was repeatedly confounded by a **cold-load blank** (the shortcut search takes ~4.4s backend Gemini and
  renders blank if you screenshot too early) — always WARM the app (do a search, wait ≥8s, confirm markers) before
  validating toggles. That 4.4s backend fetch is a _separate_ session's issue, not this work.

## How to test / gotchas

- Two Metro instances: `:8081` (logs to `/tmp/crave-metro-8082.log`? NO) and my isolated **`:8082`** which the
  app actually runs — its stdout is **`/tmp/crave-metro-8082.log`**. The `:8081` log `/tmp/crave-metro.log` is
  the WRONG one (I lost time on that).
- Sim udid `8116E09B-A11F-4AFC-B489-32B4981FC3EB`. Reload via
  `crave://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082` (full terminate drops to the picker).
- Native build: `xcodebuild -workspace cravesearch.xcworkspace -scheme cravesearch -configuration Debug
-destination 'id=<udid>' -derivedDataPath ~/Library/Developer/Xcode/DerivedData/cravesearch-ebulueazabvxrcfekwsqmhnjeydn build`
  then `simctl install`. Confirm binary mtime > source mtime before measuring (I measured a stale binary once).
- Perf attribution: arm `crave://perf-scenario?scenario=search_map_lod_toggle&scenarioRunId=X&durationMs=120000`
  BEFORE the flow, else `submit_shortcut_restaurants` is ignored. Logs `[SearchPerf][...]` to the `:8082` metro.
- Reliable toggle repro: Maestro `tapOn: { id: 'search-segment-toggle' }`. Reveal-blocked reasons print via the
  `results_reveal_watchdog_pending` attribution event (great for the staleness pinning).

## Cleanup owed before commit (step-8-style)

Strip: `[FCGATE]`, `[FADEDBG]`, `[SRCPROJ]`/`cacheReveal`/`[TGLDBG-v2] srcGate`/`early=shortcut-*`, the temp
Maestro flows; revert `lodDebugLoggingEnabled` to `false`. KEEP the debug-gated sentinel guard +
`[PRESENTATION-WATCHDOG]`. Optionally delete the now-orphaned `nativePresentationOpacity: 1` baked seeds (8 sites,
harmless — element [1] is a literal now so they're unread).
