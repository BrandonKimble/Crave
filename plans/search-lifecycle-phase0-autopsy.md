# Search lifecycle — Phase 0 as-is autopsy

**2026-07-14. QUARANTINED FROM DESIGN** — this document measures how far the implementation
is from ideal and catalogs what-not-to-do. It feeds the Phase 2 gap verdict only. The
Phase 1 design may not read it. Sources: my own reads of the dismiss/submit/resolver code,
the plans corpus (trigger-nav-ideal-verdict, s-b, s-c-de-special-search, s-c5,
s-d, return-to-origin-foundation-design, wave4-foundations-charter §3,
search-results-unification-verdict), one toggle/choreography mapping pass, and the owner's
2026-07-14 finger-test results.

## 1. The headline: two waves built two half-worlds that collide

- **Wave 1 (S-A…S-E, 2026-07-08→10)** executed most of the ratified ideal's nav strides:
  entries got entryIds, sessions became pushes, the origin slot died, dismissal became
  `resolveSessionDismissPlan → {popToEntry | popToRoot | terminalHome}` with named
  executors, EntityLink/desire values landed. **But S-B was only partially executed**
  (slices 1–2; origin-on-entry, per-entry instances, same-key nesting = NOT built), and
  S-C's model recognizes a session ONLY as a `search` entry above the root.
- **Wave 2 (wave-4 §3, 2026-07-13)** built list/entity worlds that present INTO a pushed
  listDetail/restaurantProfile entry with `preserveSheetState` — deliberately WITHOUT a
  `search` entry on the stack (stack = e.g. `[bookmarks, listDetail]`, world live).
- **The collision**: wave 2 created world-bearing stack shapes wave 1's dismiss algebra
  has never heard of. `resolveSessionDismissPlan` scans for a `search` entry; finding
  none, it **falls through to `terminalHome`** — "home" is the default answer for any
  unrecognized shape. The owner's `[NAV-CONTRACT] non-search root (bookmarks)` error on
  every ListDetail exit is exactly this: the selector misclassifies, the terminal
  executor's dev guard fires, and the dismissal runs a home-shaped dance from a
  non-home origin.

## 2. Dismissal defects (owner-repro'd, code-attributed)

- **Home-as-fallthrough** (app-overlay-route-stack-algebra.ts:274-299): the plan resolver's
  terminal arm is the `else`. Requirement C2 says unrecognized = loud failure, never home.
- **Motionless-by-design pop dismissals** (use-results-presentation-close-actions-runtime
  :110-160): non-home dismissals get NO sheet slide and NO map fade — "teardown rides the
  popped entries." Non-home mouths were architected without exit choreography, not merely
  buggy (violates C6). The stale-pins bug (sheet X pops previous screen, old pins stay) is
  this executor's exit-commit gating (`hasWorldToExit`) meeting a stack shape where the
  world "belongs" to the popped listDetail entry — the results-surface snapshot doesn't
  register it, so the native wire exit never runs. (Exact gate condition needs one runtime
  probe to confirm which arm fails; the class is certain.)
- **Chrome/world desync on child pop** (charter-parked 2026-07-13): X-dismiss from a pushed
  profile returned to the list sheet but search chrome kept the profile's title. Chrome is
  not derived from the revealed entry.
- **The X-buttons' meanings are wrong for non-home mouths** (owner-repro'd): search-bar X
  routes to home (the fallthrough); sheet X pops without ending/tearing down the search.
  Nobody owns the C3 distinction because "session" has no first-class runtime
  representation — only stack-shape heuristics.

## 3. World-lifecycle defects

- **[FITALL] zero-finite-members on 2nd profile-mouth search** (use-search-submit-owner
  :344): the world presented with rows lacking finite coordinates (or zero rows). Candidate
  classes (UNATTRIBUTED — needs a runtime probe per the attribute-before-ideate law): the
  world cache returning a sibling-derived entry whose committedResponse wasn't
  coordinate-hydrated; the first session's exit never running (see §2) leaving the
  surface/bundle state poisoned for the next enter; or tab-side mismatch (dishes vs
  restaurants row shape). DO NOT theorize a fix before instrumenting.
- **One world globally, held in module singletons**: the surface runtime / mounted-results
  store / render-owner are singletons keyed by nothing. §5.3's model (world per
  world-backed ENTRY, covered worlds retained for pop) exists only as doc. Consequence:
  any second world tramples the first's state; pop-restores of a covered world are
  impossible by construction.
- **Two render-owner instances observed live** during §3 (old visible + new hidden holding
  the list world) — the "one world" invariant isn't structural anywhere.

## 4. Choreography silos

- **The reveal statechart was chartered and never wired** (search-reveal-statechart.ts:
  zero non-spec consumers). The live path is the cover-state transport + native event
  stream, coordinated per-flow.
