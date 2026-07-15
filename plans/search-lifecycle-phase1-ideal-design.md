# Search lifecycle — Phase 1 clean-room ideal design (v2, post-red-team)

**2026-07-14. Designed against plans/search-lifecycle-phase0-requirements.md (v3).**
v1 was red-teamed by three adversaries (internal consistency / ledger coverage / platform
feasibility); every DESIGN-BREAK and must-fix is resolved in this text. Autopsy still
sealed. Status: DRAFT for owner ratification.

---

## 0. The organizing idea

**A search is not a flow — it is an ENTRY.** The navigation stack is the only lifecycle
authority. Three constructions carry the ledger:

1. **Entries are self-sufficient values** — an entry carries its desire and its origin;
   nothing about its lifecycle lives anywhere else.
2. **Worlds are properties of entries, presented by derivation** — the map renders a
   pure function of (stack, active transition); no imperative teardown exists.
3. **Transitions are data** — every stack mutation resolves to one TransitionPlan
   executed by one engine; mouths/dismissals/toggles differ only in plan values (N-6).

Pop restores the popped entry's origin — a **total function**. Home is never a
destination code chooses; it is only ever the content of some entry's origin (C2, I-7).

**The commit law (v2 correction, resolves red-team breaks 1–5):** the ROUTE MUTATION
always commits at press-up — commit-led, the proven model (O-10, L-4, platform fact:
mounting is a React/Fabric commit and the incoming scene must premount during travel).
The dismiss "freeze" is purely PRESENTATIONAL: a frozen pixel overlay above the
already-committed destination. Consequences, all structural:

- Stack-derived facts (nav depth, chrome, residency, tab) are correct from press-up;
  no "effective stack" hack is needed.
- A new mouth fired during a dismiss captures the post-pop state honestly (I-2/I-3).
- The golden home dismiss's synchronous idle commit is reproduced exactly (F2).

---

## 1. The value layer

### 1.1 Desire — A2, K-1

```
Desire = { identity: Text | Shortcut | Entity | EntitySet
                    | List(listId, listType, targetUserId?) | Seeded
           semantics: { tab, includeSimilar, rising, ... } }   // retrieval-semantic only
```

Lenses (openNow, price, sort flips) are never in the Desire (A2). `worldKey =
pure(Desire)` is VALUE identity for the resolver cache; the map wire's `worldId` is a
per-presentation EPISODE token minted by the presenter (platform fact: re-entering the
same desire needs a fresh episode; value key ≠ wire key).

### 1.2 OriginSnapshot — C1, C4, C5, J-3

```
OriginSnapshot = { sceneKey, params, detent, segment?,
                   scroll[laneKey→offset], anchor?, camera? }
```

Captured at push by the departing scene's registered provider; stored on the new entry.
Cold-start mouths mint the app-default home snapshot explicitly (I-7). Transient input
chrome excluded (C4). Restore guarantee: scroll-near + anchor-exact, readiness-gated,
sole-scroll-writer in its frame, MVCP disabled on re-sortable lanes (C5, K-8).

### 1.3 Entry — E1

```
Entry     = RootEntry | StackEntry
RootEntry = { entryId, sceneKey ('search-home'|'polls'|'bookmarks'|'profile'),
              mode? }               // docked-polls = a MODE of the home root (E3)
StackEntry = { entryId, sceneKey, params,
               desire?: Desire,     // present ⟺ world-backed
               origin: OriginSnapshot,          // REQUIRED — no nullable arm
               worldState: unresolved | resolving | ready(worldRef) | failed(reason) }
```

- Roots have no origin because popping below depth 1 is structurally unreachable
  (stated invariant, RED-assertable). The "no fallthrough" law holds: every POPPABLE
  entry was born with its return address.
- **No `retained` field** (v1 flaw): world data retention is owned by the resolver
  CACHE alone. Pop re-presents through cache→derive→network (A4); C4's
  "retention is an optimization, never correctness" is true by construction. The cache
  carries the L-2 laws: snapshot-equal ⇒ reference-equal (identity-stable warm state),
  an explicit eviction law (pinned = worlds of entries on the stack, bounded count +
  memory budget; evicted pop = cache-miss re-resolve behind the origin skeleton).
- **Chrome is DERIVED** from (sceneKey, params, desire) via the scene's E5 metadata —
  never stored on the entry (v1 flaw: two sources of truth).
