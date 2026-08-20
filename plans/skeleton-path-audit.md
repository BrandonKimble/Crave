# Skeleton-path audit — why you have never seen a skeleton sheet (2026-08-08)

> **FIXES LANDED (noted 2026-08-19, plans reconciliation).** This audit's findings were
> executed by d3f48d685 (pending mounted bodies paint skeleton), 018542e8e (skeleton with
> a face), b4a24c645 (one skeleton instance press→reveal). NOTE: the owner's 2026-08-07
> "skeleton never seen" verdict PREDATES these fixes and was never re-tested — the
> re-test rides the track-visual punchlist (v16 roadmap Phase 6, owner checkpoint ⑥).
> Residual: the 'history' preset spec-contradiction ruling (line ~246), partly addressed
> by f8a21b7d4.

Full read of the tracksheet skeleton machinery, the old host's skeleton legs, every
`SceneLoadingSurface` consumer, and the contract (G-SKEL / OA2 / OA6.1 / R2 / handoff
correction). All paths absolute under `/Users/brandonkimble/Crave/Crave/apps/mobile/src/`.

## VERDICT (question 1): the observation is CORRECT and the machinery is mostly correct

**The track skeleton is structurally near-unreachable for every scene in normal use, and
that is largely by design (OA6.1 + "ready = a body resolution exists, not rows"), plus one
genuine reachability hole (prewarm/hidden legs pre-freezing a "last-good" body) and one
genuine live BUG (four scenes' pending faces render BLANK on the track).** It is not two
rival systems double-painting; the old system is genuinely dark behind the flip. It is one
canonical-ish path whose gates compose so that the skeleton window is 0–1 frames.

### The gate chain, traced through the real runtime

The only track-skeleton painter is `rendererForSkeleton` in
`tracksheet/use-track-leg-resolver.tsx:334-359`, reached from `resolveLegList` on exactly
two branches:

**Branch A — readiness phase 'skeleton' (`use-track-leg-resolver.tsx:602-618`).**
`readinessLedgerRef.present(entry, isResolutionReady(resolution))` returns 'skeleton' only
when the entry's resolution is `{kind:'none'}` AND never latched
(`track-entry-readiness.ts:56-62`). Compute per scene family
(`resolveLegBodyPlan`, `use-track-leg-resolver.tsx:500-512` + `track-leg-plan.ts`):

- **Mounted-body scenes (12 of them: lists, profile, saveList, userProfile, listDetail,
  followList, notifications, settings, editProfile, postPhotos, messagesInbox, dmSession)**
  — resolution is `{kind:'mounted'}` the instant the scene key exists, because
  `sceneUsesMountedTrackBody` is a compile-time table read
  (`scene-foundation-spec.ts:813`) and the component map is static
  (`use-track-leg-resolver.tsx:99-114`). `resolutionHasRealRows` counts 'mounted' as rows
  (`track-entry-readiness.ts:41-42`). **Branch A can NEVER fire for these scenes.** Their
  loading is delegated to the panel's own face (PageBodyShell / SceneBodyReadyGate) — see
  the bug below.
- **Parts scenes (home, polls, search)** — `usePollsPanelListSceneParts` /
  `useHomePanelListSceneParts` run on EVERY host render
  (`use-track-leg-resolver.tsx:183-184`) and always return a `surfaceKind:'list'` spec
  (rows may be zero, but "a published list with zero rows is the scene SPEAKING" —
  `track-entry-readiness.ts:9-17`). Resolution is `{kind:'list'}` from the first commit.
  **Branch A never fires for home/polls/search.**
- **Published-lane scenes (pollDetail, pollCreation, restaurant)** — the only family where
  `{kind:'none'}` is real: a cold push before the scene-input writer publishes (or an
  entry-stamp mismatch, `use-track-leg-resolver.tsx:222-225`). But the writers run
  app-wide in `AppRouteSceneInputWritersRuntimeHost` and publish a spec whose own
  ListEmptyComponent is already a skeleton (RestaurantPanel:880 seeds
  `SceneLoadingSurface rowType="dish"`; PollDetailPanel:1281 renders its comment
  skeleton), so the window is typically one commit. **Branch A is reachable here for ~1
  frame** (correct variant per spec: pollDetail/pollCreation 'comment', restaurant 'dish').

**Branch B — the handoff frame (`use-track-leg-resolver.tsx:572-600`).**
`planTrackEntryHandoff` returns 'defer' only when the destination HAS real rows and is
non-resident, non-world-join, with an outgoing paint (`track-entry-handoff.ts:129-148`).
The deferred frame paints `lastGoodListRef.get(entry)` if present, skeleton only if not
(`:590-600`). Two facts kill the skeleton here:

1. **Hidden/prewarmed legs write `lastGoodListRef` before ever being presented.**
   `resolveLegList` runs for EVERY leg every commit (the `legs` memo maps all residents +
   retained children, `:668-694`) and line 656 `lastGoodListRef.set(legEntryKey, list)` is
   unconditional for phase-'content' legs. A resident tab (polls, lists, profile…) mounts
   its leg at nav press-DOWN via prewarm (`SearchBottomNav.tsx:87` →
   `track-entry-prewarm.ts`), builds its list in that early commit, and freezes it — so by
   press-up the handoff frame finds a frozen body **even on the very first visit**. The
   OA6.1 comment says "the skeleton is only ever the body of an entry that has never had
   one" — but "had one" is effectively "was ever RESOLVED while hidden," not "was ever
   SHOWN," which makes the handoff skeleton unreachable for all resident scenes.
2. **Mounted children (cold push to settings, userProfile, dmSession…)** — fresh entryId,
   no lastGood → the handoff frame DOES paint the skeleton… for exactly one rAF
   (`:551-564` releases at the paint boundary). 8–16 ms. Below perception.

**So: the only humanly-visible skeleton would be a published-lane child whose writer is
slow — and the writers publish their own pending faces immediately.** The owner's "never
seen it" is the computed behavior, not a mystery. Note also that he likely HAS seen the
same visual material many times without recognizing it as "the skeleton flow" — the
panels' own pending faces (PageBodyShell, HomePanel/PollsPanel empty components,
Restaurant seed) are all the identical `SceneLoadingSurface` cutout-shimmer.

