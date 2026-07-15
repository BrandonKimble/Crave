# Search lifecycle — Phase 2 gap verdict

**2026-07-14. Ideal = plans/search-lifecycle-phase1-ideal-design.md v2 (ratified, incl.
M-1 surface-scoped rule). As-is = plans/search-lifecycle-phase0-autopsy.md + Phase-0
code reads. Default stance: REPLACE — code survives only where it is exactly what the
ideal would have specified.** Per-layer answer to "would we have built this today?"

Legend: **KEEP** (is the ideal, or the ideal names it a constraint) · **EXTEND** (right
shape, missing ideal obligations) · **REPLACE** (wrong model; rebuild to the v2 spec) ·
**DELETE** (no successor).

---

## Layer verdicts

### 1. Native map contract + LodEngine — KEEP (constraint F1)

The wire (setRenderFrame / presentation events / episode sequencing / ledger-honesty +
flush-time rebuild fixes) is the platform the ideal designs TO. Untouchable except the
L-6 discovery item (mid-ramp declaration behavior — verify, don't change).

### 2. Resolver core (tuple → reconciler → resolver → world cache) — KEEP + EXTEND

Would we build it today? **Yes** — one writer, delta classification, derived intent,
cache→derive→network, last-write-wins, offline-as-paused is §1.1/A4 verbatim.
EXTEND obligations:

- **Lens exit (A2/S2):** openNow (and sort for lists) leave the tuple/worldKey — the
  open/closed sibling-world + provisional true-up machinery
  (search-open-now-variant.ts, derivation tier's openNow arm) DELETES with it.
- **L-2 laws:** identity-stable warm state (snapshot-equal ⇒ reference-equal),
  stack-pinned eviction, memory budget.
- **Episode tokens (§1.1):** presenter mints per-presentation worldIds; cache keys stay
  value identity.

### 3. Route stack + entries — REPLACE (complete S-B to the v2 spec)

entryId + pure reducer + popToEntry exist (S-B slice 1) and survive as substrate. But:
origin is NOT on the entry (captured ad-hoc at dismiss time in close-owner locals),
per-entry leg instances and same-key nesting were never built, RootEntry/docked-mode
doesn't exist, and `worldBacked: true` params + `desire` absence mean entries are not
self-sufficient. **Rebuild Entry to §1.3** (origin required at push via the provider
registry — which exists and is the right seam; worldState on the entry; chrome derived).
This is the foundation stride finally executed, sharpened by v2.

### 4. Dismissal — REPLACE (the disease site)

`resolveSessionDismissPlan`'s vocabulary (scan-for-search-entry, terminalHome
fallthrough) and BOTH executors (motionless pop / terminal home dance) are wrong by
construction against §0's total-pop law. What survives: the _shape_ (pure algebra
deciding, named executors executing — v2 keeps decision-as-data), the golden home
choreography's zero-plane synchronous commit (becomes the degenerate plan, byte-gated),
`primeDockedPollsForHomeLanding` (becomes a `landing` intent value). DELETE: the
[NAV-CONTRACT] guard (nothing left to guard — unrepresentable), hasWorldToExit gating
(residency owns teardown), the beginCloseSearch heuristic stack (isSearchSessionActive/
hasResults/submittedQuery/isRestaurantRouteActive — replaced by stack facts).

### 5. Presentation/surface runtime (search-surface singletons, enter/exit transactions,

cover-state transport) — REPLACE
The keyless module singletons (surface runtime, mounted-results store, two live render
owners observed) contradict §2's entry-keyed residency; the TWO enter paths
(results-scene takeover vs preserve-into-pushed-entry) and the exit-transaction
construction sites collapse into the one presenter + TransitionPlan engine. The dormant
reveal statechart DELETES (never wired; the plan engine is its successor). The readiness
collector generalizes to the §4.3 join (its per-entry token extension from §3 wave was
the right instinct — now the model, not a bolt-on).

### 6. Transition/choreography engine — KEEP SPINE + BUILD THE PLAN LAYER

