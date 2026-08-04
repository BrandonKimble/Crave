# Android parity — plan

**Status:** PLAN ONLY (no code). Owner ruling 2026-08-03 (D52): Android is **not**
deleted; the goal is **full parity with iOS**; owner's lean is a **from-scratch
rewrite** rather than repairing the drifted Java mirror. This document tests that
lean against measurement, then lays out the staged path.

Related: `audit/FINDINGS.md` F1110 (the audit that surfaced it), `audit/DESIGNS.md`
D52 (the ruling), `CLAUDE.md` § map-saga methodology (the lessons this plan bakes in).

---

## 1. The judgment: rewrite, not repair — the lean is CORRECT, and the measurement is worse than the hunch

The Java mirror is not "somewhat stale". Measured against today's Swift:

### 1a. The bridge contract has diverged 45% / 20%

`SearchMapRenderController`'s exported RN surface (from
`apps/mobile/ios/cravesearch/UIFrameSamplerBridge.m`, the single `RCT_EXTERN` file)
vs `apps/mobile/android/app/src/main/java/com/crave/SearchMapRenderControllerModule.java`'s
`@ReactMethod` set:

|                                                                         | methods                                                                                                                                            |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS map-controller externs                                              | 11                                                                                                                                                 |
| Java `@ReactMethod` (excl. `addListener`/`removeListeners` boilerplate) | 8                                                                                                                                                  |
| **Shared by name**                                                      | **6** — `attach` `detach` `reset` `setRenderFrame` `configureNativePressTargeting` `queryRenderedPressTarget`                                      |
| **iOS-only (never ported)**                                             | **5 of 11 (45%)** — `setCandidateCatalog` `commitEnterStart` `beginInteractionFadeOut` `resetNativeApplyAttribution` `flushNativeApplyAttribution` |
| **Java-only (dead names from an older era)**                            | **2** — `configureLabelObservation` `configureNativeLayerGroups`                                                                                   |

Name-sharing is the _ceiling_ of agreement, not evidence of it: the six shared names
sit on top of a body that has been rewritten underneath them (see 1b). The two
Java-only names are the tell that the mirror is anchored to a **superseded iOS
design** — the label-observation and dormant-layer-group model the Java commit
message itself calls "#1".

### 1b. The mirrored file's source of truth was 55% rewritten underneath it

Android's last commit is `e2654b211` (2026-06-17, _"feat(map): #1 port residency +
dormant-layers model to Android native module"_). Since that commit:

- **148 commits** touched `apps/mobile/ios`.
- `SearchMapRenderController.swift` went 13,224 → 13,463 lines with a diff of
  **7,281 changed lines** — i.e. the line count barely moved while **~55% of the
  file was rewritten in place**. This is the worst possible drift signature for a
  port: a mechanical line-count comparison (13.2k vs 9.4k) _understates_ it badly,
  because the Java file is not "3.8k lines behind", it is a mirror of a body that
  no longer exists.

### 1c. Two entire subsystems have zero Android counterpart — and did not exist at freeze time

Both were created _after_ the Android freeze (`git ls-tree e2654b211` shows neither):

- **MapLodKit** — 398 lines of pure kernel (`LodEngine.swift` 284,
  `ScreenSpaceVisibility.swift` 114) + **41 tests** across 634 test lines. No
  Android equivalent; zero hits for `MapLod` under `apps/mobile/android`.
- **TrackScrollKit** — 1,480 lines (`TrackScrollPhysics.m` 1,251, `TrackShellSlot.m`
  158, headers 71), with **7 JS call sites** (`NativeModules.TrackScrollPhysics`).
  Zero hits for `TrackScroll` under `apps/mobile/android`.

So the Java tree does not merely lag on the map — it is missing ~1,900 lines of
newer native surface it never saw, one of which (MapLodKit) is precisely the
_testable, portable_ extraction that makes a rewrite cheap.

### 1d. The mirror has never been compiled by anything, ever

F1110's three legs stand: no `android` key in any of `apps/mobile/eas.json`'s four
build profiles; nothing in `.github/workflows` or `scripts/` invokes `gradlew`; and
`@rnmapbox/maps` cannot resolve the Mapbox Android SDK without a
`MAPBOX_DOWNLOADS_TOKEN`, which appears nowhere in the repo. **12 commits** total
have ever touched `apps/mobile/android`. There is no evidence that any line of the
9,380-line module has ever executed.

### 1e. The verdict

**Rewrite.** Repair would mean reconciling a never-compiled 9,380-line file against
a 55%-rewritten source, with 45% of the contract absent, two whole subsystems
missing, and no compiler to tell you when you got a line wrong. The mirror's only
durable value is as _reference reading_ — which git history preserves perfectly.

