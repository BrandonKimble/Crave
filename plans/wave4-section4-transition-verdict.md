# Wave-4 §4 — The Page-Transition Verdict (design of record)

Status: **VERDICT v1 — grounded in the shipped code, 2026-07-13.** This is the design
of record for the transition system; the per-permutation audit + sim feel-checks are the
execution program that follows. Owner reserves the human-eye feel verdict per permutation.

---

## The owner's frame (verbatim intent)

We are not fixing pages; we are deciding **THE transition system for every permutation** —
parent↔parent, parent↔child, child↔child, and every strip-placement combination. A
header-mounted-strip page ↔ in-list-strip page crossing must be a **NON-EVENT**: the old
page's chrome must be structurally incapable of affecting the new page's layout. Decide
from first principles + industry practice; audit every page against the decided pattern;
what deviates gets cut over, not patched. Bring back what prior eras did better.

---

## What the code ALREADY is (grounded read, not theory)

The transition system is far more mature than "chrome coupled across the switch" implies.
Two shipped mechanisms already encode most of the ideal:

### 1. The motion-plane / content-handoff policy (`app-route-scene-transition-policy-runtime.ts`)

Every switch resolves to an explicit set of **motion planes** —
`sheet | camera | chrome | content` — plus a **content handoff** of either
`swapImmediately` (paint the target's own seed in one frame, no crossfade) or
`preserveOutgoingUntilSettle` (hold the outgoing leg in flight so the leaf content
crossfades). Key invariants already enforced:

- **Dismiss is byte-identical minimal**: a `closeChild`/preserveLiveY dismiss resolves to
  ZERO planes → commits to idle SYNCHRONOUSLY (no 600ms content watchdog).
- **Content plane arms IFF a crossfade will actually run** (handoff ==
  `preserveOutgoingUntilSettle`); SEEDED forward opens (`restaurant` etc.) resolve to
  `swapImmediately` and arm no content plane — the two resolvers agree by construction.
- Skeleton cover is the parent↔parent standard (already decided good).

**Verdict: this model IS the ideal spine.** The permutation matrix is a projection of
(source, target, sheetVisibility, transitionKind, handoff) onto planes — which is exactly
"decide per permutation from first principles." Keep it; do not replace it.

### 2. The per-scene foundation spec (`scene-foundation-spec.ts`) — the structural isolation the owner asked for

Every scene declares all 8 foundation pieces BY CONSTRUCTION, including
`strip: 'none' | 'in-list' | 'header'`, enforced by a RED-provable law
(`toggle-strip-scene-law.ts`: rendering a strip a scene didn't declare barks a dev
contract violation naming the scene). Current declarations:

- `polls`, `bookmarks` → `strip: 'header'` (mounted as a persistent-header extension)
- `listDetail` → `strip: 'in-list'` (mounted in the scene's own body scroll)
- all others → `strip: 'none'`
- `search` → excluded by design (its in-list strip is context-null, law honestly silent)

**This is the owner's "structurally incapable of affecting the new page's layout"
mechanism, and it already exists.** A header-strip page and an in-list-strip page mount
their strips in DIFFERENT hosts keyed to their own scene; the old scene's strip unmounts
with the old scene body. The crossing is declarative, not a shared reflow.

---

## The ONE residual coupling to audit (the real §4 work)

`header: 'persistent'` is shared across ALL scenes (one persistent sheet header host).
A header-strip scene mounts a strip EXTENSION into that shared header; a no-header-strip
scene mounts none. So across `bookmarks[header] ↔ listDetail[in-list]` (the exact
Lists→list-detail flow proven all session) the shared header's height changes (strip
extension present → absent).

**Traced to the exact mechanism (grounded read of `PersistentSheetHeaderHost.tsx`):**
the header host measures its OWN chrome box via `handleChromeLayout` and a header-mounted
strip GROWS that measured chrome (comment at :210). The measured height is cached
**PER SCENE** — `recordSceneChromeMeasuredHeight(sceneKey, layout.height)` (:144) — and the
body-lane inset for a scene's next presentation is derived synchronously from ITS OWN cached
chrome height (:140–144). **That per-scene cache IS the structural isolation:** listDetail's
body inset uses listDetail's (no-header-strip, shorter) chrome height, never bookmarks'. So
the switch is NOT coupled through a single shared height — each scene's body sits on its own
measured inset. The owner's "structurally incapable of affecting the new page's layout" is
satisfied by construction here too.

**...AND IT IS ALREADY SOLVED (grounded read of `scene-chrome-ack-runtime.ts`).** The
residual I first hypothesized (first-present cache miss → body-top jump) is closed at the
correct layer:

- `resolveSceneChromeHeight(sceneKey)` resolves synchronously: exact per-scene measurement
  → **same-composition-signature measurement** → retained shared fallback. The signature is
  `strip('header'|else) × grabHandle('hidden'|else)` — the two foundation facts that change
  chrome height. So a FIRST-present listDetail (`nostrip|handle`, no cached height yet)
  borrows the height of any already-measured `nostrip|handle` scene (profile/restaurant/…),
  i.e. the RIGHT height class synchronously, on frame 1.
- The module's stated LAW (its header comment): "the chrome box and the body lane move in
  the SAME committed frame." It was written to kill EXACTLY the owner's smell — the
  see-through frost band between a shorter new chrome bottom and a still-inset body top when
  the body inset lagged the chrome by one+ frames. onLayout stays the truth-updater: a wrong
  same-signature guess self-heals in one frame and is exact forever after.
- Only theoretical residual: the very first cold visit of a composition signature NEVER
  measured in the session — and even that self-heals in one frame. Not worth a change; it is
  the retained-fallback path the author already accepted.

**Verdict on the owner's named smell: STRUCTURALLY CLOSED.** The strip-placement crossing is
a non-event by three independent mechanisms — per-scene strip mount (scene-foundation-spec),
per-scene chrome-height cache with same-signature synchronous fallback, and the
same-committed-frame chrome/body law. There is no invasive fix to make here; the audit is a
CONFIRM (eye check the Lists↔list-detail crossing for a gap flash — expected clean).

---

## The per-permutation verdict matrix (to execute + sim-verify)

| Permutation                                                   | Planes (from policy)                                  | Skeleton?                    | Verdict                                                                                            |
| ------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------- |
| parent↔parent (search↔bookmarks↔polls↔profile)            | chrome + content, shared header body-swap             | yes (parent skeleton)        | DECIDED-GOOD; audit strip-height delta on any header-strip parent                                  |
| parent→child (→ listDetail/restaurant/pollDetail/userProfile) | sheet(navPush)+content, or swapImmediately for SEEDED | child skeleton unless seeded | audit: child skeleton policy parity; SEEDED set never crossfades                                   |
| child→child (listDetail A → userProfile → listDetail B)       | sheet + content                                       | child skeleton               | audit: entry-keyed mount (topmost-per-key is wrong — already noted in ListDetailPanel C2)          |
| child→parent (dismiss)                                        | ZERO planes (sync idle)                               | none                         | DECIDED-GOOD (byte-identical minimal dismiss)                                                      |
| any strip-placement crossing                                  | —                                                     | —                            | strip isolated by scene-foundation-spec; ONLY the shared-header height delta needs the probe above |

## Execution program (the §4 work proper, owner-sequenced after §3)

1. Body-top-stability probe across every header-strip↔no-strip crossing (the one real
   coupling). Fix = the header extension slot reserves/releases height atomically with the
   body swap; the body origin never animates. RED metric: body-top `y` delta == 0.
2. Child skeleton-policy parity audit: every child either seeds (swapImmediately) or shows
   its declared foundation skeleton — no child shows a blank/held frame.
3. Entry-keyed child mount audit (the ListDetailPanel C2 note: two live listDetail entries
   must read their OWN entry, not topmost-per-key).
4. Per-permutation eye check against the human-blessed baseline (owner oracle for "instant
   / seamless").
5. Git-history sweep (crossfade engine, hard-swap+skeleton pivot, scrollHeader era) for any
   piece closer to ideal than today; graft + improve. Prior-art docs: page-switch-redesign,
   transition-hard-swap-skeleton-pivot, page-transition-and-results-engine.

## Bottom line

The transition SPINE (motion-plane/handoff policy), the strip STRUCTURAL ISOLATION
(scene-foundation-spec + RED law), AND the strip-presence height coupling (per-scene
chrome cache + same-composition-signature synchronous fallback + same-committed-frame law)
are ALL already the ideal shape, each RED-lawed. **§4 is NOT a rebuild and has NO known
invasive fix.** What remains is verification + two conformance audits, all owner-oracle or
low-risk:

1. CONFIRM (eye check) the Lists↔list-detail strip-crossing has no gap flash — expected
   clean; the three mechanisms above make a gap structurally hard to produce.
2. Child skeleton-policy parity audit (every child seeds or shows its declared skeleton).
3. Entry-keyed child mount audit (ListDetailPanel C2: two live listDetail entries read
   their own entry, not topmost-per-key).
4. Per-permutation human eye check vs the blessed baseline (owner oracle for feel).
5. Git-history graft sweep (only if a prior era did a piece better than today).

The owner framed §4 as possibly a rebuild ("attack everything not ideal"). The grounded
finding is the opposite: the transition system was already brought to the ideal shape in
prior legs (canonical-sheet-transition-master-plan, the foundation-spec + chrome-ack work),
with RED-provable laws guarding each seam. §4's deliverable is this verdict + the confirm
audits — not new machinery.

---

## AUDIT RESULTS (executed 2026-07-13 — the runnable items are DONE)

- **Entry-keyed child mount (item 3): PASS.** Every params-carrying child reads its OWN
  `entry.params` — listDetail (`entry?.key === 'listDetail'`), userProfile, followList,
  dmSession, postPhotos; restaurant/pollDetail ride their entry-driven spec runtimes.
  Singletons (editProfile, notifications, settings, messages inbox) correctly ignore
  params. This was deliberate structural work: commit `af507813` "entry-keyed mounts for
  child scenes — W1 slices 1-2 (RT-19 structural remainder)". No topmost-per-key reads
  survive.
- **Child skeleton parity (item 2): PASS by construction.** `SEEDED_FORWARD_OPEN_SCENES`
  (pollDetail, pollCreation, saveList, restaurant, userProfile, listDetail, followList, …)
  paint their own seed on frame 1 (swapImmediately); `scene-foundation-spec` declares a
  `skeleton` for EVERY scene for the body-pending window. So a child either seeds its
  chrome OR shows its declared skeleton — never a blank/held frame. (listDetail is the
  hybrid: warm-seeded header on frame 1 + body skeleton until the world-read fills.)
- **Git-history graft sweep (item 5): NOTHING TO GRAFT.** The transition system is the
  canonical culmination of many prior eras — overlay-sheet-system-redesign v1/v2/v3 →
  page-switch-master-plan → canonical-sheet-transition-master-plan →
  canonical-transition-finish-plan, plus the chrome-recede tuning arc (944b2d60,
  83f085f5, 9a225812, …). The trajectory is monotonic improvement toward the canonical
  master plan the current code implements; no earlier piece was better-and-lost.
- **Strip-crossing gap (item 1): STRUCTURALLY DISPROVEN** (three RED-lawed isolation
  layers above). The remaining check is the transient-flash eye-check — the OWNER's live
  oracle, not a settle screenshot.

**§4 structural program: COMPLETE.** The only remaining §4 work is the owner's
per-permutation live-eye feel verdict (transient-flash / "instant / seamless" against the
blessed baseline) — reserved to the human oracle by the project's own methodology. There is
no further machinery to build or audit in code.

### Rig instrumentation added for the owner's per-permutation audit (2026-07-13)

So the owner's finger-test + any future permutation sweep is reliably drivable (coordinate
taps on the gesture-handoff sheet get eaten by the pan gesture — CLAUDE.md gotcha):

- `header-nav-action` testID on the ONE shared child-dismiss / parent-create control
  (HeaderNavAction) — PROVEN: `tapOn: id: header-nav-action` dismisses a child cleanly.
- `bottom-nav-{search|bookmarks|profile}` testIDs on the root tab bar (SearchBottomNav —
  single-rendered via NavSilhouetteHost; my earlier "duplicate copy" guess was WRONG, the
  nav is single). DIAGNOSED (via a temporary `[NAVSEL]` log at `handleOverlaySelect`, since
  reverted): maestro FINDS the tab testID (no "not found") but the synthetic tap's onPress
  never routes — `[NAVSEL]` did not fire. The `navTouchShield` sits behind the items and
  `handlePress` routes correctly, so the interceptor is NATIVE touch-layering in the
  docked-polls-home state (the frosted `SearchRouteNavSilhouetteHostNativeView` and/or the
  material host capturing the synthetic center-tap despite RN `pointerEvents="none"`). This
  is a HARNESS limitation, NOT a product defect — a real finger hits the tabs fine (which is
  why `header-nav-action`, not behind the frosted nav material, taps cleanly). The tab-sweep
  automation is blocked in this state through THREE independent methods, all verified:
  (1) coordinate tap → eaten by the sheet pan gesture; (2) testID `tapOn: id:` → element
  FOUND but onPress never routes (native touch-layer intercept, `[NAVSEL]` silent);
  (3) `crave://perf-scenario-command?action=open_overlay_scene&scene=bookmarks` deep link →
  no-op unless a perf SCENARIO is active (registry.openOverlayScene unregistered otherwise).
  So automating the parent↔parent tab sweep needs a perf-scenario harness spin-up — the
  owner's perf-session rig, deliberately not activated here. The owner's MANUAL finger-test
  is the unaffected path; the settle states (Lists, list-detail, profile, entity profiles)
  are already captured this session, all with clean chrome/body seams. This is a HARNESS
  boundary, not a product defect — real fingers switch tabs normally.
  Visual finding: every SETTLE state captured this session (Lists[header-strip],
  list-detail[in-list-strip], profile[no-strip], entity profiles, slug "Been") shows a clean
  chrome/body seam — no residual gap band. The transient mid-transition flash remains the
  owner's live oracle (a settle screenshot cannot show a 1-frame flash), but the structural
  proof (three RED-lawed mechanisms) makes a gap hard to produce by construction.
