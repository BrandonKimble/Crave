# Root Snap Law — attribution + design ledger

Leg 1 (2026-07-12), UI & small-tasks agent. Attribution + design only — NO code changed.
Owner problem: home (docked-polls page over the search root) loses its raised snap on
tab-away/tab-back. Candidate law (Jarvis, owner leaning yes):

> Every page always opens fully extended, except home — which always comes back exactly
> where you left it, and sits at the bottom only on a fresh app start (or the user's own
> gesture, or an explicit product moment that wants the map dominant).

**VERDICT: the bug is not a gate failure — it is a deliberate 2026-07-01 table row.**
The descriptor table hard-codes home's tab-return to `snapTo collapsed` ("map-first home
posture"); the 2026-07-02 "true per-page memory" upgrade was applied ONLY to the
bookmarks/profile rows. The remembered-detent machinery exists and works — home is simply
excluded from it. A second-order effect then destroys the memory itself. The law fits the
codebase cleanly; the cutover is a small, table-centered change plus one write-side contract.

---

## 1. The current model, fully mapped

### 1.1 Who decides the detent for a switch

One chokepoint: `resolveAppRouteSceneTransitionPlan`
(`apps/mobile/src/navigation/runtime/app-route-scene-transition-policy-runtime.ts:484`).
Explicit call-site `sheetMotion` wins (except modal mandates); otherwise
`resolveDefaultSheetMotionPlan` consults the ONE declarative table:
`app-route-sheet-motion-descriptor-table.ts` (most-specific row wins; parity-pinned by the
frozen-oracle spec `app-route-sheet-motion-descriptor-table.spec.ts`).

### 1.2 The table's rules for the root pages + search flows (every relevant row)

| from       | to                                                                                                                                       | kind            | motion                                 | note                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------- | ------------------------------------------------- |
| \*         | price / scoreInfo                                                                                                                        | \*              | none (mandate)                         | modals never move the sheet                       |
| \*         | \*                                                                                                                                       | terminalDismiss | hide                                   | sheet leaves screen                               |
| \*         | saveList/pollCreation/pollDetail/userProfile/listDetail/followList/notifications/settings/editProfile/postPhotos/messagesInbox/dmSession | openChild       | snapTo expanded (pollCreation instant) | children open full                                |
| \*         | restaurant                                                                                                                               | openChild       | promoteAtLeast middle                  | half-sheet                                        |
| pollDetail | \*                                                                                                                                       | closeChild      | rememberedDetent, fallback middle      | parent's own memory                               |
| settings   | \*                                                                                                                                       | closeChild      | rememberedDetent, fallback expanded    | parent's own memory                               |
| \*         | **search**                                                                                                                               | topLevelSwitch  | **snapTo collapsed**                   | ← "map-first home posture" (2026-07-01) — THE BUG |
| \*         | **polls**                                                                                                                                | topLevelSwitch  | **snapTo collapsed**                   | same                                              |
| \*         | bookmarks                                                                                                                                | topLevelSwitch  | rememberedDetent, fallback expanded    | 2026-07-02 memory upgrade                         |
| \*         | profile                                                                                                                                  | topLevelSwitch  | rememberedDetent, fallback expanded    | same                                              |
| \*         | \*                                                                                                                                       | \*              | preserveLiveY                          | catch-all (gesture/closeChild/bootstrap)          |

`materializeSheetMotionDescriptorRule` (table :308-326): a remembered snap is honored ONLY
when it is `middle`/`expanded` — `collapsed`/`hidden`/unvisited fall to `fallbackSnap`.
(Right for tab pages whose content would hide; wrong-by-omission for a home whose remembered
`collapsed` is meaningful.)

### 1.3 The snap-session ledger (per-scene memory)

`app-route-sheet-snap-session-runtime.ts` — `sceneSheetSnaps: Partial<Record<OverlayKey, snap>>`,
initial `{ polls: 'collapsed' }` (fresh-start bottom already exists — law-compatible).

WRITES — all funnel through the sheet-host authority's settle hook
(`app-route-sheet-host-authority-controller.ts:1979 recordSharedSheetSnap` →
`:2043 recordRouteSceneSnapFact`), which fires on EVERY settle, gesture **and programmatic**:

- presented scene `polls` → `settleRouteScenePollsSnap` (skipped only for the transient
  forward-open cover snap); also clears `isDockedPollsDismissed` on gesture / collapsed,
  and sets it on a gesture hide under the search root.
- `bookmarks`/`profile` → `settleRouteSceneTabSnap`.
- everything else → `recordRouteSceneSheetSettle` directly.
- Origin-restore seam: `registerRouteEntryOriginRestorer`
  (`app-route-overlay-session-state-controller.ts:281-291`) pre-writes the popped-to scene's
  captured detent into the ledger so the pop's `rememberedDetent` row reads it.
- `primeDockedPollsForHomeLanding` (`app-search-route-command-runtime.ts:33`) force-writes
  `polls: 'collapsed'` + un-dismisses — the results→home terminal dismiss + no-origin clear lane.

READS — `resolveSceneRememberedSnap` threaded into the plan resolver
(`app-route-scene-switch-controller.ts:694-696` → descriptor materializer), plus
`resolveSearchLaunchOriginSnap` (`app-route-session-utils.ts`) for origin capture, plus
NavSilhouetteHost's hidden-check.

### 1.4 The `dockedPollsRestoreSnap` gate ("shouldRestoreDockedPolls")

This gate is NOT about the sheet's detent — it is the docked-polls **restore intent** (which
snap the polls lane should re-present at, and whether to resurrect a user-dismissed docked
feed). Producers:

- Tab bar (`overlays/NavSilhouetteHost.tsx:165-190`): on a `search` tab press,
  `shouldRestoreDockedPolls = isDockedPollsDismissed || pollsSnap==='hidden'` → hard-coded
  `'collapsed'`; else `null`.
- Search-dismiss rich restore (`app-route-overlay-session-state-controller.ts:495,523`):
  `resolvedRootOverlay==='search' ? snapshot.detent : null` — restores home AT the captured
  detent. **This lane already implements the law's dismiss corollary.**
- Degenerate home restore (same file :445,459): detent is always `'collapsed'` here by
  definition of degenerate (`isDegenerateHomeOrigin` requires `detent==='collapsed'`),
  golden-asserted (:120-179).
- Terminal results dismiss (`app-search-route-command-runtime.ts:130`): `'collapsed'`
  (user dragged the results sheet to the bottom — a genuine map-dominant moment).
- Default when omitted (`app-route-scene-transition-policy-runtime.ts:463-482`): null unless
  target is `polls`, then the resolved snap target else `'collapsed'`.
  A `null` simply arms no restore intent; the DETENT still comes from §1.1 — so "null falls
  through to a default" = falls through to the descriptor table's `snapTo collapsed` row.

### 1.5 `snapLock` (scene-foundation-spec.ts:46-53)

Orthogonal: pins settings to expanded while presented. Not involved in this bug; under the
law it stays exactly as is.

### 1.6 Git archaeology (what the owner asked vs what landed)

Everything landed in one mega-commit `4eeaa27b` (2026-07-03). The written record is
`plans/page-switch-master-plan.md` §9.5 (2026-07-02 amendments):

- §9.5(c) item 4 recorded the owner's question — remembered detent was originally the LIVE
  shared detent; "if the owner wants TRUE per-page memory, the rule needs a per-scene store".
- The spec header (`...descriptor-table.spec.ts:14-17`) records the answer: "INTENTIONAL TUNE
  2026-07-02 (owner decision): 'rememberedDetent' upgraded ... TRUE PER-PAGE memory. The
  oracle's **bookmarks/profile** branch ... updated."
- The table header (:23-28) records the 2026-07-01 default that was never revisited:
  "search/polls dock at 'collapsed' (the map-first home posture)."

So versus the owner's remembered ~07-02 request ("switching to other pages fully extends;
switching back to home restores wherever home was"): what shipped is roughly the INVERSE —
other pages got memory-with-expanded-fallback (not always-expanded), and home got
always-collapsed (not restored). Both halves of the candidate law are row-level corrections
of that inversion.

---

## 2. Defect attribution (root cause, exact mechanism)

Repro: raise home's sheet to middle/expanded → tab to Favorites/Profile → tab back to Search.

1. The gesture settle writes `sceneSheetSnaps.polls = 'middle'` (ledger memory EXISTS —
   `recordRouteSceneSnapFact` → `settleRouteScenePollsSnap`).
2. Tab back: `NavSilhouetteHost.handleOverlaySelect('search')` emits a `topLevelSwitch` with
   NO `sheetMotion` (NavSilhouetteHost.tsx:185-190).
