# Trigger/Nav Ideal — vision, verdict, and strides

**Method (owner-directed, 2026-07-08):** the ideal architecture below was composed from first
principles and FIXED before any code was inspected; three read-only auditors then graded the
current implementation against it (trigger layer · nav/entry model · links/addressability/pick).
Effort/difficulty were excluded from every judgment by instruction — only "is it the most ideal
and what would it take."

---

## 1. The ideal (fixed before inspection)

**Organizing principle: a search is a VALUE, and searching from anywhere is PUSHING A PAGE —
the same push as any other page. There is no "search flow" to trigger; there is one navigation
algebra, and search is a destination in it.**

1. **One value — the Desire**: `{ identity (closed sum: text | shortcut | entity | entity-set |
seeded), constraints (filters/area/tab), mode (navigate | pick) }`. Triggers construct it,
   never interpret it.
2. **Two trigger verbs app-wide**: `push(searchScene, desire)` (session-creating) and
   `revise(desirePatch)` (in-session mutation). Nothing else.
3. **One reconciliation engine**: desired vs presented; resolve (cache→derive→network);
   last-write-wins; loading/failure/offline/empty are world states.
4. **Navigation = a stack of self-describing value entries**: entry =
   `{sceneKey, params, origin, chrome{snap, header}}`. Search is an ORDINARY scene. Child pages
   nest by pushing. Pop = restore the previous entry.
5. **The return trip is captured at departure**: uniform `captureOrigin()/restoreOrigin()` scene
   interface; dismiss from any depth is pixel-exact.
6. **Chrome shared, position is data**: one sheet + one header host; snap positions live as data;
   trigger-at-any-sheet-position is interpolation, not a code path.
7. **One universal tappable — EntityLink**: any entity mention anywhere maps entityRef → Desire →
   push through one component; new surfaces inherit triggering by rendering it.
8. **Addressability**: Desire ⇄ URL bijection; deep links, notifications, share links, and in-app
   taps are the same parse → value → push.
9. **Pick mode = a result-handling policy on the entry** with a completion promise; nothing else
   differs.
10. **Choreography belongs to the transition engine**, not to search; presentation intent is
    DERIVED from the entry/desire delta, never passed.

**Invariants:** I1 every trigger ≤1 line of value construction · I2 no trigger references
presentation · I3 pop from N deep is pixel-exact · I4 desire⇄URL total · I5 newest desire wins ·
I6 a new page joins by implementing the scene interface alone · I7 pick changes only result-tap
handling.

**One refinement the code taught (vision improved post-inspection):** transition MOTION between
two entries is a _relation_, correctly kept in a declarative (from,to,kind)-keyed descriptor
table — the existing snap-motion table is BETTER than putting motion on the entry. The entry
should carry only its own captured presentation state (origin, detent, params); the relation
table stays.

---

## 2. Verdict — pillar by pillar (audited 2026-07-08, three agents, file:line grounded)

### Already IS the ideal (keep, do not rebuild)

- **Pillars 1/3/10 (value + engine + derived intent)** — the desired-state S1–S4 rebuild: one
  tuple, one writer, delta-classifying reconciler whose DERIVED intent provably wins (one passed
  hint is literally `void`ed; another is re-derived from view inputs and ignored). Failure/
  offline/retry are world states.
- **Revise-class triggers** (4 chips, tab pill, retry): 1–2 lines, pure value, zero presentation
  references — I1/I2 PASS today.
- **Generic transition core**: PF single-writer switch + co-mounted legs + paint-ack hard-swap +
  one skeleton engine for all scenes; one physical sheet; one persistent header host; snap rules
  as a declarative descriptor table.
- **OriginSnapshot** is already the full ideal payload `{sceneKey, params, detent, segment,
scroll[], anchor}` with a provider-registry capture seam.
- **The de-facto Desire union exists**: `LaunchIntent` + `dispatchLaunchIntent` (4 surfaces +
  notifications already flow through it), and poll comments ALREADY carry structured
  `entitySpans` with entity ids — the EntityLink data model is live.

### Misses the ideal — the six gaps

**GAP A — push-class triggers are procedures, not values (I1/I2 FAIL).**
Every session-creating trigger (search bar, autocomplete, recents, shortcuts, STA, deep link)
ends in the right tuple write but fronts it with 10–60 lines of chrome (keyboard/blur/suggestion
teardown, warm-seeding, docked-polls flags, perf attribution) threaded through 3–5 owner hops,
still passing vestigial hints (`presentationIntentKind`, `preserveSheetState`, `entrySurface`,
the mutable `submission` decoration side-channel). Only two hint duties are still load-bearing
and both are derivable: bounds-source selection (STA fresh capture) and the include-similar
session reset (≡ session_enter/replace class).

