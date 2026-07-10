# Registry-era kickoff — foundation verdict + scope + structure

2026-07-10, forked payments/images session. Inputs: two deep audits
(foundation honesty pass corroborating docs against commits; registry scope
inventory). This doc = the gate list, the true registry state, the gap list
to fold into the registry, and the proposed working structure.

## 1. Foundation verdict: BUILT, CORROBORATED, NOT HUMAN-VERIFIED

The structural foundation is genuinely done and unusually well-corroborated
(claims match commits; red-teams closed with RED→GREEN proofs): S-A/S-B/
S-C/S-D/S-E executed (S-F deferred by adjudication — no consumer yet);
world-camera L1–L5 executable-surface complete; page-foundation codification
items 1–5 done; sheet-v4 + return-to-origin absorbed.

**THE GATE (close before page-building):**

1. **Owner feel-check pass** — the single biggest honest gap (~a dozen
   owner-gated checks): submit press-up reveal glide, camera focus feel,
   L4 deselect restore / z-lift / invisible-resident fade-in, toggle-strip
   finger checks (canonical strip + bookmarks/profile pills), RT-17
   selection-close VA pop, plus two DECISIONS: camera-in-origin (terminal
   search dismiss: restore pre-search camera or not) and S-C.4 item 6
   (pollDetail dismiss → captured origin vs expanded feed).
2. **RT-19** — panels read the TOPMOST entry per scene key; the
   userProfile(A)→followList→userProfile(B) drill-in re-derives the page
   behind the transition and loses origin on pop. Pages would bake this in.
   Fix per-entry params into bodies BEFORE the page wave.
3. **The two content-swap frames** (~160–190ms reveal/dismiss body Fabric
   mount burst) — last floor-60 gap, in the exact machinery new pages mount
   into. Fix before 5 new bodies ride it.
4. Conditional on wave-1 contents: S-D autocomplete row widening BE
   (person/list rows) if people-search ships in wave 1; RT-18 share
   revocation semantics owner call before listDetail/share ship.

**Rides alongside pages (not gate):** failure-matrix API-kill runs (run ON
each new page), RT-16 dead-surface deletes, RT-20/21/24, maestro flow
cleanup, AASA universal-link registration, dead-slug ListBody body, S-F,
camera-in-origin mechanical slice post-decision, JS Release sampler.
**Housekeeping:** mark best-in-class-app-foundation-cutover-master-plan.md
(2026-04-18) SUPERSEDED — trigger-nav-ideal-verdict + page-registry are the
authorities now.

## 2. True registry state (better than the registry implies)

Real pages already: all 4 top-level scenes; restaurant, saveList,
pollDetail, pollCreation; **userProfile, followList, notifications,
editProfile are REAL functional pages** (built during foundation red-teams —
design passes not done). settings = functional stub (5 real drill-ins).
PURE stubs: **listDetail** (the owner-flagged "most involved page" — fully
unbuilt) + shareConfig. Modals: price + scoreInfo built; ALL 7 new modals
absent (substrate exists: OverlayModalSheet is the app-wide primitive).
Images backend (steps 1–5 + avatar server path) DONE + red-teamed; step 6
(all photo UI) held for this era.

## 3. Gaps to FOLD INTO the registry (the pre-implementation discussion)

From the scope audit — items with no registry row today:

- addPhotos funnel + restaurantGallery + userGallery need FORMAL §1 rows
  (scene keys, legs, skeleton specs) — they exist only as §6 prose.
- Avatar picker/upload UI (server path done; editProfile has no picker).
- Settings TREE: subscription/billing management (manage Crave+, restore,
  lapse states), notification preferences (per-type opt-in is a
  prerequisite for fanning notifications beyond poll_release), legal,
  delete-account confirm. Settings today = one row, no children.
- Paywall registry row is STALE (says contextual modal; shipped reality =
  hard full-screen PaywallScreen + EntitlementLapseHost; contextual modal =
  dormant freemium machinery). Reconcile.
- FriendCluster expand surface (stacked-avatars → full list) + friend-
  presence chip card slot (explicitly registry-phase product design).
- Poll creation extensions: marketPicker + duplicatePoll (registered,
  unbuilt), pollInfo, axis-inference confirm chip.
- Collaborator/invite flow (favorites) — semantics undecided; owns the
  collaborator MODEL (schema included, deliberately not pre-built).
- listDetail cluster sub-surfaces: drag-rank edit mode (+ accessibility
  path), "All" list source toggle, search-within-list, per-item notes UI,
  tags-as-filters.
- Restaurant-profile design-pass sub-surfaces: button/chip row, Discussion
  section, Polls/Mentions tabs, score-evidence surface, multi-location
  cards.
- Report flows (comment + photo) — no registered modal.
- Empty-query search screen as a distinct registered state.
- Share infographic flow; web landing for /l/{slug} (unowned, not an app
  page).
- Onboarding status reconcile (username flow exists; registry says 🆕).
- **Messaging/DMs: mentioned NOWHERE in any doc.** Net-new product
  decision, not a forgotten row — owner must decide scope-in/scope-out
  before it enters the registry.

## 4. Proposed structure (owner leaning: one session, don't split context)

Recommended shape — split by LAYER, not by area (the payments/images
experience: cross-area context pays inside one long-lived DISCUSSION
session; execution travels fine on spec docs):

- **Phase 0 — close the gate.** Feel-check script for the owner (one
  sitting, checklist-driven, on-device) + RT-19 + the two content-swap
  frames in the session that owns the transition engine. Nothing else.
- **Phase 1 — registry completion DISCUSSION (one deep session).** Fold §3
  above into the registry; make the named product decisions (messaging
  in/out, collaborator semantics, settings tree, share/report, friend
  chips). Output = registry v2: every page/modal/funnel has a row, a role,
  entry points, and open-questions resolved or explicitly parked.
- **Phase 2 — implementation, ONE ANCHOR SESSION + waves.** One long-lived
  session holds the cross-area context and orchestrates; work lands in
  dependency-ordered waves (proposal, to be finalized in Phase 1):
  W1 listDetail cluster + collaborator + save-funnel toolkit UI (lists are
  the center of gravity: images entry points, notes/tags, share all hang
  off them); W2 photos UI (addPhotos funnel, galleries, card strips,
  placeholder/skeleton row); W3 modal batch + settings tree + billing
  surfaces; W4 design passes (restaurant profile, user profile/food log,
  notifications) + report/share flows. Mechanical, well-specified slices
  may be delegated out; decisions never are.