3. The plan resolver falls to the descriptor row `('*','search','topLevelSwitch')` →
   **`{ snapTo, collapsed }`** (`app-route-sheet-motion-descriptor-table.ts:205-210`). The
   remembered detent is never consulted — home's rows are the only root rows without the
   `rememberedDetent` rule. **This is the root cause.** Correct layer: the table row itself.
4. Second-order memory destruction: the programmatic settle at collapsed then writes
   `sceneSheetSnaps.polls = 'collapsed'` (authority-controller :2058, source 'programmatic'
   is NOT filtered for the polls ledger), so even the lanes that DO read memory (search
   dismiss rich-restore, pollDetail closeChild) now see collapsed. This is why it feels
   intermittent/"often": dismiss-returns preserve the snap until any tab round-trip has
   laundered the ledger to collapsed.

Not guilty: the `shouldRestoreDockedPolls` gate (it's the polls-lane restore intent, and the
rich-restore lane already passes the captured detent); the snap-session ledger (it works);
`snapLock`; return-to-origin.

---

## 3. The law, evaluated

**Fits. No structural conflict.** Per transition:

- **Tab switch → home**: today `snapTo collapsed` (violates law). Fix = row edit to
  `rememberedDetent` with fallback `collapsed` — BUT home's remembered `collapsed` must be
  usable (the materializer currently discards collapsed). Needs per-row "usable snaps"
  semantics, not a global change (tab pages must keep discarding collapsed/hidden).
- **Tab switch → bookmarks/profile**: today `rememberedDetent` fallback expanded. The law
  says ALWAYS expanded → these rows become `snapTo expanded` and their memory rows are
  deleted. ⚠️ Owner should consciously ratify deleting the 2026-07-02 memory behavior for
  these two pages — it was an explicit owner decision 10 days ago. The law is cleaner (and
  matches "opens like a fresh page"); flagging, not deviating.
- **Search reveal**: explicit `sheetMotion` from `openAppSearchRouteResults` — untouched.
- **Search dismiss (return-to-origin)**: already law-compliant. Degenerate home restore
  (collapsed) and rich restore (captured detent) both agree with "home comes back exactly
  where you left it". The golden assertion is untouched — no change flows through
  `emitDegenerateHomeRestore`.
- **Results drag-to-bottom terminal dismiss** (`dismissAppSearchRouteResultsToHome` +
  `primeDockedPollsForHomeLanding` → collapsed): user gesture + deliberate map-dominant
  moment — one of the law's three sanctioned paths to bottom. Keep.
- **Docked-polls resurrect after user dismissal** (NavSilhouetteHost `'collapsed'`): an
  explicit product moment (S-C.5 4b verdict says the pair is load-bearing). Keep, but the
  posture constant should live in the table/declaration layer, not a call-site literal.
- **Child open/close (pollDetail, settings, etc.)**: opens expanded, closes to parent's
  remembered detent — consistent with the law (the law governs OPENS; closes are restores).
- **Fresh app start**: initial ledger `{ polls: 'collapsed' }` — already the law's cold-start
  bottom snap.
- **snapLock (settings)**: the law's "always opens fully extended" subsumes it for opens;
  the lock's drag-rubber-band behavior is orthogonal and stays.