- **Search is deliberately spec-less**: excluded from scene-foundation-spec (no declared
  skeleton row), silent under the strip law, can't donate/receive chrome-height in the
  chrome-ack runtime. The app-wide scene laws (D4) simply don't apply to the app's most
  important surface.
- **Search is the only 'world'-consequence toggle consumer**; the floor-signal is a search
  module singleton. The toggle engine itself (interaction engine, consequence seam) is
  clean and generic — a genuine primitive worth keeping.
- **Reveal-go was results-scene-coupled**: the presentation machine advances only via the
  results route switch's readiness collector; §3 hand-extended it for the listDetail push
  (readiness token on the child push). Works, but the "presentation lane keyed by the
  pushing entry" is a bolt-on at one call site, not the model.
- **Pins/labels/dots SNAP instead of fading on reveal** (owner-repro'd regression;
  intermittent fade on back-to-back searches suggests a JS-side timing/perf race around
  the joint). UNATTRIBUTED — instrument the joint (cardsAdmit→rampStart vs native
  enter_started) before any theory.

## 4b. Choreography defects (owner, 2026-07-14 round 2)

- **Home dismiss content-switch fires LATE** relative to the bottom-snap hit (the
  `preserveOutgoingUntilSettle` handoff switches on settle, not on snap-crossing). The
  ideal needs a snap-crossing trigger (UI-thread position condition), generalized to any
  snap point (requirement N-3/N-4).
- **Page-switch P5 never executed**: search results is still a self-frost cover, not a
  real skeleton page under the shared header — the root of search's spec-less exemption
  (§4 above) and of per-mouth skeleton inconsistency.
- Non-home mouths lack the press-up skeleton+slide entirely (they ride the motionless
  executor on dismiss and ad-hoc enters on reveal).

## 5. Mouth adapters — closer to ideal, still leaky

- EntityLink + entity-ref-action-policy + the executor are real and good (S-D.1/2/4).
  But: the listWorld composite push stamps `worldBacked: true` params and the panel
  world-read matches on requestKey prefix strings (`favorites:<listId>:`) — stringly
  coupling between the panel and the world-key vocabulary. The launch channel still rides
  the LaunchIntent bus bridge. The restaurant arm is a "warm-profile composite" (seed +
  world + auto-open keyed off lastSearchRequestIdRef) rather than a uniform world push.
- Two enter paths persist: results-scene takeover (home) vs preserve-into-pushed-entry
  (§3 mouths) — the D1 contract implemented twice with different owners.

## 6. What is genuinely GOOD (candidates to survive Phase 2 on merit)

- The native map render contract + event stream + LodEngine (F1 — untouchable and
  excellent).
- The desired-tuple → reconciler → resolver core (A4 lives: one writer, delta
  classification, derived intent, cache/derive/network tiers, last-write-wins,
  offline-as-paused). The uniform-async commit, flush-time delta rebuild, ledger-honesty
  fixes are hard-won and correct.
- The toggle interaction engine + consequence seam (D3 is fully built and generic).
- EntityLink / desire values / URL codec (B2, E4 substantially real).
- The golden home dismissal choreography end-to-end (G1) — the one dismissal that is
  fully choreographed.
- entryId'd stack + resolveSessionDismissPlan's _shape_ (decision as pure algebra) — the
  algebra is right; its vocabulary (search-entry-scan + home fallthrough) is wrong.
- Scene foundation laws (skeleton/chrome-ack/failure policy) — search just doesn't obey
  them yet.

## 7. What-not-to-do (the disease catalog)

1. **Fallthrough defaults for navigation** — every "else → home" becomes a wrong answer
   the moment a new shape ships.
2. **Recognizing sessions by stack-shape heuristics** instead of representing them.
3. **Tiered choreography** ("terminal gets the dance, pops get motionless") — quality
   became a property of the code path, not the product.
4. **Presentation state in keyless module singletons** while the nav model is entry-keyed.
5. **Chartering a machine (reveal statechart) and shipping around it** — doc-only
   abstractions rot into lies.
6. **Exempting the flagship surface from the app's own laws** (spec-less search).
7. **String-prefix coupling across layers** (requestKey matchers, worldBacked param
   sniffing).
8. **Partial stride execution without a fence** — S-B stopped at slice 2 with no guard
   forcing S-C/§3 to stay inside the executed subset; each later wave built on the
   unexecuted parts' ABSENCE.

## 8. Open attribution items (runtime probes required before design freeze on these points)

- FITALL zero-members exact producer (§3 above).
- Stale-pins exact gate (which `hasWorldToExit` arm fails on the listDetail-pop shape).
- Snap-vs-fade reveal regression (joint timing).
  These do not block Phase 1 (the ideal doesn't depend on which arm is broken) but MUST be
  attributed before Phase 3 sequencing, and the harness should reproduce all three.
