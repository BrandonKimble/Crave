# Toggle Primitive Red-Team: Settle Machinery, Completeness, Ideality (2026-08-08)

Scope: every line of `apps/mobile/src/toggles/` (engine, consequence seam, hook,
awaiting face, ToggleStrip), `components/SegmentedToggle.tsx`, `components/FilterChip.tsx`,
the four surface wirings (polls feed, listDetail, lists-home, search results), and
`plans/toggle-primitive-rederivation.md`. Read-only pass; no source touched.

---

## 1. How rapid-tap-then-settle actually works (end to end)

Files: `src/toggles/toggle-interaction-engine.ts` (pure core),
`src/toggles/toggle-strip-consequence.ts` (consequence seam),
`src/toggles/use-content-toggle.ts` (React face).

1. **Press edge.** The control flips optimistically in the press handler's own stack
   (SegmentedToggle commits via `runOnJS(commit)` from a UI-thread worklet —
   `SegmentedToggle.tsx:313-363`; store-backed surfaces flip a zustand store, which
   notifies synchronously). The subscription/handler calls `seam.scheduleCommit(...)`.
2. **Synchronous content exit.** For `consequence:'content'`, `scheduleCommit` flips
   `contentPhase` to `'awaiting'` BEFORE the engine even begins, in the caller's stack
   (`toggle-strip-consequence.ts:199-213`) — so the old cards' exit and the control's
   optimistic flip land in the same React batch. The surface renders the primitive's
   `awaitingFace` (OA12; `use-content-toggle.ts:121-133` →
   `resolveToggleAwaitingMaterial` → `resolveSceneLoadingMaterial(scene,'refetch')`).
3. **Coalesce window.** `engine.begin` bumps `interactionSeq`, aborts any in-flight
   consequence's AbortSignal, and arms a **restarting** `setTimeout(settleMs)`
   (`toggle-interaction-engine.ts:286-320`). Each tap in a burst re-arms the timer;
   the runner fires exactly once, `settleMs` after the LAST tap. Stale timers and
   stale async landings are dropped by the seq guard at every boundary
   (`:199, :213, :262` — a superseded landing can never publish).
4. **One fetch, latest values.** Runners read the SETTLED control values at run time
   (polls: `refreshPollFeed`'s own refs, `polls-feed-runtime-controller.ts:488-505`;
   listDetail: `sliceRef.current`, `ListDetailPanel.tsx:1259-1263`), never the press
   closure — so the coalesced commit targets the final selection.
5. **Slice swap.** The runner's resolution (finalize/fail/cancel lifecycle) settles the
   phase back to `'settled'` (`toggle-strip-consequence.ts:179-184, 138-175`) — new
   cards snap in; the `[CONTENTTOGGLE] gap` log records `exitToReadyMs` /
   `lastPressToReadyMs` / commit count per burst.
6. **World variant (search).** Same engine, `consequence:'world'`: the commit is
   additionally gated on the presentation visual floor (quiet window elapsed AND
   fade-out acked at ~0, with a LOUD 900ms bounded fallback —
   `toggle-interaction-engine.ts:250-284`). The "awaiting face" for search is the
   world-reveal cover, not `awaitingFace` (by design, plan §2.3).

### One implementation or several? — **ONE. Verdict: no drift risk in the settle core.**

- The engine header states it was "extracted from the search toggle coordinator (the
  TR5 portable-toggle-primitive seed); the state machine moved verbatim"
  (`toggle-interaction-engine.ts:5-8`). Search itself now consumes the SHARED seam —
  `use-results-presentation-toggle-coordinator.ts:63-102` calls
  `createToggleStripConsequenceSeam({ consequence:'world', ... })`; there is no
  parallel search-local copy of the debounce/seq machinery left. The hard-won original
  IS the shared code.
- The `~300ms` window is **one constant stated once**:
  `DEFAULT_TOGGLE_SETTLE_MS = 300` (`toggle-interaction-engine.ts:87`). No surface
  overrides it except lists-home's deliberate `settleMs: 0` synchronous degenerate
  case (`lists-home-content-toggle.ts:27-31`). (SegmentedToggle's "~300ms 3-segment
  travel" is a coincidental product of `150ms × 2 segments`, a distinct constant —
  not a duplicate of the settle window.)
- The control-level pill is also one implementation now: SearchFilters imports the
  house `SegmentedToggle` (`SearchFilters.tsx:7,124`); the header's claim that it
  "mirrors" SearchFilters describes ancestry, not a live twin.

### Does the frame-rate optimization hold on every surface?

**Pills: yes, everywhere.** SegmentedToggle's tap handling is a UI-thread worklet:
hit-test, `targetProgress` write, and `withTiming` pill travel all run on the UI
thread before `runOnJS(commit)` ships the JS-side state write
(`SegmentedToggle.tsx:318-361`). Coalescing keeps the fetch off the burst. This holds
identically on search, polls, lists, listDetail — the control is shared.

