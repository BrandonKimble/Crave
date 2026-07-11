# CLAUDE.md — Working Memory

This file is loaded into context every session. It captures hard-won process
knowledge and reminders. Keep entries short, concrete, and actionable. Add to it
as we learn things; don't let it rot. (Prior project-overview content lives in
git history if needed.)

---

## Workflow: solo dev — commit straight to `main`, no branches, no PRs

Decision 2026-07-05. Solo project: **work directly on `main` and commit straight to it.**
No feature branches, no PRs, no isolation worktrees — they only pile up as stale cruft
(on 2026-07-05 we deleted 5 worktrees + 8 branches whose committed work was ALL already on
main). The standard "commit/push only when the user asks" still applies — this rule is
about WHERE commits land (`main`, directly), not about committing unprompted. If you later
find a stray branch or worktree, treat it as cruft to surface, not something to build on.

---

## Memory: after ANY prisma migration, rebuild + restart the shared API — twice-burned trap

2026-07-11, hit twice in one day. The dev API on :3000 is one long-lived `node dist/main`
shared by all sessions. A session that applies a migration (esp. one DROPPING columns)
leaves that process serving a STALE generated Prisma client -> P2022 on every touched
query. When the broken query is in the AUTH path (per-request user load), EVERY
authenticated endpoint 500s BEFORE the request logger, so the server log looks clean and
empty while the app shows a flapping "Service temporarily unavailable" + banner-driven
map/header jitter (tight client retry). Unauthenticated curl returns 401 and looks healthy.
RECIPE: `npx prisma generate && yarn build && kill <pid> && nohup node --enable-source-maps
dist/main >> /tmp/crave-api.log 2>&1 &` from apps/api — the session that MIGRATES does this.
Diagnose with byte-offset log DELTAS on /tmp/crave-api.log + /tmp/crave-metro.log around an
app relaunch (0-byte API delta while the app 500s = requests dying pre-logger). Related
gotcha fixed 2026-07-11: prompt .md files are nest-cli assets now; a clean `yarn build`
used to produce a dist that crashed at bootstrap (ENOENT relevance-gate-prompt.md).

## Where product & business thinking lives (read before working on a feature)

Three doc homes, by purpose:

- **`plans/`** — concrete _execution_ plans for work in flight (technical, sequenced).
- **`product/`** — living _feature-idea backlog_, one file per app area
  ([favorites](product/favorites.md), [notifications](product/notifications.md),
  [profile](product/profile.md), [polls](product/polls.md),
  [restaurant-profile](product/restaurant-profile.md),
  [search-and-dishes](product/search-and-dishes.md), [map](product/map.md),
  [images](product/images.md), [messaging](product/messaging.md),
  [sharing](product/sharing.md)).
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

## Memory: The map is SHIPPED — and the old `[lodev]` LOD harness is GONE

The custom iOS map (pins/labels/dots LOD, crossfade, wiggle) is done and best-in-class
as of ~2026-07. Two corrections to prior memory so you don't chase ghosts:

- **The `[lodev]` JSONL telemetry harness this file used to document DOES NOT EXIST in
  the code.** There is no `lodHarnessEnabled`, no `step/mut/frame/render/lod` events, no
  `renderP`/`roleGap` fields; `log stream --predicate '[lodev]'` returns nothing. Do not
  go looking for it. What remains is narrative `[LODDBG]` NSLog behind
  `static let lodDebugLoggingEnabled = false` in `SearchMapRenderController.swift` (inert;
  flip to true only if you must debug the map again). Treat it as dead scaffolding, not a
  source of truth.
- **Don't build or strip map instrumentation unless you're actually changing the map.**
  It's a finished, precious ~9.7k-line surface — a "cleanup" edit there risks regressing
  hard-won behavior for zero benefit. The dormant NSLog costs nothing sitting behind a
  `false` flag; its proper replacement (a structured mach-clock event log) gets built as
  PART of a real map change, never as a naked delete.