**Is it mis-gated or dead weight? Both, in parts:**
- The machinery is NOT dead weight: it is the mandated cold-push face for the
  published-lane family and the handoff's "one body the page can always paint"
  (contract, handoff checkpoint). Deleting it would violate G-SKEL/OA2 and the owner's
  "if they're not ready we use the skeleton flow" ruling.
- It IS mis-gated in one place: for the 12 mounted scenes the track deliberately does not
  reach in ("its internal loading is the scene's declared state" —
  `track-entry-readiness.ts:38-40`), so the skeleton flow for the majority of the app is
  actually the PANEL-side faces — and one of those is broken (next section).

## THE ONE LIVE BUG: blank pending bodies on the track (4 scenes)

`SceneBodyReadyGate` resolves its scene through `SceneBodySceneKeyContext`
(`overlays/SceneBodyReadyGate.tsx:48-66`), and the ONLY provider of that context is the
OLD host — `overlays/BottomSheetSceneStackHost.tsx:976`. On the track path,
`rendererForMountedEntry` (`use-track-leg-resolver.tsx:268-324`) mounts bodies with
activity contexts + `SceneBodyFoundationSurface` but **no SceneBodySceneKeyContext**. So
every `<SceneBodyReadyGate pending>` inside a track-mounted body resolves `material ==
null` and **returns null — a blank body while pending** (plus the `[FOUNDATION]` dev
bark). Affected call sites:

- `overlays/panels/EditProfilePanel.tsx:194`
- `overlays/panels/FollowListPanel.tsx:67`
- `overlays/panels/MessagingPanels.tsx:153` (inbox) and `:477` (DM session)

