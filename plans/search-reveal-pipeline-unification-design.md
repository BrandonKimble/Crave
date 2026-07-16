# The Reveal-Pipeline Unification (Q-2 phase 5) — clean-room design

2026-07-15. Input: the Q-2c reveal-joint census (phase0-requirements ledger) + the
ratified choreography laws (T4 joint, press-up skeleton, O-1, O-6, L-1, the fade floor,
O-9). This design sees the REQUIREMENTS, not the existing lanes — the lanes are the
disease being cured. Owner ratifies before any code.

## 0. The problem, stated once

"The world revealed" is one fact the app needs in one place, and today it is computed
four different ways depending on which mouth asked (Q-2c): list enters complete the P5
readiness collector AND the cardsAdmit tick; natural revises complete cardsAdmit;
shortcut/coverage worlds complete neither (only 'sheet' ever reaches the collector);
toggles complete via `presentation_toggle_settled`. Every consumer that wants the fact
(the results rows hold, the listDetail panel hold, the native enter-start, the route
txn's settle, the future perf fences) must today pick a lane — and every new mouth adds
a lane. Three Q-2 mechanisms were falsified by exactly this (ledger Q-2c).

## 1. The ideal, from scratch

A WORLD PRESENTATION EPISODE is `(worldIdentity, episodeToken)` — identity is the
SearchQueryIdentity already threaded through the mounted store; the episode token is
the existing `#g{generation}`. An episode has exactly two facts any consumer may need:

1. **ADMITTED** — cards and map may become visible together (the T4 joint).
2. **SETTLED** — presentation motion complete (native ramp/fade done).

**The episode IS a TransitionTxn.** No new store, no parallel lifecycle: every world
presentation — in-place OR route-coupled, every mouth — runs a `revise` transaction
whose 'revealed' edge IS admitted and whose 'settled' edge IS settled. The engine
already provides identity, phases, supersession-by-staging, the declared-inputs join,
the liveness watchdog (plan-data windows), and the [TXN-TRACE] composite log.

## 2. The three producers (the whole cut)

The reveal join has exactly three inputs, each with exactly ONE producer that fires for
EVERY mouth by construction — this is the load-bearing insight; everything else follows:

- **`paint`** ← the mounted-results ROWS ADMISSION **resolution** for the episode's
  identity in search-mounted-results-data-store. Every mouth mounts rows into the ONE
  store (that is what "presenting a world" means), so this producer is total by
  construction. RED-TEAM REFINEMENT: the producer is NOT `mode==='full'` — an EMPTY
  world (empty list, zero results) is a legitimate presentation whose reveal shows the
  empty body; the producer fires when admission EVALUATES for the episode's identity
  (full OR legitimately-empty-with-results-committed), never parks on emptiness.

- **`mapFrame`** ← the render owner's WIRE ACK for the episode's frame
  (`lastNativeAck` — the D6e revision-ack ledger). The render owner is the single wire
  owner (grep-proven); every lane's markers — execution batches, coverage-derived
  frames, toggle swaps — flow through its submit/ack cycle. The ack is the composite
  fact ("native holds the episode's frame"), not intent. Coverage and toggle lanes get
  the producer FOR FREE because they already ride the same wire.

- **`sheet`** ← the sheet host's motion fence restore (already ONE producer, already
  total — the only input the shortcut lane completes today, which is the proof the
  single-producer pattern works).

Plans by episode kind (reason-shaped, soak-proven vocabulary from phase 2):
- world enter / world revise: `{paint, mapFrame}` (+`sheet` iff motion-expected);
  joinLivenessMs 2000 (network+native-paced).
- toggle: `{paint}` — the canonical swap IS the reveal; the crossfade's
  `presentation_toggle_settled` maps to the SETTLED edge, not the join.

## 3. Route-coupled enters (the arbitration, resolved by unification)

The two-txn shape stands, and becomes CORRECT once producers are total (the deferred
revise failed only because the old marks never fired for some lanes):

1. The route txn reveals the SKELETON at press-up ({paint, chrome} — unchanged) and
   settles at idle (unchanged).
2. The world episode's `revise` txn stages when the route txn terminates (the
   engine's every-edge notification, already shipped), joins on the three producers,
   with already-landed producer facts seeded as offers (mechanism already built and
   soak-proven for the in-place family).

