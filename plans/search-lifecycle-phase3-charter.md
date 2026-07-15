# Search lifecycle — Phase 3 execution charter

**2026-07-14. Ratified shape (owner): harness → entries → plan engine → residency+dismissal
→ dissolutions. Ideal = phase1 design v2 (ratified); verdicts = phase2 doc. Standing gates
on EVERY leg: golden home dismissal byte-identity (invariant 9), API/mobile tsc + suites,
and from Leg 1 onward the harness matrix. Solo-dev: work lands on main; each leg ends
with the app WORKING (cuts are whole, no half-migrated flags).**

## Leg 1 — THE HARNESS (built against the OLD code, deliberately)

1a. **Ack transport**: dev-only local HTTP probe server in the app (Metro-adjacent port)
or correlation-ID Metro-log emission — every perf-scenario verb returns
{ok, stateSnapshot}. Choose by spike; HTTP preferred (pull-based, no log scraping).
1b. **Verbs**: trigger_mouth(kind, payload) for all 8 mouth kinds; dismiss(affordance:
searchBarX | sheetX | dragToBottom | back); toggle(kind); read_lifecycle_state()
→ {stack entries (key, entryId, worldBacked), resident worldId+phase, native ack
snapshot, sheet snap, nav state, chrome title}.
1c. **Trace**: mach-clock event log for transition executions (commit, motion start,
join inputs, joint, crossing, settled) — v0 instruments the EXISTING paths.
1d. **The matrix v0**: mouth × {reveal, sub-mouth push/pop, each dismiss} on the old
code. EXPECTED: it fails where the owner's finger-tests failed — those failures are
the RED proofs that the assertions can see the real defects (methodology law).
1e. **Attribute the 3 open items on old code** (instrument, don't theorize): FITALL
zero-members repro; stale-pins exact gate; snap-vs-fade joint timing. Findings →
autopsy addendum; fixes ride their owning legs (no patching ahead of the cut).
Gate: matrix runs end-to-end via one script; every assertion RED-proven on a planted or
real defect; findings documented.

## Leg 2 — ENTRIES AS VALUES (design §1.3)

Entry/RootEntry types; origin captured at push via the provider registry (REQUIRED);
worldState on entries; chrome derived from scene metadata (fixes chrome-desync class);
per-entry leg instances for children + same-key nesting (S-B slices 3–4 to v2 spec);
docked-polls as home-root mode. The dismissal selector keeps working during this leg
(vocabulary swap comes in Leg 4).
Gate: matrix (nav flows) green-or-known; reducer + entry spec suite; drill-in
poll→profile→list→restaurant→back×3 restores each level (harness-assert).

## Leg 3 — TRANSITIONPLAN ENGINE + FREEZE PRIMITIVE (design §4)

resolvePlan over the kept transition spine; press-up clock (§4.3) incl. warm-hit async
hop; the freeze overlay + UI-thread snap-crossing predicate (velocity-scaled ε,
shared-gate across body lanes + persistent header host); search scene-foundation row
(skeleton spec — P5; self-frost cover dies); aux suggestion lane; landing intents;
resolution-edge re-plan (K-2). Home dismiss re-lands byte-identical as the degenerate
plan FIRST (the standing gate proves the engine before anything else migrates).
Gate: golden byte-identity through the NEW engine; crossing-timing trace assertion
(≤ε); no-partial-bundle assertion; L-1 task law on the loops.

## Leg 4 — RESIDENCY PRESENTER + DISMISSAL (one arc; design §2, §4.5, §4.6)

The presenter (single wire owner; sequenced worldSwap; exit frames pre-built; episode
tokens; crave-rank/multi-location/lens rules); surface singletons replaced; the
dismissal vocabulary swap (total pop, endSession multi-pop, X semantics per C3,
[NAV-CONTRACT] + heuristics deleted); ADOPT/OWN sub-mouths with derived highlight +
one-owner camera; gesture reversal; arbitration (§4.6).
Gate: FULL matrix green (all mouths × all dismissals, incl. the owner's exact repros:
ListDetail exit from bookmarks, 2nd profile search, sheet-X world teardown); zero
resident sources after every exit (assert); reveal joint ±1 frame (this leg likely
absorbs the snap-vs-fade regression — verify via 1e's attribution).

## Leg 5 — DISSOLUTIONS + LENS EXIT

M-1 coercion in the engine; worldBacked/requestKey leaks deleted (panel reads the
shared set via residency); LaunchIntent bridge collapse; profile machinery + origin
locals deleted; lens exit (openNow out of the tuple; sibling-world/true-up machinery
deleted; S2 of the unification verdict) + L-2 identity/eviction/budget laws.
Gate: full matrix + listIdSet===mapIdSet lens assertion + perf baselines (H3, release
or known-multiplier dev) + grep invariants (§8.3/8.4/8.10).

## Owner checkpoints

After Leg 3 (home feel through the new engine), after Leg 4 (the full-matrix feel pass —
M-2/M-9 defaults set by eye here), after Leg 5 (final). M-3..M-8 land where flagged.

## Risk register

Golden seam (every leg, standing gate); camera choreography (Leg 4 — composite probe,
never touch LodEngine internals); freeze primitive on gesture devices (Leg 3 finger
check); the L-6 wire discovery (Leg 4 entry criteria: verify mid-ramp declaration
behavior BEFORE presenter cutover); perf regression (trace + samplers per leg).
