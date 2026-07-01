# Return-to-Origin Foundation — Canonical Design

Source-agnostic search reveal/dismiss. A reveal = PUSH from an origin; a dismiss = POP back to that EXACT origin. The "reverse-morph" and "slide-to-home" are ONE behavior; home is the degenerate case. Full panel output: `tasks/w7e1qs2mp.output` (design-return-to-origin workflow). Vision: memory `return-to-origin-foundation`. Ethos: memory `uncompromising-ideal-ethos`.

**Verdict from the 4-lens panel (research + seams + sources + red-team): ADOPT. GO.** It's ~40% scaffolded — generalize-and-complete, not greenfield. `SearchSessionOriginContext` (searchRouteSessionTypes.ts:8-17) is a proto-OriginSnapshot; `OverlayRouteRestoreState` (app-overlay-route-types.ts:377-381) is a write-only sibling.

## Two refinements to the lead's model (both adopted)
1. **Unify on snapshot RICHNESS, not source.** Slide-to-home and reverse-morph ride *different* mechanisms today (home = zero-motion-plane idle-commit + **synchronous** flushSettleCallbacks; reverse-morph = re-root+push). The home case MUST short-circuit to the EXACT existing single emission (byte-identical, golden-guarded) — never run through the morph path.
2. **Restore is RECONSTRUCT, not pop.** Panels are state-local and clear on `!visible` → restore ALWAYS hits a cold panel. So the snapshot carries **only stable IDs + query-key params (never data, never list indices)**; restore is **skeleton-first** (rides SEEDED_FORWARD_OPEN_SCENES — our skeleton work feeds straight into this) + **anchor-resolves-to-index POST-fetch**, gated on the existing content-readiness signal.

## OriginSnapshot (replaces SearchSessionOriginContext)
```ts
type OriginScrollLane = { laneKey: string; offset: number };           // offset = hint, anchor wins; never an index
type OriginAnchor = { laneKey: string; elementId: string; highlight?: boolean };  // stable domain id (commentId|listId)
export type OriginSnapshot = {
  schemaVersion: 1;                 // version → DROP-not-crash on stale
  sceneKey: OverlayKey;             // TRUE scene identity (search|polls|pollDetail|bookmarks|profile) — NOT root-collapsed
  sceneParams?: OverlayRouteParamsMap[OverlayKey] | null;  // {pollId}|{profileUserId,...}|null(home)
  detent: TabOverlaySnap;           // LIVE snap at trigger (not hard-coded 'expanded')
  segment?: string | null;          // active sub-tab for segmented scenes (profile)
  scroll?: OriginScrollLane[];      // nested-aware; EMPTY for home
  anchor?: OriginAnchor | null;     // EMPTY for home
};
```
Degenerate home = `{schemaVersion:1, sceneKey:'search'|'polls', sceneParams:null, detent:'collapsed', segment:null, scroll:[], anchor:null}`.

