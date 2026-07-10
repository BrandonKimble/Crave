# S-C — De-special search (execution plan)

**Charter:** plans/trigger-nav-ideal-verdict.md S-C + §5.1/§5.3. Presenting a search session is a
PUSH; roots persist ("you're still on Favorites" becomes map/route truth); dismiss is a pop
restoring the popped entry's origin; the single-slot capturedOriginContext dies; the nav law
reaches final form (depth-derived, no interim clause). Grounded in the 2026-07-09 cut-surface
sweep (9 traps).

## The load-bearing design fact

The search HOME is already a depth-1 `search` root. A search SESSION is therefore just ANOTHER
`search` entry pushed on top — S-B's same-key nesting (push always stacks; a leg renders from
the top-most entry of its key) powers search-as-push with no new stack machinery:

- Home submit: stack `[search#home] → [search#home, search#session]` (same-key push).
- From Favorites: `[bookmarks] → [bookmarks, search#session]` — root stays bookmarks, tab
  highlight + chrome derive correctly, docked-polls lane correctly absent (root ≠ search).
- Docked polls stay EXACTLY the depth-1 search-home feature the lane formula already encodes
  (`rootOverlayKey==='search' && stackLen<=1`) — the formula is CORRECT under the ideal, not a
  casualty.
- Dismiss (X) = closeActive pop; entry-origin restore (already shipped) replaces the slot; the
  child-anchor re-push (dismiss lands on pollDetail@comment) reads entry.origin.anchor.

## What dies

`ensureAppSearchRouteSearchEntry` + `ensureAppSearchRouteSearchScene` (the re-roots — incl.
their BUG-1 child-clobber), `handleRootOverlayTransition`'s re-root reflex, the single-slot
capturedOriginContext + armSearchCloseRestore slot mechanics (the restore VERBS stay, fed by
entry origins), and eventually the multi-switch reveal-supersede correlation (born from the
setRoot dance — audit for deadness AFTER the push conversion, not in the same slice).

## The predicate split (trap: ~90 rootOverlayKey sites conflate two meanings)

- **Root identity** ("which tab am I on"): tab highlight, chrome mode, docked-polls lane,
  static-scene mounts — KEEP reading rootOverlayKey; they become CORRECT once roots persist.
- **Search-session presence** ("is search UI active"): isSearchOverlay-style consumers that
  actually mean "a search session is presented" — re-point to a new derivation
  `isSearchSessionPresented` (a `search` entry is top-of-stack at depth>1, OR the depth-1
  search root has a presented world — the §5.1 interim, deleted at the end of S-C).

## Slices

- **S-C.1 — the predicate.** Introduce the presence derivation; classify + re-point the
  misclassified isSearchOverlay consumers. Behavior-preserving under setRoot (root==search
  implies presented today; assert equivalence on the rig).
- **S-C.2 — push from non-search roots.** Favorites/profile launches present via
  `routeAction:'push'` (target search) instead of the entry re-root; dismiss = pop + entry
  origin (the shipped machinery); the slot bypassed on THIS path. Rig: favorites list →
  results → dismiss → Favorites root never destroyed (tab highlight survives the WHOLE flow).
- **S-C.3 — home search + slot deletion.** Home submit = same-key push over search#home;
  delete ensure\*/handleRootOverlayTransition/slot; nav law final form (delete the interim
  clause); child pushes stop re-rooting (restaurant from results pushes OVER the session).
- **S-C.4 — cleanup pass.** searchRoute shell rename/dissolve decision, reveal-supersede
  correlation deadness audit, readiness-lift into the generic push (search keeps its 3-gate
  content join as the per-target contract — already table-driven).

Validation per slice on the rig; red team (3 auditors) after S-C.3 lands, before S-C.4.

---

## S-C.2 WIP status (2026-07-09 ~01:50, UNCOMMITTED working tree)

Sequencing amendment executed: S-C.2 (push conversion) ran FIRST so misclassified consumers
show RED empirically (attribute-before-ideate); S-C.1's predicate work happens as those fixes.

**Built (uncommitted, tsc + 93 jest green):**