One trace then reads: `push(skeleton) → settled` then `revise(world) → join:paint →
join:mapFrame → revealed → settled` for EVERY mouth — the full enter as data.

## 4. Consumers (the inversion, then the deletion)

- `canAdmitResultsBody` becomes a DERIVATION of the episode txn (live revise targeting
  'search' unjoined ⇒ false). The visual-policy selector keeps its signature; consumers
  (results rows, ListDetailPanel — already on the policy seam after the T4 keyless cut)
  do not change.
- `canStartMarkerEnterForSurface` reads the txn phase instead of the redraw policy.
- The redraw transaction's READINESS JOIN + tier-1/tier-2 watchdogs DELETE — the
  engine's plan-data liveness watchdog is the one never-stuck net. The redraw object
  itself shrinks to its legitimate domain content (bundles, cover state), keyed by the
  episode token.
- The P5 collector (markSceneContentGate / evaluateContentReadiness) DELETES — its one
  real consumer (the search switch's PF paint-ack) re-keys to the route txn's reveal,
  which the T5 render-derived paint evidence already drives.

## 5. Laws preserved (checked one by one)

- T4 joint (cards ±1 frame of ramp start): 'revealed' gates both; the enter-start
  command moves to the txn's revealed edge (one subscription in the enter runtime).
- Press-up skeleton: untouched — the route txn owns it.
- Fade floor / exit ordering: untouched — exits are not episodes; the emptying-catalog
  deferral stays in the render owner.
- O-6 settle-under-cover, J-2/J-6 camera holds: unchanged (camera is not a join input
  of the episode; it stays plan data on route txns).
- Supersession latest-wins: staging supersedes — rapid re-slice/toggle bursts inherit
  the engine's arbitration instead of the redraw's bespoke latest-wins matching.
- Never-stuck: engine watchdog per plan; degrade is LOUD ([TXN-CONTRACT]) and
  RED-provable by suppressing any producer.
- Pagination/version bumps under one identity: NOT a new episode — no txn, no join
  (the value versions; the store appends; nothing re-reveals).
- Failure (world fetch fails): the episode txn is superseded by the unwind's route txn
  or degrades loudly; the covered world does not resurface (unchanged law).

## 6. Migration (strangler, the pattern that has now worked three times)

- **S1 producers-in-shadow**: wire the three producers as OFFERS alongside the existing
  lanes (paint from rows admission; mapFrame from the wire ack; sheet already done).
  The existing shadow stager stops excluding motion-expected arms (the deferred revise
  returns, now correct). Verify: every mouth's episode traces a full lifecycle; zero
  degrades across the matrix + the phase-2 soak set + a coverage/openNow soak.
- **S2 inversion**: canAdmitResultsBody + canStartMarkerEnterForSurface derive from the
  txn. Eye + matrix + soak. (The ONE behavior-bearing step; everything before is trace-
  only, everything after is deletion.)
- **S3 deletion**: redraw readiness join, tier watchdogs, P5 collector, the per-lane
  mark plumbing (markRedrawCardsReady/NativeMarkerFrameReady/SheetReady public wrappers
  where callers remain), the [JOINT]-era escape hatches. Grep invariant: zero readers
  of `redrawTransaction.readiness` outside the surface runtime's own bundle logic.

## 7. Open items the design carries (verify in S1, never assume)

- The wire-ack ledger's coverage-lane behavior: confirm `lastNativeAck` advances for
  coverage-derived frames on device (the census only proved the OLD marks don't fire;
  the ack path is believed lane-agnostic — prove it before S2).
- Rows-admission timing for the toggle's pre-mounted tabs (admission may flip before
  the arm — the seeding mechanism covers it; confirm on trace).
- The enter-start command's move to the revealed edge must not reorder against
  `canStartMarkerEnterForSurface`'s current redraw-phase check (S2 detail).
- EMPTY-world enter vs the exit-ordering deferral: a fresh enter with ZERO pins ships
  an empty catalog — the render owner's emptying-catalog floor deferral must not treat
  it as an exit (the residency gate should distinguish "resident world is empty" from
  "no resident world"; verify on a zero-result search in S1).
- The route-window hold after S3: during a search enter's push window the results hold
  today via BOTH the leg skeleton (S2 law) and the redraw policy; post-deletion only
  the leg skeleton holds. Confirm the panel/rows never paint through the route window
  on a slow fetch (the S2 skeleton fallback is believed sufficient — prove it).