- Identity-revise (§3) resets worldState to resolving and keeps entryId + origin
  (deliberate: X unwinds to where the user physically entered search UI, even after N
  revises — reaffirmed).
- E5/D4 discharged: `search` gets a full scene-foundation row (skeleton spec, strip
  declaration, header descriptor, failure/empty spec) — the spec-less exemption ends.

---

## 2. World residency & the presenter (E2, F1, J)

**Residency is entry-level:** `residentEntry(stack) = nearest world-BACKED entry at or
below top` (regardless of world state). What the map SHOWS derives from
`(residentEntry.worldState, activeTransition)`:

- ready → the world's frame (through the active lens).
- resolving → the under-cover state: prior pixels at the fade floor, or empty on a
  fresh root; promotion/placement settle under cover (O-6).
- failed → the fade floor (never a stale world resurrection; the covered world does NOT
  resurface pre-pop — the sheet shows the failure state, the map holds dark; on the
  pop, the origin's world re-presents). Camera holds on failed/empty (J-2, J-6).

**The presenter** is the single owner of the native wire (F1). It converts
(residentEntry, lens, highlight, cameraIntent) into SEQUENCED frame declarations:

- **World swaps are sequential, never simultaneous** (platform fact: the wire is a
  single-register (worldId, phase); no two-world cross-ramp exists). The plan arm is
  named `worldSwap(a→b)` = fade-out(a) → floor ack → enter(b). v1's "crossfade" is
  retired as misleading.
- Structural frames never land mid-ramp (the wire barks by contract): the presenter
  queues declarations behind the relevant acks. Residency changing mid-ramp supersedes
  at the next ack boundary. (L-6 discovery item: verify wire behavior under mid-ramp
  declarations before Phase 3 freeze — carried.)
- Exit frames are PRE-BUILT at press-up (the dismiss motion window stays clean; L-6);
  frame-build cost is budgeted per pin count with a declared quiet-window carve-out for
  world-enter builds (L-1's declared-window mechanism).
- Frame derivation laws: LOD promotion keys off crave-rank, never active sort (J-4);
  multi-location renders per J-5 (representative competes, siblings dots, selection
  promotes the whole group budget-exempt); the lens projection feeds map AND list from
  one set (A1's invariant at one chokepoint).

**Sub-mouths (B3, I-5, K-5):** one policy fn `resolveResultTap(ref, stack)`:

- restaurant ∈ resident world's projected set → push `restaurantProfile` ADOPT:
  no desire; params {restaurantId}; resident world stays; highlight DERIVES
  (present iff restaurant ∈ the current projected set — so a lens/revise that filters
  it out simply drops the highlight and closes the callout in-transition per O-8; the
  profile itself stays legitimate as sheet content and never self-promotes — v1 break
  #2 resolved by making highlight a derivation, not a stored claim).
- otherwise → push `restaurantProfile` OWN: desire = Entity(id), world of one,
  camera focus. (K-2's collapse is a different thing — see §4.4.)
- Re-taps replace-top (I-5). ADOPT/OWN is derived at push, never passed. Pick mode
  (K-5) swaps this policy fn only.
- **ADOPT pop camera (J-3, one owner):** popping the profile fires the standard
  world-camera restore of the entry beneath through the single camera owner —
  last-write-wins, epsilon no-op (a user pan during the profile that stayed within
  epsilon doesn't snap back).

---

## 3. Mouths (B1–B5)

A mouth fires ONE verb with a value; the ENGINE decides push vs revise (mirror of
ADOPT/OWN: derived, never chosen by the mouth — v1 wording fixed). Mouth table as v1
(§unchanged: home bar/autocomplete/recents, tiles, bookmarks/profile lists, comment
spans via EntityLink, messaging cards, slug/notification links via the codec, sub-mouth
taps, toggles/STA per K-4).

**I-1 rule (M-1 recommendation): surface-scoped.** A mouth fired from INSIDE the
session's own surface (retype, in-search recents) coerces to identity-REVISE (entryId +
origin survive; worldState resets). A mouth from any other surface pushes a new session
(I-4, I-6). X therefore always unwinds to where the user physically entered search UI.

**Edit-mode collision (I-8):** the engine's mutation gate resolves any live edit session
first (commit/abort per the edit primitive's own law) before the push; edit state never
enters origin.

**Background/foreground (I-9):** on foreground, any live transition jumps to its settled
end state; origins do not survive process death (cold start mints I-7 origins).

---

## 4. The transition engine (D, N, O)

### 4.1 TransitionPlan

```
TransitionPlan = {
  chromeCommit,                     // ONE React commit: title/strip/nav-out/plus-X (O-5)
  content:  swapImmediately         // warm hit (O-12) / seeded scene
          | skeleton                // unresolved world (N-1)
          | holdOutgoingUntilSettle // reveal-side crossfade over opaque backing (O-11)
          | freezeUntilSnap(target) // dismiss freeze — presentational overlay (§4.2)
  sheet:    snapTo(collapsed|middle|expanded|full) | hide | none,   // K-2, K-6 'full'
  aux?:     suggestionOverlay(progressDriver: keyboard),            // O-14 lane
  map:      none | enter(world) | exit(world) | worldSwap(a→b),     // sequenced (§2)
  camera:   hold | fitAll | focus | restoreOrigin | restoreWorldBeneath,   // J
  landing?: namedIntent,            // e.g. primeDockedPolls on map-dominant home landing
}
```

- Nav bar is never a plan field: follower projection of sheet progress (O-3), one
  derivation (M-10), never appears/disappears/reappears within a transaction.
- Never-see-through (O-13): sheet alpha constant 1.0; all content policies operate over
  the opaque backing. Sole-motion-source (O-9): no plan consumer may write sheet Y —
  RED-asserted alongside O-15's seat-writer law.
- `landing` carries named product intents that are NOT pure origin restore: the K-7
  docked-polls resurrect priming rides the map-dominant home dismissal's plan
  explicitly (recorded: home landing = origin restore + named intent; the
  docked-dismiss-roundtrip RED flow guards it).
- O-14: search-mode enter/exit is a plan with `aux` — the overlay + bar/chips fade on
  one keyboard-matched progress driver; submit holds the overlay full-height while the
  results plan (content: skeleton) is already live beneath. One engine, no bespoke path.

### 4.2 The dismiss freeze (N-3/N-4, O-1/O-2 — mechanism, platform-verified)

Press-up: route mutation COMMITS (pop; multi-entry per §4.5); destination lanes premount
beneath; the outgoing content becomes a FROZEN OVERLAY — an opacity-gated, z-topped
complete bundle (body + strip + its header state + cover; the shared persistent header
host swaps on the SAME gate — the single-shared-value rule that makes O-1's
no-partial-frame law hold across the host boundary). Sheet motion + map exit start on
the same clock. The swap trigger is a UI-thread position predicate on the sheet's
shared value, armed with a velocity-scaled ε BEFORE the numeric snap Y (O-2), flipping
overlay/destination OPACITY in that same frame (mount never flips UI-side — platform
law); the React cleanup commit follows within an input-fenced window (taps during
crossing→commit are fenced). Degenerate rule: the predicate is a state condition —
already-at-target evaluates true at arm time → swap at press-up (N-4).
**Gesture reversal (O-4):** re-expand during travel re-pushes the SAME entry value
(entryId preserved, world cache-hot, map re-enters the same world from wherever the
fade reached) — cheap by construction; the frozen overlay simply unfreezes. Reversal is
a first-class plan supersession, not an animation rewind.

### 4.3 Execution clock (N-1, L-1)

```
press-up → COMMIT (route mutation + chrome + content policy + bar-text clear on dismiss
           + map exit/worldSwap fade-out start + exit frame [pre-built])
        → raf-sequenced sheet motion; nav follows as projection
        → [always ≥1 async hop off the press-up task] world resolution & world-commit
          fan-out — including the warm-hit swapImmediately content commit (O-12; the
          656ms same-tick class is banned by clock rule, not by vigilance)
        → readiness join: {paint-ack, chromeAck, map mounted-hidden,
          camera-arbiter completion (existing JS signal; 'cancelled' counts satisfied)}
        → THE JOINT: JS flips cards visible and fires the native enter-start token in
          ONE JS tick — cards and map ramp start within ≤1 frame (platform bound; the
          trace assertion tolerates ±1 frame — N-2 as achievable)
        → settled: seats written only by sanctioned writers (O-15)
```

Zero-plane dismisses (child pops, preserveLiveY) resolve to a degenerate plan — no
planes, synchronous idle commit — byte-reproducing the golden home seam (O-10, F2,
invariant 9).

### 4.4 Resolution-edge re-planning (K-2)

A plan may be AMENDED at a resolution edge by rule, not by mouth code: a natural/entity
world resolving to exactly one member re-plans presentation to {sheet: hide, profile
presents} (K-2; suppressed for list identities). This is the one sanctioned re-plan
class; it is a resolver-edge derivation, same engine.

### 4.5 Multi-entry pops (v1 break #5)

`endSession(sessionEntry)` = ONE mutation: pop the session entry AND everything above it;
the restored origin is the SESSION entry's (children's origins point into the dying
subtree and are discarded with their entries). The frozen bundle is the visible
top-of-stack bundle. Search-bar X = endSession(nearest enclosing session); sheet X /
back = pop(top) (C3).

### 4.6 Arbitration (I-2, I-3)

One live transaction per stack. Because mutations commit at press-up, arbitration is
simple: a new mutation supersedes the live transaction's PRESENTATION immediately
(overlay dropped, motion re-targeted with live values/velocity — F3) and the stack is
already truthful for origin capture. Dismissal aborts resolution/revisions/toggle
queues; post-dismiss landings cache, never present. X during dismiss: no-op.

## 5. Toggles & lenses — as v1 (B4/D3/N-5/O-8), with the content arm now typed

(`holdOutgoingUntilSettle` for world-class revise crossfades). Failed revise: world
never left; control state reconciles via the engine's failed-edge baseline restore.

## 6. Failure & offline — as v1 (K-3, §2's failed-residency rule added: map holds dark

at the floor, covered world does not resurface pre-pop). A failed entry accepts revise
(retry = identity-revise) and pop; nothing else.

## 7. Instrumentation & harness — as v1, plus the transport fact: the perf command bus

needs an out-of-band ACK channel (deep links are one-way) — a local HTTP probe endpoint
or correlation-ID Metro-log emission; every verb acks with a state snapshot.

## 8. Invariants (RED-assertable)

1. Every StackEntry has an origin (construction); pops below depth 1 unrepresentable.
2. The presenter's only inputs are (residentEntry, worldState, activeTransition, lens,
   highlight, cameraIntent); zero imperative map-teardown call sites exist (grep).
3. One TransitionPlan type; zero per-mouth choreography branches (grep).
4. Pop is total — no default/fallthrough branch anywhere in dismissal (grep + spec).
5. Joint: cards' first visible frame within ±1 frame of map ramp start (trace).
6. Freeze swap within ε of the crossing; no partial-bundle frame ever paints (trace).
7. No JS task >16ms during a transition outside declared quiet windows (L-1).
8. listIdSet === mapIdSet under every lens (A1).
9. Golden home dismissal byte-identity — standing gate through every cut (F2).
10. No consumer outside the engine writes sheet Y or posture seats (O-9, O-15 — RED).

## 9. Divergences from the 2026-07-08 ideal — as v1 §9, plus: commit-led freeze

overlay (this design) vs that ideal's silence on dismiss mechanics; residency made
world-state-aware; episode tokens split from value identity.

## 10. Owner calls consumed — as v1 §10, plus: M-2 both directions are plan data;

K-7 landing intent is explicit in the plan type; §4.4 is the K-2 mechanism.

## 11. Red-team disposition (for the record)

Consistency: #1–5 resolved by the commit law + derived highlight + endSession + §4.6;
#6/#7 resolved in §1.3 (worldState reset; RootEntry + unreachability invariant; docked
mode + landing intent); #8/#9 resolved by aux lane + §4.4 + landing; #10 in §6;
#11–13/#15 type/derivation fixes in §1.3/§3; #14 in §4.3's zero-plane clause.
Coverage: gaps 1–20 addressed at §3 (I-8/I-9), §4.1 (K-6 full/hide, O-11, O-13, O-9,
K-7), §4.4 (K-2), §2 (J-4/J-5/J-6, L-6), §1.3 (L-2, E5/D4), §4.3 (O-12, L-4), §1.2
(K-8), §2 (J-3 adopt-pop). Feasibility: all 12 findings absorbed — mount-vs-opacity,
commit-led premount, worldSwap sequencing, episode tokens, ±1-frame joint, header-host
shared gate, harness ack transport, exit-frame pre-build.
