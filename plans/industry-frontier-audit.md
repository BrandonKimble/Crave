# Industry-Frontier Audit v2 — the track vs. best-in-class screen switching

Mandated by OA8 (`plans/transition-endstate-contract.md:798-824`). Owner intent,
verbatim spirit: "you first visit a screen maybe it shows a skeleton but the next time
you visit that screen it's still there, like preloaded... do the frontier of what is
possible and ideal in the industry... What does the architecture we landed on lend
itself to leverage?"

v1 of this file (git history, commit 4af349f6d) covered the gap table, the ONE TRACK
leverage argument, the rules-as-outcomes census, and a first ladder. v2 supersedes it:
it keeps those findings (folded in below), completes the topic enumeration the mandate
demands (cache tiering, image pipeline, offscreen suspension, progressive rendering,
choreography norms, interaction prediction, skeleton norms, virtualization tuning,
cold-start restoration), and adds the old-plans-astray audit, the ranked plan, and the
five user-felt gaps.

Comparables throughout: Instagram/Airbnb/Yelp/Google Maps-class list-heavy mobile apps;
react-native-screens (`detachInactiveScreens`/`freezeOnBlur`), React 19.2 `<Activity>`,
TanStack Query SWR defaults, FlashList v2, instant.page / Next.js `Link` press-intent
prefetch canon, expo-image, Apple `UISheetPresentationController`, Bill Chung
skeleton-perception research.

All code paths under `/Users/brandonkimble/Crave/Crave/apps/mobile/src/` unless rooted.

---

## Part 1 — The playbook, topic by topic

Each row: the industry norm → what we do (file:line) → gap verdict → what our
architecture uniquely enables → cost to close.

### 1.1 View/screen retention + back-stack state restoration

**Norm.** Tab navigators keep inactive tabs mounted (react-navigation default);
best-in-class apps (Instagram, YouTube) retain each tab's full view tree AND scroll
position forever within a session; stacks retain the previous 1–2 screens live so
back always finds warm pixels. Cold launch restores the last route + scroll near-state
from disk (Instagram resumes mid-feed).

**Us.** Resident set = 5 tabs retained forever (`use-track-leg-resolver.tsx:394-397,
684-690`; residency declared in `scene-foundation-spec.ts:252-362`) + depth-3 LRU for
children (`track-entry-retention.ts:16-49`). Entry identity `sceneKey#entryId`
(`track-entry-identity.ts:26`) keys scroll memory, readiness, frozen bodies, chrome.
Scroll memory deliberately survives eviction (`track-entry-scroll-memory.ts:32-37`,
sweep exception at `use-track-leg-resolver.tsx:476`). **But retention is STATE-layer,
not VIEW-layer**: only the presented leg's rows are ever mounted — one FlashList fed by
`presentedLeg` only (`TrackSheetPage.tsx:1347-1367`; honesty note, contract `:331-334`).
Chrome (title/strip) stays mounted and opacity-flips (`TrackSheetPage.tsx:1022-1038`).
No session restoration: cold launch starts at the root; nothing persists route stack or
scroll to disk (only zustand search/onboarding slices persist, `store/searchStore.ts:100-181`).

**Gap.** PARTIAL. Retention model is richer than the RN norm (K=3 with a scroll-memory
carve-out beats a binary detach flag), but the retained thing is state, so a revisit
still pays the first-screenful render (the D1 correction's honest residual, contract
`:704-709`). Cold-launch restoration is MISSING entirely.

**Leverage.** Entry identity is exactly the serialization key a restore system needs —
persisting `{entryKey → scrollOffset, route stack}` at background and replaying it at
boot is a bolt-on, not a redesign.

**Cost.** Second-paint-lane (true view retention): a real rung, previously rejected
(contract `:657-659`) — see 1.6. Cold-launch restore: small-medium (persist stack +
offsets on AppState background; replay through existing revealRoute + scroll memory).

### 1.2 Render-ahead / prefetch on prediction signals

**Norm.** Web canon: prefetch on hover/press-down (instant.page's ~65ms-before-tap
window, Next `Link`). Native best-in-class: prefetch DATA for the likely next screen on
touch-down or on cell-appear (Instagram prefetches profile data when a username row
renders); some apps pre-render the next view tree at low priority (React `<Activity>`'s
stated use case).

