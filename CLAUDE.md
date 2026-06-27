# CLAUDE.md — Working Memory

This file is loaded into context every session. It captures hard-won process
knowledge and reminders. Keep entries short, concrete, and actionable. Add to it
as we learn things; don't let it rot. (Prior project-overview content lives in
git history if needed.)

---

## Where product & business thinking lives (read before working on a feature)

Three doc homes, by purpose:
- **`plans/`** — concrete *execution* plans for work in flight (technical, sequenced).
- **`product/`** — living *feature-idea backlog*, one file per app area
  ([favorites](product/favorites.md), [notifications](product/notifications.md),
  [profile](product/profile.md), [polls](product/polls.md),
  [restaurant-profile](product/restaurant-profile.md),
  [search-and-dishes](product/search-and-dishes.md), [map](product/map.md)).
  Start at [product/README.md](product/README.md). **Before building in an area, read its file;
  when an idea comes up, add it there.**
- **`business/`** — the business model: [pricing/model](business/business-model.md),
  [free-vs-paid gating](business/monetization-and-gating.md), and mined BRD/PRD material.
  Start at [business/README.md](business/README.md). Relevant to monetization, Stripe/onboarding,
  and the dish-vs-free gating split.

`PRD.md` / `BRD.md` (root) are the **stale** original v3 spec — good seed ideas only; the
`product/` and `business/` files supersede them and flag what's no longer true.

---

## Memory: Metro COLD LAUNCH serves the last FULL bundle, NOT your HMR edits

Cost me many wasted validation rounds (2026-06-22). When you edit JS then
`simctl terminate`+`launch` OR run a Maestro flow with `- launchApp`, the app loads
the last **full** bundle Metro built — which does NOT include subsequent
Fast-Refresh "(1 module)" HMR patches. So you measure STALE code: a console.log /
fix you just added simply never runs, and you chase ghosts.
- TELL-TALE: a render-body `console.log` you added prints 0 times even though the
  component clearly renders on screen. That's stale bundle, not a render bug.
- FORCE A FRESH FULL BUNDLE before validating: `curl -s -o /dev/null -w "%{http_code}\n"
  "http://localhost:8081/apps/mobile/AppEntry.bundle?platform=ios&dev=true"` (look for
  a multi-second rebuild + a `Bundled … (N modules)` line with N in the thousands).
  Then cold-launch. `/index.bundle` 404s here; the entry is `apps/mobile/AppEntry.js`.
- Confirm freshness with a uniquely-named marker log (`[BUILDCHECK-vN]`) each round;
  if the new marker prints, the bundle is live.

## Memory: A re-sortable feed needs FlashList MVCP DISABLED

FlashList 2.0.2 has `maintainVisibleContentPosition` (chat-style anchoring) **ON by
default**. On a list whose ROWS RE-ORDER (a sortable feed — polls feed sort/Live↔Results),
it anchors the old top row and scrolls your header/filter-strip off-screen. Symptom: after
changing sort the strip vanishes and the new #1's middle shows at the top, even though the
list is at offset 0 (a swipe-down collapses the sheet → proves at-top). Fixes that DON'T
work: `scrollToOffset(0)` (no-op, already at 0; also races ahead of the anchor scroll),
`listKey` remount, `skipSpinner`. THE FIX: disable MVCP for that list —
`flashListProps: { maintainVisibleContentPosition: { disabled: true } }`. In the scene-stack
sheets, pass it via the body transport's `flashListProps` (reaches the FlashList in both
`SearchMountedSceneBody` + `BottomSheetSceneStackListBodySurface`); it's per-scene, so other
sheets keep the default. Append/chat lists (poll detail thread) should KEEP MVCP on.

## Memory: Effects DON'T fire in the scene body-spec hooks (e.g. usePollsPanelListSceneParts)

