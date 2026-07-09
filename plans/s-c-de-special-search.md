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
