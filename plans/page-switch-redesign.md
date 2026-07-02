# Page-Switch Redesign — Ideal Ground-Up Architecture

**Status:** design/red-team phase (2026-07-01). Owner wants the most-ideal LONG-TERM shape for
nav-page switching, NOT a patch on the current architecture. Nothing is permanent; destructive
rewrites are on the table. Chasing the ideal, not preserving past decisions.

**Scope for THIS effort:** strictly the PAGE SWITCHES (nav-page + child-page transitions). NOT the
search query flows. Get page switching completely smooth + reliable + tunable first.

**Sim:** iPhone 17 Pro `7B0DD874-3496-46F7-9480-3EDDABCE2F31` (NOT the Max `8116E09B`).

---

## 1. THE BUG (why we're here)

Nav-page switches leave the sheet with NO content — content gets hidden / shows on the WRONG page.
Exact owner repro (2026-07-01):

1. Open app → poll sheet at its persistent bottom snap point.
2. Tap "Favorites now" → favorites page snaps up (fast, this time).
3. Tap back to Search → sheet slides down to the persistent poll bottom-snap position, BUT the whole
   top white area of the frosty sheet goes away → left with a frosty sheet with NO content.
4. Move the sheet up/down, switch to Favorites → still no content, but it moves.
5. Switch back to Search → the favorites page then snaps on (even though we just left favorites),
   then it goes away.
6. Switch back to Favorites → nothing pops up.
7. Switch to Profile → SEE the favorites page (wrong page), but the content SHOWS UP when switching
   to profile.
8. Switch back to Favorites → content gone.
9. Switch to Profile → favorites page is there.
10. Switch to Search → switches to profile page at bottom snap before content disappears → blurred
    screen.

Net: content is being HIDDEN somehow; the wrong page's content shows; switches are unreliable. It
behaves like the content plane / retained-scene visibility is desynced from the active scene.

---

## 2. IDEAL DESIGN — REQUIREMENTS (owner directives)

### 2a. Instant switch on press-up, skeleton-first

- On press-up, the switch to the next page is INSTANT. Content switches immediately.
- If the next page's content isn't ready, switch INSTANTLY to that page's SKELETON, then the skeleton
  reveals content the moment it's ready. The instant switch is prev-page → skeleton (when a skeleton
  is needed). When no skeleton is needed, an immediate content switch is fine and PREFERRED.
- EVERY page must be able to show a skeleton (for latency/errors). NEVER rely on an immediate switch
  of everything. Also focus on making content as fast as possible.

### 2b. Shared / persistent header — never unmounts

- The header is CONSISTENT across pages and does NOT unmount — not even across skeletons.
- When a page's content changes, the ONLY thing changing is the BODY under the header (body → skeleton
  → new content). The header itself stays exactly the same except its TEXT.
- Header TEXT switches ABSOLUTELY IMMEDIATELY on press-up — no skeleton for the header. Architect the
  header so its text is available immediately (whatever it takes). The body can show a skeleton under
  the header while content loads, but the header title should never need one.
- WHY shared/persistent: every page has a header; it tells the user WHICH page they're on and that the
  page actually switched — so it must change immediately.

### 2c. Standardize on ONE header — remove the poll special-case

- The only non-standard header was the POLL header. Owner decision: **remove the poll-count cutout to
  the LEFT of the close-button circle cutout in the poll header.** Then EVERY header is identical:
  a circle cutout on the RIGHT + the title on the LEFT. No special case. Clean up the poll-header
  branch and standardize all pages on one header component.

### 2d. Configurable / tunable transitions between snap points

- It must be EASY to configure how pages move between each other — the movement between snap points,
  in BOTH directions (forward and back).
- Example: changing your mind on a poll-card → poll-details open. Today it moves up then exits down.
  The owner wants to easily change that — keep it the same, or a different pattern (e.g. poll-details
  moves to the lowest snap, or moves fully up). These are just examples; the point is the snap-point
  movement (both directions) should be a tunable config.
- Applies BETWEEN nav pages AND between any child/trial sheets that extend from within a nav page.
  Standardize this so future child-pages-within-pages inherit it.

### 2e. Search results as a real skeleton PAGE (not a self-frost cover)

- Restructure the search-results loading cover into a real skeleton PAGE with the shared header,
  triggered to RELEASE the same way the cover is currently triggered to reveal — i.e. it becomes a
  PAGE SWITCH: the results + toggle strip live on the next page, and we switch when everything on
  that next page is ready. Immediate switch on the reveal trigger.