**Us.** Press-DOWN prewarm exists and is genuinely ahead of the RN norm:
`onPressIn → requestTrackScenePrewarm` (`SearchBottomNav.tsx:86-88`), drained at
`use-track-leg-resolver.tsx:406-426`. But it warms **structure only** — first-visit
resident legs get chrome/title/skeleton renderer built early; it fetches NO data, warms
NO images, and is a no-op for already-visited residents and ALL child pushes
(`track-entry-prewarm.ts:34-38`; child-push prewarm ruled out by construction, contract
`:373-374`). No adjacency prefetch, no likelihood model, no idle warm of other tracks
(subagent sweep confirmed; the only other predictive machinery is search-internal,
`use-direct-search-map-source-controller.ts:176-177,2661-2682`).

**Gap.** PARTIAL — the trigger is frontier-grade; the payload is thin.

**Leverage.** The prewarm signal is a ready-made bus. Because prewarm only touches a
memo (no second scroll view), hanging MORE work on it — `queryClient.prefetchQuery` for
the destination's primary query, `Image.prefetch` for its first-screenful thumbs — is
collision-free by construction. Child pushes: the tap target usually KNOWS the id at
press-down (poll card knows its pollId); an `onPressIn` data-prefetch on card rows is
the Instagram pattern and needs no entry identity to exist yet.

**Cost.** LOW for tab prewarm payload (one registry: scene → prefetch fn). LOW-MEDIUM
for card-row press-in prefetch (per-surface wiring, but each is ~5 lines into
react-query).

### 1.3 Cache tiering: memory → disk → network, stale-while-revalidate

**Norm.** Three tiers everywhere at the frontier: in-memory query cache renders
instantly; a disk layer (persisted query cache) hydrates at boot so even a cold launch
paints last-known content; network revalidates silently behind stale content. TanStack's
own mobile guidance: raise `staleTime`/`gcTime`, add `persistQueryClient` +
AsyncStorage/MMKV persister.

**Us.** react-query v5 with **library defaults** — no `defaultOptions` at all
(`App.tsx:71-88`): `staleTime: 0`, `gcTime: 5min`. Per-panel ad-hoc staleTimes
(20s/30s/60s/300s scattered; census in subagent report) with no shared policy. **No
persistence plugin anywhere** — the query cache dies with the process. The app's real
SWR analogue is the frozen last-good body (`lastGoodListRef`,
`use-track-leg-resolver.tsx:438,600,618,666`) — stale PIXELS, not stale DATA: it
survives only in memory and only per entry.

**Gap.** This is the LARGEST structural gap. The track holds scene state warm for its
whole retention window while the data cache underneath expires in 5 minutes — a revisit
inside the retention window can eat a full network refetch behind the frozen body. And
cold launch always starts from zero: no disk tier at all, while every comparable app
paints last-session content instantly.

**Leverage.** The track never needs the data layer's cooperation to paint (frozen
bodies + skeleton are total), so tuning react-query is pure upside with no
choreography risk. Entry identity again gives the natural persistence scope.

**Cost.** LOW for defaults (`staleTime: 30-60s`, `gcTime: 24h` on track-hosted
queries + a one-page policy). MEDIUM for `persistQueryClient` + MMKV (add the
persister, buster on app version, throttle; ~a day incl. verification).

### 1.4 Image pipeline

**Norm.** Thumbnail-first / blurhash placeholders (Instagram's tiny-preview-in-payload
pattern), decode-ahead of the visible window, explicit priorities, memory+disk cache
policy, prefetch tied to the same intent signals as data.

**Us.** expo-image in ~5 surfaces, RN `Image` still in ~8 (avatars, poll heroes —
census in subagent report). Props used: `recyclingKey` (2 sites), `transition={180}`,
`contentFit`. **Zero** `blurhash`/`placeholder`, `priority`, `cachePolicy`,
`Image.prefetch`, decode-ahead, or memory budget anywhere (grep-confirmed). Thumb vs
card variants chosen statically per surface. One nice request-coalescer: 16ms
dataloader over `POST /photos/strips` (`use-card-photo-strip.ts:11-67`).

**Gap.** MISSING tier. Cards pop from blank to photo; nothing warms images on the
prewarm signal the scene layer already enjoys.

**Cost.** LOW-MEDIUM: standardize on expo-image, `cachePolicy="memory-disk"` +
`priority` at the two recyclingKey sites first, blurhash needs a backend column
(compute at upload in the images pipeline — coordinate with `product/images.md`),
`Image.prefetch` wired to press-in.

### 1.5 Offscreen rendering / suspension