This is exactly the owner's "mixed non-canonical implementation" suspicion, confirmed:
these four scenes migrated their pending gate to the leg-6 primitive but the primitive's
scene resolution was never re-homed when the track became the default host. (Panels that
use `PageBodyShell` instead — profile, lists, listDetail, userProfile, notifications —
are fine: the spec carries `scene` inline, `overlays/PageBodyShell.tsx:64,145,194`.)

## DOUBLE-PATH CENSUS (question 2)

| # | Loading face | Where | Alive? | Path |
|---|---|---|---|---|
| 1 | Track cold/handoff skeleton (`rendererForSkeleton`) | `use-track-leg-resolver.tsx:334-359` | ALIVE (rarely visible, see above) | track (default) |
| 2 | Track frozen last-good body | `use-track-leg-resolver.tsx:590-611` + readiness ledger | ALIVE, the face that usually wins | track |
| 3 | PageBodyShell pending/appending material | `overlays/PageBodyShell.tsx:67-117,146-210` | ALIVE — profile, lists, listDetail, userProfile, notifications, childScenes | track (inside mounted bodies) |
| 4 | SceneBodyReadyGate pending material | `overlays/SceneBodyReadyGate.tsx:53-77` | **BROKEN on track (renders null)**; worked only under old host | track (editProfile, followList, messagesInbox, dmSession) |
| 5 | HomePanel cold face `SceneLoadingSurface rowType="tile"` as ListEmptyComponent | `overlays/panels/HomePanel.tsx:589` | ALIVE | track (parts lane) |
| 6 | PollsPanel: expanded skeleton / collapsed spinner / **bare-white toggle-gap null** | `overlays/panels/PollsPanel.tsx:690-707` | ALIVE (bare-white gap is owner-ratified, charter Part 3) | track (published lane wins for polls) |
| 7 | RestaurantPanel seed skeleton (`rowType="dish"`, ListEmptyComponent) | `overlays/panels/RestaurantPanel.tsx:825,843-880` | ALIVE | track (published lane) |
| 8 | PollDetailPanel comment skeleton | `overlays/panels/PollDetailPanel.tsx:1281` | ALIVE | track |
| 9 | SaveListPanel `rowType="history"` while lists load | `overlays/panels/SaveListPanel.tsx:492` | ALIVE — **rowType disagrees with its spec row ('tile', `scene-foundation-spec.ts:393`)** | track |
| 10 | RESULTS_LOADING_EMPTY_COMPONENT (search results list empty) | `screens/Search/runtime/shared/search-results-loading-empty-component.ts:19` | ALIVE (published into the search leg) | track (search composition, spec-excluded by design) |
| 11 | Search per-band appending skeleton | `screens/Search/runtime/read-models/use-search-results-list-render-item-runtime.tsx:27` | ALIVE | track |
| 12 | RecentHistoryView history skeleton | `screens/Search/RecentHistoryView.tsx:428` | ALIVE | track |
| 13 | OLD host S2 skeleton leg | `overlays/BottomSheetSceneStackHost.tsx:936-965` | **DEAD by default** (only under flip-off) | old |
| 14 | OLD host P5 never-null search skeleton page | `overlays/SearchMountedScenePageBundleAuthority.tsx:348-362` | **DEAD by default** | old |
| 15 | ListDetail world-backed pending → PageBodyShell | `overlays/panels/ListDetailPanel.tsx:1803-1851` | ALIVE (world-join owns reveal; handoff exempts it, `track-entry-handoff.ts:141`) | track |

