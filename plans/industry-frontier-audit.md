# Industry-Frontier Audit — bottom-sheet navigation (track)

Mandated by OA8 (`plans/transition-endstate-contract.md:798-802`): are we using the
strategies best-in-class apps use for screen switching; what does our architecture
uniquely enable; where did old plans write rules the industry treats as outcomes;
what's the plan to the frontier.

Sources cited inline: react-native-screens (`detachInactiveScreens`, `freezeOnBlur`),
React 19.2 `<Activity>` (react.dev), TanStack Query stale-while-revalidate defaults
(tanstack.com), FlashList v2 (shopify.engineering), instant.page prefetch canon,
Next.js `Link` prefetch, RN `Pressable` feedback-delay issue (facebook/react-native#29376),
Bill Chung skeleton-perception research (uxdesign.cc), expo-image docs, Apple
`UISheetPresentationController`, Airbnb motion-engineering.

---

## Part 1 — Gap table by switch type

| Switch type | Industry norm | What we do (file:line) | Gap | Verdict |
|---|---|---|---|---|
| **parent↔parent** (tab↔tab) | react-navigation keeps inactive tab screens mounted (`detachInactiveScreens=false` on tabs); RN default does NOT freeze the top-2 stack screens so back-swipe always finds a live screen | Resident chrome stack: all top-level layers mounted, opacity-flipped on the same commit as the switch — `plans/transition-endstate-contract.md:539-541`, `:216-217`. Top-level tab = one entry forever, chrome pins to `scene#root` — `:297-310` | We match/exceed the norm: react-navigation still pays a *screen-focus* transition; ours is an opacity flip on already-mounted layers | **AHEAD** |
| **parent→child** (push into a detail/thread) | `react-native-screens` mounts the new screen and animates in; no native prefetch-on-touch-down analogue exists for RN nav — that's a web-only pattern (instant.page, Next `Link`) | Press-DOWN prewarm: `onPressIn` → `requestTrackScenePrewarm` — `apps/mobile/src/screens/Search/components/SearchBottomNav.tsx:86-88`, consumed at `use-track-leg-resolver.tsx:398-426` (adds the leg to `legs` memo, builds chrome/title/skeleton renderer early) | None — this is the instant.page 65ms-touchstart canon, applied to native nav, which the RN ecosystem does not do natively | **AHEAD of RN norm, AT-PAR with web-prefetch canon** |
| **child→child** (thread→thread, card→card at same depth) | React Query stale-while-revalidate: cached data renders instantly, background refetch is silent (tanstack.com "important defaults") | Depth-3 LRU retention (`track-entry-retention.ts:16`, `TRACK_CHILD_RETENTION_DEPTH=3`) + entry-keyed `lastGoodListRef` frozen-body fallback (`use-track-leg-resolver.tsx:666`, `:618-621`) — but EVERY switch's destination is non-resident by construction (`track-entry-handoff.ts:57-58`: "the destination of ANY switch is non-resident, so EVERY switch defers"), so the first frame after a switch is always a deferred frozen/skeleton frame, never the resident view itself | The mechanism is SWR-shaped (frozen last-good stands in for cache), but our `staleTime` census (Part 4b) shows we never tuned the data layer to match — most panel queries either default to `staleTime:0` or use ad-hoc per-panel values (60s/30s/300s) with no shared policy | **PARTIALLY AHEAD** — retention beats RN screens' un-keyed detach; data freshness policy is unbuilt |
| **deep nesting** (3+ levels) | React Query `gcTime` (default 5 min) bounds how long anything off-screen survives; `<Activity>` (React 19.2) explicitly recommended for pre-rendering "likely next" screens at low priority | Depth-3 LRU with an explicit eviction sweep that deletes retained entry/title/strip/renderer/readiness/residency/`lastGoodList` but **scroll memory deliberately survives eviction** (`use-track-leg-resolver.tsx:467-477`) | RN screens has no per-screen retention depth at all (native-view GC is OS-driven); we have an explicit, tuned K=3 with a scroll-memory exception carved out on purpose | **AHEAD** — a bespoke retention policy RN doesn't offer |
| **backward** (pop back) | `react-native-screens` freeze integration deliberately does NOT freeze the top two stack screens, "so back-swipe always has a live previous screen" — platform norm is "previous screen stays warm" | Same depth-3 retention + frozen last-good body serves backward switches identically to forward ones — no special-cased "previous screen" path; OA8 explicitly reframes this as the *intended* outcome (`:798-802`) | None structurally; the open item is Part 3's rules-as-bans, which used to force this warmth to hide itself | **AT-PAR, now correctly unblocked by OA8** |

**Where we're uniquely ahead, restated:** press-down prewarm on `onPressIn` *is* the
instant.page touchstart canon applied to native tab navigation, something
react-navigation does not do by default. Entry identity (`sceneKey#entryId`) plus
depth-3 LRU plus scroll-memory-surviving-eviction is a strictly richer retention model
than `detachInactiveScreens`, which is a binary per-screen flag with no depth budget.
The frozen-last-good-body mechanism (`use-track-leg-resolver.tsx:618-621`,
`track-entry-handoff.ts:606`) *is* "stale pixels beat a skeleton," the top of the
show-something hierarchy from the choreography research — implemented at the
scene-body layer, independent of whether the data layer (React Query) is tuned to
match it.

---

## Part 2 — The leverage question: ONE TRACK

The contract's core move (`plans/transition-endstate-contract.md:23-41`) is a single
scroll view where τ *is* the scroll offset — every scene is a row in one continuous
track, not a stack of independently-mounted screens. This inverts the industry's unit
of retention:

- **react-native-screens retains at the VIEW layer** — a screen is a native view;
  `detachInactiveScreens`/`freezeOnBlur` decide whether that view stays attached/live.
  The retained thing is a subtree of native views.
- **Our track retains at the STATE layer** — `sceneKey#entryId` keys a bundle of
  readiness/scroll-position/last-good-rows/title/chrome state
  (`plans/transition-endstate-contract.md:169-177`), and the mounted renderer is
  rebuilt from that state on demand (`use-track-leg-resolver.tsx:260-337`).

**What this makes uniquely cheap:**
- **Single-frame data swaps.** Because there is one scroll view and one presented-entry
  pointer, a switch is a pointer update plus an opacity/paint-residency handoff on the
  SAME commit (`track-entry-handoff.ts:129-148` decision tree; rAF release at
  `use-track-leg-resolver.tsx:561-574`) — never a navigator transaction spanning two
  independently-animating screen containers.
- **Posture preserved by construction.** τ-as-scroll-offset means the sheet's
  collapsed/expanded posture is never a separate piece of state to resync after a
  switch — it falls out of the one scroll view's offset (`:147-157`, `:341-348`). RN
  screens has no analogous guarantee; posture (e.g. modal presentation style) is
  re-derived per screen.
- **Press-down speculative work is cheap and safe.** Because prewarming a resident leg
  only adds it to a memo (builds chrome/skeleton/title state) rather than mounting a
  second competing scroll view, it can't race the active list — the rejected
  alternative in the contract explicitly names "a second mounted list lane... the
  ancestor of every hard bug of this arc" (`:652-659`). instant.page's touch-down
  prefetch has no such collision risk to avoid in the first place (it prefetches an
  HTTP response, not a live scrollable render), so our architecture had to solve a
  harder version of the same idea and did.

**What this makes hard:**
- **Per-screen native view retention** (react-native-screens' actual mechanism) isn't
  available — there is no second native view to detach/freeze; everything lives inside
  the one FlashList, and hidden mounted bodies are "structurally unmounted" on the
  one-list page per the contract's own honesty note (`:331-334`). This is why MVCP is
  disabled unconditionally track-wide (`TrackSheetPage.tsx:1365`) rather than per-scene
  like the polls feed — there's only one list to configure, not N screen-owned lists.
- **Shared-element continuity** (SwiftUI `matchedGeometryEffect`, Reanimated
  `sharedTransitionTag`) assumes two independently-mounted screens with a geometry
  interpolation between them. In ONE TRACK, "child→parent" isn't two screens
  crossfading, it's a re-presented row in the same list — there's no natural anchor for
  an element to fly between two separate view hierarchies, because there aren't two.
  Any shared-element move here has to be built as a custom overlay animation keyed to
  the same entry-identity system, not adopted off the shelf from either platform's
  primitive (flagged honestly in Part 4e).

---

## Part 3 — Rules written as outcomes in old plans

OA6.1 is the known case (`:287-295`, reframed by OA8 at `:778-802`: "warm revisits are
an OUTCOME, not a ban... the no-skeleton-on-revisit behavior was never a RULE to
enforce — it was the natural OUTCOME of an industry-best-practice implementation").
Grepping `plans/` for the same species (loading/preload/retention phrased as
prohibition rather than as a measured consequence) turns up more:

| file:line | rule as written | should be read as |
|---|---|---|
| `plans/page-switch-master-plan.md:91` | "retained round-trip (Favorites→Profile→Favorites) shows content both times, **no skeleton blink**" | Outcome of retention working, not a ban to enforce independent of whether retention actually holds — this is OA6.1's direct ancestor |
| `plans/toggle-strip-and-edit-charter.md:102` | "NO skeleton sheet between toggle-driven slices" | Currently implemented as literal bare-white (`isFeedSliceAwaiting`, `polls-feed-runtime-controller.ts:107-111`) — the ban is enforced even though SWR (frozen old rows, not blank) is the industry outcome the retention story elsewhere claims to want |
| `plans/strip-wave-finger-test-checklist.md:22` | "(bare white between, never a skeleton). Measured gap ~340-650ms — decide later" | This one **admits the cost in writing** and defers the decision — a live TODO, not settled doctrine; it is the strongest evidence the "never a skeleton" phrasing was never actually validated against the stale-pixels-beat-blank hierarchy |
| `plans/wave3-conformance-audit.md:34`, `plans/wave2-finger-test-checklist.md:36`, `plans/toggle-strip-rebuild-ledger.md:416`, `plans/wave3-corrections-charter.md:57` | variations of "no skeleton, ever" for the toggle seam | Same rule restated four times across four docs — the ban propagated by copy, not by re-derivation from outcome |
| `plans/canonical-transition-finish-plan.md:124` | "No skeletons needed (restaurant has a SquircleSpinner...non-blank)" | A DIFFERENT and inconsistent outcome — sanctions spinners, which the choreography hierarchy (stale pixels > skeleton > spinner > blank) ranks BELOW skeletons; shows the doctrine drifted even within itself |

**Net finding:** the "no skeleton on a warm path" instinct appears independently in at
least six documents. Every one of them writes it as a *rule to satisfy* rather than a
*measurement to take* — and one of them (`strip-wave-finger-test-checklist.md:22`)
explicitly logs the actual user cost (340–650ms of bare white) of over-literally
enforcing it, which is worse for the user than the skeleton it was written to prevent.
The toggle seam is the one place today where the letter of an old ban is actively
producing a WORSE outcome than the pattern it was trying to protect.

---

## Part 4 — Sequenced ladder to the frontier

Ordered by (a) how directly it changes what a user sees, (b) how cheap it is given
what Part 2 already made cheap.

**(a) Stale-while-revalidate at the feed layer — HIGH payoff, LOW cost.**
The toggle seam (`isFeedSliceAwaiting`) is the one place in the audited surfaces that
still shows bare white instead of the retained-row pattern the rest of the system
already uses (frozen last-good body). `polls-feed-runtime-controller.ts` already HAS
the SWR mechanism for every other refetch path (`skipSpinner`, old rows stand while
new ones load, `:521-522`) — the toggle path is the one spot that deliberately
bypasses it per the ban in Part 3. Fix is in-pattern with code that already exists
elsewhere in the same file; the 340–650ms gap the team already measured becomes the
before/after number.

**(b) staleTime/gcTime tuning — MEDIUM payoff, LOW cost.**
Every query without an explicit override runs on the RQ v5 default (`staleTime: 0`,
`gcTime: 5min`) — confirmed by reading `App.tsx:71-88` (no `defaultOptions`). Only one
`gcTime` is configured anywhere in the app (`profileSceneQueryOptions.ts:33`, 10 min).
This is directly undercutting the track's own retention story: the track can keep an
entry's SCENE state (scroll position, readiness, frozen rows) alive for a depth-3
window, but the underlying React Query cache backing that panel's data can garbage
collect in 5 minutes regardless — a revisit inside the retention window can still
trigger a full network refetch behind the frozen body. Raising `gcTime` on
track-hosted panel queries to match or exceed the retention depth's typical dwell time
closes that mismatch; this is exactly TanStack's own documented "mobile apps should
raise defaults" guidance.

**(c) blurhash/expo-image priming — MEDIUM payoff, LOW-MEDIUM cost.**
Zero `blurhash`, zero `priority`, zero `cachePolicy` anywhere in the app (confirmed by
grep). `recyclingKey` is set in exactly two places (`PhotoStrip.tsx:140`,
`ListsPanel.tsx:148`) but nothing else expo-image offers is used. Nothing in
`tracksheet/` renders an image directly — all imagery lives in panel bodies, so the
track's prewarm has no image-warming hook. Cards currently pop from nothing to loaded
photo with no placeholder; a blurhash on card/list images plus `Image.prefetch` fired
from the same `onPressIn` prewarm signal that already exists (`SearchBottomNav.tsx:86-88`)
would extend the "instant.page canon" already built for scene state to images too —
this is genuinely free to wire onto an existing trigger.

**(d) Shimmer style per perceived-duration research — LOW payoff, LOW cost.**
Bill Chung's finding is that L-to-R shimmer reads as shorter than a pulse for the same
actual duration. Since the skeleton-path audit found the skeleton window is
"structurally near-unreachable" for 12 of the scenes and reachable for ~1 frame
elsewhere (`plans/skeleton-path-audit.md:9-21`), this only matters for the
still-real skeleton windows (published-lane family: pollDetail/pollCreation/restaurant)
and the toggle seam once (a) replaces its bare white with a real skeleton or SWR frame.
Worth doing alongside (a), not before it.

**(e) Child→parent shared-element continuity — SPECULATIVE, flag experimental honestly.**
Reanimated's `sharedTransitionTag` is still experimental behind a Fabric flag (4.2+);
SwiftUI `matchedGeometryEffect` is the native benchmark but has no RN equivalent at
production maturity. Per Part 2, ONE TRACK doesn't have two independently-mounted
screens to interpolate between, so even a mature library primitive wouldn't drop in —
this would be custom-built on entry identity, is high-cost, high-risk (the reject
history in the contract at `:652-659` shows this codebase has already burned time on a
structurally similar idea — a second competing render lane — and rejected it). Do not
sequence this before (a)-(d); it's a "someday, prove the library first" item, not a
near-term move.

**(f) `<Activity>` / freeze evaluation for NON-track surfaces only — LOW urgency, scoped.**
React 19.2's `<Activity>` (hidden preserves state, low-priority re-render, ~2x memory)
is the closest first-party analogue to what the track already does by hand for scene
state. It should NOT be evaluated for the track itself — the track's bespoke
entry-identity + depth-3 retention + frozen-body system is more precise than
`<Activity>`'s coarser hidden/visible binary, and replacing hand-tuned machinery with a
generic primitive here would be a regression, not an upgrade. It's worth evaluating
for surfaces OUTSIDE the track that have no retention story at all today (e.g. modal
overlays, standalone non-sheet screens) where the memory cost is easy to bound and
there's no existing bespoke system to disturb.

---

## Part 5 — Top 5 moves, by user-felt payoff

1. **Fix the toggle seam's bare-white gap (4a).** A user switching Live↔Results
   currently sees ~340–650ms of blank space where every other switch in the app shows
   retained content. This is the single largest, already-measured, already-in-pattern
   fix available — it makes the toggle behave like every other switch already does.

2. **Raise `gcTime` on track-hosted queries (4b).** Right now a user can revisit a
   panel inside the track's own retention window and still eat a full network
   refetch, because the data cache expires faster (5min default) than the scene state
   the track is holding onto. Fixing this makes "warm revisit" true end-to-end, not
   just at the scene-state layer — closes the exact gap OA8's ruling assumes is
   already closed.

3. **Wire image prefetch onto the existing press-down signal (4c).** The prewarm
   trigger that already makes scene switches feel instant (`onPressIn`) does nothing
   for the photos inside those scenes today. A user who presses a tab currently gets
   instant scene state but photos still pop in cold — extending the same trigger to
   `Image.prefetch` + blurhash closes the last visible "it just appeared" moment on a
   prewarmed screen.

4. **Retire the toggle seam's "never a skeleton" ban text once (1) ships (Part 3).**
   Not a runtime change — a documentation change that stops six different plan files
   from re-deriving a rule that was already shown to cost the user 340-650ms of blank
   space. Prevents the next feature from copying the same ban into a seventh document.

5. **Add `priority`/`cachePolicy` tuning to the two existing `recyclingKey` sites
   (4c, smaller half).** `PhotoStrip.tsx:140` and `ListsPanel.tsx:148` already do image
   recycling correctly; they're the cheapest place to prove out `priority="high"` +
   `cachePolicy="memory-disk"` before rolling it wider, with a fast, low-risk
   before/after on scroll-in image pop.

**Summary:** the track's own machinery — entry identity, depth-3 retention with
scroll-memory-surviving-eviction, frozen-last-good bodies, and press-down prewarm — is
already at or ahead of what react-native-screens and the web's prefetch-on-intent
canon offer, and OA8 correctly recognized that the old "never show a skeleton on
revisit" phrasing was describing an outcome of that machinery, not a rule to chase
independently. The real gaps are one layer up and down from that machinery: the
React Query cache backing panel data isn't tuned to match the retention window it
sits behind (staleTime/gcTime), images have zero priming despite a ready-made trigger
to hang it on, and one surface (the toggle seam) still enforces the literal old ban
with a measured, admitted cost instead of using the SWR pattern already proven
elsewhere in the same file.