- The results page is likely already MOUNTED (unlike other pages) — decide the best way to get the
  immediate switch given that. The skeleton page should follow the same pattern every other
  skeleton-using page uses.
- (This closes the red-team note that search results is currently self-frost, not a real page.)

---

## 3. CONSTRAINTS & ETHOS

- Ground-up ideal shape; NOT a patch on bad architecture / past decisions. Anything on the table,
  including destructive rewrites. Everything's in git → nothing to lose.
- Red-team + panel should DISCUSS the ideal design from the ground up given all constraints, assess
  how CLOSE / FAR the current architecture is, and what to COMPLETELY REDO vs KEEP.
- Review the OLD PLANS (plans/): sheet-transition-engine-design.md, return-to-origin-foundation-design.md,
  search-system-ideal.md, and the transition-engine code under
  apps/mobile/src/navigation/runtime/ (scene-stack, page-frame, content-plane, transition-policy).

## 4. VALIDATION HARNESS

- Build a page-switch harness: click the nav pages in sequence (Search ↔ Favorites ↔ Profile, +
  child pages) and instrument logs that report whether the active scene, the visible content, the
  header, and the snap point are all consistent after each switch. This is easy to set up (it's just
  tapping nav tabs) and is the gate after the panel/fix.

## 5. RELATED CONTEXT (memory)

- [[unified-fade-toggle-architecture]], [[toggle-label-dot-unification]] — the content-plane / reveal
  writer contracts + the "cards never reveal / blank" failure class (directly relevant to this bug).
- [[page-transition-and-results-engine]], [[transition-hard-swap-skeleton-pivot]] — the transition
  engine + hard-swap+skeleton pivot.
- [[return-to-origin-foundation]] — the reveal/dismiss foundation (search flows, out of scope here but
  shares the scene-stack machinery).
- [[cutout-skeleton-foundation]] — the skeleton system every page will use.
- [[nav-poll-favorite-swap]] — a prior "favorites screen renders as polls" swap bug (persistent-poll-lane
  forcing the wrong scene) — likely the SAME failure family as this bug; start here.

---

## 6. PANEL CONSENSUS (2026-07-01, 9-agent design red-team `w3lj3g6zs`)

### ROOT-CAUSE HYPOTHESIS (must confirm on-device before building — attribute-before-ideate)

"Which scene is on screen" is derived **THREE times, in three files, from three differently-timed
subscriptions that race** during a nav switch. There is NO single committed "presented scene":

1. **Sheet-host leg-role/opacity** (`app-route-sheet-host-authority-controller.ts:1045-1120`) — from
   `activeSceneFrameEntry.sceneKey` → chooses which leg PAINTS (opacity 1).
2. **Scene-stack body-attach** (`app-route-scene-stack-runtime.ts:2517-2524`) — from `routeActiveSceneKey`
   → chooses which leg has a BODY attached.
3. **Host search override** (`BottomSheetSceneStackHost.tsx:960-967`) — re-relabels to `'search'` whenever
   `searchSurfaceOwnsVisibleSheet`, even when the route says bookmarks/profile.

Legs are absolute-fill siblings at the same zIndex. Out of lockstep → VISIBLE leg with NULL body (frosty
sheet, no content) OR WRONG body painted (favorites on profile). The header rides the same per-leg opacity
gate → it vanishes too. NOT a missing poll-lane guard — the CROSS-CADENCE RACE, amplified by the search
override + content switches hanging on the 600ms readiness watchdog.

CONFIRM: a `__DEV__` `[pageswitch]` JSONL probe per committed frame + Maestro nav-tab repro. Signature:
blank frames → displayedSceneKey ≠ activitySceneKey; wrong-page frames → non-idle-leg-key ≠ routeActiveSceneKey.

### IDEAL — ONE COMMITTED PRESENTATION FRAME (PF)

`AppRouteSceneSwitchController` emits per switch ONE immutable **PresentationFrame** `{switchId,
activeSceneKey, presentedSceneKey (==active EXCEPT the one legal divergence: docked-polls-under-search-home),
outgoingSceneKey, bodyReady, laneKind:'top-level'|'docked-polls'|'child', contentMode, snapIntent,
originRef}`, resolved once from the fresh resolved target. EVERY consumer (leg opacity, body attach, header
title, snap) is a PURE FUNCTION of PF → leg-visible and body-attached CANNOT disagree. `isPersistentPollLane`
scalar → `PF.laneKind` computed once.