**GAP B — the stack entry is impoverished (the deepest miss).**
Entry = `{key, params}` only; origin, snap, header live in _sibling registries keyed by
sceneKey_, and rendering is one warm leg per scene key. Direct consequences: same-key nesting is
structurally impossible (`userProfile(A) → userProfile(B)` cannot exist — push replaces the top
entry when keys match); child pop restores by warm-leg accident, not by restoring a captured
entry (breaks the moment legs re-param per entry); nav-out is a 2/13 per-scene opt-in instead of
a `laneKind==='child'` derivation. Summary: **entries-as-values route truth, registry-keyed-by-
scene presentation truth.**

**GAP C — search is first-among-equals, not ordinary.**
The shared sheet still lives inside a "searchRoute" shell; origin capture/restore verbs are
search-dismiss-named (the machinery is scene-generic, the triggering isn't); the map-synchronized
reveal/dismiss is a private search transaction family (surface phase machine, prepared-
presentation runtimes, own command verbs) rather than a readiness contract any push can supply.

**GAP D — no EntityLink; tap→desire policy re-encoded 3–4×.**
Poll span rendering + the restaurant-vs-entity dispatch fork are ~70 bespoke lines inside
PollDetailPanel; profile/bookmarks rows hand-roll intents; the search side (autocomplete/recents/
result cards) uses a _different_ thrice-duplicated `selectedEntityId` submission shape that never
touches LaunchIntent. TWO value families exist where the ideal has one.

**GAP E — addressability is 2 of 7.**
`parseLaunchIntentFromUrl` handles `crave://restaurant/<id>` + `crave://saved-place/<id>` only.
No serializer exists. Outbound share links (`/l/<shareSlug>`) are emitted but have NO inbound
route — a shared list cannot open in-app at all. Notifications parse payload→intent (good
layering) but handle one type.

**GAP F — pick mode is a plan-doc paragraph.**
Zero code; result-card taps are per-card handlers, not a policy-injectable chokepoint.

---

## 3. The strides (ideal-only; dependency-ordered)

**S-A. The great trigger deletion.** Strip `presentationIntentKind`/`preserveSheetState`/
`entrySurface`/decoration-side-channel from every trigger; fold bounds-source selection and the
include-similar reset into the writer/classifier (both derivable from the delta); move keyboard/
suggestion/blur teardown into the engine's session_enter foreground effects; collapse the 3–5
owner hops. End state: every push trigger is one line. (Independent — can run parallel to S-B.)

**S-B. Entries become values (the foundation stride).** Move origin + captured presentation
(detent, segment, scroll, params) ONTO the stack entry, captured at push; key presentation off
entry _instances_, not scene keys (per-entry leg instantiation for children); pop = restore the
popped-to entry, always, replacing the warm-leg accident; derive nav-out from
`laneKind==='child'` (13/13); delete the same-key top-replacement so `userProfile(A) →
userProfile(B)` exists. The motion descriptor table STAYS (relations, not entry state). This is
"the child-nav stack" — the registry's hardest contract — with the audit-identified root cause
fixed rather than worked around.

**S-C. De-special search.** Rename/dissolve the "searchRoute" shell (the sheet system is the
app's, not search's); make origin capture/restore fire on EVERY push/pop (the snapshot is
already scene-generic); lift the results-readiness join into the generic push as an optional
content-readiness contract (search supplies map+cards readiness; other scenes already supply
paint-ack — same slot).

**S-D. One Desire + EntityLink.** Dissolve the dual value families: LaunchIntent's search-shaped
members become `push(search, desire)` (the tuple identity IS the payload); its pure-nav members
become plain pushes. One `entityRef → Desire` function replaces the 3–4 copies (restaurant-vs-
entity policy encoded once). Wrap PollDetailPanel's span rendering into the shared `EntityLink`
component; profile rows, bookmarks rows, and (later) notification rows render through it. New
surfaces then inherit search-triggering with zero wiring (I6).

**S-E. Addressability.** One parser+serializer pair making Desire ⇄ URL total: search desires
(query/shortcut/entity/list), scenes (poll, profile, list), and the already-emitted `/l/<slug>`
share links (inbound route + `getShared` consumer — this alone turns list-sharing from broken to
working). Notification payloads route payload → Desire/push through the same values.

**S-F. Pick mode.** Centralize result-card tap into one policy-injectable handler (prerequisite
worth doing in S-C/S-D anyway), then `push(search, desire, {pick}) → Promise<Selection>` on the
entry; first consumer = listDetail "Add places."

**Then the pages land on this foundation** — userProfile, listDetail, followList, notifications,
settings each become: scene metadata row + body + skeleton spec + header descriptor + origin
provider (S-B makes that the whole contract), with listDetail = the search-results renderer fed
by `push(search, entity-set-desire)`.

**Dependency order:** S-B first (foundation; everything keys off entry instances) with S-A in
parallel; then S-C; then S-D; then S-E; then S-F; pages ride along from S-C onward (listDetail
is both a page and the proof of S-C/S-D).