**Go-forward testing methodology (for the REST of the app) — this is the lesson from the
4–6 month map saga:** instrument the **composite / rendered output**, never intent (state
values, style-spec literals, "a handler fired"); **every metric must be able to show RED**
(an always-green metric is lying — that was the whole disease); the **human eye stays the
oracle for feel** (centered / instant / seamless), while instruments gate _regression_
against a human-blessed baseline. Build order: bidirectional command bus (ack + state
snapshot) → app-owned "settled" signal → mach-clock event log → golden-timeline with a
proven-RED self-mutation backstop → composited-pixel checks only where truly needed.
**Foundation to build on (KEEP — do not delete):** `apps/mobile/src/perf/` — the
command-bus seed (`perf-scenario-command-registry.ts` + `PerfScenarioCoordinator.tsx`,
today fire-and-forget verbs that deliberately bypass gestures) and the frame/latency
samplers. `apps/mobile/ios/MapLodKit` `LodEngine` + its tests are the clean pure-engine
golden home (`swift test`, no sim).

**iOS build verification (durable — don't measure a stale binary):**

- `xcodebuild ... build` can print `BUILD SUCCEEDED` for a sub-step yet end with
  `(N failures)`; a Bash `run_in_background` "exit code 0" only means the shell exited,
  NOT that the build linked. After EVERY build, confirm the installed binary is newer than
  the source edit: `stat -f "%Sm" -t "%H:%M:%S" <derivedData>/Build/Products/Debug-iphonesimulator/cravesearch.app/cravesearch`
  vs the source mtime, and grep the build log for `error:` lines.
- Build cmd: `xcodebuild -workspace cravesearch.xcworkspace -scheme cravesearch -configuration Debug -destination 'id=<udid>' -derivedDataPath ~/Library/Developer/Xcode/DerivedData/cravesearch-ebulueazabvxrcfekwsqmhnjeydn build`
  then `simctl install <udid> <app>`. `SourceState` has `featureStateById` but NOT
  `featureById` — read baked feature properties via `<family>State.collection.featureById`.

**Driving a repro without the user (STILL VALID — this is the command-bus seed):**

- Perf deep links: `crave://perf-scenario-command?action=set_map_camera&lat=..&lng=..&zoom=..`
  and `action=submit_shortcut_restaurants` (wiring in
  `apps/mobile/src/perf/PerfScenarioCoordinator.tsx` + `perf-scenario-command-registry.ts`).
  These are exactly the fire-and-forget verbs the methodology's bidirectional bus extends
  (add an ack + `read_state()` return so a no-op can't silently pass).
- Maestro needs JDK: `export JAVA_HOME=/opt/homebrew/opt/openjdk@17`. Old map-saga flows
  live under `maestro/perf/flows/` (mostly historical throwaway; `market-demand/` is
  current search work; `map-accept.sh` is the best existing "outer-shell drives + asserts
  on a probe" example).

---

## Memory: ATTRIBUTE before you ideate (do not guess)

When something is wrong, the order is **attribute → prove → then fix.** Do NOT
propose or implement a solution before the data points at a specific cause.

- Read the logs / instrumentation first. If they already show the answer, there is
  nothing to guess about — state it.
- If attribution returns zero events, that itself is signal: keep ADDING logs
  until something tells you something. Don't theorize into the void.
- "Trust the screen / sim" over green metrics — instrument the COMPOSITE, not intent,
  so the instrument quantifies what the eye actually sees. A metric that can only ever
  show green is lying; if you can't make it show RED on a real defect, don't trust it.
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

## Memory: VERIFIED dev-client reload — use scripts/rig/reload-dev-client.sh

Root cause found 2026-07-10: the dev client persists its last bundle revision and requests
a DELTA on the next launch; a delta computed while Metro is still absorbing a batch of file
writes boots MIXED module revisions — a one-boot `ReferenceError: Property 'X' doesn't
exist` that clears on the next launch. Never trust a single relaunch after editing files.
`scripts/rig/reload-dev-client.sh` makes freshness a verified fact: builds the full bundle
until two consecutive hashes match (graph quiescent), cold-relaunches through the dev-client
URL, greps the boot for ReferenceError, retries once, then falls back to
uninstall+reinstall (clears the client's cached revision). Related rig traps: the dev-menu
onboarding card swallows the first tap of a fresh session (tap Continue/X first), and
`echo >>` markers in /tmp/crave-metro.log get CLOBBERED (Metro's fd is truncate-mode) — scan
tails, not offsets.