One honest caveat that argues the mirror is not worthless: **the `@rnmapbox/maps`
10.3.1 patch already carries a Kotlin Android side.** `patches/@rnmapbox+maps+10.3.1.patch`
(976 lines) patches 8 Android Kotlin files — including
`ProfilePresentationCameraHostRegistry.kt`, `RNMBXCamera.kt`,
`CameraStop.kt`/`CameraUpdateItem.kt`, and the camera-animation-complete event —
alongside the 4 iOS Swift/ObjC files. Someone wrote the Android arm of the
camera-host-registry work cross-platform. It has never compiled, but it is a real
head start on the single hardest bridge seam, and it means the patch is _shaped_
for both platforms rather than iOS-only. Stage 4 should read it before writing
anything.

---

## 2. Inventory: what parity actually costs

The whole point of the classification is that **most of the app is already
platform-agnostic**. `apps/mobile/src` is **194,525 lines of TS/TSX across 1,343
files** against **~19.7k lines of iOS native** — the native surface is ~9% of the
mobile codebase, and only a fraction of that is genuinely platform-bound.

### (a) SHARED BY RN ALREADY — parity is free (no work, only verification)

All 194.5k lines of `apps/mobile/src`: navigation runtime, scene-stack, sheets,
search, polls, profile, tracksheet, services, API client. These run on Android the
moment a build lane exists. **They are not zero-risk** — RN's platform deltas
(status/nav bar insets, back button, keyboard avoidance, `elevation` vs `shadow*`,
`Pressable` ripple, font metrics, `FlashList` scroll physics) will produce a long
tail of cosmetic and a short tail of functional defects. But that is _smoke-and-fix_
work, not _port_ work. Stage 3 exists to size this tail with data instead of guesses.

### (b) PORTABLE PURE LOGIC — translate the kernel, keep the tests

| Surface                                 | Lines | Tests | Notes                                          |
| --------------------------------------- | ----- | ----- | ---------------------------------------------- |
| `MapLodKit/LodEngine.swift`             | 284   | 28    | Pure LOD decision kernel. No UIKit, no Mapbox. |
| `MapLodKit/ScreenSpaceVisibility.swift` | 114   | 13    | Pure geometry.                                 |

**41 tests are the parity oracle.** These port to Kotlin as a `:maplodkit` Gradle
module with a 1:1 JUnit translation of the test suite — no emulator, no Mapbox, no
device. If the Kotlin kernel passes all 41 translated cases, the _decision_ half of
the map is at parity by proof rather than by eyeball. This is the single highest
leverage item in the plan and it is why the order is kernel-first.

`TrackScrollPhysics.m` (1,251 lines) is a middle case: physics math that is
_conceptually_ portable but written against UIKit/CADisplayLink and with no tests.
Treat its **math** as class (b) and its **driver** as class (c). It also has no
extracted kernel — extracting one (iOS-side, as a `TrackScrollKit` pure core with
tests, mirroring what MapLodKit did for the map) is the honest prerequisite, and is
deferred out of v1 (§5).

### (c) GENUINELY PLATFORM-SPECIFIC — must be written fresh against Android APIs

| iOS surface                                                               | Lines                                             | Android rewrite target                                                                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `SearchMapRenderController.swift` (render/gesture/camera/annotation half) | ~13,100 (13,463 minus the kernel it delegates to) | Mapbox Maps Android SDK v11 — style layers, `PointAnnotationManager`, gesture plugin, camera animations                                        |
| `CraveBottomSheetHostView.swift`                                          | 700                                               | Android view + `ViewManager`; no `UISheetPresentationController` equivalent                                                                    |
| `SearchChromeScalarSurfaceRegistry.swift`                                 | 529                                               | Straight logic port; Android measurement/layout pass differs                                                                                   |
| `SearchRouteSheetNavExclusionMaskView.swift`                              | 475                                               | Gesture exclusion — iOS `preferredScreenEdgesDeferringSystemGestures` has **no direct Android analog**; predictive-back is the nearest concept |
| `SearchChromeNativeHitTargetSurface.swift`                                | 211                                               | Android hit-testing                                                                                                                            |
| `ProfilePresentationTransactionExecutor.swift`                            | 168                                               | Presentation choreography                                                                                                                      |
| `UIFrameSampler.swift` + bridge                                           | 411                                               | `Choreographer` / `FrameMetrics` — Android has _better_ primitives here                                                                        |
| `TrackScrollPhysics.m` driver                                             | ~400 of 1,251                                     | `Choreographer` + `OverScroller`                                                                                                               |

**~16.3k lines of iOS native is the true parity budget**, of which ~13.1k is one
owner-locked map controller.

---