**Norm.** react-native-screens `freezeOnBlur` / React `<Activity mode="hidden">`: hidden
screens keep state but stop rendering and defer effects at low priority. Native apps
suspend offscreen view controllers.

**Us.** Structural suspension by construction: hidden legs' rows simply aren't in the
tree (one list, presented leg only), and the activity object gates data lanes to the
presented leg (`track-entry-activity.ts:27-40`, delivered via contexts at
`use-track-leg-resolver.tsx:306-308`; liveness audit `track-entry-liveness.ts:43-85`
proves delivered==derived). Hidden chrome is opacity-0 + pointerEvents none
(`TrackSheetPage.tsx:1034-1035`) — deliberately not display:none (100ms Yoga relayout,
`:1406-1413`). Home/polls parts hooks DO run on every host render regardless of
presentation (`use-track-leg-resolver.tsx:183-184`) — that's the deliberate "warm data"
story, not a leak.

**Gap.** NONE worth closing. We meet the norm's goal (no hidden work) by a stronger
mechanism (absence, not freezing). `<Activity>` would be a regression here; evaluate it
only for non-track surfaces with no retention story (v1's verdict, kept).

### 1.6 Progressive / priority rendering (above-fold first)

**Norm.** Paint the above-fold shell in the tap frame; stream below-fold and heavy
content in later commits. iOS apps commit the view controller instantly and populate
cells as data lands.

**Us.** This IS the press-up handoff after the D1 correction: every switch defers — the
flip frame paints chrome + (frozen body | skeleton), real rows land next commit at the
rAF boundary (`track-entry-handoff.ts:129-185`, `use-track-leg-resolver.tsx:532-574`).
Honest [PERF] span: press→first-paint + press→real-rows, one anchor
(`track-entry-prewarm.ts:151-216`).

**Gap.** PARTIAL, and this is the honest residual the contract itself names
(`:704-709`): the deferred real-rows commit renders the WHOLE first screenful at once —
there is no row-level progressive fill, and a heavy scene's revisit can still be slow.
The industry's answer is paint residency for >1 screen (the "second lane") or
incremental row mounting. Our architecture rejected the second lane for good reasons
(rival scroll views — "the ancestor of every hard bug of this arc", contract
`:657-659`).

**Leverage/alternative.** ONE TRACK offers a cheaper path than a second live list: a
**snapshot tier**. Because a switch is an atomic data swap under stable chrome, the
outgoing/incoming visuals are perfectly still — capture a native snapshot
(`UIView.snapshotView` / `react-native-view-shot`) of each entry's rows at switch-out,
and let the deferred frame paint the SNAPSHOT (a single image = guaranteed one-frame
paint, exactly the "one body the page can always paint") instead of re-rendering the
frozen list spec. This is what iOS itself does for app-switcher cards and what
snapshot-based navigators do. It makes revisit first-frames O(1) regardless of scene
weight — the thing the second lane was for — without a rival scroll view. The dead
`prepared-snapshot-presentation-architecture-audit.md` chased this with a whole
transaction machine; the track reduces it to "one image per entry, swapped like the
frozen body."

**Cost.** MEDIUM (native snapshot capture + an image row type in the leg resolver +
staleness rules). Only worth it if the revisit measurement (the contract's open number)
shows frozen-body renders are actually slow on heavy scenes. MEASURE FIRST.

### 1.7 Transition choreography norms

**Norm.** For TAB switches, best-in-class apps move NOTHING: no slide, no crossfade —
content swaps in place under persistent chrome (Instagram, YouTube, Maps). Pushes get a
platform slide or a sheet spring; dismissals are user-paced and interruptible; springs
are critically damped; 60/120fps is table stakes.

**Us.** Exactly the norm, and cleaner than most: tab switch = same-commit data swap +
chrome opacity flip, no animation (`TrackSheetPage.tsx:1005-1038`); every postural move
is one critically damped native spring (OA5 — glide universal, teleport unrepresentable);
dismiss is user-paced with swap at the screen-edge τ-crossing (A2/R4); interrupts are
finger-owned (THE FINGER OWNS TAU); frame-rate math measures intervals (F889/F5806);
60fps is a hard requirement held through the red teams.

**Gap.** NONE on mechanics. The owner's punchlist items (strip/choreography "still
bad", memory: track-visual-punchlist) are polish/tuning on this substrate, not a
missing mechanism.

### 1.8 Interaction prediction beyond press-down

**Norm.** Frontier apps predict from scroll velocity (prefetch cells about to appear —
FlashList drawDistance is the crude version), from adjacency (warm the next tab over),
and from likelihood (Instagram's ranked prefetch). Gesture-driven pre-commit: begin
preparing the destination when a back-swipe STARTS, commit or abort at release.

**Us.** drawDistance overscan is tuned (1.6/1.9 below). Nothing else: no adjacency, no
idle warm, no gesture-start speculation.

**Gap.** MISSING, but deliberately low-priority: with 5 residents warm forever and
press-down prewarm, the marginal value of likelihood models is small at our scene
count. The one worthwhile piece is idle-time warm: after boot settles
(InteractionManager idle), touch each resident's primary query once so the FIRST visit
to each tab is data-warm — that plus 1.2's payload closes the owner's "next time you
visit it's still there" for first visits too.

**Cost.** LOW (one idle task calling the same prefetch registry as 1.2).

### 1.9 Skeleton / placeholder norms

**Norm.** The hierarchy: stale content > content-under-cover > skeleton > spinner >
blank. Skeletons appear ONLY on genuinely cold surfaces, shaped like the content,
shimmering L→R (reads faster than pulse, Chung); never on warm revisits — as an
OUTCOME of retention, which is exactly OA8's reframe.

**Us.** The hierarchy is implemented and mostly honest: frozen last-good bodies win
wherever they exist; skeleton is the cold face with per-scene rowType variants
(G-SKEL/OA2); the skeleton-path audit proved the skeleton is near-unreachable BECAUSE
retention works (`plans/skeleton-path-audit.md:7-77`). Known defects, all already
queued/fixed: the 4 blank pending bodies (SceneBodyReadyGate context — FIXED,
uncommitted per audit status note), 6 hardcoded rowTypes + SaveList spec contradiction
(R8, owner-approved), two paint deciders → one paint resolver (R8, owner-approved),
silent spec-excluded fallback (make loud). The ONE live norm violation is the polls
toggle seam: literal bare white for a measured 340–650ms
(`polls-feed-runtime-controller.ts:107-111`; cost admitted in
`plans/strip-wave-finger-test-checklist.md:22`) — bottom of the hierarchy, enforced by
a copied ban (Part 3).

**Gap.** One surface (toggle seam) + the queued R8 hygiene. Shimmer-direction polish is
real but minor.

### 1.10 List virtualization tuning

**Norm.** Tune render-ahead to the VISIBLE window, not the screen; disable MVCP on
re-sortable lists; recycle by type; estimated sizes.

**Us.** Better than most: drawDistance derives from the sheet's actual visible height
(`clamp(round(visibleHeight*0.5), 200, screenH)`, `track-list-window.ts:94-142`,
consumed off settledTau at `TrackSheetPage.tsx:1277-1286`) — a posture-aware overscan
almost nobody bothers with. MVCP disabled (`:1365`). No `estimatedItemSize` — FlashList
v2 doesn't need it.

**Gap.** NONE material.

---

## Part 2 — What ONE TRACK uniquely lends itself to (plain UX terms)

The industry retains SCREENS (native view subtrees). We retain IDENTITY (entry-keyed
state under one scroll view). That inversion makes a family of experiences cheap that
screen-stack apps find hard:

1. **Switches that are literally one frame.** Because a switch is a pointer swap + an
   opacity flip in one commit, there is no navigator transaction, no two containers to
   coordinate, no transition to interrupt badly. Users feel "the content just IS the
   other thing." Screen-stack apps approximate this with animation-duration:0 and still
   pay screen-focus lifecycle.
2. **Posture that never resets.** The sheet's height/detent is τ — one number in one
   scroll view. Switch tabs, push a child, come back: the sheet is where you left it by
   construction, not by resync code. Sheet-per-screen apps fight this forever.
3. **Speculation with no collision risk.** Prewarm adds a leg to a memo; it cannot race
   the live list because there is only one list. Web prefetch has this safety (it
   fetches bytes, not views); native screen-stacks don't (pre-rendering a screen means
   a second live hierarchy). We get web-grade speculative safety in native nav.
4. **Snapshot-based instant revisits are a bolt-on, not an architecture** (1.6): stable
   chrome + atomic swaps mean an entry's pixels are still and capturable at exactly one
   moment. Screen-stack apps need a presentation-transaction machine for this (we built
   and deleted one, 260KB of plan); the track needs an image cache keyed by the entry
   identity we already have.
5. **Session restore falls out of entry identity** (1.1): the whole UI state of "where
   the user was" is a small serializable set of entry keys + offsets + a route stack.
6. **One place to enforce every law.** A11y announcements, skeleton variants, world
   joins, scroll memory — each is one required column or one ledger because there is
   one track. In a screen-stack app each of these is N screens' local discipline.

What it makes HARD (stated honestly, kept from v1): per-screen native view retention
(no second native view exists to freeze), and off-the-shelf shared-element transitions
(no two hierarchies to interpolate between — any hero-motion is custom overlay work
keyed on entry identity; do not sequence before the ladder below).

---

## Part 3 — Where the old plans were led astray

Full lineage: engine-design → pillars → increment-1 → canonical-finish →
canonical-master → final-master → page-switch → page-composition (ONE TRACK) →
world-derivation → residents-cutover → endstate-contract. Eight "canonical/final/
master" docs in six weeks; three superseded within a day of being declared canonical;
supersession banners only retro-added by the 2026-08-03 truth audit.

The recurring failure patterns, each with its exhibit:

1. **Rules written where outcomes belonged.** "No skeleton on revisit" appears in ≥6
   docs (`page-switch-master-plan.md:91`, `toggle-strip-and-edit-charter.md:102`,
   `wave3-conformance-audit.md:34`, `wave2-finger-test-checklist.md:36`,
   `toggle-strip-rebuild-ledger.md:416`, `wave3-corrections-charter.md:57`), copied
   never re-derived; one doc measured the enforcement cost (340–650ms bare white,
   `strip-wave-finger-test-checklist.md:22`) and deferred anyway. OA8 corrected this
   ~4 months late. The toggle seam still pays it today. And
   `canonical-transition-finish-plan.md:124` sanctioned SPINNERS ("no skeletons
   needed") — the doctrine drifted against itself.
2. **Architecture-scale plans for one-line bugs.** `canonical-transition-finish-plan.md`
   Phase 5 self-documents that the whole revealRoute/childAnchor architecture was
   unneeded — the fix was one missing `prepareSearchSessionEntry` call (`:139-146`).
3. **Acceptance gated on evidence that didn't exist.** `canonical-sheet-transition-
   master-plan.md` gated phases on the `[lodev]` harness — which never existed in the
   repo. Plans passed on unrunnable checks.
4. **Primitives orphaned by substrate swaps.** `child-transition-primitive.md`'s
   SceneBodyReadyGate resolved its scene from a context only the OLD host provided;
   when the track became default, four scenes rendered blank for months
   (`skeleton-path-audit.md:89-108`). Pattern: land a primitive, replace the floor
   under it, never re-home it. R8's whole reason to exist.
5. **Dead vocabulary kept "for stability."** The crossfade was correctly retired
   (`transition-engine-final-master-plan.md:27-40`, the 0.75-midpoint leak) but its
   three-mode ContentMode union was kept, confusing the next month of planning.
6. **The biggest doc was the deadest.** `prepared-snapshot-presentation-architecture-
   audit.md` (260KB): 94 of 211 modules it asserts in the present tense don't exist;
   the machine was deleted wholesale. Yet its INSTINCT (snapshot-based presentation)
   was frontier-correct — it failed on mechanism (a transaction machine) not on goal;
   1.6 shows the track makes the goal cheap now.
7. **Fixing the case nobody complained about.** The press-up handoff D1 correction
   (contract `:682-709`): the first cut keyed the exemption on paint HISTORY, so every
   revisit — the measured complaint — still blocked. Metric D2 would have gone green
   by definition. Both were caught by independent audit, not by the rung's own tests.
8. **The data layer was never planned at all.** Zero mentions of staleTime/gcTime
   policy, cache persistence, or image prefetch across the ENTIRE arc until this
   audit. Every plan fought at the render layer while the layer below (data) and above
   (images) stayed at framework defaults. This is where the frontier gap actually is.

Where the planning was RIGHT and the industry confirms it: hard-swap over crossfade;
seats/policy-as-data; one motion primitive; entry identity; killing the second list
lane; measuring composited output not intent.

---

## Part 4 — Ranked get-to-frontier plan (leverage ÷ cost)

Measure-first note: items 5–6 are gated on the contract's own open measurement
(revisit press→real-rows on device); 1–4 need no measurement to justify.

1. **Toggle-seam SWR (kill the bare white).** The one norm violation a user hits daily.
   `polls-feed-runtime-controller.ts` already has skipSpinner/old-rows-stand for every
   other refetch path; route the toggle through it. Before/after number already exists
   (340–650ms → 0). Retire the six-doc ban text in the same commit. LOW cost, HIGH felt.
2. **React-query policy + defaults.** One `defaultOptions` block (staleTime 30–60s,
   gcTime ≥ 24h for track-hosted panels), one written policy page, collapse the ad-hoc
   per-panel values into it. Makes "warm revisit" true end-to-end instead of
   scene-state-only. LOW cost, HIGH felt (silent refetch storms disappear).
3. **Prewarm payload: data + images on the existing signals.** A scene→prefetch
   registry drained by the SAME press-down prewarm; `onPressIn` prefetch on card rows
   (pollId/restaurantId known at press-down); idle-time warm of resident primaries
   after boot (1.8). LOW-MEDIUM cost, HIGH felt on first visits and child pushes.
4. **Image pipeline pass.** expo-image everywhere, `cachePolicy="memory-disk"` +
   `priority` at the recyclingKey sites first, `Image.prefetch` from the registry in
   (3), blurhash column when the images pipeline is next touched. LOW-MEDIUM cost,
   MEDIUM-HIGH felt (photos stop popping).
5. **Persisted query cache (the disk tier).** `persistQueryClient` + MMKV, app-version
   buster. Cold launch paints last-session content like every comparable app. MEDIUM
   cost. Sequence after (2) so persistence persists a tuned cache, not staleTime:0.
6. **Cold-launch session restore.** Persist route stack + entry scroll offsets at
   background; replay at boot through revealRoute + existing scroll memory. MEDIUM
   cost. Pairs with (5) — restoring position without data is a skeleton parade.
7. **Snapshot tier for revisit first-frames (conditional).** Only if the device
   measurement shows heavy-scene revisits still slow after 1–5: per-entry native
   snapshot painted in the deferred frame (1.6). MEDIUM cost, replaces the rejected
   second-lane rung at a fraction of its risk.
8. **R8 + one-paint-resolver (already owner-approved).** Not frontier work but the
   hygiene that keeps the skeleton/frozen decision one honest mechanism; the six
   rowTypes and the SaveList ruling ride along. Scheduled independently of this audit.
9. **Shimmer direction + skeleton polish.** L→R shimmer, loud spec-excluded fallback.
   LOW cost, LOW felt — ride along with (1).
10. **Shared-element hero motion.** Custom, entry-identity-keyed overlay work; the one
    frontier item our architecture makes HARDER. Someday-list; prove appetite on one
    surface (restaurant card → restaurant sheet) before generalizing.

---

## Part 5 — The five gaps a user actually FEELS

1. **Alice flips Live↔Results on the polls tab and the sheet goes blank-white for
   half a second** — the only moment in the app where switching shows *nothing*. Every
   other switch shows the old content until the new is ready. (Fix: ladder #1.)
2. **Bob visits Profile, hops to Lists, comes back 6 minutes later — and watches his
   own profile refetch from the network** behind a frozen frame, sometimes with fields
   flickering as they revalidate. The track remembered his screen; the data cache
   forgot his data. (Fix: #2.)
3. **Carol presses a poll card and the thread arrives, but the comment data starts
   fetching only AFTER her finger lifts** — the ~200ms her press-down window offered
   is thrown away, and the avatars pop in cold after that. (Fix: #3 + #4.)
4. **Dan force-quits at night; in the morning the app opens to a cold root with
   skeletons everywhere** — Instagram would have shown him last night's feed
   instantly and refreshed it silently. We have no disk tier and no restore. (Fix:
   #5 + #6.)
5. **Eve returns to a heavy, photo-dense screen and the flip is instant but the rows
   take a beat to arrive** — the deferred frame shows the frozen body, then the real
   rows re-render as one big commit. Usually fine; on the heaviest scenes it's the
   residual slowness the contract already flagged. (Measure; fix with #7 only if the
   number says so.)

**Bottom line.** The track itself is at or ahead of the frontier on every switching
mechanic that the arc actually planned — retention model, press-down prewarm trigger,
choreography, suspension, virtualization, skeleton honesty. The gaps are the layers the
arc never planned: the DATA tier (untuned, unpersisted), the IMAGE tier (unprimed), one
copied-ban surface (toggle seam), and session restore. All four are cheap relative to
what's already built, and three of them bolt onto signals and identities the track
already provides.