- **Persistent header**: ONE `OverlaySheetHeaderChrome` hoisted above the legs (like the Phase-0 frost
  hoist), never unmounts, opacity 1.0, reads {title,actionButton,onClose} from a HeaderModel keyed by
  `PF.activeSceneKey`; title swaps the same frame as press-up; never skeletons.
- **Every page = skeleton-capable leg**: `(params,bodyReady)=>bodyReady?Content:SkeletonShell`, NEVER null
  while presented. Kills the three blank-holes.
- **Instant switch**: press-up commits PF in ONE batched frame; the paint-ack player becomes a DECORATION
  timing the in-place skeleton→content reveal, never a gate.
- **Search = just another leg** (delete the self-frost cover): search-home IS the 'polls' scene under
  `laneKind:'docked-polls'`; 'search' presents ONLY when a bundle exists + renders a real skeleton page;
  the results reveal = a page-switch on the incoming paint-ack.
- **Tunable transitions**: ONE descriptor table row per (from,to,direction) driving a real sheet-Y lane both
  directions, dismiss=inverse. Owner's poll-detail example = a two-row edit, no engine change.

### CLOSE/FAR: ~60% there. Substrate ideal (KEEP); resolution layer is where the bug lives (REDO).

- **KEEP**: co-mounted absolute-fill legs; Phase-0 frost hoist; the paint-ack player (already does hard body
  swap + instant header swap); route reducer; single-writer activeSceneKey; transition-policy resolver SHAPE;
  descriptor contract SHAPE; OverlaySheetHeaderChrome visual; SceneLoadingSurface skeletons.
- **REDO**: 3-site derivation → PF; isPersistentPollLane scalar → PF.laneKind (+ delete deny-list band-aids);
  per-scene header → persistent hoisted header; poll badge cutout → deleted; the 3 blank-holes →
  skeleton-or-content; bespoke search leg + cover → uniform leg + real skeleton; instant-switch gating; dead
  sheet-Y descriptor lane → descriptor table.

### MIGRATION PHASES

- **P0** (free, first): req 2c — delete the poll-count badge cutout (`OverlaySheetHeaderChrome.tsx:174-190` +
  badge props + `PollsHeaderBadge`) + dead `OverlaySheetHeader.tsx` + `useHeaderCloseCutout.tsx`.
- **P1** (attribute GATE): `[pageswitch]` probe + `__DEV__` invariant asserts + Maestro nav-tab harness;
  REPRODUCE + PIN the bug with data. Regression gate for every later phase.
- **P2** (core redo, atomic — kills the bug): introduce PF; rewire consumers to read PF; DELETE the sheet-host
  cascade + resolve\*PresentationSceneKey + the host search override + isPersistentPollLane scalar reads + the
  deny-list band-aids — all in ONE phase.
- **P3** (req 2b): hoist the persistent header; delete per-scene header wiring; decouple white plate from the
  header mount gate.
- **P4** (req 2a): commit every nav switch instantly; arm the paint-ack for all cross-scene switches; drop the
  search/polls seeded exclusion; synthetic ack for warm retained legs; demote the watchdog to safety net.
- **P5** (req 2e): fold search into the uniform leg; real results skeleton; reveal via paint-ack; delete the
  cover transport + search override + pageBundle-null branch. Keep the search reveal join as bodyReady producer.
- **P6** (req 2d): FIRST consolidate the snap switch into a config table the kept spring reads (no
  double-driver); THEN mount the descriptor sheet-Y lane + dismiss=inverse + enrich OverlayRouteEntry, once
  the single-writer handoff is proven.

### INVARIANTS (assert `__DEV__`; each fires on one repro symptom)

S1 wrong-page; S2 blank (visible leg is bodyReady OR own non-null skeleton); H1 header-vanish; SR1
search-blank; T1 descriptor completeness (dismiss.to === origin.snap).

### OPEN QUESTIONS FOR OWNER

1. **Plan canonicalization**: `transition-engine-final-master-plan.md` vs `transition-pillars-build-plan.md`
   are both live + point different ways; resolve before P2/P6.
2. **2d scope now**: full descriptor sheet-Y lane vs config-table-first (90% value, ~5% risk).
3. Docked-polls the ONLY legal presented≠active divergence?
4. Title seeds OK for late-loading titles (seed then fill)?
5. Delete only the search COVER; keep the reveal readiness join as bodyReady producer?
6. iOS-first (like the map work)?