## 3. Methodology, baked in from day one (the map-saga lesson, not relearned)

iOS spent 4–6 months on the map largely because the instruments lied. `CLAUDE.md`
records the cure; Android gets it **before** the first render line, not after:

1. **Instrument the composite, never intent.** No metric that reads a state value, a
   style-spec literal, or "a handler fired". Android's `Choreographer`,
   `FrameMetrics`, and `PixelCopy` make composited-output capture _easier_ than on
   iOS — use them from stage 3.
2. **Every metric must be able to show RED.** Before a metric is trusted, prove it
   fails: mutate the engine deliberately and watch it go red. An always-green metric
   is the disease itself. The MapLodKit Kotlin port gets this for free — a mutation
   that breaks the kernel must break the 41 tests.
3. **The human eye stays the oracle for feel.** Instruments gate _regression_ against
   an owner-blessed baseline; they never decide "does this feel right".
4. **Bidirectional command bus with ack + state snapshot.** `apps/mobile/src/perf/`
   already holds the seed (`perf-scenario-command-registry.ts`,
   `PerfScenarioCoordinator.tsx`) — today fire-and-forget verbs. Android bring-up is
   the right moment to add the ack + `read_state()` return, because a fire-and-forget
   verb on an unfinished platform silently "passes" everything.
5. **Build trust before behavior trust.** The iOS analogs of the 2026-08-01 lesson:
   Gradle's up-to-date checks and R8 will happily hand you a stale or stripped APK.
   **Plant a referenced build marker, verify it in the installed APK's dex, never
   chain verification with the build, always use absolute paths.**
6. **One change at a time, attribute before you fix.** No proposing a cause before
   the instrument points at it.
7. **`scripts/perf-scenario-parity-contracts.js` gets teeth.** F1110 notes parity was
   once meant to be enforced and never was. When both platforms build in CI, this
   script becomes the thing that fails a PR — otherwise "parity" stays unfalsifiable,
   which is exactly how the mirror rotted.

---

## 4. Staged path

Each stage names what it **proves**. A stage that cannot fail proves nothing.

### Stage 0 — Decision record & scope freeze

Land this document + D52. No code. **Proves:** the plan is the agreed shape before
anyone writes Kotlin.

### Stage 1 — Build lane + credentials (the gate everything waits on)

- Obtain and store `MAPBOX_DOWNLOADS_TOKEN` (a Mapbox _secret_ download-scoped token,
  distinct from the public access token) — EAS secret + local `gradle.properties`
  outside git. Route it through the `service-access` skill's conventions like every
  other credential.
- Add `android` blocks to the four `apps/mobile/eas.json` profiles.
- Regenerate the Android project from Expo prebuild against RN 0.81.5 / Expo ~54 —
  **do not** try to modernize the June scaffold; it predates the current versions.
- CI job that runs `./gradlew assembleDebug` on every push.

**Proves:** the platform compiles at all — the first time in the project's history.
**Fails loudly if:** the token is unobtainable, or Expo 54 prebuild conflicts with
the hand-written `MainApplication`/`MainActivity`. Both are cheap to discover here
and expensive to discover in stage 4.

### Stage 2 — Delete the Java mirror