- `prepareSearchSessionEntry`: bookmarks/profile roots skip slot-capture + re-root (push path).
- `openAppSearchRouteResults`: `routeAction:'push'` when root is bookmarks/profile.
- Pop dismiss branch in `use-results-presentation-close-actions-runtime` (before the rich
  seam): pushed session (top='search', depth>1, root bookmarks/profile) → clearSearchState +
  `closeActiveRoute()` + `requestSearchBottomNavMotionTarget('show')` (the submit choreography
  commands nav out; the pop path owns commanding it home — terminalDismiss is skipped).
- Origin-restore DELEGATE (route-entry-origin-capture-delegate gains restorer channel):
  session controller registers detent-ledger write (`recordRouteSceneSheetSettle`) + scroll-
  lane staging; `closeActiveRoute` stages BEFORE requesting the switch (plan reads the ledger —
  commit-time staging is a stale read); reducer paths keep fallback staging.

**Rig-validated GREEN:** favorites list → results present as PUSH over bookmarks root (frame:
active search / interKey bookmarks), full reveal (cards+world), X-dismiss pops to Favorites
with content intact AND the nav bar returns with the Favorites tab still highlighted — the tab
invariant held through a whole search session for the first time.

**OPEN RED (next attribution — findings so far):** the pop lands the Favorites sheet at
MIDDLE, not the captured EXPANDED detent, with home search-bar chrome above. RULED OUT:
(a) wrong captured detent — the [SC2-DET] probe (still in the session controller, TEMP) shows
`restore scene=bookmarks detent=expanded` staged correctly; (b) transition KIND — closeActive
from source 'search' now resolves 'closeChild' (policy-runtime change, in the WIP tree) and
the landing did not change. REMAINING HYPOTHESIS: the ledger route is simply not consulted for
this row (or is overridden); the OLD seam (restorePendingOrigin) applied the detent as an
EXPLICIT snapTo on the restore switch. Next step: have the pop path pass the popped entry's
origin.detent as explicit sheetMotion (a closeActiveRoute variant carrying snap), or route the
pop through restorePendingOrigin's application mechanics — decide which is the ideal seam
(explicit-origin-motion on pops is principled: origin restore has ALWAYS been an explicit
application, not a remembered-snap default). Chrome-mode check still pending after detent.

**Then:** finish S-C.2 rig matrix (profile root launch; restaurant child push FROM the pushed
session — child-over-session stacking; failure/offline dismiss), commit, then S-C.3 per plan.

## ✅ RESOLVED (24efdca2): zombie-results regression — surface session-exit finalize