The motion-plane/handoff policy model, descriptor snap tables, paint-ack/chromeAck join,
PF single-writer, skeleton engine: **KEEP** (O-10 canon; the child-transition primitive
is already §4.1's chromeCommit + join). BUILD: TransitionPlan as the resolver above it;
the freeze overlay + UI-thread snap-crossing predicate (replaces settle-triggered
preserveOutgoingUntilSettle on dismisses — the "late switch" dies); the aux suggestion
lane; landing intents; resolution-edge re-plan (K-2's collapse moves out of
worldPresentedEffects into the engine). **Search's spec-less exemption ENDS**: search
gets its scene-foundation row (the ratified page-switch P5, finally executed); the
self-frost cover becomes the declared skeleton.

### 7. Toggle engine + consequence seam — KEEP

Would we build it today? **Yes** — the interaction engine (quiet window, seq-guarded
cancelable consequence, visual-floor gate) and the world/content seam are §5 as
designed. Rewire only: consequence = revise on the session entry; floor signal stops
being a search-module singleton (presenter-owned).

### 8. Mouth adapters (EntityLink / entity-ref policy / executor / codec) — KEEP + EXTEND

The value layer is real (S-D executed; URL codec bijective). EXTEND: the M-1
surface-scoped coercion in the engine; DELETE the leaks — worldBacked param sniffing,
requestKey string-prefix matching in the panel world-read (residency + the shared set
replace it), the LaunchIntent bus bridge simplifies to the one action vocabulary, the
warm-profile composite becomes derived ADOPT/OWN (§2), auto-open via
lastSearchRequestIdRef becomes §4.4's re-plan.

### 9. Profile-over-results machinery (ref-bridge remnants, close-chain wrappers,

clearSearchState forks) — REPLACE
The pop-teardown writer proved entry-pop-owned teardown works; v2 makes it the only
model. The remaining profilePresentationActiveRef consumers, outgoingSheetSceneKey
forks, close-transition wrapper ceremony, and chrome/world desync (the "Tomoni" bug —
chrome not derived from the revealed entry) all dissolve into derived chrome + ADOPT
entries.

### 10. Origin/restore machinery — REPLACE (subsume)

captureSearchCloseOrigin/restoreSearchCloseOrigin local-value mechanics, the
richness-gated restore, applyOriginDetent's two pop classes: subsumed by
origin-on-entry + plan data (M-3 stays a per-flow detent config). The capture provider
registry KEEPS (it is §1.2's seam).

### 11. Harness — BUILD NEW

Command-bus verbs + out-of-band ack channel + the mouth×action×dismiss matrix + trace
assertions + frame samplers (samplers exist — KEEP). Lands EARLY in Phase 3 (gates the
rebuild). The three unattributed runtime items (FITALL zero-members, stale-pins gate,
snap-vs-fade regression) get attributed DURING harness bring-up on the OLD code first —
they are the harness's first RED proofs, and two of them likely dissolve with layers
4–5 (verify, don't assume).

---

## The scorecard

| Layer                        | Verdict                 | Confidence |
| ---------------------------- | ----------------------- | ---------- |
| Native wire + LOD            | KEEP                    | constraint |
| Resolver core                | KEEP + EXTEND           | high       |
| Entries/stack                | REPLACE (complete S-B)  | high       |
| Dismissal                    | REPLACE                 | high       |
| Surface/presentation runtime | REPLACE                 | high       |
| Transition spine             | KEEP + build plan layer | high       |
| Toggle engine                | KEEP                    | high       |
| Mouth adapters               | KEEP + EXTEND           | high       |
| Profile machinery            | REPLACE                 | high       |
| Origin/restore               | REPLACE (subsume)       | high       |
| Harness                      | BUILD                   | —          |

Roughly: the VALUE layers (desire, resolver, toggle, mouth adapters) and the NATIVE
layer were built right and survive. Everything between them — the lifecycle middle
(entries, dismissal, surface runtime, presentation ownership) — is replaced. That is
exactly the autopsy's two-half-worlds diagnosis: the middle is where the waves collided.

## Phase 3 shape (for the charter, owner ratifies separately)

1. Harness first (on old code; attribute the 3 open items; RED-prove assertions).
2. Entries-as-values + origin-at-push (layer 3) — the foundation cut.
3. TransitionPlan engine + freeze/crossing primitive + search scene-spec (layer 6).
4. Residency presenter + surface-runtime replacement (layer 5) — the big cut, with
   dismissal (layer 4) landing in the same arc (they are one model).
5. Mouth/profile/origin dissolutions (layers 8–10) + lens exit + L-2 (layer 2).
   Golden home byte-identity + the harness matrix gate every cut (invariant 9).