The moment stage 1's regenerated skeleton lands and compiles, `git rm` the 34 tracked
Java files (~11.2k lines). **Timing is the point:** not before (the mirror is the only
existing reference for how someone previously read the map controller, and deleting it
while nothing compiles leaves the tree with _neither_), and not never (F1110's core
harm is that every map grep returns two answers and every iOS change presents as "and
port it"). Git history preserves it at `e2654b211`; the commit message must cite that
SHA so a future reader can retrieve it in one command.

**Proves:** the tree stops lying. One answer per grep.

### Stage 3 — RN-parity smoke on a device/emulator

With the mirror gone and no custom native map, run the app on Android with the map
surface **stubbed** (a plain `MapView` or a placeholder). Walk every screen: onboarding,
search, polls, profile, tracksheet, sheets, navigation runtime.

**Proves:** how much of the 194.5k TS lines is _actually_ free. This is the plan's most
valuable cheap measurement — it converts "most of the app is shared" from an assumption
into a defect list with a count. Expect the FlashList/MVCP law (`CLAUDE.md`) to need
re-verification on Android's scroll implementation.

### Stage 4 — Map bring-up, kernel-first

1. **`:maplodkit` Kotlin module + 41 translated JUnit tests.** No Mapbox, no emulator.
   **Proves:** the LOD decision layer is at parity, by test.
2. **Read the existing Kotlin arm of `patches/@rnmapbox+maps+10.3.1.patch`** (8 files)
   and make it compile. **Proves:** the camera-host-registry seam — the hardest bridge
   — before any render work depends on it.
3. **The Mapbox Android SDK spike** (§6 — this is the plan's biggest risk; do it here,
   timeboxed, before committing to a render architecture).
4. **Render surface**, one subsystem at a time against the spike's findings: style
   layers → annotations → camera → gestures → crossfade/wiggle. Each subsystem gets a
   RED-provable composite metric before it gets an implementation.
5. Bridge the 11 extern methods to match the iOS contract exactly, and turn on
   `perf-scenario-parity-contracts.js` in CI.

### Stage 5 — TrackScroll

Extract a pure `TrackScrollKit` kernel **on iOS first**, with tests (the MapLodKit
shape), then port the kernel to Kotlin and write an Android `Choreographer`/`OverScroller`
driver. **Proves:** the physics matches by test rather than by feel, on both platforms.
Deliberately last: 7 JS call sites, and the extraction pays for itself on iOS regardless.

---

## 5. Explicit NON-goals for v1

- **Play Store submission.** v1 targets internal/device builds. Store listing, signing
  rotation, and review are a separate lane.
- **Tablet / foldable / landscape layouts.**
- **Pixel-identical visual parity with iOS.** Android should feel _native-correct_, not
  iOS-transplanted. Material back behavior, ripple, and system bars are wins, not defects.
- **Android-specific features** (widgets, App Actions, Wear).
- **TrackScroll parity** (deferred to stage 5, after v1's definition of done).
- **The owner-locked map's every micro-behavior.** v1 map = correct LOD, correct camera,
  correct annotations, correct press targeting. The wiggle/crossfade micro-polish that
  consumed iOS's saga is stage 4.5, gated on the owner's eye.
- **Push notifications on Android** (couples to the F1101 TestFlight/push lane).
- **Re-porting `SearchRouteSheetNavExclusionMaskView`'s exact semantics.** iOS's
  screen-edge gesture deferral has no Android analog; v1 finds the nearest correct
  Android behavior (predictive back), it does not emulate iOS.

---

## 6. Unknowns, honestly stated

### RISK 1 (largest) — Mapbox Maps Android SDK feature gaps vs the iOS surface

The iOS controller is 13.5k lines written against Mapbox Maps iOS SDK idioms, plus a
patched `@rnmapbox/maps` 10.3.1. The Android SDK differs materially in annotation
management, style-layer mutation cost, camera animation semantics, and gesture plugin
architecture. **We do not know which iOS behaviors are cheap, expensive, or impossible
on Android**, and a wrong guess here is what a 4–6 month saga looks like.

**SPIKE (timeboxed, stage 4.3, before any render architecture is chosen).** Deliverable:
a written gap table, one row per iOS map behavior, each marked
`direct-equivalent / achievable-differently / expensive / not-possible`, each backed by
a _running_ emulator demonstration rather than documentation reading. Minimum rows: the
LOD tier crossfade; per-annotation label collision/priority; dot↔pin↔label transitions;
imperative camera with completion callbacks (the patch's whole subject); rendered-feature
press hit-testing (`queryRenderedFeatures` equivalents); dormant/residency layer model;
and the `SourceState.featureById` read path (the iOS note in `CLAUDE.md` — `featureStateById`
vs `featureById` — almost certainly has a different Android shape). **The spike's output
gates stage 4.4; if it finds `not-possible` rows, the plan changes before code is written,
which is the entire point of doing it here.**

### RISK 2 — `MAPBOX_DOWNLOADS_TOKEN` availability and terms

The whole Android platform is blocked on a secret token from the Mapbox account. If the
account tier or billing does not permit it, stage 1 does not complete and nothing after
it matters. **This is why it is stage 1, item 1** — the cheapest possible discovery of
the most total blocker. Also unknown: Mapbox Android's pricing model relative to the iOS
line already in the budget.

### RISK 3 — the RN-parity tail is unmeasured

"~9% native, so ~91% free" is an argument, not a measurement. The real number is whatever
stage 3 finds: RN 0.81 on Android may surface insets, keyboard, back-button, shadow,
`FlashList`, and font-metric defects across a 1,343-file surface, and a few could be
architectural (e.g. the scene-stack/sheet host assumes iOS presentation semantics —
`CraveBottomSheetHostView` has no Android analog, and 700 lines of it sit under the
navigation runtime). Stage 3 is deliberately early and cheap precisely because this
estimate is the one most likely to be wrong.

**Lesser unknowns:** Expo 54 prebuild vs. the hand-written June `MainApplication`;
whether `patches/@rnmapbox+maps+10.3.1.patch`'s Kotlin arm compiles at all (written, never
built); Android device-matrix scope for v1; and whether `TrackScrollPhysics`'s untested
1,251 lines encode behavior nobody can currently specify.