**Chips: no.** `FilterChip` is a plain `Pressable` with a JS-thread `onPress` and a
render-time fill swap (`FilterChip.tsx:56-79`). Its visual flip waits on the JS
thread; during a congested frame the chip lags where the pill would not. It also has
**no pressed-state feedback at all** (no style function on the Pressable). ListDetail's
strip is chip-heavy — the surface most likely to feel different under rapid taps.

---

## 2. Completeness — gap list, ranked (behavior-visible first)

### G1 (BUG, behavior-visible): listDetail's failure baseline re-captures STALE values
`toggle-strip-consequence.ts:162-173`: on the `'failed'` edge the seam runs the
restore thunk, then IMMEDIATELY re-captures the baseline in the same stack ("after a
failed settle the store is back at the old baseline"). That contract is only true for
**synchronous** control stores. Polls satisfies it (zustand `setState` is synchronous;
`restorePollsFeedControls` → `getPollsFeedControlsSnapshot` reads restored values,
`polls-feed-controls-store.ts:100-107, 85-88`). ListDetail does NOT: its restore is
four React `setState` calls (`ListDetailPanel.tsx:1226-1231`) and its capture reads
`sliceRef.current` (`:1225`), which is only updated on render (`:1212-1213`). So the
post-failure re-capture snapshots the **failed optimistic values** — after one failed
toggle, the "last settled baseline" is wrong, and a second failure "restores" to the
first failure's values: the control lies, which is exactly the coherence the leg-5
design exists to prevent. Fix shape: capture must be a value snapshot taken from a
synchronous source (or the seam must defer re-capture to the next settled commit);
the seam's contract should state "restore must be synchronous" and dev-assert it.

### G2 (behavior-visible): world-class failure has no primitive-level control revert
The declaration type forbids `captureControlBaseline` on `consequence:'world'`
(`toggle-strip-consequence.ts:75-96`), and search's adapter swallows the `'failed'`
lifecycle entirely ("the engine-level event is trace-only here",
`use-results-presentation-toggle-coordinator.ts:92-97`), delegating to search's
resolution seam + uniform failure modal. Whether the optimistic pill is actually
reverted on a failed world swap therefore depends on search-runtime code outside the
primitive — the one honesty behavior the primitive owns for content is opt-in-by-
another-system for world. Red-team ask: verify the search resolution seam restores the
control on failure; if it does, document the split in the seam header; if not, this is
the same lying-control defect the content class fixed.

### G3 (behavior-visible): chip press feedback ≠ pill press feedback
See §1. FilterChip: JS-thread flip, no pressed state, no UI-thread path. The owner's
"identical across every surface" bar fails at the control layer for chip-based toggles
(listDetail sort/openNow/price/city, polls type chips, search openNow/dietary). The
rapid-tap SETTLE semantics are shared (they ride the same seam), but the per-tap
visual response is a different class. Recommend: give FilterChip a pressed style and
consider the same Gesture.Tap+worklet treatment, or explicitly rule the difference.

### G4: `awaitVisualSync` wait is unbounded (no fallback twin)
`settleOutcome` with `awaitVisualSync: true` parks the interaction until
`notifyIntentComplete` (`toggle-interaction-engine.ts:198-207, 322-327`). The floor
gate got a LOUD bounded fallback (`:260-274`) precisely because "expose, never
silently hang" — the visual-sync wait has no equivalent. A dropped intent-complete
(dead presentation path) leaves the engine non-idle forever, silently. Only search
uses it today; still, the asymmetry contradicts the engine's own stated contract.

### G5: `cancel()` leaves the optimistic control un-reverted, by omission not ruling
`settleContent('cancelled', …)` deliberately skips the restore (documented for the
dispose case, `toggle-strip-consequence.ts:88-91` "cancelled (= seam dispose, surface
teardown)"), but `seam.cancel` is a public method any content surface could call
mid-awaiting — that path would settle the phase with old content under a flipped
control. No content surface calls it today; the type surface allows it. Cheap fix:
state the contract on `cancel` or restore on explicit-cancel too.

### G6: silent freeze of `captureControlBaseline` presence
`use-content-toggle.ts:96-105`: whether the failure-restore path exists at all is
decided by `declarationRef.current.captureControlBaseline != null` at memo creation.
F1559 documents `surfaceName`/`settleMs`/`scene` as frozen; this fourth
partially-frozen field (presence frozen, implementation live) is undocumented — a
caller adding the capture after first render is silently ignored.

### G7: rapid-tap coalescing coverage — complete for content, with one stale doc
Every content toggle rides the seam: polls (store subscription →
`scheduleFeedQueryCommit`), listDetail (`applySlice` → `contentSeam.scheduleCommit`),
lists-home (store subscription → module seam, sync), search (world seam). **No
surface fetches per tap.** Lists-home's press-edge-is-the-store-write pattern
(F933a) is the strongest shape — a control write cannot bypass the seam; listDetail's
`applySlice` is a convention call sites must remember (weaker, same class F933a
fixed for lists). Minor: `SegmentedToggle.tsx:38-39` still lists "profile
Created/Contributed/Favorites" as a consumer — no profile consumer exists (stale doc).

### G8: the form-control boundary (SaveList flip, ListEditHost) — boundary is SOUND
Both use the same `SegmentedToggle` (`SaveListPanel.tsx:413,468`,
`ListEditHost.tsx:114`), so press feel, unbounded press-up (T1/T2 `maxDuration(1e9)`),
layout-first pill, travel timing, and accessibility are byte-identical to strip
toggles — the visual/press layer IS shared even where the seam is not. The seam
absence is correct: their consequences are synchronous local re-slices (no fetch, no
awaiting window, nothing to coalesce). The one trap is documented in the hook header
(`use-content-toggle.ts:31-35`): a form flip that ever becomes async must join the
hook — nothing enforces that migration except review. Acceptable; no change needed.

### G9: haptics — consistently absent
No haptic feedback anywhere in the toggle family (grep: zero hits in toggles/,
SegmentedToggle, FilterChip). Consistent today; if ever added, it must land in
SegmentedToggle/FilterChip once, not per surface.

### G10: accessibility — consistent, one nuance
SegmentedToggle: `accessibilityRole="button"`, `accessibilityValue` = selected label,
VoiceOver double-tap advances with wrap (`SegmentedToggle.tsx:366-375, 241-252`).
FilterChip: role button + `selected` state (`FilterChip.tsx:60-62`). Consistent. The
default `accessibilityLabel ?? 'Toggle'` fallback (`:371`) is weak — a surface that
forgets the label announces "Toggle, button"; consider requiring the label.

### Press-during-awaiting (third-option tap while fetch in flight) — CONSISTENT
One engine ⇒ one semantics everywhere: the new `begin` bumps the seq, aborts the
in-flight signal (`toggle-interaction-engine.ts:294-296`), re-arms the window; the
stale landing is dropped by the seq guard; the phase stays `'awaiting'` (already set;
`publishContentPhase` dedupes) until the NEW runner resolves; runners read final
values at run time. Latest-wins, no double-fire, no per-surface divergence. This is
the machinery at its best.

---

## 3. Ideality verdict on the settle implementation

**The shape is right.** The core is a pure closure state machine with no React in it
(`toggle-interaction-engine.ts`), seq-guarded at every async boundary, one settle
constant, optional sinks, and a spec suite; the consequence seam composes rather than
forks it; the React hook is a thin subscription face (`useSyncExternalStore`, no
timing logic in effects). The press-edge phase flip being synchronous with the
optimistic control flip (`toggle-strip-consequence.ts:199-211`) is the load-bearing
insight and is stated in code. The OA12 face is structurally non-optional (required
`scene`, no suppress field). Falsifiable: engine/seam/face/law specs exist, and the
`[CONTENTTOGGLE] gap` instrumentation can show RED.

**What a from-scratch design would change:**
1. **Make the failure-baseline contract synchronous-by-construction** (G1): the seam
   should take a `captureControlSnapshot(): S` + `restoreControlSnapshot(S)` pair over
   a value, or defer re-capture until the next settled press — the current
   capture-thunk-then-recapture-in-the-same-stack shape only works for zustand-class
   stores and silently corrupts for React-state stores.
2. **Symmetric bounded fallbacks**: the visual-sync wait should get the floor gate's
   LOUD timeout treatment (G4).
3. **One control-press layer**: FilterChip joins SegmentedToggle's UI-thread gesture +
   pressed-state family (G3), so "identical across every surface" is true at the
   finger, not just at the seam.

**What is correct and must not be churned:** the engine's seq-guard/abort protocol;
the restarting quiet window with the one 300ms constant; the synchronous press-edge
phase flip; the store-subscription press edge (polls/lists — extend it to listDetail
rather than weakening it); the `settleMs: 0` degenerate case; the OA12 no-opt-out
awaiting face; the world-class floor gate with its loud fallback; SegmentedToggle's
worklet tap + layout-first pill + warm restore.

## Top 3 recommendations
1. **Fix G1** (listDetail stale baseline re-capture on the failed edge) — the only
   found defect that makes the control lie, which is the exact failure the leg-5
   machinery exists to prevent; tighten the seam contract while fixing it.
2. **Verify/close G2** (search world-class failure revert) — prove the resolution seam
   reverts the pill on a failed world swap, or bring world failure coherence into the
   primitive.
3. **Level the control layer (G3)** — pressed states + UI-thread press handling for
   FilterChip so chips and pills are indistinguishable under rapid taps on 120Hz.
