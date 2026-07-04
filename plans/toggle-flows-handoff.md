# Handoff: Toggle Flows (search results strip · polls feed strip · nav page-switch)

## Framing

This covers the **toggle-strip UI + coordinator** axis: the search Restaurants/Dishes segment + filter chips, the polls Live/Results feed strip, and the bottom-nav page switch. It is a **separate axis** from the map-LOD unified-fade toggle (the fade-out/swap/fade-in map _reaction_), which is owned by the marathon map-render session — do not try to fix the map fade here. Per project ethos, toggle bugs are **runtime/timing** (debounce, cancelable-consequence, cover-lift ordering, snapshot desync during a switch): the correct path is **reproduce + instrument on-device, then attribute — not static-read a fix**. **The user's specific observed issues are NOT yet enumerated. Step 1 of the fresh session is to reproduce on-device and build the real issue list before fixing anything below.**

## Current architecture (as-is)

All three surfaces now render their strip UI through **one shared shell**: `FrostedFilterStrip` (frost + `MaskedHoleOverlay` cutouts + horizontal scroll), plus `SegmentedToggle` (2-option sliding pill) and `FilterChip`. This is the drift-proof state the plans wanted.

**Search results strip** — `apps/mobile/src/screens/Search/components/SearchFilters.tsx` (renders through `FrostedFilterStrip` at :356): a Restaurants/Dishes segment pill (its OWN Reanimated optimistic slide, _not_ `SegmentedToggle` yet) + Open now / Price / 100+ votes / Rising chips. **Every** toggle and chip funnels through ONE shared coordinator: `use-results-presentation-toggle-state-runtime.ts` → `beginToggleInteraction` (:125):

1. Press-up fires `searchMapRenderController.beginInteractionFadeOut()` immediately (:136) — pins/dots/labels fade out together, decoupled from data.
2. Optimistic state published to `searchRuntimeBus` (pill/chip color flips instantly).
3. A single **restarting** 300ms quiet-window debounce (`DEFAULT_TOGGLE_SETTLE_MS`, :23) — rapid taps re-arm it; the heavy consequence runs **once**, ~300ms after the last tap; latest-wins via `interactionSeqRef`.
4. On commit, `commitActiveInteraction` (`use-results-presentation-toggle-commit-runtime.ts`) runs the runner; `awaitVisualSync:true` holds until native redraw settles, then `finalizeInteraction` re-reveals. Tab runner: `use-results-presentation-tab-toggle-runtime.ts` (`beginRedrawTransaction reason:'toggle', coverState:'interaction_loading'`). Chip runners: `query-mutation-orchestrator.ts` (`toggleVotesFilter`/`toggleRising`/`toggleOpenNow`/`commitPriceSelection`, each writes zustand `searchStore` + fires `rerunActiveSearch`, a real network re-run).

Native side (owned by the map session but load-bearing here): `SearchMapRenderController.swift` — `applyInteractionFadeOut` (~1433), `reprojectCatalogUnderCoverIfReady` (~1498), `presentation_toggle_settled` emit (~8598-8640). JS cover-lift resolver: `search-map.tsx:1837` `onToggleSettled` → `search-surface-runtime.ts` `markRedrawSettled` + 800/1200ms watchdog (:462-473).

**Polls feed strip** — `PollsPanel.tsx:486-532`: a `SegmentedToggle` Live/Results pill (testID `poll-feed-state-toggle`) + Type/Sort/Time `FilterChip`s in a `FrostedFilterStrip` ListHeaderComponent. State threaded through `polls-feed-runtime-controller.ts` via refs + a dedicated refetch effect (skips initial mount, `skipSpinner:true`). MVCP disabled for the re-sortable feed. **DONE + sim-validated** — a _separate_ runtime from the search coordinator (shares only the UI shell).

**Nav page-switch** — bottom-nav Home/Favorites/Polls/Profile. `SearchBottomNav.tsx` item `onPress` → `handleOverlaySelect` (`NavSilhouetteHost.tsx:164`) → `routeOverlayTransitionActions.requestOverlaySwitch({sheetTransitionKind:'topLevelSwitch', sheetOpenerSource:'navTab'})` → `AppRouteSceneSwitchController` commits ONE immutable `PresentationFrame` per switch. The poll↔favorite swap is now structural: `resolveIsPersistentPollLane` (`app-route-native-overlay-target-authorities.ts:372`) = `presentationFrame.laneKind === 'docked-polls'`, a pure read of the committed frame. Switches are HARD-SWAP to skeleton + reveal-in-place (crossfade retired). Committed at `4eeaa27b`.

## Where to start

Open FIRST, in this order:

1. `use-results-presentation-toggle-state-runtime.ts` — THE shared coordinator (`beginToggleInteraction`, :136 fade-out, :177 debounce). Read this before anything else to understand behavior.
2. `use-results-presentation-toggle-commit-runtime.ts` — commit/`awaitVisualSync`/`finalizeInteraction` join.
3. `query-mutation-orchestrator.ts` + `use-results-presentation-tab-toggle-runtime.ts` — the chip and tab runners plugged into the coordinator.
4. `SearchFilters.tsx` — the strip UI (segment pill + chips). `PollsPanel.tsx:486` for the polls surface. `SearchBottomNav.tsx` + `NavSilhouetteHost.tsx:164` for nav switch.