Vestigial under the law (audit in the build leg, don't delete blind):

- `hasUserSharedSnap`/`sharedSnap` as the bookmarks/profile hidden-fallback in
  `resolveSearchLaunchOriginSnap` — becomes a constant `expanded` for tab pages. The
  shared-snap store has OTHER consumers (child scenes' persistence); scope carefully.
- `resolveDockedPollsRestoreSnap`'s `targetSceneKey==='polls'` default arm — third place
  encoding home posture.

**The RED-provable contract the law needs** (this is what makes the fix root-cause instead
of a row patch): _programmatic sheet settles may READ scene memory but never WRITE it;
memory writers are (a) user-gesture settles, (b) the origin-restore seam, (c) named product
intents (`primeDockedPollsForHomeLanding`)._ Today §2.4's laundering exists precisely
because the write side has no such contract. Enforce at `recordRouteSceneSnapFact` (source
already flows in) with a `__DEV__` loud assert on any undeclared programmatic ledger write —
provably RED by reverting the gate.

---

## 4. Cutover design (owner ratifies before any code)

Ideal shape — the law declared per page, one decision layer, one restore path:

1. **Declare per page** in `scene-foundation-spec.ts` (the 8-pieces foundation layer):
   `openPosture: 'expanded' | 'remembered'` — home(`search`/`polls`) = `remembered`
   (fresh-start ledger seed `collapsed` stays), every other page = `expanded`. Required
   literal, same style as `snapLock`/`grabHandle`.
2. **Derive the topLevelSwitch rows** of the descriptor table from that field (children keep
   their curated rows). Concretely the table diff is: search/polls rows →
   `rememberedDetent{fallback:'collapsed', usableSnaps: all-non-hidden}`; bookmarks/profile
   rows → `snapTo expanded` (memory deleted). `materializeSheetMotionDescriptorRule` gains a
   per-row usable-snap set instead of the hard-coded middle/expanded pair.
3. **Write-side contract** (§3): gesture/origin/named-intent-only ledger writes + `__DEV__`
   assert. This deletes the laundering class, not just this bug.
4. **Delete / relocate**: NavSilhouetteHost's `'collapsed'` literal (resurrect posture moves
   to the declaration layer); the bookmarks/profile arms of `resolveSearchLaunchOriginSnap`'s
   shared-snap fallback (constant `expanded`); audit `settleRouteSceneTabSnap` (its only
   remaining reader may be origin capture); update the frozen-oracle spec branches in-change
   (the spec's stated protocol for intentional tunes).
5. **Verify on device**: tab round-trips ×3 roots at every detent; search reveal/dismiss
   (golden assertion must not fire); results drag-to-bottom dismiss; docked-polls
   dismiss→home-press resurrect; pollDetail/settings open/close.

Honest size: ~6-8 files, ~200-400 line diff (rows + rule semantics + write gate + oracle
spec + deletions), one focused session + on-device verification. No new machinery; net
deletion of one hard-coded posture and two duplicated posture encodings.

---

## 5. Out-of-scope observations (standing mandate — flagged, not fixed)

- `isSharedOverlaySnapOwner` (`app-route-sheet-snap-session-runtime.ts:79-91`): curated
  hard-coded scene list — the recurring type-list-disease shape. Comment acknowledges it;
  new shared-sheet scenes silently don't persist. Candidate for a metadata flag.
- Home posture is encoded in THREE places today (descriptor row, NavSilhouetteHost literal,
  `resolveDockedPollsRestoreSnap` default arm) — the cutover collapses them, but this is the
  exact multi-writer pattern the owner's one-writer contract memory warns about.
- Two overlapping "shared snap" stores in the snap session (`sharedSnap`/`hasUserSharedSnap`
  vs `persistentSnaps[ROUTE_SHARED_SNAP_PERSISTENCE_KEY]`) kept in lockstep by
  `setSharedSnap` — a consolidation candidate when this territory is next open.
- `plans/page-switch-master-plan.md` §9.5(c) post-soak cleanup ledger (probe teardown,
  carrier shrink, dead `getRouteSceneVisibilityPolicySnapshot`, stale host comments) appears
  still outstanding.

---

## Leg 2 — design + build (2026-07-12, ratified two-posture law)

### The from-scratch model (re-derived; leg-1 §4 treated as input only)

The ratified law needs exactly FOUR concepts — anything more is overbuild:

1. **Two posture seats.** `homeSeatSnap` (home = the search root's docked-polls
   presentation; cold-start seed `'collapsed'`; domain also admits `'hidden'` — the
   docked-dismiss physical fact, which already lives here) and `contentSeatSnap` (ONE
   value shared by every non-home root page — bookmarks, profile, and any future tab;
   seed `'expanded'`; domain `collapsed|middle|expanded`, never hidden). They live in
   the snap-session runtime, replacing the per-scene `polls`/`bookmarks`/`profile`
   ledger entries. Child scenes keep the per-scene map (closeChild restores + origin
   capture for child departures).
2. **One derived topLevelSwitch rule.** Every nav-page switch resolves to
   `snapTo seat(targetSide)` — rule kind `postureSeat`, seat key: `search|polls →
home`, else `content`; unusable seat (hidden/unset) → the side's seed. The
   boundary behavior the owner described EMERGES: content→content snaps to the seat
   the live sheet already sits at (a settle is always a detent, and gesture settles
   wrote the seat) → zero motion; home↔content crossings restore the other seat.
   No per-transition rows, no preserveLiveY special case, no side(from) needed.
3. **Gesture-only seat writes.** Seat writers are exactly: (a) user-gesture settles,
   (b) the origin-restore seam (`registerRouteEntryOriginRestorer` — restores the
   gesture-placed capture), (c) named product intents (`primeDockedPollsForHomeLanding`,
   `dismissDockedPolls`). A programmatic settle reaching a seat write is a contract
   violation: the snap-session drops it and fires a `__DEV__` console.error
   (RED-provable: remove the source gate at the settle hook and the assert lights up).
   The `isDockedPollsDismissed` flag arms in `settleRouteScenePollsSnap` keep running
   on ALL settles — they are lane-dismissal semantics, not posture memory.
4. **Everything else untouched.** Search reveal/dismiss (explicit sheetMotion +
   return-to-origin), child open/close rows, snapLock, terminal results dismiss,
   golden degenerate-home assertion.

vs leg-1 §4: leg-1 proposed per-page `openPosture: 'expanded'|'remembered'` declared in
scene-foundation-spec + per-row usable-snap sets + snapTo-expanded rows for tabs. ALL of
that dies: there is no per-page declaration (side is structural: home vs not-home), no
row-level posture literals, no scene-foundation-spec change (good — the file is fenced),
and bookmarks/profile get SHARED memory, not always-expanded.

### Kill list (executed in this leg)

- The 4 hand-written topLevelSwitch rows (incl. the `snapTo collapsed` "map-first" bug
  row and the 2026-07-02 per-tab rememberedDetent rows) → 4 `postureSeat` rows with
  zero per-row config.
- `settleRouteSceneTabSnap` action + type (bookmarks/profile no longer have own entries).
- Per-scene ledger entries for polls/bookmarks/profile → two seat fields.
- The materializer's collapsed-discarding special case for tab switches (dies with the
  rows; `rememberedDetent`'s middle/expanded filter survives ONLY for the two closeChild
  restore rows, where a collapsed parent memory is genuinely unusable).
- The polls transient-cover skip in `recordRouteSceneSnapFact` seat write (subsumed:
  cover snaps are programmatic and programmatic never writes a seat). Flag arms keep
  the skip semantics unchanged.
- `resolveSearchLaunchOriginSnap`: the bookmarks/profile hidden→sharedSnap fallback
  arms, `resolveSharedOverlaySnap`, and the `hasUserSharedSnap`/`sharedSnap`/
  `isDockedPollsDismissed` parameters (origin capture reads the seats directly).
- NavSilhouetteHost's hard-coded `'collapsed'` resurrect literal → shared
  `DOCKED_POLLS_RESURRECT_SNAP` constant (single declaration, also used by the
  terminal-dismiss lane's named intent).
- `returnAppSearchRouteToDockedSearch`'s forced `snap:'collapsed'` (the polls-page X →
  home lane) → derived seat motion ("dismissing a non-home page lands on home at home's
  remembered posture").

NOT killed (checked, still load-bearing): `sharedSnap`/`hasUserSharedSnap` store — has
bootstrap consumers outside origin capture (`resolveSheetRuntimeRegistrationSeedSnap`,
`resolveInitialSharedSheetPosition` in use-app-route-shared-sheet-runtime); flagged as a
follow-up consolidation, out of scope. `resolveDockedPollsRestoreSnap`'s default arm
(target 'polls' only; its final `'collapsed'` fallback is near-unreachable post-change —
noted, left).

### Mechanical walkthroughs (logic-first, hand-executed)

- **Cold start**: seeds homeSeat=collapsed, contentSeat=expanded → home presents docked
  polls at collapsed (unchanged boot path). ✓
- **Raise home to middle**: gesture settle → recordSharedSheetSnap(source gesture) →
  recordRouteSceneSnapFact polls branch → settleRouteScenePollsSnap → homeSeat=middle.
  → **favorites tab**: NavSilhouetteHost topLevelSwitch, no sheetMotion → descriptor
  (\*,bookmarks,topLevelSwitch)=postureSeat → contentSeat=expanded → snapTo expanded;
  programmatic settle at expanded hits the contentSeat gate (source programmatic) → NO
  write (seat already expanded anyway). → **profile tab**: postureSeat → contentSeat=
  expanded = live snap → snapTo expanded = no motion, content swaps. → **home tab**:
  postureSeat → homeSeat=middle → snapTo middle. Laundering structurally impossible:
  the arrival settle is programmatic. ✓
- **Drag favorites to half (middle)**: gesture settle, active scene bookmarks →
  contentSeat=middle. → profile: snapTo middle = no motion (owner's "stays half,
  content swaps"). → home: homeSeat. → favorites: contentSeat=middle. ✓
- **Docked-polls resurrect** (dismissed or physically hidden, press Search): homeSeat=
  'hidden' → postureSeat fallback = home seed 'collapsed' → sheet rises collapsed; the
  dockedPollsRestoreSnap:'collapsed' intent (kept, constant now shared) re-presents the
  lane; the collapsed settle's flag arm un-dismisses (unchanged). ✓
- **Search from favorites at half → dismiss**: capture = resolveSearchLaunchOriginSnap
  (bookmarks → contentSeat=middle); rich restore emits snapTo middle + the origin seam
  pre-writes contentSeat=middle (named writer — value-identical to the gesture that
  placed it). ✓ Byte-path of degenerate home restore untouched (golden assert green).
- **Polls-page X → home**: returnAppSearchRouteToDockedSearch now emits no sheetMotion
  → postureSeat → homeSeat (law: dismiss lands home at home's memory).
- **pollDetail close**: rememberedDetent(to=polls) reads homeSeat via the seat-routed
  getter — same restore semantics, now consistent with tab-return by construction.
- **Tab press from a child (e.g. settings→Search)**: postureSeat → homeSeat. From
  settings→Favorites: snapTo contentSeat (glides down from the pinned expanded if seat
  is lower) — consistent: the sheet always shows the target side's seat.

### Origin-capture coverage (verified, see report in final message)

- Capture is STRUCTURAL, not per-trigger: every route PUSH snapshots the departing scene's
  origin at commit — the two `pushRouteState` arms in `app-route-scene-switch-controller.ts`
  (:268 transition-plan commit, :950 direct push) both call `captureRouteEntryOrigin`, whose
  delegate is the ONE `buildCurrentOriginSnapshot` rule (home roots = degenerate at live seat;
  every other scene = rich capture merged onto the seat-read detent). So ALL search trigger
  sources — typed submit, shortcut chips, search-this-area, autocomplete pick, perf deep link —
  funnel through `openAppSearchRouteResults` → push → capture. In-session re-runs use
  routeAction 'preserve' (no capture needed — the session's origin is already held). **No
  coverage gaps found.** The capture detent now reads the posture seats via the rewritten
  `resolveSearchLaunchOriginSnap` (home seat for search/polls incl. hidden→resurrect posture;
  the ONE content seat otherwise) — the old per-tab + sharedSnap fallback arms are deleted.

### Build + verification status (2026-07-12, session 2 completion)

Tree inventory on resume: the pre-kill session had already built ~95% (table postureSeat rule

- rows, seat fields + write contract + **DEV** asserts, settleRouteSceneTabSnap deleted,
  origin-capture seat rewrite, NavSilhouetteHost constant, returnAppSearchRouteToDockedSearch
  derived motion, oracle spec tune, new jest spec). Finished this session: the last kill-list
  item — the polls transient-cover skip in `recordRouteSceneSnapFact` (dead under the write
  contract; the SEPARATE persistentSnaps cover skip at :1987 is a different store and stays).

Gates: tsc = only the 2 known pre-existing Camera-patch errors (runtime-inert, not ours);
eslint = 0 errors (6 pre-existing warnings in untouched lines); jest = 16/16 across the two
specs (frozen oracle parity sweep + the new snap-session law pins, incl. the RED laundering
test). scene-foundation-spec.ts NOT touched (its diff is the sibling's strip law; the final
design needs no posture field there).

Sim scenario sequence: first attempt aborted (dev client re-downloaded mid-flow — sibling
Metro rebuild; per protocol the whole sequence was restarted). Second run = ONE uninterrupted
flow on a verified-fresh bundle (`reload-dev-client.sh`, quiescent hash, boot clean), ALL PASS:
cold start home collapsed → home raised middle → Favorites EXPANDED (seed) → Profile no-motion
→ home MIDDLE (bug dead) → content dragged (collapsed then middle) shared across
Favorites/Profile with in-place content swaps → dismiss-X Favorites lands home at MIDDLE →
"Best restaurants" search from Favorites-at-middle → X dismiss = EXACT restore (Favorites,
middle) → home left collapsed → away → back → collapsed. Metro log: ZERO `[snap-law]`
contract barks, no NAV-CONTRACT / ReferenceError.

NOT COMMITTED — awaiting owner finger test (feel of the two-seat glide, the content-seat
collapsed posture as product behavior, and the pollDetail/settings closeChild restores).

---

## Leg 3 — hygiene (2026-07-12, post two-posture build)

Scope: the leg-1/leg-2 hygiene queue + one orchestrator red-team finding. All type-list-disease
class fixes; NOT COMMITTED (rides with the leg-2 tree).

### Item 1 — `resolveSheetPostureSeat` hardcoded scene list → DERIVED (built)

Attribution of the canonical root-page source of truth: there was NO single one — three
parallel hand lists encoded "root page": the seat resolver's if-chain, the descriptor table's
4 hand-written topLevelSwitch rows, and NavSilhouetteHost's `SEARCH_BOTTOM_NAV_ITEMS` literal.
The scene-policy registry (`app-route-scene-policy-registry.ts`) is the ONE existing exhaustive
`Record<OverlayKey, …>` in this territory, so that's where the declaration now lives:

- **`postureSeat: 'home' | 'content' | null`** added to every scene policy (search/polls =
  'home', bookmarks/profile = 'content', all children/modals = null). Exhaustive Record ⇒
  adding an OverlayKey without deciding its seat is a COMPILE error.
- **`resolveNavTargetPostureSeat`** (snap-session runtime) = registry lookup — the nav-target
  seat. **`resolveSheetPostureSeat`** (seat STORAGE routing) = same derivation with the one
  named structural exception, now declared once as `HOME_SEAT_CARRIER_SCENE_KEY = 'polls'`:
  on the home side only the carrier scene owns the home seat ('search' settles are the results
  sheet's, search-session facts). Behavior byte-identical to the old list (spec pins unchanged).
- **Descriptor rows DERIVED**: the 4 hand topLevelSwitch rows are now
  `APP_ROUTE_SCENE_KEYS.filter(seat != null).map(→ postureSeat row)` — a new root page gets its
  row by construction. `APP_ROUTE_SCENE_KEYS` = `Object.keys(registry)` (runtime enum list that
  grows with the type). The materializer's `search|polls` isHomeSide literal pair also now
  derives (`resolveNavTargetPostureSeat(to) === 'home'` + the carrier constant).
- **Tab set extracted to a pure module** `app-route-root-nav-items.ts` (`APP_ROOT_NAV_ITEMS`);
  NavSilhouetteHost consumes it — the tab enumeration is now importable by hermetic jest.
- **RED-provable contracts**: (a) jest sweep in the descriptor-table spec — every
  `APP_ROOT_NAV_ITEMS` key + the home carrier must resolve a non-null seat AND a 'postureSeat'
  rule. PROVEN RED: temporarily nulling profile's postureSeat failed 3 tests (both profile
  sweeps + the frozen-oracle parity), reverted. (b) `__DEV__` bark in
  `resolveDefaultSheetMotionPlan`: a topLevelSwitch to a TAB-SET target resolving to anything
  but postureSeat → `[snap-law] CONTRACT VIOLATION` console.error (scoped to the real tab set —
  the parity oracle legitimately sweeps topLevelSwitch across the full domain).

### Item 2 — `isSharedOverlaySnapOwner` → exhaustive Record (built)

Attribution: it gates `recordUserSnap` (the ONLY writer of the `sharedSnap`/`hasUserSharedSnap`
store, gesture-sourced settles only). Its own comment is honest: a CURATED product policy that
deliberately does NOT align with `role`/`sheetPolicy`/`snapPersistence` (includes
pollCreation/pollDetail + restaurant-under-search, excludes saveList + search), so true
derivation would change behavior — confirmed against the policy registry (`snapPersistence:
'shared'` is polls/bookmarks/profile/sheetHost — a different set). NOT dead post-leg-2 (store A
still has bootstrap readers, see item 3). Class fix applied = assert-exhaustive:
`SHARED_OVERLAY_SNAP_OWNERSHIP_BY_SCENE: Record<OverlayKey, 'owner' | 'owner-under-search-root'
| 'not-owner'>` — the silent degrade ("a forgotten scene simply won't persist") is now a
compile error. PROVEN RED: deleting the dmSession key → tsc TS2741, restored.
ADDING_A_SCENE.md §4 updated (both this and postureSeat).

### Item 3 — dual shared-snap stores: DESIGNED, NOT BUILT (owner sizing call)

Attribution (post-leg-2 exact):

- **Store A** `sharedSnap`+`hasUserSharedSnap` — domain middle|expanded, seed expanded/false.
  Writer: `setSharedSnap` ← `recordUserSnap` only (gesture + ownership record + hidden/collapsed
  filtered). Readers: (1) `resolveSheetRuntimeRegistrationSeedSnap`
  (host authority :1746-1761 — seeds a newly-registered sheet runtime when currentSnap is
  hidden), (2) `resolveInitialSharedSheetPosition` (use-app-route-shared-sheet-runtime :52-70 —
  docked-polls target position when the polls seat is hidden).
- **Store B** `persistentSnaps[ROUTE_SHARED_SNAP_PERSISTENCE_KEY]` — same effective domain
  (recordPersistentSnap rejects hidden always + collapsed for the shared key). Writers:
  `setSharedSnap` (lockstep with A) AND `recordSharedSheetSnap` on EVERY non-transient-cover
  settle of a `snapPersistence:'shared'` scene — including programmatic — AND the
  initial-visible bootstrap seed (:1733-1738). Reader: `syncInitialVisibleSnap` (:1817-1823,
  desiredSnap for the hidden→visible bootstrap; same reader also serves the per-scene
  `overlay:` keys, which are NOT part of this overlap).

So the overlap is real but NOT redundant: A = gesture-only shared posture; B(shared) = any-source
shared posture; they diverge exactly when a programmatic settle lands on a shared-persistence
scene. Since leg 2, both are vestigial-shaped: the two-posture SEATS are the law's memory, and
these stores only survive as boot/registration seeds.

**Designed end state (one store = the seats):** delete store A entirely
(sharedSnap/hasUserSharedSnap/setSharedSnap/recordUserSnap + the item-2 ownership record) and
delete the shared-key lane of store B (keep per-scene `overlay:` persistence untouched). The
three reader lanes re-route: registration seed + initial-visible bootstrap + docked-polls
initial position read the SEAT of the scene they're seeding (home seat for the docked-polls
surface incl. hidden→resurrect, content seat for tab pages; a CHILD scene's seed falls to its
policy `defaultFirstEntrySnap`, which every child already declares as 'expanded'). Write side:
nothing — the seats already have the gesture-only contract; `snapPersistence: 'shared'` in the
policy registry collapses to 'none' for those scenes (field may become 'none'|'scene').

**Sizing (why NOT built this leg):** ~5 files, net-deletion, BUT all three re-routed lanes are
BOOT-CRITICAL (cold-start seed, hidden→visible bootstrap, sheet-runtime registration) and the
child-scene seed semantics change (today a child registration can inherit the user's shared
drag; under seats it opens at its declared snap — arguably more law-consistent, but it is a
BEHAVIOR decision, not a refactor). Needs one focused session with `reload-dev-client.sh` sim
verification of: cold start, first docked-polls reveal, child open/close during boot, tab
round-trips. Wider than "trivially bounded" on top of the uncommitted leg-2 tree — owner
decides when to schedule.

### Item 4 — §9.5(c) post-soak cleanup ledger status (assessed, not built)

- **Item 1 probe teardown — STILL OUTSTANDING** (grep-verified): `logPageSwitch` family in
  BottomSheetSceneStackHost.tsx (:846/:1328/:1435/:1452/:1463/:1512/:1539) +
  BottomSheetSceneStackBodyLayer.tsx:194 + `[pageswitch] frame/watchdog/controller
replaced/activity` in scene-switch-controller + scene-stack-runtime + `bootstrap` in
  MainLaunchCoordinator.tsx:37 AND polls-feed-runtime-controller.ts:38 (the latter is FENCED
  this session — sibling agent). `[DISMISS-SEAM]` lines appear gone. The landmine note stands
  (host body-probe effect carries the functional recordSceneBodyAttached).
- **Item 5 dead `getRouteSceneVisibilityPolicySnapshot` — DONE** (0 hits repo-wide).
- **Item 4 rememberedDetent semantics question — SUPERSEDED/RESOLVED** by the leg-2 two-posture
  law (the owner's answer is the seats).
- **Items 2 (carrier shrink), 3+7 (SearchResultsPageBundleHost fold-in + sheetYValue thread),
  6 (host stale comments), 8 (CONTENT_MODE all-HARD, `held-dissolve` still present — 8 hits) —
  ALL STILL OUTSTANDING.** None trivially in-path with this leg (different files, one fenced);
  left for the post-soak sweep.

### Standing mandate — surfaced, not fixed

- `resolveDockedPollsRestoreSnap`'s `targetSceneKey === 'polls'` default arm (transition-policy
  runtime :463-482, flagged leg 2) still hand-encodes a home-posture default — third posture
  encoding largely dead post-law; candidates to fold into the seat read when next open.
- `resolveSnapPersistenceKey`'s `snapPersistence: 'shared'` scenes (polls/bookmarks/profile/
  sheetHost) vs the item-2 ownership record vs the seats = THREE adjacent "who persists what"
  vocabularies in one file chain; item 3's design collapses two of them — reinforces doing it.
- The frozen-oracle spec's `SCENE_KEY_DOMAIN` map is compile-tied via `satisfies
Record<OverlayKey, true>` (healthy pattern) — but several OTHER specs/files likely still
  hand-enumerate OverlayKey subsets; `APP_ROUTE_SCENE_KEYS` now exists as the runtime
  enumeration to migrate them to opportunistically.

---

## Leg 4 — store collapse (2026-07-12, executes leg-3 item 3, owner greenlit)

One store = the seats. Store A (`sharedSnap`/`hasUserSharedSnap`/`setSharedSnap`/
`recordUserSnap` + the item-2 ownership Record) deleted entirely; store B's shared lane
(`ROUTE_SHARED_SNAP_PERSISTENCE_KEY`, the `'shared'` case of `resolveSnapPersistenceKey`,
the shared-key collapsed filter in `recordPersistentSnap`, `snapPersistence:'shared'` in the
registry → `'none'`) deleted. Per-scene `overlay:` persistence machinery KEPT (the `'scene'`
case; no scene declares it today, but it is the declared per-scene lane, not this overlap).
Discovered while cutting: `sheetHost`'s `snapPersistence:'shared'` was already dead —
'sheetHost' appears as `activeSemanticOverlayKey` only in `EMPTY_MOTION_PERSISTENCE_INPUT`,
whose `activeShellSpec:null` short-circuits `resolveSnapPersistenceKey` to null first.

### Boot-reader walkthroughs (before → after, hand-executed pre-build)

All three stores are in-memory (session-scoped) — a warm relaunch re-seeds them identically
to cold start, so cold and warm boots share one walkthrough per reader.

**R1 — registration seed** (`resolveSheetRuntimeRegistrationSeedSnap`, fires when a sheet
runtime registers while `currentSnap==='hidden'` and the surface is visible):

- Cold/warm boot, home (seeded scene = 'polls'): BEFORE `hasUserSharedSnap=false` →
  `initialSnap` = policy default 'collapsed'. AFTER seat(polls)=home → `homeSeatSnap` seed
  'collapsed'. **Identical.**
- Mid-session re-registration, home raised by gesture to middle: BEFORE `sharedSnap='middle'`
  → middle. AFTER `homeSeatSnap='middle'`. **Identical** when the drag was home's own.
- Divergence (designed): user dragged PROFILE to middle (before: sharedSnap=middle bleeds
  into a polls-surface seed; after: homeSeat, home's OWN memory). Law-consistent by design.
- Child registration from hidden: BEFORE inherits the user's shared drag (middle only —
  store-A domain is middle|expanded and expanded equals the default); AFTER falls to
  `defaultFirstEntrySnap` (= 'expanded' for every child). See first-entry table below.

**R2 — initial-visible bootstrap** (`syncInitialVisibleSnap` → `desiredSnap`):

- Cold/warm boot, home: BEFORE persistedSnap null → policy 'collapsed'; the null-persisted
  write-back tried `shared:'collapsed'` and was silently REJECTED by the shared-key filter
  (a dead ritual every boot). AFTER seat read → homeSeat 'collapsed'. **Identical value**;
  the rejected-write ritual dies with the key.
- Hidden→visible mid-session (post-search re-present of docked polls): BEFORE store-B shared
  key = last non-collapsed settle of ANY shared scene, ANY source (programmatic included) —
  the any-source lane. AFTER homeSeat (gesture-only home memory, hidden→policy 'collapsed').
  Designed delta: this is the law's memory replacing the laundered store.
- bookmarks/profile bootstrap from hidden: BEFORE shared key; AFTER contentSeat. Same value
  whenever both were gesture-written; diverges only on programmatic settles (law-consistent).
- Children: BEFORE persistenceKey already null ('none') → policy default. **Unchanged.**

**R3 — docked-polls initial position** (`resolveInitialSharedSheetPosition`):

- Cold/warm boot: `currentPollsSheetSnap` (= homeSeat) 'collapsed' ≠ hidden → returned
  directly; the fallback branch not reached. **Identical.**
- Fallback branch (home seat 'hidden' = user dismissed docked polls, target shown again):
  BEFORE `hasUserSharedSnap ? sharedSnap : 'collapsed'` — i.e. a prior middle drag resurrected
  the feed at MIDDLE, contradicting the leg-2 resurrect contract (descriptor fallback =
  collapsed). AFTER `DOCKED_POLLS_RESURRECT_SNAP` ('collapsed') always. Designed delta and a
  consistency FIX: resurrect posture now single-sourced.

No behavioral delta found beyond the designed ones.

### Child first-entry before/after (R1 lane only — openChild snapTo expanded is untouched)

The change is visible ONLY when a child's sheet runtime registers while the sheet is hidden
AND the user had previously gesture-dragged an owner scene to 'middle' (store-A domain is
middle|expanded; expanded === the default, so no delta there). Normal child opens go through
the descriptor's `openChild → snapTo expanded` explicit motion, not the registration seed.

| child scene                                                                                                               | before (worst case)                                  | after                                       | feel-regression candidate?                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| saveList, userProfile, listDetail, followList, notifications, settings, editProfile, postPhotos, messagesInbox, dmSession | 'middle' (inherited shared drag)                     | 'expanded'                                  | No — all are `requiresExpandedPresentation:true`; expanded IS their contract                                                                                                                                                                                                                        |
| pollCreation, pollDetail                                                                                                  | 'middle' (they were store-A owners)                  | 'expanded'                                  | **Flagged for finger test**: a pollDetail re-registration mid-session used to inherit a raised-to-middle drag; now always expanded. Matches `requiresExpandedPresentation` + the openChild row, so expected to feel MORE consistent, but it is the one lane where a user-placed snap stops echoing. |
| restaurant                                                                                                                | 'middle' via shared drag OR its own 'middle' default | 'middle' (`defaultFirstEntrySnap:'middle'`) | No — default is middle either way                                                                                                                                                                                                                                                                   |

bookmarks/profile/polls are NOT children — they read their seats (R1/R2 above).

### Deletions executed

(net counts recorded post-gates below)

- `app-route-sheet-snap-session-runtime.ts`: store A deleted whole — `sharedSnap`,
  `hasUserSharedSnap`, `DEFAULT_SHARED_SNAP`, `RouteSheetSharedSnap`, `setSharedSnap`,
  `recordUserSnap`, `SHARED_OVERLAY_SNAP_OWNERSHIP_BY_SCENE` (the leg-3 item-2 Record),
  `isSharedOverlaySnapOwner`, `ROUTE_SHARED_SNAP_PERSISTENCE_KEY`, and the shared-key
  collapsed filter in `recordPersistentSnap` (~110 lines).
- `app-route-sheet-host-authority-controller.ts`: `recordUserSnap` call deleted; the
  `'shared'` case of `resolveSnapPersistenceKey` deleted; NEW `resolvePostureSeatSeedSnap`
  (the ONE seat boot read) wired into `resolveSheetRuntimeRegistrationSeedSnap` and
  `syncInitialVisibleSnap`'s `desiredSnap`.
- `use-app-route-shared-sheet-runtime.ts`: `resolveInitialSharedSheetPosition` loses the
  store-A params; hidden branch = `DOCKED_POLLS_RESURRECT_SNAP`; both call-site snapshot
  reads deleted.
- `app-route-scene-policy-registry.ts`: `snapPersistence` narrowed to `'none' | 'scene'`;
  polls/bookmarks/profile/sheetHost → 'none'.
- `ADDING_A_SCENE.md` §4: ownership-record bullet deleted.
  Scope stayed at the leg-3 sizing (4 code files + 1 doc); no wider threading encountered.

### Gates + sim (2026-07-12)

tsc = only the 2 known pre-existing Camera errors; eslint = 0 errors (6 pre-existing
warnings, the 2 new unused-var warnings from the recordUserSnap removal cleaned); jest =
23/23 suites, 263 tests (frozen-oracle parity + leg-2 law pins + leg-3 sweeps untouched,
all green — no spec referenced the deleted stores, confirming they were law-invisible).

Sim: ONE uninterrupted flow on a verified-fresh bundle (`reload-dev-client.sh`, quiescent
hash b3203dd3, boot clean): cold start home COLLAPSED → gesture to middle → Favorites
EXPANDED (content seed) → Profile no-motion → home MIDDLE → Favorites dragged to middle →
Profile at middle (in-place swap) → dismiss-X lands home at MIDDLE → Favorites (middle) →
"Best restaurants" search → results → X dismiss = EXACT restore (Favorites, middle) → home
dragged to collapsed → away → back → COLLAPSED → warm relaunch (verified reload) → home
COLLAPSED. Metro delta scan across the whole flow + relaunch: ZERO `[snap-law]` barks, zero
NAV-CONTRACT, zero ReferenceError. NOT COMMITTED — rides the leg-2/3 tree for the owner's
finger test (flagged item: pollCreation/pollDetail hidden-registration seed no longer
inherits a user middle-drag — see the child first-entry table above).

---

## Leg 5 — child-transition primitive audit + §4 rotation design (2026-07-13, read-only)

Wave-2 charter §4+§5 executed as design/audit; full design of record =
**plans/child-transition-primitive.md** (owner review gates leg 6). Verdict in one line:
the transition machinery is UNIFORM and half-built-correct (all scenes seeded hard-swap);
the jank is (a) four unsynchronized commit clocks (PF/header, scene-stack body dispatch
flushed last, UI-thread paint-ack opacity, nav-out route projection) and (b) child panels
seeding ActivityIndicator instead of the ALREADY-DECLARED foundation skeletons
(scene-foundation-spec rows exist for all 16 scenes; ADDING_A_SCENE.md §5 row 3 still
names the dead SCENE_STACK_BODY_SKELETON_SPECS table). Design: one PF chrome clock
(nav-out + headerNavAction become frame fields), SceneBodyReadyGate (declared skeleton,
spinner sweep = 10 panel files + Button.tsx), reveal joins {paintAck, chromeAck}.
Rotation: prior art ALIVE (OverlayHeaderActionButton.tsx, 45°·progress twist, 220ms
cubic; polls wiring removed in e9bd105a) — rebuilt as ONE host-owned HeaderNavAction on
the persistent header, progress = role-derived (topLevel=red plus, child=black X),
clockwise on push from press-up, ccw on dismiss, X↔X child-to-child. Nav re-tap =
extend-only NAMED product intent (sanctioned seat-writer category c), third tap inert.
Overlap fence recorded in the doc §4: core build files (scene-switch-controller,
BottomSheetSceneStackHost, panels except 3) are CLEAN; PersistentSheetHeaderHost /
scene-foundation-spec / 3 panels carry strip-wave diffs; results-presentation family =
transition-perf session. No code changed this leg.

---

## Leg 6 — build: the child-transition primitive (2026-07-13)

Design of record (plans/child-transition-primitive.md) built in full. Gates: tsc = only the 2
known Camera errors (+1 CONCURRENT error in fenced PollsPanel.tsx:459 owned by Strip leg 7's
live toggles/ edits — not ours, untouched); eslint = 0 errors (every warning our diff introduced
cleaned; remaining warnings live in other sessions' dirty files); jest = 25 suites / 280 tests
green incl. the 2 new sweep suites (13 tests). NOT COMMITTED. SIM = PENDING (Strip leg 7 owns
the simulator and is mid-leg per its ledger — its tail even records observing our mid-edit tree).

### 1. PF chrome clock (built)

- `PresentationFrame` gains `isChildSceneRevealed` (top-of-stack role === 'child'; exact parity
  with the deleted writer's selector — jest-swept over the LIVE metadata table) and
  `headerNavAction: 'create' | 'close'` (`resolveHeaderNavAction(presentedSceneKey)`: null→create,
  'search'→close, topLevel→create, else close). Both minted in `resolveNextPresentationFrame`,
  both in `arePresentationFramesEqual` (snapshot-equality law).
- DEAD: `nav-out-derivation-store.ts`, `use-app-route-nav-out-derivation-writer-runtime.ts`, the
  AppShellMainNavigator mount. Consumer (`use-search-foreground-bottom-nav-visual-runtime`) reads
  `useIsChildSceneRevealed(routeSceneSwitchRuntime)` — new field-selector bridge in
  use-presentation-frame.ts (`usePresentationFrameSelector`). Nav-out now starts on the PF
  commit — the same commit as title/strip/rotation, by construction.

### 2. HeaderNavAction (built)

- `overlays/HeaderNavAction.tsx`: ONE host-owned control on PersistentSheetHeaderHost — two
  stacked LucidePlus glyphs (RED #e11d48 @0 = parents, BLACK @1 = children), stack rotates
  45°·progress (plus rotated 45° IS the X); driver = `frame.headerNavAction` →
  `withTiming(220ms, Easing.out(cubic))` in the host (starts on press-up because the PF commit
  IS press-up). cw on push, ccw on dismiss, X↔X inert between children.
- Press routing = `header-nav-action-registry.ts` (module-scope): CLOSE override lane
  ('search' → closeSearchResultsSession, 'restaurant' → live-state onRequestClose token-guarded
  session close) else canonical `closeActiveRoute`; CREATE lane (panel-registered) else host
  fallbacks: polls → bare `pushRoute('pollCreation')` **with a dev warn** (PollsPanel's
  market-gated create is FENCED to the strip wave — it must `registerHeaderCreateAction('polls', …)`
  when it lands), bookmarks → **unwired dev-bark** (create form is BookmarksPanel-internal state,
  fenced — register `openCreateForm` there), **profile → OWNER-OPEN STUB that dev-barks**
  (charter §9, flagged).
- DEAD: per-scene Action factories in ChildScenePanels (6 scenes), PollDetailPanel,
  PollCreationPanel, MessagingPanels (×2), PostPhotosPanel, RestaurantPanel (bespoke
  headerCloseButton), ProfilePanel (the parent X — parents now non-dismissable), ListDetailPanel,
  search-results-header-live-state — 14 scene registrations. The 3 FENCED panels (Bookmarks/
  Polls/SaveList) still register `Action:` — the slot is optional+documented-dead; the host
  ignores it (delete with the strip wave).
- EXTRAS seam (§3.5): descriptor gains `Extras?: ComponentType<{transitionProgress}>` — the SAME
  progress SV as the rotation. First consumers: pollDetail's share button and restaurant's
  heart+share (both now fade in synchronized with the plus→X, starting on press-up). ListDetail's
  ellipsis inherits the shape.
- DEAD (the whole old driver chain): `useOverlayHeaderActionController.ts` (file),
  `headerActionPolicy` (type + metadata field + 21 per-key values + resolver),
  `headerActionModeTarget` (transition contract + plan + dispatch selector),
  `resolveAppRouteSceneHeaderActionModeTarget`, the native mode machinery in
  app-route-native-overlay-target-authorities (resolveOverlayHeaderActionMode + scene-mode helper
  - reset-token/close-handoff latches; the sheet-policy null gate proven equivalent — the mode
    resolver's null arm WAS the scene-null condition), `headerActionModeValue`/`headerActionVisible`
    (+ middle/collapsed snap SVs, driver-only) in frame-host native targets, the frame-host
    follow-collapse driver, and the `overlayHeaderActionProgress` SV plumbing across 19 files
    (creation → contracts → read-models → live-state).

### 3. SceneBodyReadyGate + spinner sweep (built; lint ban proven RED)

- `overlays/SceneBodyReadyGate.tsx` + `SceneBodySceneKeyContext` (provided by
  SceneStackBodyContentLayerHost around the content layer): a pending body renders its DECLARED
  `SCENE_FOUNDATION_SPECS` skeleton — no call-site skeleton choice; unresolvable scene = loud
  [FOUNDATION] bark.
- eslint ban (apps/mobile/.eslintrc.js): `no-restricted-syntax` on the ActivityIndicator import
  from react-native, scoped `src/overlays/panels/**` + `Button.tsx`. **Proven RED on 11 files
  before the sweep, 0 after.**
- Sweep: content gates → gate in NotificationsPanel, FollowListPanel, UserProfilePanel,
  EditProfilePanel, MessagingPanels (inbox + dm), ListDetailPanel (7 gates; loading testIDs
  preserved); button/inline spinners → SquircleSpinner in Button.tsx (the SHARED primitive — all
  consumers inherit), EditProfile (avatar + save), PostPhotos (2 inline + submit), ListDetail
  (save + join), ChildScenePanels settings blocked-users inline row, ProfileSectionsBody
  SectionLoading (in-page slices under an instant shell → inline squircle by design).
- NOT swept (fenced): BookmarksPanel Save spinner + footer (strip leg's home-edit deletion kills
  it). Out of scope (not sheet pages, flagged): Onboarding.tsx, PaywallScreen.tsx,
  CameraCaptureHost.tsx.

### 4. The joined reveal (built; watchdog jest-proven RED)

- `overlays/scene-chrome-ack-runtime.ts`: single-writer chromeAck store —
  PersistentSheetHeaderHost records the presented sceneKey in a post-commit useLayoutEffect
  (recorded even when the descriptor is missing so the reveal can't deadlock on the
  missing-descriptor bug — that bark is the signal). `joinSceneChromeAck(scene, flip)` =
  synchronous when matching, else subscribe + **34ms (2-frame) watchdog → degrade with a loud
  [JOINEDREVEAL] console.error** (jest: suppressed ack ⇒ bark + degrade; cancel ⇒ never fires).
- BottomSheetSceneStackHost: all three REVEAL flips join {paintAck, chromeAck} — the warm PF-flush
  early flip (the exact source of the nav-page one-beat lag: it reached the UI thread a frame
  before the header's React commit; it now lands in that commit's layout phase), the real
  onLayout paint-ack, and the synthetic warm-leg ack. HOLD writes (paintAck=0) stay immediate;
  cold legs keep the commit-reconcile timing (already same-commit as the header). One pending
  join, superseding reveals cancel their predecessor.
- Walkthroughs (hand-executed): tab switch polls→bookmarks = one commit paints title+strip+body,
  flip in its layout phase ⇒ one-beat; child push messages = PF commit swaps title + starts
  rotation + nav-out, gate paints the 'comment' skeleton frame-1, ack joins chrome ⇒ no bare
  frost; dismiss symmetric (warm parent + ccw rotation + nav-in on the same PF commit);
  docked-polls re-present: ack already 'polls' ⇒ join synchronous, old timing byte-preserved.

### 5. Nav re-tap (built; snap-law RED pinned)

- `extendActiveRootFromNavReTap` (app-search-route-command-runtime, peer of
  primeDockedPollsForHomeLanding): promoteAtLeast('expanded') + seat write `writer:'named'`
  (home taps write the CARRIER 'polls' home seat; bookmarks/profile the content seat).
  NavSilhouetteHost fires it on an active-root re-tap (stack depth 1, target === active key);
  docked-polls resurrect keeps precedence. Extend-only: promote is inert at expanded and the
  seat write value-idempotent ⇒ third tap does nothing. Jest: named write lands; the SAME write
  routed 'programmatic' is dropped with the [snap-law] bark (RED).

### 6. Docs

- ADDING_A_SCENE.md §5: row 3 rewritten (dead `SCENE_STACK_BODY_SKELETON_SPECS` →
  `SCENE_FOUNDATION_SPECS`, Partial-Record caveat deleted — the table is exhaustive; ready-gate +
  lint ban named); row 6 now covers nav-out AND the header action as PF-derived law (do NOT
  register per-scene close buttons).

### Overlap fence notes

- PersistentSheetHeaderHost / scene-foundation-spec / NavSilhouetteHost edited ADDITIVELY over
  the in-flight strip-wave/snap-law diffs (diffed first; strip mount + law barks preserved).
- Strip leg 7 was live-editing toggles/ during this build (ToggleStrip.tsx mtime mid-session);
  its in-flight PollsPanel tsc error (PollFeedSort|null at :459) is theirs and untouched.
- Fenced panels untouched: BookmarksPanel, PollsPanel, SaveListPanel, toggles/\*\*.

### SIM VERIFICATION: PENDING

Strip leg 7 owns the simulator and is not marked complete. Finger/sim checklist for whoever runs
it: child push (messages/settings/listDetail) = press-up → title + plus→X cw rotation + nav-out
in one beat → DECLARED skeleton (never spinner/bare frost) → one joined reveal; dismiss
symmetric (ccw); tab switch = content+header+strip one beat (zero [JOINEDREVEAL] barks in
Metro); re-tap extends + third tap inert (zero [snap-law] barks); polls plus opens creation
(expect the dev warn until PollsPanel registers its market-gated create); profile plus barks
(owner-open stub); restaurant close still exits the session cleanly; search results X unchanged.

---

## Leg 7 — integrations + sim (2026-07-13)

Fast integration leg on the post-strip-restructure tree (strip ledger Leg 7 panels unfenced).
Gates: tsc = only the 2 known Camera errors; eslint 0 on all touched files; jest 25 suites /
280 tests green. NOT COMMITTED.

### Built

1. **Polls plus wired**: the market-gated create (market params + "Pick a market" modal,
   formerly `PollsPersistentHeaderAction`) now registers via
   `registerHeaderCreateAction('polls', …)` from a hook on the header Title mount
   (`usePollsHeaderCreateActionRegistration` in PollsPanel.tsx — a REAL committed component;
   the body-spec hooks never commit effects). Host fallback + dev warn kept as the
   pre-effect-commit safety net (comment updated in PersistentSheetHeaderHost).
2. **Lists plus wired**: `registerHeaderCreateAction('bookmarks', openCreateForm)` from
   BookmarksDataSurface. **FLAG for owner**: the compact "New list" row below the grid now
   duplicates the plus — kept per instruction, delete on owner's word.
3. **Dead `Action:` slots deleted** in the 3 formerly-fenced panels (Polls/Bookmarks/SaveList)
   - their now-unused OverlayHeaderActionButton/useSharedValue/ACTIVE_TAB_COLOR imports.
     **saveList got a close OVERRIDE** (`registerHeaderCloseAction('saveList',
handleCloseSaveSheet)` from its Title mount): its close is a SESSION verb (clears
     saveSheetState AND pops); bare closeActiveRoute would leave `saveSheetState.visible`
     dangling (no route-watching reconciliation exists — verified).
4. **Followers/Following one-liner**: own-profile stat blocks are now Pressables →
   `pushRoute('followList', {userId, mode})`, exactly the UserProfilePanel pattern.
   Plumbed as `onOpenFollowList` through contract → actions runtime (owns the push) →
   body-model (binds resolved userId; inert while loading) → identity runtime → chrome.
   testIDs `profile-followers` / `profile-following`.

### Sim checklist (verified-fresh bundles via reload-dev-client.sh; Metro delta scans)

- Polls plus → market-gated "Add a poll in Austin" creation sheet, ZERO fallback warns — PASS.
- Dismiss symmetric (creation X → polls feed, plus back red) — PASS.
- Lists tab switch = title+strip+grid one beat — PASS (first attempt failed on a STALE MIXED
  bundle after a host SpringBoard crash + a Fabric uiManagerDidDispatchCommand segfault on
  relaunch; on a rig-verified bundle the same tap is correct. Environment, not code).
- Lists plus → Create list form (registered action) — PASS; Cancel restores the New-list row.
- Profile Followers/Following taps → followList child w/ seeded fixtures, X + nav-out — PASS.
- Child pushes (messagesInbox, settings, listDetail): press-up → title + X + nav-out one beat →
  declared skeleton/no spinner → joined reveal; dismiss returns to EXACT parent — PASS
  (messages dismiss once landed home mid-run: attributed to a sibling-session HMR module reset
  — duplicate 'listDetail' descriptor registration + switchId counter reset in the log; clean
  bundle repro = correct).
- Re-tap extends (bookmarks collapsed→expanded AND home docked-polls collapsed→expanded,
  motion log shows the promoteAtLeast), third tap inert — PASS. ZERO [snap-law] barks.
- ZERO [JOINEDREVEAL] barks across the whole session.
- Strip §1 eyeball: polls Top selection slides the period chip ("All time") into the strip,
  feed re-sorts; Live · 3 / Closed vocabulary intact after my integrations — PASS.

### Notes / flagged (not fixed)

- followList header title is the static 'Followers' from CHILD_HEADER titles even in
  'following' mode (body section label IS mode-correct) — pre-existing, applies to
  UserProfilePanel pushes too; one-line fix wants a mode-aware Title.
- [FOUNDATION] strip-declaration barks seen mid-session were from stale bundles; the
  scene-foundation-spec rows already declare 'header' for polls/bookmarks — no action.
- Sim contention: the ListDetail sibling was live-editing during runs (HMR resets mid-flow);
  every verdict above was taken from a rig-verified fresh boot.
- tapOn-id gotcha (new): a header-strip chip on a COLLAPSED docked sheet hit-tests under the
  bottom nav — maestro id-taps land on the nav button occupying those pixels. Expand first.

---

## Leg 8 — wave-3 corrections §2.2/§2.3/§2.5/§2.6/§2.7 (2026-07-13; RETRY — prior process died mid-leg)

Gates: tsc = only the 2 known Camera errors; eslint 0 on touched files; jest green
(scene-chrome-ack suite 10/10 incl. 3 new cache tests; runtime+overlays+reorder sweep
166/166). NOT COMMITTED. Sim = iPhone 17 Pro rig, verified-fresh bundles via
reload-dev-client.sh; Austin re-pinned.

### Inventory (dead process left §2.3 + §2.6 BUILT in-tree, ledger unwritten)

- §2.3 X-glyph revert: HeaderNavAction.tsx already rewritten (mtime 13:39) — ONE LucideX
  glyph (the OLD close icon, arms span the full diagonal), two color layers (red@0/black@1),
  stack rotates 45·(1+progress)° (X rotated 45° IS the plus; LucideX is 90°-symmetric so
  progress=1 renders the canonical X). Comment cites wave-3 §2.3. VERIFIED on sim: one glyph,
  cw quarter-twist on push, ccw on dismiss, visibly larger than the old rotated-Plus.
- §2.6 listDetail return posture: descriptor table already carried (mtime 13:40) a
  `listDetail closeChild → rememberedDetent (fallback expanded)` row (same rule as
  pollDetail/settings; the origin-restore seam pre-writes the popped-to scene's captured
  posture). VERIFIED on sim: push listDetail from expanded Lists home → sheet drops to
  middle (open row) → X dismiss → Lists home restored at EXPANDED. Descriptor jest 11/11.
- §2.2, §2.5, §2.7: no trace — unstarted by the dead process. Built/designed this leg.

### §2.7 strip-gap on child push — ROOT CAUSE + FIX (built, sim-verified)

Root cause (primitive layer, exactly as the owner demanded): the persistent header's Strip
slot unmounts on the PF commit — the chrome box shrinks in that committed frame — but every
leg's body-lane top inset (reservedHeaderHeight) came ONLY from the header wrapper's
onLayout → setState in BottomSheetSceneStackHost, one-plus frames LATER. Between commits the
hoisted frost shows as a see-through band between chrome bottom and body top.
Fix (no skeleton, no timer): a measured-chrome height cache in scene-chrome-ack-runtime.ts —
the header host records (sceneKey, wrapperHeight) in its chrome onLayout; each scene-stack
leg derives ITS OWN scene's chrome height SYNCHRONOUSLY at render (exact measurement →
same-composition-signature measurement (strip×grabHandle from the foundation table; spec-less
'search' can neither donate nor receive) → retained shared measurement as the cold-first
fallback). The hoisted scroll divider derives the presented scene's height the same way.
onLayout stays the truth-updater. Files: scene-chrome-ack-runtime.ts (+spec),
PersistentSheetHeaderHost.tsx, BottomSheetSceneStackHost.tsx. SIM: 30fps frame-by-frame of
bookmarks→listDetail — strip unmount, title swap, and body-lane move land in ONE frame; zero
frost band, divider flush, glyph mid-rotation in the same frames.

### §2.2 choppiness — MEASURED, attributed (numbers)

Rig-verified bundle, JS+UI frame samplers ([SearchPerf]), scenario leg8b; commands timed:

- Tab switch (bookmarks↔profile, 3 switches): ONE long JS frame per switch — 65.9 / 63.9 /
  59.6 ms (~4 dropped frames), occasionally one UI-thread 64.9ms frame; all other windows
  60fps flat (stallCount 0 in 179/189 windows).
- Child push (listDetail): JS 126.3ms + 210.1ms (~0.1s and ~0.56s after the command — mount
  commit then results hydration), UI 83.3ms, then flat.
  Verdict: CODE (a single long JS commit building the incoming page's body subtree), NOT the
  joined reveal — zero [JOINEDREVEAL] barks all session; the chromeAck join adds no frame (it
  lands in the header commit's layout phase — same-frame semantics by construction, nothing to
  desync). This render-cost class is exactly the transition-perf session's in-flight charter
  (their ledger: list subtree = cost center; next = sceneBodyContent churn + press-up diet).
  Recommendation: hand these numbers to that session; no change made here (their live surface).

### §2.5 dismiss content-swap law — DESIGN + STOP (landing zone is the perf/map session's live files)

Confirmed live: the results-presentation close family (use-results-presentation-close-\*,
owner-close, close-transition state) all carry fresh perf-session mtimes — per charter, design
locked here, build gated on their commit (step-1-gate pattern).
Design (snap-progress-derived, zero timers): ONE primitive `joinSnapArrival(targetSnap, onArrive)`
on the snap-session/spring runtime — subscribes to the sheet position on the UI thread and fires
(runOnJS) when the glide first reaches/crosses the bottom-snap Y (epsilon = spring settle band);
synchronous when already at bottom. The close transition then becomes: (a) dismiss pressed at
bottom snap → arrival is synchronous → swap on press-up (owner's degenerate case, free);
(b) dismiss from higher snaps → results content FROZEN (no clearSearchState, no leg swap; the
presented results leg keeps painting its last committed frame) while the sheet glides;
`joinSnapArrival('collapsed', …)` fires the single swap commit (origin content + finalize/clear)
at/just-before arrival. Superseding motion cancels the pending join (same cancel discipline as
joinSceneChromeAck). RED-provable: suppress the arrival signal ⇒ content never swaps (loud
watchdog bark, degrade to arrival-by-settle), swap-before-arrival assert in dev.
STOPPED here per charter — recommend building it as the first step of the perf session's
world-push/dismiss leg, immediately after their tree commits.

### Environment / contention notes

- Sibling sessions live-edited FENCED files mid-run twice (RestaurantResultCard.tsx
  'LucideShare' redbox 13:58; ListDetailPanel.tsx 'openRename' redbox 14:03) — both cleared
  by their subsequent saves + a verified reload; all verdicts above taken on clean boots.
- perf-scenario-command deep links are IGNORED without an active scenario
  (`no_active_scenario`) — always open `crave://perf-scenario?scenario=…` first.
- simctl recordVideo must be stopped with SIGINT (plain kill leaves no moov atom).
- LEG 8 SIM USE COMPLETE — rig free for the Strip retry.

## Leg 9 — home-edit child-page conformance: edit-session liveness on the PF chrome clock (2026-07-13)

Executes the wave3-conformance-audit ND #1 adjudication (W2-8 / W3-5): during HOME edit the
tab bar stayed and the header kept the LIVE red plus, because nav-out + headerNavAction
derived purely from route ROLE (bookmarks = topLevel). The primitive's close-override was
dead on home.

**The derivation (built exactly as the audit's ideal shape):**

- NEW `edit-session-liveness-contract.ts` (navigation/runtime, dependency-free) — the same
  module-scope registry pattern as header-nav-action-registry: `publishEditSessionLive(sceneKey)`
  (counted per scene, release fn), `isEditSessionLiveOnScene`, `subscribeEditSessionLiveness`.
- `useEditModeSession` publishes liveness from its own effect (same lifecycle as the edit
  lock — can't outlive session or unmount). No store back-channels.
- `resolveIsChildSceneRevealed` + `resolveHeaderNavAction` take liveness as a PURE input:
  live session ⇒ nav-out true + 'close' on that scene; dead ⇒ role derivation unchanged.
- AppRouteSceneSwitchController subscribes at construction and RE-MINTS the frame on change
  (same one-writer law as the lane inputs, §9.1 R1); unsubscribes in dispose. One chrome
  clock preserved — the header X, nav-out, and rotation all commit on the one PF commit,
  and the primitive's existing close-override answers the X as CANCEL.

**RED contracts (presentation-frame-chrome-clock.spec.ts):** live ⇒ close/nav-out on EVERY
scene (metadata-table sweep, type-list-disease-proof); dead ⇒ exact role parity (existing
sweeps, now with the flag); controller-level publish→re-mint→deliver + release→restore +
scene-scoped no-leak; liveness counting/idempotent-release. RED-proven by self-mutation
(controller ignoring liveness ⇒ integration test fails). Gates: jest 28 suites/314 green,
lint 0, tsc = the 2 known Camera errors only.

**Sim (rig, iPhone 17 Pro, Austin):** home → My ranking → Edit ⇒ sheet extends full AND tab
bar transitions out AND plus becomes X; clean X ⇒ immediate exit; dirty (drag reorder) X ⇒
"Discard changes?" Keep editing/Discard; Discard reverts + restores plus/tab bar, sheet stays
extended; Save persists order + restores chrome; ListDetail edit UNCHANGED (X stays X,
promote, action row, Cancel fine). Tab-switching mid-edit impossible by construction (nav-out).

**INCIDENT + RECOVERY (recorded so it's never repeated):** a RED self-mutation check ended
with `git checkout` on app-route-scene-switch-controller.ts, which reverted UNCOMMITTED leg-6
chrome-clock work in that file (HEAD predates it). Recovered byte-exact from in-context reads:
reconstructed the full file, diffed vs HEAD (only the expected hunks: +2 resolver imports,
−2 headerActionModeTarget lines deleted by leg 6, +8 chrome-clock frame fields), re-applied
leg 9 on top; tsc/lint/jest/sim all green after. NEVER `git checkout` a tracked file in this
uncommitted tree — revert edits by editing.

LEG 9 SIM USE COMPLETE — rig free. UNCOMMITTED like the rest of the wave.
