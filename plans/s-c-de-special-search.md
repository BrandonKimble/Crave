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