Proven 2026-06-22: a render-body `console.log` in `usePollsPanelListSceneParts` fired
31×, but a sibling `React.useEffect(…, [visiblePolls])` fired **0×**. These
spec-building hooks render to produce `sceneBodyContent`/`sceneBodyTransport` but their
effects never commit. So a fix here must be **render-time** (compute a value, set a
`listKey`, etc.) — an `useEffect` / imperative ref (e.g. `listRef.scrollToOffset`) is
DEAD CODE. Put effect-based logic in the feed runtime / controller instead, whose
effects do fire.

---

## Memory: How to use the LOD harness (USE IT — don't guess from screenshots)

We built a JSONL telemetry harness specifically to validate marker LOD
(pin promote/demote, crossfade, wiggle) behavior. It is the source of truth for
"what is the map actually doing." Read it BEFORE describing on-screen state or
diagnosing a problem.

**Enable / capture** (`lodHarnessEnabled = true`, hardcoded in
`apps/mobile/ios/cravesearch/SearchMapRenderController.swift`):

```bash
DEV=7B0DD874-3496-46F7-9480-3EDDABCE2F31   # booted sim udid
# live stream:
xcrun simctl spawn $DEV log stream --style compact \
  --predicate 'eventMessage CONTAINS "[lodev]"'
# or after the fact:
xcrun simctl spawn $DEV log show --last 3m --style compact \
  --predicate 'eventMessage CONTAINS "[lodev]"'
```

**Event types:** `step`, `mut`, `frame`, `cwork`, `render`, `lod`.

**`step` — per-frame role/render state. Read the RIGHT field:**
- `activePin` / `activeDot` = count of markers with an **active in-flight transition**
  (crossfading right now) — NOT how many pins are visible. Easy to misread.
- `roleP` = role table promoted count (how many SHOULD be pins).
- `renderP` = pins actually painted (effective `nativeLodOpacity` > 0.5). **This is
  the "are pins visible?" metric.** `roleGap = roleP - renderP` = promoted-but-invisible.
- GOTCHA (fixed 2026-06): `renderP` used to read a feature-state key `nativePinOpacity`
  that NOTHING writes → always `nil ?? 1` → renderP fakely echoed roleP, roleGap always 0.
  A metric that's always green is lying. The pin's real on-screen opacity is
  `presentationOpacity × nativeLodOpacity` (style line ~2362); read `nativeLodOpacity`
  (feature-state → baked property → 1), the same coalesce the style + read site ~5316 use.
- `moving` = camera in motion. `pinMidFade`/`dotMidFade` = markers at intermediate opacity.

**`mut` — source mutations (the wiggle axis):**
- `bundle:[add, update, remove]` — the 3rd element (removes) **while `moving:true`**
  is the wiggle: removing a marker's bundle re-tiles the whole pin layer and every
  pin re-snaps. Wiggle fix = `bundle:[*,*,0]` (zero removes) during movement.
- `reason` = which path mutated: `native_lod` (LOD flips during pan/zoom),
  `dot_transition_complete` / `pin_transition_complete` (a crossfade finished).
- `affected` / `total` = scope of the mutation.