**Does any old-system skeleton code execute today?** No. The flip default is
`on: true` (`tracksheet/track-flip-store.ts:29`) and the entire old sheet subtree —
`SearchOverlayRouteGateHost` → `SearchOverlayRouteSheetSurfaceHost` →
`SearchRouteSceneStackBottomSheetSurfaceHost` → `BottomSheetSceneStackHost` (faces #13,
#14, and the only `SceneBodySceneKeyContext` provider) — renders only when
`trackFlip.on` is false (`overlays/AppOverlayRouteHost.tsx:84-88`). No same-scene
double-paint is reachable. BUT the old system's death left a live dependency dangling
(face #4's context), which is the concrete harm of "R8 never ran."

## DOUBLE-WRITING / NON-CANONICAL SHAPE (question 3)

1. **Two skeleton paint deciders on the track.** The readiness ledger
   (`present()`, one decision) and the handoff branch (which deliberately bypasses the
   ledger, `use-track-leg-resolver.tsx:572-600`) both independently decide
   skeleton-vs-frozen. The contract itself already flags this: the "one paint resolver"
   item was **displaced, not done** (contract CORRECTION 2026-08-08, lines 485-497) and
   the handoff is the "FOURTH paint decision" added to that glue. Queued for R8; real.
2. **Six call sites hardcode a rowType instead of `resolveSceneLoadingMaterial`** —
   HomePanel:589 ('tile'), PollsPanel:702 ('restaurant'), PollDetailPanel:1281
   ('comment'), RestaurantPanel:825/846 ('dish'), SaveListPanel:492 ('history'). Five
   happen to agree with the spec; **SaveListPanel disagrees** (spec says 'tile'). Search
   surfaces (#10-12) are legitimately outside the spec ('search' is excluded by design).
   OA2 says "never a hardcoded rowType"; these are exactly that, and the SaveList
   mismatch is the proof of why.
3. **Silent spec-excluded fallback**: `trackSkeletonMaterialForScene` substitutes
   `{rowType:'restaurant'}` for any spec-excluded scene
   (`tracksheet/track-entry-skeleton.ts:20-23`). For 'search' as a presented leg this
   would silently paint a restaurant skeleton; no bark.
4. **ProfilePanel caches its material at module scope**
   (`PROFILE_LOADING_MATERIAL = resolveSceneLoadingMaterial('profile')!`,
   `overlays/panels/ProfilePanel.tsx:29`) — canonical derivation, non-canonical timing
   (module init; harmless today, `!` swallows a future exclusion).
5. **Frozen-before-first-paint**: `lastGoodListRef.set` for hidden legs (line 656) makes
   the OA6.1 latch mean "resolved while hidden," widening frozen-world beyond "has SHOWN
   content" (readiness ledger's own doc says "has shown content", `:64`). Benign for UX
   (the frozen body IS the destination's current rows) but it is a second, drifted
   definition of the latch fact — same class as the four presented-refs item.

## CLEANUP PLAN (question 4), ranked

> STATUS 2026-08-08: item 1 is IMPLEMENTED (uncommitted) — provider added in
> `rendererForMountedEntry`, render-lane falsifier added
> (`track-host-readiness.render-spec.tsx`, "a PENDING mounted body paints its
> SceneBodyReadyGate face"), RED-proven by removing the provider. Items 2-3 are held
> for the owner (R8 / post-burn-in agenda). Items 4-5 (the six hardcoded rowTypes and
> the SaveList 'history'-vs-'tile' spec contradiction, plus the silent fallback) are
> **R8 kill-list additions**; the SaveList contradiction needs an owner call on which
> side is right. The OA6.1 latch drift (finding 5) goes to the owner as a ratification
> question — tightening it makes skeletons MORE visible on first visits.

1. **FIX (bug, small, do now): re-home SceneBodyReadyGate's scene resolution to the
   track.** One-line: provide `SceneBodySceneKeyContext.Provider value={legScene}` inside
   `rendererForMountedEntry` (`use-track-leg-resolver.tsx:296-323`) — or migrate the four
   gate consumers to PageBodyShell specs. Cost: trivial. Risk: none (old host provides the
   same value). User impact: editProfile / followList / messages inbox / DM thread stop
   rendering blank-white while their queries pend. This is the audit's one
   user-visible defect.
2. **R8 delete pass (medium, gated on your burn-in sign-off): remove the flip and the old
   subtree.** `track-flip-store.ts` on/rollback lever, `AppOverlayRouteHost.tsx:84-88`
   dead branch, `SearchOverlayRouteGateHost`/`SearchOverlayRouteSheetSurfaceHost`/
   `SearchRouteSceneStackBottomSheetSurfaceHost`/`BottomSheetSceneStackHost` (S2 skeleton
   leg + context provider — do item 1 FIRST) and the old-host half of
   `SearchMountedScenePageBundleAuthority`'s presentation (its P5 skeleton page, if the
   bundle host is old-only after the trace). Cost: a day with the render lane green.
   Risk: medium (large deletion; the R8 opener already queues F9400-F9403 + the
   four-refs and one-paint-resolver items — do them in the same pass).
3. **One paint resolver (medium): collapse readiness.present + handoff branch + frozen
   lookup + skeleton fallback into a single total `resolvePaint`** returning
   {content|frozen|skeleton} with the handoff as an input fact, per the contract's own
   displaced item. This is where the "two deciders" and the drifted latch (finding 5)
   both die. Cost: a focused rung with the existing pure specs re-pointed. Risk: low-med
   (well-falsified territory).
4. **Canonicalize the six hardcoded rowTypes** through `resolveSceneLoadingMaterial`
   (band-level overrides stay data via `materialRowType` as PageBodyShell already does),
   and **rule the saveList 'history' vs 'tile' disagreement** (recommend: spec row becomes
   'history' if the current look is right — the call site is what ships today). Cost:
   small. Risk: cosmetic only.
5. **Make the spec-excluded fallback loud**: dev bark in
   `trackSkeletonMaterialForScene` when it substitutes for a scene that can actually be a
   presented leg. Cost: trivial.
6. **Do NOT delete the skeleton machinery.** Against the "unreachable so dead" reading:
   Branch A is the mandated face for cold published-lane pushes (reachable today, ~1
   frame only because writers are fast — a slow network makes it the real face), and the
   handoff's skeleton is the guaranteed "paintable in one frame" body the touch-latency
   rung is built on. The correct honesty fix is a forced-repro falsifier (below), not
   deletion. Optionally rule whether prewarm/hidden legs SHOULD pre-freeze lastGood
   (finding 5): if you ever want first visits to show the skeleton flow demonstrably,
   gate line 656 on `legEntryKey === presentedEntryKey` — but as-is the frozen body is
   better UX, matching OA6.1's spirit.

## THE FORCED REPRO (one, runnable on the sim)

**Dev lever: starve the published lane for one scene.** In
`use-track-leg-resolver.tsx:478-484` (`publishedListForLeg`), temporarily add
`if (__DEV__ && legEntryKey.startsWith('pollDetail')) return null;` (or equivalently
comment out the pollDetail writer registration). Then: launch → polls tab → tap any poll
card. The push commits, resolution is `{kind:'none'}` forever, the readiness ledger
returns 'skeleton', and the track paints the **'comment'-rowType cutout skeleton
indefinitely** — visibly, with the strip law and frost cutouts inspectable. Revert the
line and the same tap shows why you never see it: the writer publishes in the next
commit. (No production lever exists because every gate is data-driven with no artificial
delay knob — which is itself evidence the machinery is honest rather than staged.)
A softer variant needing no edit: cold-launch with the API dead and push a restaurant
from a map pin — you get the published spec's own seed skeleton (face #7), which
demonstrates the panel-side flow but not Branch A.

---

## R8 EXECUTION UPDATE (2026-08-08)

Items 2-5 of the cleanup plan are DONE (owner-approved via OA8, executed in the R8
delete pass): the old subtree + flip off-branch are deleted (faces #13/#14 gone; the
whole gorhom-era shared-sheet runtime family went with them); the two paint deciders
are merged into ONE total `resolveTrackPaint` (tracksheet/track-paint-resolver.ts,
OA8 semantics — the readiness ledger and its drifted latch are deleted, `hasFrozenBody`
IS the latch); the six hardcoded rowTypes ride `resolveSceneLoadingMaterial` (SaveList
keeps 'history' behind a TODO(owner) — spec contradiction still owed a ruling); the
spec-excluded fallback barks in dev. The grep-invariant suite
(scripts/check-tracksheet-invariants.mjs, CI-wired) keeps all of it dead/canonical.
Item 1 (SceneBodyReadyGate provider) had already landed pre-R8.