## Capture — source-agnostic registry
- `registerOriginCaptureProvider(sceneKey, () => OriginSnapshot)`. Each scene snapshots ITSELF, reading its **feed runtime / controller** (live scroll SharedValue + active-segment state) — NOT a render-body hook (CLAUDE.md: effects don't fire in scene body-spec hooks).
- Single chokepoint stays: `prepareSearchSessionEntry({captureOrigin:true})` → `captureSearchSessionOrigin` calls `registry.get(activeSceneKey)?.() ?? degenerate(activeSceneKey, liveDetent)` instead of `createCurrentOriginContext` (controller:201-225, DELETE it).
- `childAnchor` (app-route-types.ts:12-16) is SUBSUMED into `anchor`. Adding a source = register route + `captureOrigin` + nothing in dismiss machinery.
- One-capture invariant: search-trigger capture = session-level authoritative origin; per-entry `OverlayRouteRestoreState` = nested closeChild pops only (compose, not compete).

## Restore — ONE richness-gated path (replaces BOTH dismisses)
In `restorePendingOrigin` / `flushPendingSearchOriginRestore` (reuse arm/commit/flush lifecycle):
1. Keep `resolveContentHandoff` (policy-runtime:286-322) as SOLE handoff authority (snapshot = WHAT, policy = HOW → byte-identity survives).
2. **Degenerate short-circuit (home guard):** if `scroll empty && anchor==null && sceneParams==null && sceneKey∈{search,polls} && detent==collapsed` → emit the EXACT existing `requestOverlaySwitch({targetSceneKey:resolvedRoot, topLevelSwitch, snapTo:detent, dockedPollsRestoreSnap})` (controller:319-326 bytes), RETURN. No further stages.
3. **Rich restore:** motionless re-root to true `sceneKey` (`setRoot`, `sheetMotion:none`, `swapImmediately`) → if child origin, `openChild` push that RISES to captured `detent` (settle callback) → else `snapTo` captured `detent` (never `promoteAtLeast`).
4. **Skeleton-first:** re-root rides SEEDED_FORWARD_OPEN_SCENES seed from `sceneParams` (free).
5. **Gate scroll+anchor on READINESS** (never the re-mount frame — #1 jump-to-top cause): on first non-skeleton commit → segment-select → seed `getOverlayScrollOffset(laneKey)` from `snapshot.scroll` (overlayScrollOffsetRuntime already self-restores on remount) → anchor: resolve `elementId→index` vs CURRENT data, `scrollToIndex({viewPosition})` + `onScrollToIndexFailed` retry + flash-highlight; degrade to top if gone.
6. **Sole-writer:** restore is the only scroll writer that frame; disable MVCP on restoring re-sortable lanes.
7. Finalize on settle; DELETE `requestDefaultPostSearchRestore` as a separate lane (home is the degenerate captured origin).

## Motion — one direction-reversible morph (container-transform "return == reversed enter")
Forward = motionless re-root to 'search' (zero plane) + one `snapTo:middle` + content swap. Reverse = motionless re-root to ORIGIN + one sheet motion to captured `detent` (child → rising `openChild`; top-level → `snapTo`; home → `snapTo:collapsed`) + content swap (skeleton-first). The ONLY structural difference is "is there a child to re-push," read from the snapshot, NOT `if(sceneKey==='pollDetail')`. Detent morph reuses the kept spring; captured detent is AUTHORITATIVE; suppress `recordUserSnap` during the restore transaction.

## Home byte-identity proof
The generalization keeps `restorePendingOrigin`'s existing two-branch structure (controller:315-317) — it only WIDENS the rich branch from "pollDetail child" to "any rich snapshot" and keeps the empty branch character-for-character equal. Home captures the degenerate snapshot by construction → enters the short-circuit → emits the identical switch → rides the zero-plane idle-commit + synchronous flush. **Golden assertion:** home snapshot → byte-equal `requestOverlaySwitch` args (targetSceneKey, kind, snapTo:collapsed, dockedPollsRestoreSnap, zero motionPlanes). Catches any future edit that attaches a plane to home before the deadlock seam regresses.

## Integration (reuse / generalize / replace)
- REUSE: snap spring; `resolveContentHandoff`; SEEDED_FORWARD_OPEN_SCENES + idle-commit/sync-flush escape hatch (controller:1294-1302) + content-readiness link (controller:1403-1426); `overlayScrollOffsetRuntime` (self-restores on remount); arm/commit/flush lifecycle.
- GENERALIZE: `SearchSessionOriginContext`→`OriginSnapshot`; `restorePendingOrigin` 2 branches → 1 richness-gated; `resolveLeavingEntryRestoreState` (controller:1335-1347) reads real scroll; widen `OverlayRouteRestoreState`.
- REPLACE: the dismiss fork — remove `if(capturedOriginChildAnchor?.sceneKey==='pollDetail')` at close-actions-runtime:150.
- NEW SOURCES: BookmarksPanel:538 + profile-panel-actions:95 list-press providers; foreign profile (route + `profileUserId` param). NOTE: `commentAnchorId` is threaded end-to-end but NEVER read by PollDetailPanel today — the "exact comment" restore is vaporware; P4 builds it as the reference.

## Phased build (each device-verified; home seam guarded from P0)
- **P0** Snapshot type + provider registry, NO behavior change. Home/polls providers return degenerate. Delete createCurrentOriginContext. Verify: tsc=baseline; home reveal+dismiss byte-identical ([DISMISS-SEAM]).
- **P1** Unify restore + degenerate short-circuit + golden assertion. Delete requestDefaultPostSearchRestore lane. Verify: home byte-identical + reverse-morph still rises to poll@detent.
- **P2** Remove the dismiss fork; generalize child re-push via sceneParams; suppress recordUserSnap; one snapTo. Verify: all dismisses through one path; no sharedSnap pollution.
- **P3** Scroll + segment capture/restore, gated on readiness, sole-writer. Verify: favorites-from-bookmarks scrolled → restores true scene+offset; no jump-to-top.
- **P4** Anchor scroll-to + highlight — implement the missing PollDetailPanel commentAnchorId consumer as reference, then list-card anchor. Verify: far-down comment span → dismiss → scrolled-to + highlighted; deleted element degrades to top.
- **P5** New source: foreign profile (acid test) — route + profileUserId param + provider. Verify: tap a public list on someone's profile → map shows pins → dismiss restores foreign profile (skeleton-first, anchor on the list). Proves "add a source = captureOrigin + route/params, nothing in dismiss machinery."

## Decisions (owner calls — resolved per panel rec; flag to change)
- **Reconstruct-everywhere for V1** (not react-freeze). Most uniform, ships the agnostic model fully; freeze is a later pure optimization for cheap origins.
- **Guarantee = "scroll near + anchor-exact"** (the tapped element scrolled into view + highlighted), NOT byte-exact pixel restore (unachievable on a refetched virtualized list).
- **Defer the restoreState read-side** (nested child-over-child pops) until a real consumer exists; ship the session-level path first.
- **Foreign-profile params** = `{profileUserId}`; self-profile stays undefined (self-default) for now.
- **Highlight visual** = default a tasteful flash (mirror existing highlight patterns); owner tunes later like the cutout.

## Key risks (mitigations baked into the phases)
Home byte-identity (CRITICAL — richness-gate + golden assertion); reconstruct-not-pop (IDs-only + skeleton + anchor-post-fetch); virtualized scroll/anchor (readiness-gate + scrollToIndex+retry + sole-writer); anchor-vaporware (P4 builds the reference); interruptibility (atomic restoreToken + in-flight guard); detent-vs-snap-persistence (captured detent wins + suppress recordUserSnap); snapshot staleness (stable IDs + graceful degradation).