**Build verification (don't measure a stale binary):**
- `xcodebuild ... build` can print `BUILD SUCCEEDED` for a sub-step yet end with
  `(N failures)` — and a Bash `run_in_background` "completed exit code 0" only means
  the shell exited, NOT that the build linked. I measured a STALE binary for several
  rounds this way (harness fields I'd just added were absent → tipped me off).
- After EVERY build, before measuring: confirm the installed binary is newer than the
  source edit. `stat -f "%Sm" -t "%H:%M:%S" <derivedData>/Build/Products/Debug-iphonesimulator/cravesearch.app/cravesearch`
  vs the .swift mtime. If a NEW harness field you added is missing from the events,
  the binary is stale — rebuild and check for `error:` lines.
- Build cmd: `xcodebuild -workspace cravesearch.xcworkspace -scheme cravesearch -configuration Debug -destination 'id=<udid>' -derivedDataPath ~/Library/Developer/Xcode/DerivedData/cravesearch-ebulueazabvxrcfekwsqmhnjeydn build`
  then `simctl install <udid> <app>`. `SourceState` has `featureStateById` but NOT
  `featureById` — read baked feature properties via `<family>State.collection.featureById`.

**Driving the repro (self-test, no user needed):**
- Maestro needs JDK: `export JAVA_HOME=/opt/homebrew/opt/openjdk@17`.
- Jitter/pan repro flow: `maestro/perf/flows/search-map-jitter-swipe.yaml`.
- Perf deep links: `crave://perf-scenario-command?action=set_map_camera&lat=..&lng=..&zoom=..`
  and `action=submit_shortcut_restaurants` (wiring in
  `apps/mobile/src/perf/PerfScenarioCoordinator.tsx`).
- NOTE: the deep-link `submit_shortcut_restaurants` path can land on a poll CTA
  instead of results depending on UI state — verify with `activePin`/`activeDot`,
  not assumptions.

---

## Memory: ATTRIBUTE before you ideate (do not guess)

When something is wrong, the order is **attribute → prove → then fix.** Do NOT
propose or implement a solution before the data points at a specific cause.

- Read the harness / logs first. If they already show the answer (e.g.
  `activePin:0`), there is nothing to guess about — state it.
- If attribution returns zero events, that itself is signal: keep ADDING logs
  until something tells you something. Don't theorize into the void.
- "Trust the screen / sim" over green metrics — but the harness IS the screen,
  quantified. Use it to confirm what the eye sees.
- Only claim a root cause once it's proven through attribution AND code, not
  plausibility. One change at a time; verify each via the harness before moving on.

**Attribution = instrument the running app YOURSELF. Do NOT delegate to subagents.**
For a runtime/state bug, static code-reading gives a confident, well-cited, WRONG
answer — proven the hard way on the persistent-poll-lane "tap a poll card opens
nothing" bug: two thorough subagent passes each pinned a different wrong line +
proposed a fix that didn't work; the real cause (one shared `resolveIsPersistentPollLane`
forcing `'polls'` across 4 consumers incl. the sheet host) only surfaced once I
added `console.log`s to the actual runtime and watched the values during a real
repro. Subagents are great for breadth/reading; for "why is this behaving wrong,"
add logs and run it.

**How to capture RN JS logs (the gotcha that wasted time):** dev `console.log`
does **NOT** surface to `xcrun simctl log stream` (os_log) — it goes to Metro's
stdout. The session's Metro is launched with `> /tmp/crave-metro.log`, so:
`grep "[MARKER]" /tmp/crave-metro.log`. Log a distinctive `[MARKER]` tag + the
exact state tuple, drop a `=== RUN <ts> ===` line before each repro, and read the
LAST (settled) entries. Correlate the log with the screenshot from the SAME run —
a passing internal gate + a stale screenshot usually means timing/tap-miss, not a
broken fix. After a runtime-module edit, Fast-Refresh HMR may NOT replace a
long-lived closure — force a full reload (`simctl terminate` + `launch`, confirm
Metro logs a full `Bundled … (N modules)`, not a `(1 module)` HMR patch).
GOTCHA: coordinate taps on the gesture-handoff sheet are unreliable (land on
endorse bars / overshoot into search) — confirm the actual open with a finger tap.
Maestro tap gotchas (cost ~an hour on the thread-accordion validation, 2026-06-24):
(1) `tapOn: point:` REQUIRES INTEGER percentages — `49.5%` throws a Java
`NumberFormatException` and the step silently reads as a no-op tap (you chase a
"missed tap" that never fired). Use whole numbers.
(2) On the gesture-handoff / poll-detail sheet, raw-coordinate taps get eaten by the
pan gesture (overshoot → dismiss) and even land-on-element coordinate taps miss the
`onPress`, BUT a `tapOn: id:` ELEMENT tap on a `testID` fires reliably. To drive a
Pressable on that sheet, add a temporary `testID` and target it by id — don't fight
coordinates. `tapOn: text:` against a custom `<Text>`/accessibilityLabel often won't
match either; `id` is the reliable lever.