MINIMAL REPRO (fresh boot → favorites → results-push → X-pop → tab switches): the pop itself
is GREEN, but afterwards the tabs are polluted. SHARPENED FINDING (second run): the pollution
is a ZOMBIE RESULTS SURFACE — a stale collapsed "Results" sheet (skeleton cards, empty query)
resurfaces over the search home after tab switches; on the first run it manifested as
no-sheet-at-all on every tab. ROOT SHAPE: the pop path exits the ROUTE (closeActiveRoute) and
clears the desired state (clearSearchState skipPostSearchRestore) but the RESULTS-PRESENTATION
machine never runs its surface-exit — the rich seam paired the clear with
dismissRestoreToTopLevelRichOrigin, and the terminalDismiss path runs
requestClosePresentationIntent; the pop path does NEITHER. RESOLVED: probe showed
phase idle + bottomBandOwner results_header + animatedSearchTransition clip = the RESULTS
bundle never cleared (no dismiss transaction on the pop path — same hole as the old rich seam,
almost certainly the charter's long-open 'favorites regression').
finalizeSessionExitWithoutDismissMotion() on the surface runtime returns the surface to the
poll/home bundle when a session exits without a dismissal; pop calls it after closeActiveRoute.
Full repro chain GREEN; legacy home dismiss byte-canonical.

## S-C.3 slice A status (2026-07-09 ~02:20, WIP UNCOMMITTED)

Built: ONE routeAction rule in openAppSearchRouteResults — `preserve` when a session is already
active (active==='search' && depth>1: variant reruns, STA, tab adoption), `push` otherwise
(home submit pushes search#session over search#home; non-search roots push over their root).
Also closes the latent S-C.2 gap (in-session rerun from a favorites root would have stacked a
duplicate session entry). Pop-dismiss branch now covers ANY pushed session (top==='search' &&
depth>1). tsc + 93 jest green.

RIG: home submit as push reveals fully; X-pop restores home with docked polls re-deriving on
the lane formula automatically + nav restored. **BLOCKER before commit: map marker residue** —
the dismissed world's DOTS stay on the map after the home pop. Cause: the pop path never
drives the NATIVE world dismissal (the (worldId, exitAckId, phase) wire's exit correlation —
armDismissMotion/commitDismissBoundary/completeDismissHandoff normally run it via the terminal
choreography). The favorites pop escapes because its scene switch (search→bookmarks) changes
chrome/map ownership; the home pop stays on the search scene so nothing clears the source.
ATTRIBUTED FURTHER: after the pop, JS builds+stores an EMPTY frame (T1DBG markers:0) — the JS
map source cleared correctly; the NATIVE side never applied it (the wire's exit/reveal
correlation — (worldId, exitAckId, phase) — never ran on the pop path, so the native world
holds its last source). FIX DIRECTION CONFIRMED: the pop must arm a MOTIONLESS dismiss
transaction (the one owner of surface exit + native map dismissal + nav return) — likely
replacing finalizeSessionExitWithoutDismissMotion on the pop path (the finalize solved the
sheet half only). Read armDismissMotion → commitDismissBoundary → markBottomBoundaryReached/
markBottomNavReturnReady → completeDismissHandoff + the wire's exitAckId serialization, then
design the motionless variant (all readiness marks satisfied synchronously or by the immediate
paint); alternatively deliver the empty frame through the wire's normal apply path if that is
the truer seam. Home-pop dots are the RED probe for whichever design lands.

---

## RED TEAM (2026-07-09 ~02:40, 3 auditors: S-B code / S-C flows / ideal drift) — verdicts + ledger

### Confirmed BREAKS (fix immediately)

- **RT-1 (flows#1):** restaurant terminal dismiss from a pushed favorites session ([bookmarks,
  search, restaurant]) never pops — `isTopLevelRichSeededOriginCaptured` FABRICATES a rich
  origin via the live fallback (no slot was captured on the push path) → old single-switch
  seam runs → setRoot collapse discards the pushed origin AND the seam never calls the surface
  finalize → zombie residue returns. FIX: pushed-session detection by STACK MEMBERSHIP (a
  'search' entry above a non-search root), the rich gate requires an ACTUALLY-captured slot
  (no live fallback when the session was pushed), and the finalize runs on the seam branch too.
- **RT-2 (flows#2):** in-session re-present while a CHILD tops a pushed session resolves
  'push' → duplicate session entries ([bookmarks, search, restaurant, search#2]). Same fix:
  in-session = stack membership, not top-of-stack.

### REAL code fixes (cheap, do with RT-1/2 or next slice)

- **RT-3 (code#1):** setRoot idempotence uses params REFERENCE equality — value-equal param
  objects re-mint the root (the teardown class the rule exists to prevent). Value-compare.
- **RT-4 (code#4):** popToRoot stages NO origins — stage `stack[1].origin` (deepest pushed
  entry wins).
- **RT-5 (code#3):** the `offset > 0` capture filter makes scroll-to-TOP unrestorable under
  shared warm legs (pop past a deep-scrolled same-key sibling lands at ITS offset). Drop the
  filter for entry-origin capture; zero is a meaningful target now.

### S-C.3-B/C LEDGER (the remaining-work list the sub-slices anchor to — red team finding

"S-C.3-B existed only in a code comment")

1. Motionless dismiss transaction (home pop owns surface exit + native wire exit + nav return).
2. Slot deletion + prepareSearchSessionEntry skip generalized to ALL roots (incl. the polls-root
   childAnchor flow — currently a HYBRID: re-roots then pushes; deferred explicitly here).
3. `handleRootOverlayTransition` re-root reflex deletion (session-state-controller ~:815).
4. Nav law FINAL FORM: flip the nav-out selector from role-based to DEPTH-based (role≡depth
   broke when search sessions became depth-2 topLevel pushes) + delete BOTH manual nav
   commands (submit choreography's hide + the pop branch's requestSearchBottomNavMotionTarget).
5. The policy-runtime `'search'`-joins-child-close special case → generalize kind from the
   stack operation.
6. `applyOriginDetent` decision: either explicit origin application becomes THE pop mechanism
   (flag dies, ledger staging demoted) or the flag dies the other way — one mechanism only.
7. Child-departure DETENT capture is root-collapsed (code#2 — masked today because stubs are
   all expanded); resolve the departing scene's own detent.
8. Slice-3a child unmount is unreachable on the fast dispatch path (code#5) — include a route
   -stack signature in the fast-path guard so stack shrinkage forces the mounted-keys recompute.
9. pollDetail/pollCreation dynamic input writers still select activeOverlayRoute (code#6) —
   flip to the top-most-entry-of-key rule.
10. `restaurant` profile foreground re-assert still re-roots via ensureAppSearchRouteSearchScene
    (profile-app-foreground-runtime:33) — dies with child-pushes-stop-re-rooting.

VERIFIED-SAFE by the flow auditor: STA-during-pushed-session (preserve), polls-root childAnchor
round-trip (as the recorded hybrid), deep links cold+warm, depth-2 home sessions vs every
stackLen consumer, finalize vs mid-flight redraw (2 hygiene notes: watchdog timer not cleared;
bookmarks pop shares the native-wire residue but is masked by the full-height sheet).

---

## S-C.3-B DESIGN (written 2026-07-09 ~5:20PM — implement in a FRESH session; all facts below

## are already verified in code this session)

**Goal:** the home dismiss becomes a TRUE POP ([search#home, search#session] → [search#home])
owning surface exit + native wire exit + nav return — then the slot, the re-root reflexes, and
the manual nav commands all die (ledger items 1,2,3,4,5,6,10 in one coherent unit).

**The golden contract amendment (deliberate, not a workaround):** the home dismissal keeps the
EXISTING terminalDismiss choreography end-to-end — armDismissMotion → boundary/nav marks →
completeDismissHandoff (it is already the one owner of surface + native + nav; nothing
motionless is needed, that framing was wrong). The ONLY change is the ROUTE MUTATION the
choreography commits: `emitDegenerateHomeRestore` gains `routeAction: 'popToRoot'` WHEN a
session entry exists above the search root (hasSearchSessionAboveRoot), else byte-identical
legacy. `assertDegenerateHomeEmission` is amended to REQUIRE exactly that (the golden contract
grows a conditional arm — the assertion still fails loudly on any other divergence: no content
plane, no routeParams, no chrome/camera fields). popToRoot of [search#home, search#session]
reveals search#home with rootOverlayKey unchanged ('search') — the docked-polls restore path
(dockedPollsRestoreSnap) is UNAFFECTED because the lane derives from root+depth, both correct
post-pop. Validation: the golden {polls,search}@collapsed dismissal must be BYTE-IDENTICAL on
screen (home + docked polls + nav) AND the stack must end [search#home] (not a fresh root) —
assert the entryId survives the dismissal (the RED probe: log stack[0].entryId before submit
and after dismiss; a fresh id = the old setRoot leaked back).

**Then, in dependency order (same session):**

1. Generalize `prepareSearchSessionEntry`: the skip extends to ALL roots (the polls-root
   childAnchor flow stops re-rooting; its childAnchor rides the pushed entry's origin.anchor —
   resolveChildOriginRePush reads entry origin instead of the slot).
2. DELETE: captureSearchSessionOrigin + capturedOriginContext slot + armSearchCloseRestore's
   slot mechanics (restorePendingOrigin stays, fed by entry origins), ensureAppSearchRouteSearchEntry,
   ensureAppSearchRouteSearchScene (+ its profile-foreground caller — item 10),
   handleRootOverlayTransition's re-root reflex.
3. Nav law FINAL: nav-out selector flips role→DEPTH (overlayRouteStackLength > 1, with the
   presented-world clause deleted — search sessions are now always pushes); DELETE the submit
   choreography's nav-hide command and the pop branch's requestSearchBottomNavMotionTarget
   ('show') — the derivation owns both directions.
4. `resolveInferredSheetTransitionKind`: the closeActive kind derives from the STACK OP (any
   closeActive/popToRoot = close-family); the 'search'-joins-child special case dies.
5. `applyOriginDetent` becomes THE mechanism: every pop applies the popped/deepest entry's
   origin detent explicitly (the flag dies, always-on); the ledger-staging path demotes to
   scroll lanes only. Validate pollDetail/saveList/restaurant pops still land correctly (their
   descriptor rows currently decide motion — the explicit snapTo must match or intentionally
   supersede; check each row).

**RED probes for the session:** home dismissal byte-identity + entryId survival; poll-dish-from-
comment round trip (childAnchor via entry origin); favorites/profile launches unchanged; map
marker clearance on home dismissal (the wire exit must still run — it will, the choreography is
untouched); tab sweep after every dismissal variant (zombie guard).

## S-C.3-B step 1 SHIPPED (b889a8ba + b16a092c, 2026-07-09 ~6:15PM)

DESIGN CORRECTION discovered by the RED probe: the stack died at the dismissal dance's FIRST
switch (dismissAppSearchRouteResultsToPolls, explicit setRoot) — NOT at the golden home
emission. The pop landed THERE (routeAction popToRoot when hasSearchSessionAboveRoot; same
'polls' presentation target — presentation and stack truth are separate axes). The golden
emission needed NO amendment (post-pop its setRoot is a value-equal idempotent no-op; the
assertion is untouched). getRouteState joined the ACTIONS slice.

PROVEN: double submit→dismiss shows the SAME search#home sentinel entry across both dances
(entryId survival); home byte-canonical (docked polls, nav, zero marker residue — wire exit
runs, choreography untouched); favorites chain + tab sweep canonical.

REMAINING (design steps 2-5) — STEP-2 REVISION (chase-the-true-ideal): the anchor-publication
idea is DEAD — it compensated for the re-root+re-push mechanism itself. Under entries-as-values
the poll-dish search pushes OVER the still-alive pollDetail entry ([search#home, pollDetail,
search#session]); dismissal is a plain closeActive pop revealing the untouched leg — scroll,
comment position, everything survives because the ENTRY survives. No anchor, no slot, no
re-push. Step 2 = prepareSearchSessionEntry becomes a no-op (skip ALL roots) + the dismiss
branch selector generalizes: top-is-session && beneath-is-child → closeActive (one pop, NO
manual nav-show — the derived rule keeps nav out for the revealed child); beneath-is-search-
root → legacy terminal home dance (step 1's pop); non-search root → existing popToRoot path.
resolveChildOriginRePush + the slot machinery go DEAD and delete in step 3. Deferred: a
pop-to-entry routeAction for [home, pollDetail, session, restaurant]-shaped X-dismissals
(popToRoot slightly overshoots to home there; rare, noted). Then: slot deletion,
handleRootOverlayTransition deletion, nav-law depth flip + both manual nav commands, close-kind
generalization, applyOriginDetent one-mechanism, profile foreground re-root (item 10).

## Ledger items 4-6 CLOSED (2026-07-09 ~7PM)

- **Item 5 (code):** the closeActive/popToRoot KIND inference collapses to the stack-operation
  rule — a pop is a CLOSE ('closeChild'), whatever scene pops. The per-scene-set membership
  test and the 'search'-joins-child special case are gone (every live pop verb also passes its
  kind explicitly; the inference is the fallback rule).
- **Item 4 (verdict — final form, not interim):** the nav-out law's depth form governs CHILD
  entries (derived store, shipped); SESSION nav motion is TRANSACTION-owned BY DESIGN because
  the desired-state architecture presents after resolve — the route commits at REVEAL while
  the nav must leave at SUBMIT (press-up feel). The enter/exit-transaction 'hide'/'show'
  commands are a symmetric owner pair, not manual stragglers; the pop-dismiss branch's 'show'
  is the exit half for pop-shaped dismissals. Flipping the store to raw depth would command the
  nav home EARLY during the home-dismissal collapse (route pops at the dance's first switch,
  boundary lands later) — rejected with reasons.
- **Item 6 (verdict — one mechanism per POP CLASS):** applyOriginDetent selects the
  WORLD-SESSION pop shape (explicit origin-detent snapTo + topLevelSwitch/swapImmediately —
  the proven seam shape for dismissing a presented world). CHILD pops keep descriptor motion +
  the staged remembered-snap ledger: their dismiss detent is a PRODUCT choice. ⚠️ OWNER CALL
  (open): pollDetail dismiss deliberately lands on the EXPANDED feed today, not the captured
  docked-home origin — the pure §5.3 origin restore would collapse back to docked. Flag when
  feel-checking.

S-C.3-B/C is COMPLETE except: prepareSearchSessionEntry no-op verb + call sites (collapses
with S-A), searchRoute shell rename + reveal-supersede deadness audit (S-C.4), and the
post-S-C.3 red team.

---

## POST-S-C.3 RED TEAM (2026-07-09 ~8PM, 3 auditors: correctness / ideal-shape / deadness)

**Fixed same-session (3b6c5b55):** popToEntry landed (algebra + routeAction plumbing + command
verb); the dismiss selector resolves from the DEEPEST session entry (fixes the restaurant-from-
comment dismissal discarding pollDetail — finding #1); the degenerate home emission carries
routeAction popToRoot when a session survives (golden assertion grew the conditional arm —
finding #2, the armed clear-lanes door). **Cleaned same-session (5bf6b07c):** the no-op verb
chain, childAnchor threading, and all stale-machinery prose (deadness auditor's full inventory).

**S-C.4 LEDGER (updated with the ideal-shape auditor's unrecorded items):**

1. ~~searchRoute shell rename/dissolve~~ **DONE 2026-07-09 (26933311)** — the shell OverlayKey
   is now `'sheetHost'`; the search||searchRoute pair checks collapsed to `'search'` (the shell
   key is provably never a dispatch target — it only names the pre-commit sentinel frame) and
   the dead sheetHost readiness row deleted.
2. ~~Reveal-supersede correlation deadness audit~~ **CLOSED 2026-07-09 — the arm is LIVE, kept**
   (26933311). The [SC4-COALESCE] RED probe fired 8x across the submit-dismiss interrupt/repeat
   sweeps: a close-then-resubmit switch carries no txn of its own and correlates via the
   surviving reveal txn. Verdict recorded at the arm in the scene-switch controller; probe
   stripped. NOT dead code — do not re-open without a new structural change to re-submit.
3. ~~ONE-SWITCH home dismissal~~ **DONE 2026-07-09 (step 1 f983194c, step 2 8e038dd5)** — the
   dismiss verb's terminalDismiss targets 'search' directly; the pending-restore ledger
   (arm/commit/cancel/flush + pendingOriginRestoreContext + isSearchOriginRestorePending +
   requestDefaultPostSearchRestore + ArmSearchCloseRestoreOptions threading) is DELETED; the
   clear lanes hold the origin as a local value (captureSearchCloseOrigin →
   restoreSearchCloseOrigin); the finalize boundary emits nothing; the golden assertion still
   guards the clear lanes' emitDegenerateHomeRestore seam. Rig: dismiss-repeat + interrupt
   green on both steps, zero marker residue, home canonical. NOTE: the successor shapes
   (nav command pair → one derivation) remain OPEN — ledgered separately below as item 3b.
   (was: ONE-SWITCH home dismissal
   **3b CLOSED 2026-07-09 (778a0a05):** nav motion has ONE writer — the manual submit-hide /
   dismiss-show command pair (3 sites) + the command-sink registry are deleted; the visual
   runtime's derivation layout effect (session arm = surface visual policy, suggestion arm,
   child arm = stack role) was already commanding the same worklet — the pair was a
   same-commit duplicate. Supersedes the item-4 "transaction-owned pair is final form"
   verdict (its premise — route commit lags SUBMIT — was true but the surface policy never
   lagged). Rig: dismiss-repeat 5 cycles green (show-half proven; every cycle opened results
   and returned a clean silhouette). ⚠️ Submit-side press-up FEEL check rides the owner
   finger test — blocked by the authed-API 500s (suspect: the hard-paywall entitlement
   enforcement landed this evening; anonymous curl fine, guard-level, unlogged; the app's
   circuit breaker then suppresses all requests until relaunch). Also found for the owner:
   deterministic collection crash at projection-rebuild.service.ts:53 (Invalid
   tx.entity.updateMany() — repeats until code-fixed).
   — the terminal dance's two presentation switches (polls
   intermediate + home re-emission) collapse into the pop's own reveal, with docked-polls as a
   presentation MODE of the revealed home entry (§5.5 already declares it a mode). Medium; must
   re-prove the golden deadlock seam. Successor shapes that unlock WITH it: the nav command
   pair → one derivation over (childDepth, sessionEnterTransactionPending); the pending-restore
   ledger (arm/commit/cancel/flush + pendingOriginRestoreContext) collapses — its only producer
   is the dance and its snapshot is always the degenerate live build now.
4. ~~collapse the TWO origin-capture systems~~ **DONE 2026-07-09 (26933311)** — the
   origin-capture-registry is deleted; buildCurrentOriginSnapshot carries the one rule directly
   (home roots 'search'/'polls' → degenerate snapshot; everything else → captureRichSceneOrigin,
   which the deleted rich providers literally called). Construction-equivalent; sweeps green.
5. ~~Wire-exit ownership for pop-shaped session dismissals~~ **CLOSED 2026-07-09 (c342cc0a)** —
   the pop branch commits a results_exit presentation transaction alongside the surface
   finalize (the wire's normal self-driving exit path; no dismissTransaction, no motion).
   Rig-proven on the favorites chain: markers:20 world revealed over the bookmarks root, X-pop
   → native lifecycle dismissing→hidden with the minted exit ack id, byte-canonical Favorites,
   zero dots. Session-over-child shares the code path (exit commit precedes the branch split);
   its finger test still rides the seeded-comments gap. UNBLOCKED en route: the authed-API 500
   root cause was NOT billing enforcement (log mode) — the schema kept an @@index on the
   deleted users.trial_ends_at field, so prisma generate failed and the long-running server's
   stale client selected the dropped subscription_status column → P2022 → unlogged 500 on every
   identity sync; fixed by dropping the stale index + regenerate + rebuild (own commit).
   (superseded text: NARROWED by item 3: the home
   dismissal's wire exit provably rides the dismiss-transaction choreography (unchanged by the
   one-switch cut; dismiss_start→hidden observed on-rig). Remaining scope is ONLY the
   pop-shaped branches (popToEntry session-over-child, popToRoot to non-search roots) using
   finalizeSessionExitWithoutDismissMotion — (the original text follows:) wire-exit for pop-shaped session dismissals (the known native marker residue —
   masked behind full-height sheets today; the session-over-child closeActive branch shares it
   and remains finger-test-pending, no rig entry point).
6. OWNER product call (flagged): pollDetail dismiss lands on the expanded feed vs the pure
   origin-restore collapse to docked home.

**S-C.4 ITEM 3 DESIGN (2026-07-09 — one-switch home dismissal; NOT yet implemented):**

Code map (verified against source):

- Switch 1 = `dismissAppSearchRouteResultsToPolls` (app-search-route-command-runtime.ts):
  `terminalDismiss → polls`, `preserveOutgoingUntilSettle`, routeAction popToRoot/setRoot,
  dockedPollsRestoreSnap collapsed. Plays the sheet slide over the docked feed.
- Switch 2 = the boundary flush (`use-results-presentation-close-transition-finalize-runtime`
  → `flushPendingSearchOriginRestore` → `restorePendingOrigin`): degenerate short-circuit →
  `emitDegenerateHomeRestore` (`topLevelSwitch → search@collapsed`, the GOLDEN emission —
  route-idempotent, presentation flips polls→search docked home). Rich origins take the
  direct re-root instead.
- The pending-restore ledger (`pendingOriginRestoreContext` + `isSearchOriginRestorePending`
  - arm/commit/cancel/flush) exists ONLY to carry the origin across the switch-1→switch-2
    gap. The CLEAR lanes (use-search-clear-owner) arm-and-flush SYNCHRONOUSLY — for them the
    ledger is pure ceremony already.

The design:

1. The RICH seam already IS the one-switch shape — a bookmarks/profile dismiss re-roots
   directly to the origin in ONE swapImmediately switch precisely to eliminate the
   supersede class. Item 3 = extend that shape to HOME: the dismiss verb resolves the
   origin AT VERB TIME and emits ONE switch — `terminalDismiss → search@collapsed` with
   dockedPollsRestoreSnap + routeAction popToRoot (or the rich/child pop shapes) — the
   sheet slide plays on the outgoing session content (preserveOutgoingUntilSettle), the
   presentation lands directly in the docked-polls MODE of the search root (§5.5: docked
   polls is a presentation mode, not a scene target).
2. The ledger DIES: no arm/commit/cancel/flush, no pendingOriginRestoreContext, no
   isSearchOriginRestorePending; requestDefaultPostSearchRestore dies (the no-origin case
   is the same verb with the degenerate build). The clear lanes call the verb directly.
3. The golden deadlock seam MOVES, not disappears: the single emission must still be
   provably zero-plane-safe at the {polls,search}@collapsed seam. assertDegenerateHomeEmission
   becomes the assertion on the SINGLE switch (terminalDismiss kind + snapTo collapsed +
   dockedPollsRestoreSnap + pop arm; still no routeParams/chromeVisibilityTarget/cameraIntent).
   Re-prove with the byte-identity flows (p1-byteid-\*, dismiss-seam-byteid) + deadlock soak.
4. ⚠️ COUPLED TO ITEM 5 (discovered in this design pass): the two-switch dance is currently
   LOAD-BEARING for the map WIRE EXIT — S-C.3 already tried popping home without the dance
   and native marker residue appeared (JS emitted the empty frame, native never applied).
   The single switch must OWN the wire exit: the search-surface exit (finalize/bundle swap)
   has to run off the ONE switch's settle, not off the polls-intermediate reveal. Items 3+5
   are ONE cut; do not ship 3 without re-proving marker teardown on-sim (pins gone after
   dismiss, zoom/pan after).
5. Successor shapes that unlock WITH the cut (unchanged from the ledger): nav command pair
   → one derivation over (childDepth, sessionEnterTransactionPending).

**STEP 1 SHIPPED (2026-07-09 ~8:41PM, f983194c):** the dismiss verb's terminalDismiss now
targets 'search' directly (routeAction/pop shape, snapTo collapsed, dockedPollsRestoreSnap
unchanged). Rig-proven in the healthy window: wire exit ran (dismiss_start→hidden), zero
marker residue, 5-cycle dismiss-repeat + interrupt flows land a byte-identical home
(post-loop screenshots md5-equal). The finalize flush + golden emission remain as
idempotent no-ops until step 2. STEP 2 REMAINING: delete the arm/commit/cancel/flush
pending-restore ledger + requestDefaultPostSearchRestore (clear lanes call the restore
directly), move the golden assertion onto the single verb emission, drop the now-unused
getAppOverlayRouteMetadata import warning. ⚠️ BLOCKED at session end: the rig broke on the
OWNER'S live billing-session WIP (EntitlementLapseHost.tsx renders useAuth outside
ClerkProvider → red-screen on every fresh bundle) — step 2 needs a bootable app for the
golden-seam re-proof. Also of note: the localhost API accumulated THREE fighting :3000
processes (wedged Mon watcher + two dist instances); cleaned to one fresh `yarn start`
(logs at /tmp/crave-api-sc4.log). App-authed requests were 500ing at the guard layer
during the contaminated window — anonymous curl + junk-token 401 both fine; recheck
after the owner's billing WIP lands.

Sequencing for the implementing session: (a) teach the presentation/laneKind path that a
terminalDismiss targeting 'search' lands docked-polls mode; (b) move origin resolution to
the dismiss verb, attach to the switch; (c) delete the ledger + default-restore; (d) wire-exit
ownership on the single switch's settle; (e) golden assertion rewrite + byte-identity flows +
marker-teardown finger/rig test.

**Ideal-shape classifications confirmed:** the terminal dance = recorded-interim (successor in
item 3); item-4 nav verdict ACCEPTED with the named successor; the launch-intent restaurant arm
= ~90 lines ride S-A/S-D + world-camera L-layers (its prepare/anchor lines died this session).