**Reproduce on sim** (force a fresh FULL Metro bundle first — cold-launch serves the last full bundle, NOT HMR patches; curl `http://localhost:8081/apps/mobile/AppEntry.bundle?platform=ios&dev=true`, confirm a multi-thousand-module rebuild, then cold-launch): run a query with results, then (1) tap the segment pill, (2) rapid-tap it 4–5×, (3) tap Open now / Rising / 100+ votes, (4) toggle restaurant→dish→restaurant to probe the T4 staleness. Watch the MAP (do pins/dots/labels fade out on press-up and fade back in on settle?) and the STRIP (does it stay put or vanish/collapse the sheet on a segment tap = regression #3?). Polls: open Polls tab, tap Live/Results + Type/Sort/Time (`maestro/perf/flows/poll-feed-toggle.yaml` exists). Nav: fast Favorites↔Search↔Polls↔Profile loop.

**Instrument FIRST (attribute before fixing):**

- **JS** (goes to Metro stdout, NOT `simctl log`): the coordinator already emits `[TGLDBG-v2]` begin (:145) / settle:fire (:180) and `[TOGGLE]` commit/finalize. `grep '[TGLDBG-v2]' /tmp/crave-metro.log`. Drop a `=== RUN <ts> ===` marker per repro; read the LAST settled entries. Confirm: does settle:fire fire **once** per burst (~300ms after last tap)? Does the runner return `awaitVisualSync:true` and finalize re-reveal?
- **Native / map** (the LOD harness is source of truth): flip `lodDebugLoggingEnabled = true` (`SearchMapRenderController.swift:9742`, currently false), rebuild, and **verify a FRESH binary** (`stat` mtime vs .swift edit — a stale binary is the classic trap; look for `error:` lines, `BUILD SUCCEEDED` on a sub-step can still end in failures). Stream `[lodev]` events. Read `roleP` (should-be-pins) and `renderP` (actually-painted); `roleP:0` after a toggle = the reproject gap.
- **T4 toggle-back staleness specifically**: add `didPublishSourceFrame` logging around `areSearchMapSourceFrameSnapshotsEqual` in `search-map-source-frame-port.ts` (~:134) to confirm whether the dish→restaurant frame is deduped (published-but-not-rendered). Also consider a `[t4dbg]` log at the projection axis-pick (`use-direct-search-map-source-controller.ts` ~:1219).
- **Nav swap**: log the committed `PresentationFrame` at each switch (switchId, activeSceneKey, presentedSceneKey, laneKind) from `AppRouteSceneSwitchController`. If `presentedSceneKey` ever diverges from `activeSceneKey` for a non-docked-polls case, that's the bug — at the frame commit, not a deny-list. The reliable painter probe is `app-route-sheet-host-authority-controller.ts` `displayedSceneKey`.

Driving without a user: `export JAVA_HOME=/opt/homebrew/opt/openjdk@17`; Maestro `tapOn: id:` on testIDs (coordinate taps on these sheets are unreliable per CLAUDE.md); `tapOn: point:` requires INTEGER percentages. Perf deep link `crave://perf-scenario-command?action=toggle_tab&tab=dishes` (`PerfScenarioCoordinator.tsx:553`) drives the real tab toggle.

## Known-open + fragile (verified, not invented)

- **Search regression #3 — segment toggle historically nuked the strip + collapsed the sheet.** Status **UNVERIFIED** after the shared-shell + page-switch rework. Plan `plans/toggle-strip-regression-fix.md` marks #3 open/architectural (restore `SearchResultsHeaderChromeAuthority` as fixed chrome). The strip is still a render-gated list header (`use-search-root-search-scene-surface-render-header-source-runtime.tsx:30`) but now renders through the shared `FrostedFilterStrip` AND scene mounting changed under the committed page-switch redesign — the fixed-chrome prescription may be obsolete or already subsumed. **Reproduce a segment tap on device before acting on the plan.** (There are two conflicting research readings: one says the strip now survives because the redraw transaction re-projects the mounted list under the `interaction_loading` cover — treat "resolved" as unconfirmed and verify empirically.)
- **T4 toggle-back staleness** (dish→restaurant fades the SAME dish data — cards switch, map doesn't). Root-caused NOT fixed per `ISSUE-LEDGER.md:61`; suspect source-frame dedup. (One later research pass claims this was fixed via `coverage-cache-policy.ts` sibling-feature caching and validated on-device — **conflicting**; re-repro on a dataset where dishes ≠ restaurants before trusting either.)
- **T1** (frame drop right at click, blocking the pill animation) + **TR1** (zero dropped frames during pill anim) — the PILL/Reanimated side was **never frame-measured**; all validation is simulator-only (`03-STATE-BRIEF.md:116`). `ISSUE-LEDGER.md:58`.
- **T2** (double fade-in after settle) + **T3** (cutout white area flashes transparent on rapid toggling) — not reproduced, not proven fixed. T3 _may_ be covered by `FROST_HANDOFF_FLOOR_MS` (`use-search-root-search-scene-interaction-frost-runtime.tsx:14`) — verify it covers the cutout-plate case. `ISSUE-LEDGER.md:59-60`.
- **~1-frame coverage-features-ref lag** on rapid toggle (projection runs new activeTab but coverage-features ref lags one frame; self-heals, masked by fade-dim). `02-CONFIRMED-FINDINGS.md:62`.
- **TR5 portable toggle primitive — NOT extracted.** The coordinator is welded to `searchRuntimeBus` and lives only in `screens/Search`. Recipe in `plans/search-map-ideal-effort/01-MASTER-PLAN.md:41-43`. A new strip today = re-implement the lifecycle.
- **Rising→Sort modal — unbuilt** ~7-file thread (would add `SearchSortSheet.tsx` + a sort modal-layer runtime, remove the Rising pill; Rising is a pill today at `SearchFilters.tsx:515-529`). `toggle-strip-regression-fix.md` "Also still pending".
- **Nav swap fragility**: `PresentationFrame.laneKind` commit timing during a rapid tab switch — if the "favorites renders as polls" swap recurs, attribute at the frame commit.

## Stale-context warnings (do NOT trust)

- **`CompositorToggle` / `useToggleCoordinator` / `declareToggle` do NOT exist in code** — grep returns ZERO matches. Memory `unified-fade-toggle-architecture` names them as if built; they are the FUTURE TR5 abstraction (spec only, `01-MASTER-PLAN.md`). The actual shipped coordinator is `useResultsPresentationToggleStateRuntime` + `beginToggleInteraction` (search-specific).
- **Regression #2 (map fade-out on toggle) is NOT "deferred/un-started."** `toggle-strip-regression-fix.md` marks it `⏸ DEFERRED`, but `use-results-presentation-toggle-state-runtime.ts:136` unconditionally calls `beginInteractionFadeOut()` and the comments say the fade was unified across tab+chips. It is effectively landed — verify it plays + re-reveals on-device; don't treat as un-started.
- **`SearchResultsHeaderChromeAuthority` no longer exists** (deleted). Any plan step that says "restore it via `git show`" is pre-page-switch-redesign and likely stale. Verify before following.
- **The `fade_swap` transaction kind does NOT exist.** `toggle-fade-swap-lane.md`'s "turnkey M1 recipe" was superseded (the doc flags this at its own 2026-06-29 section); the toggle routes through the redraw/`interaction_loading` path + `reprojectCatalogUnderCoverIfReady` + `presentation_toggle_settled` instead.
- **`toggle-fade-swap-lane.md`'s "toggle still hangs" evidence** (roleP:0/renderP:0, no projection frame, 2026-06-22) predates the pin-residency/CA-overlay/reveal-deadlock work — treat the hang as UNCONFIRMED on current binaries; re-repro before acting.
- **`03-STATE-BRIEF.md` (2026-07-01) "EVERYTHING uncommitted", `lodDebugLoggingEnabled=true`, `.env` throttle relaxed** — STALE. Map work is committed; `lodDebugLoggingEnabled=false` (:9742); most JS debug probes (`[t4dbg]`/`[tclur]`/`[SRCPROJ]`) were swept; only a couple `[TGLDBG-v2]` lines + the gated native `[LODDBG]` remain. Verify the gitignored `apps/api/.env` throttle directly if it matters.
- **Memory `toggle-strip-state` "regressions fixed+committed" overstates it**: only #1 (color-flip-on-press-up, via `use-search-root-search-scene-chrome-freeze-runtime.tsx`) is fully done. #3 is open/unverified in code.
- Memory `polls-feed-toggle-state` is **ACCURATE** — `SegmentedToggle.tsx`, `FrostedFilterStrip.tsx`, `FilterChip.tsx`, the `PollsPanel` wiring all verified. No open build work; regression-check only.
- Memory `nav-poll-favorite-swap.md`'s deny-list fix (`!== bookmarks && !== profile` at `~L345-380` + a painter gate) is **GONE** — replaced by the structural `laneKind === 'docked-polls'` read. The `displayedSceneKey` probe technique is still useful; the cited fix lines are not.

## First-session checklist

1. Force a fresh FULL Metro bundle, cold-launch. Do NOT measure HMR patches.
2. **Reproduce and enumerate the user's actual observed issues** — this list does not exist yet. Nothing below is fixed until you've seen it on-device.
3. Re-enable JS `[TGLDBG-v2]` reading (`/tmp/crave-metro.log`) + native `[lodev]`/`[LODDBG]` (`lodDebugLoggingEnabled=true`, fresh binary). Attribute before touching code.
4. Re-verify regression #3 (segment tap → does strip survive?) and the two conflicting T4 readings on a dishes≠restaurants dataset.
5. Only after attribution: decide TR5 extraction / Rising→Sort / any point-fix. One change at a time, verify each via the harness.
