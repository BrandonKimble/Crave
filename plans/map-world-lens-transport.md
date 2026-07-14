# Map World Lens Transport — ground-up redesign of the JS→native map data plane

Status: EXECUTED 2026-07-12 (strides resolved below; uncommitted) — see §8 for the
build ledger, reshapes, and what remains owner-gated.
Prereqs: round-1 sheet-motion fence + round-2 acked-parity fix (built 2026-07-12,
uncommitted); folds into the reveal-statechart wiring and the presentation-choreography
derivation work ([map-presentation-choreography-derivation.md]).
Related memory: `dismiss-nav-lockstep-and-transition-perf` (attribution numbers),
`map-architecture-shipped` (3-substrate + LEA + dormancy precedents).

---

## 1. Why (measured, 2026-07-12, iPhone 17 Pro sim, Austin ~650 restaurants)

The current transport treats every search episode as a fresh universe: build a preview
world, ship it whole, ship the enriched world whole, destroy everything on dismiss.

- One full-world frame = **4.9MB of JSON** (2,600 features × ~1.9KB across the 4
  sources: pins, pinInteractions, dots, labelCollisions).
- A fresh submit ships it **twice**: `hidden_preload` (restaurant-preview world, ~88ms
  native main) then `enter_requested` (enriched world — every pin's properties rewritten
  with connectionId/dishName/topDishCraveScore — **~215ms native main, landing exactly at
  reveal start** = the visible reveal hitch).
- Zero-delta frames each burn 90–115ms of module-queue time (queue churn behind the
  megapayloads; the envelope itself is ~1.5KB).
- Resubmit of a cached world re-ships 4.9MB. CORRECTED (red team 2026-07-12): native
  does NOT clear sources on dismiss — it already keeps them resident and dorms the
  layers (SearchMapRenderController.swift:6237-6256, :6496 "no deferred SOURCE clear").
  The rebuild cost is the **JS republish path** (store re-projection + full re-ship),
  i.e., the JS side doesn't KNOW native is still resident. That reframes S-3 entirely.
- The whole defect family lives here: the double ship, the reveal-time apply, the
  "Source delta missing feature" patch-baseline rejections, the (now removed)
  force-replace-on-new-request compensation, the rebuild-on-resubmit.

The map's OWN architecture already rejects this premise everywhere else: LEA mutates
opacity without reparsing features; the dot layer goes DORMANT (withdraws from collision
so basemap labels return) without destroying data; the candidate catalog (Stage B)
already ships a rank/coordinate lens that native projects per camera tick. The GeoJSON
re-ship pipeline is the one subsystem still bending under the old premise. This plan
retires it rather than optimizing it.

## 2. The model — the city is the substrate, a search is a lens

**Substrate (native-resident, market-keyed).** Restaurants at fixed coordinates.
Geometry + stable identity + stable display attributes ship ONCE per market and stay
resident (dormant when no search is active). Native owns feature materialization for all
four GL/VA families from the substrate. Ships as an incremental, append-only stream:
the first search in a market pays today's full cost; later searches append only entities
not yet resident (kilobytes).

**Lens (per search episode).** What a search actually changes:

- membership: ordered entity ids in-world (per tab)
- ranks + badge assignments
- per-entity attribute patches (craveScore, dishName/connectionId, isOpen, rising, …)
- collision participation + presentation phase (already owned by LEA/LodEngine)

A lens frame is ids + numbers + short strings — kilobytes. Applying a lens = native
re-materializes/patches features from resident substrate + lens attributes. Removing a
lens (dismiss) = presentation ramp-out + collision withdrawal (dormancy), substrate
untouched. Re-applying a cached lens (resubmit) = near-free.

**Enrichment is a lens patch.** The preview→enriched two-phase stops being two worlds:
the preview IS the lens with partial attributes; when the full response lands, an
attribute patch updates the same lens in place. No second world, no second full apply.

### Behavioral invariants (constraints confirmed 2026-07-12, owner)

- Basemap-label crossfade between searches is UNCHANGED: label return is driven by
  collision participation + opacity (presentation facts), never by data destruction.
  Dismiss = ramp-out + collision withdrawal, exactly the dots' dormancy pattern.
- Cross-market flow (Austin → dismiss → NY → search) degrades exactly to today: first
  search in a non-resident market pays the full substrate ship. Never worse than today.
- Substrate residency policy: LRU, small cap (start with 2 markets). Eviction is
  invisible (next search in an evicted market = first-search cost).
- Viewport-bounded searches returning entities not yet resident ship those entities as a
  substrate APPEND (incremental), never a full re-ship.

## 3. Contracts (loud, RED-provable)

1. **One substrate ship per (market, entity)** per residency epoch. A second full-feature
   ship for a resident entity is a contract violation (log + counter).
2. **Lens frames are bounded**: a lens/patch frame carrying feature geometry is a
   violation (geometry lives only in substrate appends).
3. **Acked substrate parity**: every lens applies against an acked substrate revision;
   native rejects (loudly) a lens referencing a non-resident entity id → JS responds with
   a substrate append + lens retry (the round-2 acked-parity + toggle-strip
   baseline-resync machinery generalizes to this).
4. **Presentation stays the sole opacity/collision authority** (LEA/LodEngine unchanged;
   one writer per factor). Lens application must not touch opacity channels.
5. Reveal readiness gates on **enriched-lens applied under cover** — the reveal never
   co-fires with a lens/patch apply (kills the 215ms reveal hitch by construction; this
   piece ships FIRST, see sequencing).

## 4. Sequencing (strangler — each stride device-verified before the next)

- **S-0 (independent, do first): reveal gates on the enriched frame.** Pure choreography:
  `nativeMarkerFrameReady` must be satisfied by the frame carrying the CURRENT world's
  enriched data, not the preload; the enriched apply lands under cover. No transport
  changes. Kills the visible reveal hitch immediately. Re-measure.
- **S-1: substrate/lens schema + native substrate store.** Swift-side market-keyed
  entity store + feature materialization for the 4 families; pure-engine golden tests in
  MapLodKit style (`swift test`, no sim). JS ships substrate appends + lens frames over
  new verbs on SearchMapRenderController (`appendSubstrate`, `applyLens`, `patchLens`,
  `retireLens`). Old setRenderFrame path stays live in parallel.
- **S-2: cut the submit path over.** Preview = lens with partial attributes; enrichment =
  `patchLens`. Delete the hidden_preload full-world ship. Contract counters prove one
  substrate ship + bounded lenses.
- **S-3: dismiss → dormancy.** `retireLens` = presentation ramp + collision withdrawal;
  sources stay resident. Resubmit = `applyLens` from cache. Verify basemap-label
  crossfade byte-identical (recorded-frame comparison vs today's baseline).
- **S-4: delete the legacy pipeline.** GeoJSON full-frame path, sourceDeltas transport,
  force-replace remnants, journal-replay machinery that only existed to make optimistic
  patch baselines safe. (Per ethos: DELETE, don't keep the fallback.)
- **S-5: residency policy** (LRU cap, eviction, memory ceiling instrumentation).

Each stride: perf scenario `search_submit_dismiss_repeat_*` before/after (bridge-slice
main/module numbers + UI/JS frame samplers), plus eye-verified choreography (reveal
crossfade, dismiss label return, resubmit).

## 5. Open decisions (owner)

- Residency cap + memory ceiling (substrate for 650 restaurants ≈ small; measure NYC
  scale before fixing the cap).
- Whether labelCollisions substrate rides the same store or stays derived natively from
  pins (preferred: derive natively — one less family to ship).
- Preview lens contents: is a restaurant-only preview still wanted once enrichment is a
  cheap patch, or should the preview phase collapse entirely on fast responses?
- Android: pins/taps are iOS-only today; the lens verbs should be designed
  platform-neutral but implemented iOS-first.

## 6. Risks

- Precious-surface risk: native store + materialization touch the shipped map. Mitigate
  with the strangler order (old path stays until S-4), golden pure-engine tests, and the
  perf-scenario harness gating every stride.
- In-flight overlap: toggle-strip session's transport fixes (journal proof, baseline
  resync) and the choreography-derivation plan touch the same files — sequence S-1+
  after those land or fold them into this effort explicitly.
- The two "quick option" temptations (property-patch channel alone, dormancy alone) are
  fragments of this plan; building them standalone re-bends the old system. S-0 is the
  only piece sanctioned to ship ahead of the model.

---

## 7. Red-team verification findings (2026-07-12 — two adversarial code passes; MUST-READ before implementing)

The model survived verification and is BETTER-SUPPORTED than §2 claims — but several
premises were corrected and the strides rescope. Every claim below carries file:line
evidence from the passes.

### 7.1 The substrate mostly already exists natively — S-1 shrinks

Native never passes GeoJSON through: `parseSourceDeltas`/`applyParsedCollectionDelta`
maintain per-family `ParsedFeatureCollection` (featureById, diffKeyById, featureStateById,
markerKeyByFeatureId, idsInOrder — SearchMapRenderController.swift:11835-11868) plus an
acked `SourceAppliedFeatureLedger` (:659, :682). **S-1's genuinely new work is only: a
market key + residency epoch on these collections, and an append-only substrate verb**
distinct from per-frame deltas. Extend the existing types; do not build a new store.

### 7.2 One-entity-list fan-out is a generalization of existing machinery

pinInteractions is a 1:1 property-thinned clone of pins (use-direct-search-map-source-
controller.ts:2117-2149). labelCollisions is a pure function of pin geometry gated by the
on-screen set NATIVE already owns (:849-893; getNativeVisibleMarkerKeys :2154). The
marker-role path already ships per-entity BUNDLES (pin+interaction+dot+collision per
markerKey, Swift :567-575, :2062-2113). So: ship ONE entity list; native fans out to all
four families; the labelCollisions on-screen gate moves native-side (and JS's
`assertProjectedVisualFrameInvariants` :2162 parity check moves with it).

### 7.3 The lens has TWO attribute consumers — design both channels

Swift reads only transient opacity keys + nativeLodZ from feature properties; everything
semantic is resolved in JS into catalog fields (`badgeImageId`, `labelText`,
`labelSubtext` — Swift :1441-1448, :7745, :7969). BUT the GL pin bundle still consumes
raw properties (craveScore/isOpen/pinColor/…) via Mapbox style expressions. An
enrichment patch must update BOTH the catalog channel and the GL property channel — or
(preferred, decide in S-1) migrate GL styling to catalog/lens-derived values so the lens
is the single attribute channel.

### 7.4 Entity identity = markerKey, not restaurantId

markerKey = `restaurantId:lng:lat(6dp)` — coordinate-stable ACROSS TABS (search-map-
visual-identity.ts:11-20), which is the strongest validation of the lens split (a tab
toggle changes membership/attrs, never identity). Consequences: multi-location
restaurants = multiple entities; a coordinate re-pick (same restaurant, new coords) is an
evict+append, not a patch (`coordinateSwapCount` in pin_publish_stability_contract
:2098-2104 already tracks this). The substrate keys on markerKey.

### 7.5 Toggles/variant-reruns are lens-shaped TODAY — and there is a proto-lens to delete

A tab toggle is zero-network (both tabs' coverage fetched up front, shortcut-coverage-
world.ts) and differs only in membership order, ranks, dish attrs (isDishPin/dishName/
connectionId/topDishCraveScore), and pin color. The existing `preparedSourceFrameByFingerprintRef`
cache + sibling prewarm (:1085-1116, :1409-1534, contract `toggle_frame_rebuilt_despite_prewarm`
:1546) is a proto-lens computing exactly what `applyLens` would carry. **S-2 must DELETE
it in favor of the lens store — two caches computing sibling membership is the two-writer
disease.** Variant reruns (open-now/price/rising/include-similar) are membership+attr
lenses that re-fetch coverage (network) — lens-shaped, not new-world-shaped (TR5-N,
use-results-presentation-surface-transaction-runtime.ts:243-270).

### 7.6 Pagination appends (natural mode)

Natural-search page-2 GROWS map membership (marker catalog from mounted results,
:1557-1597); shortcut mode is page-invariant (pins decoupled from card pagination,
comment :1574-1586). The lens must support membership EXTENSION + substrate append for
page-2 entities; today this is a full republish — the lens turns it into the honest
increment.

### 7.7 S-0 exact wiring + two traps

`nativeMarkerFrameReady` is produced by the FIRST `presentation_execution_batch_mounted_hidden`
(use-search-map-native-render-owner.ts:2337-2356 → use-results-presentation-marker-enter-
runtime.ts:101-125 → markRedrawNativeMarkerFrameReady). S-0 = key the acceptance to the
batch carrying the ENRICHED world's requestKey, so the preload's mounted_hidden cannot
satisfy the gate. Traps: (a) `armRedrawCoverWatchdog` tier-1 force-resolves this gate
for toggles (search-surface-runtime.ts:658-716) — added enrichment latency must fit the
watchdog budget or the budget moves; (b) TWO resolvers race (`mounted_hidden` fast path
vs `presentation_toggle_settled`→`markRedrawSettled` :755-779) — S-0 must sever the
preload path without breaking the toggle resolver.

### 7.8 Contract semantics corrections

- Contract 3: native ALREADY auto-heals (update→add promotion via
  `reconcileSourceMutationAgainstLedger`, Swift :10521-10533, loud `[R3RECON]` log) rather
  than reject-and-wait. DECISION: keep auto-heal as the mechanism, add a loud counter
  (auto-heal = the append; a rising counter = the RED signal that JS membership math is
  wrong). Reject-and-wait would add a round-trip for no correctness gain.
- Contract 4 rewording: lens patches don't **own** opacity — a new-entity append still
  SEEDS initial feature-state (the diffKey/featureState split already enforces the
  separation on both sides: TRANSIENT_VISUAL_PROPERTY_KEYS, source-store :12-17;
  Swift transientVisualPropertyKeys :210-218; nativePresentationOpacity RETIRED).
- Dormancy invariant to preserve: layer `visibility` flips ONLY at the opacity floor —
  `contract_violation_visibility_dorm_mid_ramp` (Swift :6361) already fires on violation.

### 7.9 S-4 scope correction

`markerRoleFrame` (promote/demote opacity transport) is the LEA/presentation lane, NOT
part of the structural journal machinery — it survives S-4. What S-4 deletes: the
GeoJSON sourceDeltas path, `buildReplayJournalDelta` + chain-proof + full-replace
fallback (:1214-1290), the fingerprint prepared-frame cache + prewarm, and the
force-replace remnants.

### 7.10 Sequencing dependency, sharpened

The reveal statechart is scaffolded but NOT wired (imported only by its spec; the seam's
world-commit hold names it as chartered owner). S-0 lands directly on that half-wired
seam — wire the statechart as part of S-0 or explicitly declare the gate re-keying as
pre-statechart work it will absorb. The toggle-strip session's transport fixes (journal
proof, baseline resync) become S-4 deletions — coordinate so that session doesn't keep
hardening machinery this plan deletes.

### 7.12 S-0 IMPLEMENTATION SPEC (decided 2026-07-12, in progress)

The gate must be DATA-KEYED and RE-DERIVABLE, not stage-latched:
`nativeMarkerFrameReady ⇔ (last mounted_hidden frame's sourceDataKey === currently
desired sourceDataKey)`. A latch is insufficient: with a slow response the preview
legitimately satisfies the gate pre-commit, then the commit changes the desired data —
the gate must flip back until the enriched frame mounts. Steps:

1. Render owner (use-search-map-native-render-owner.ts): record
   `frameGenerationId → sourceDataKey` for each submitted frame (bounded ring/map on the
   transport state); mounted_hidden handler resolves the mounted frame's dataKey.
2. Marker-enter runtime (use-results-presentation-marker-enter-runtime.ts:101-125):
   on accepted mounted_hidden, compare mounted dataKey vs the current desired dataKey
   (source frame port getSnapshot → markersRenderKey/data key). Match → mark ready.
   Mismatch → record as mounted-stale (do NOT mark).
3. New `markRedrawNativeMarkerFramePending(transactionId)` on SearchSurfaceRuntime
   (mirror of markRedrawSheetMotionPending): called when the projector publishes a NEW
   desired dataKey while the active redraw transaction's ready bit was satisfied by a
   different dataKey. The enriched frame's own mounted_hidden then re-marks ready.
4. Traps honored: toggle watchdog budget unchanged (toggles have one dataKey — no
   preview/enrich split); the `presentation_toggle_settled` resolver untouched;
   commitEnterStart/marker-enter start must also ride the ACCEPTED (data-matching)
   batch, not the stale one.
   Verification: probe run must show enter_requested frame with upsert:0 —
   the enriched apply lands in `covered` (main-thread apply under cover), and the
   bridge-slice for enter_requested carries zero source deltas. Eye: reveal crossfade
   smooth, no mid-reveal hitch; UI sampler maxFrameMs during reveal < 33ms.

**S-0 RESOLVED 2026-07-12 — the premise was WRONG and the goal is already met by
construction (device-attributed):** correlating `native_execution_batch_mounted_hidden_ready`
with bridge slices shows the preload (covered) frame carries NO presentation requestKey
and NEVER emits mounted_hidden; the gate is satisfied ONLY by the enriched frame's batch
(frame:3/batch:3 = the enter frame with the 2600 upserts), and that apply lands at the
DARK FLOOR (markers mount hidden) before the fade-in ramp. So the reveal already gates
on the enriched world; the ~220ms main-thread apply is a CPU/contention cost under
darkness — its fix is S-2's lens slimming, NOT reveal gating. §7.7's "preload satisfies
the gate" claim is retracted. The S-0a data-keyed stale-mount skip stays as a defensive
contract (protects future same-request preview/enrich flows; measured no-op today).

**S-0a original notes (superseded):** the acceptance skip (stale-mount rejection via
mountedSourceDataKey/desiredSourceDataKey on ExecutionBatchPayload; ledger in
use-search-map-native-render-owner module scope; skip in
use-results-presentation-marker-enter-runtime handleExecutionBatchMountedHidden) only
helps when the enriched commit lands BEFORE the preview mounts. With dev-API latency
0.5-4s the preview always mounts first, legitimately satisfies the gate, and the
enriched apply still lands at enter_requested (~220ms main). **S-0b is therefore the
real win and is REQUIRED:** when the desired dataKey changes while the active redraw's
nativeMarkerFrameReady was satisfied by a different dataKey — (1) flip the gate back
(new markRedrawNativeMarkerFramePending, mirror of the sheet-motion pending), (2) reset
the enter machine stage from enter_mounted_hidden back to enter_pending_mount for the
new batch (THE TRAP: acceptance blocks non-pending stages, so a stale-accepted batch
currently deadlocks the enriched batch's acceptance — this stage reset is why S-0b was
deferred), (3) ensure marker-enter start/commitEnterStart re-key to the enriched batch.
Fold S-0b into the reveal-statechart wiring where enter staging is explicit state.

### 7.11 Highlight orthogonality carve-out

In-world selection/highlight rides the frame envelope (highlightedMarkerKeys,
search-map.tsx:1634-1676) — orthogonal, confirmed. EXCEPT additive-seeded profile-open
(restaurant outside the presented world, `additiveSeededRestaurants` :1159-1175): that is
a genuine small substrate append + lens membership add, not envelope-only.

---

## 8. BUILD LEDGER (2026-07-12, all uncommitted, device-verified)

**S-0 — RESOLVED BY EVIDENCE (no build needed).** The reveal already gates on the
enriched frame's batch (preload frames carry no presentation request and never emit
mounted_hidden); the enriched apply lands at the dark floor. §7.12's S-0a data-keyed
stale-mount skip is built and stays as a defensive contract.

**S-1 — DELIVERED, RESHAPED (frame-channel fan-out instead of standalone verbs).**
Standalone appendSubstrate/applyLens verbs would have broken setRenderFrame's
presentation/apply ATOMICITY (mounted_hidden lifecycle, ledger, enter arming) — the
lens instead rides the frame as a channel:

- S-1a: diffKey = dual-32-bit hash of the stable serialization (was the full ~800B
  serialized feature, shipped ×4 families). search-map-source-store.ts.
- S-1b: `derivedFamilyTransport` frame channel — JS ships ONLY the pins family;
  native synthesizes pinInteractions (1:1 thin clone), dots (pin bundle + JS-shipped
  dotImageId/nativeDotOpacity extras), labelCollisions (native's own on-screen gate,
  patch-safe membership: retain resident ∪ add upsertable∩visible). diffKeys stay
  JS-computed (Swift float-format trap). Swift: synthesizeDerivedFamilyDeltaDicts +
  threading in applyRenderFrameSnapshotPayload; TS: buildDerivedFamilyTransportForPinsDelta
  in use-search-map-native-render-owner.ts + controller passthrough.
- Measured: structural frames 4 deltas/2600 upserts → 1 delta/650 upserts (~4× feature
  cut, est. 4.9MB → ~1.2MB); zero new rejection classes; submit/toggle(dishes)/dismiss/
  resubmit all render correctly on device. GL main-thread apply unchanged (native still
  materializes 4 families — expected; it runs under the dark floor).
- Round-2 companion (already in): force-replace-on-new-request downgraded to acked-
  revision-parity proof.

**S-2 — PARTIALLY DELIVERED; remainder is an OWNER DECISION.** The 4× family cut
delivered S-2's payload goal. The preview double-ship persists because the preview
world is HONEST different data (restaurant preview vs dish-enriched) and the reveal
never waits on it — deleting it is the §5 "should the preview phase collapse?" product
decision, not a transport defect. Enrichment-as-property-patch (ship only changed props
per feature) is a further ~30-50% cut on enrich frames — marginal vs the risk until the
preview decision lands. The prewarm proto-lens (§7.5) also survives until then.

**S-3 — RESOLVED BY EVIDENCE + ROUND-2 FIX.** Native already keeps sources resident
across dismiss (§7.1); exit frames' structural payload is SKIPPED natively
(kind=='dismiss' guard). The residual resubmit re-ship traced to HONEST per-fetch data
drift (e.g. `rising` scores differ between fetches → diffKeys change → 623/681 re-upsert)
— a BACKEND determinism question (flagged), not a transport defect. When data matches,
the acked-parity fix yields zero-delta frames.

**S-4 — DEFERRED (blocked by design).** The legacy full-family path remains as (a) the
derived-family-only delta path (collision gate rebuilds without a pins change), and
(b) the rejection-recovery replace path. Full deletion requires native to own the
obstacle-membership rebuild continuously (its visible-set changes driving collision
membership without JS frames) AND coordination with the in-flight toggle-strip session's
journal machinery (§7.10). Do as its own pass once those land.

**S-5 — MOOT UNDER THE FINAL DESIGN.** The fan-out design has no separate substrate
store to LRU: residency = the presented world's native collections (already resident
across dismiss, superseded by the next world's apply). One world ≈ few MB native-side.
Market-keyed LRU only returns if multi-world residency is ever wanted (fast
Austin↔NY alternation — no evidence of need).

**Remaining measured costs after this effort (attributed, non-transport):** JS-thread
world-commit/hydration stalls (300-560ms cold, post-slide by construction via the
round-1 fence) and the ~200ms GL apply under the dark floor. Neither drops visible
frames during slides/reveals. Next levers if ever needed: React-commit slicing of the
hydration fan-out; GL apply chunking.

## 9. RED TEAM OF THE BUILD (2026-07-12, two adversarial passes + fixes, device-verified)

**Confirmed defect FIXED — collision gate divergence (the synthesized/legacy alternation
seam):** native's gated collision membership diverged from the JS store's acked
revisions (native echoes JS revisions verbatim, so the divergence was telemetry-
invisible), setting up "Source delta missing feature" rejects on the next
collision-only legacy patch. FIX (ideal shape): the on-screen gate DELETED on BOTH
sides — it was a bridge-payload optimization the fan-out made free; membership now
mirrors pins exactly (placement-equivalent: gated-out ids are off-screen → tile-culled;
obstacle 0↔1 gating stays native via the reseed). This also removes the collision-only
delta churn source.

**Erosions fixed:** (1) S-0 frame ledger was not instance-scoped (frameGenerationIds
are per-instance sequences — two live maps could cross-contaminate the reveal gate) —
now keyed instanceId|frameGenerationId with teardown on detach. (2) Native dot
synthesis leaked pin-only baked props (nativeLodOpacity/badgeImageId/etc.) into dot GL
features — now stripped for parity with the JS dot builder (rank divergence noted:
candidate rank vs unified rank; dot layer reads neither).

**Cleared by the red team:** diffKey hash is opaque on both sides (JS and native
serializations were never interoperable — native's is an internal fallback only);
replace-mode synthesis safe (native resolves resident features from the mounted base);
featureState parity exact; pagination/variant-rerun flows clean; attach/detach recovery
re-materializes all four families via replace-mode fan-out; bare-swap census +
lane-leak contracts unmuted (keyed to effectiveChangedSourceIds, which still lists all
changed families); bridge-slice summaries now undercount (log-only fidelity loss, noted).

**Final gauntlet (post-fix build):** submit → toggle dishes → toggle restaurants →
dismiss → resubmit: all correct on device; toggles replayed resident frames with ZERO
structural re-ships; structural frames 1 delta/650-681 upserts; one rejection = the
PRE-EXISTING pins-family baseline class (identical message pre-dates the fan-out;
designed recovery, screen correct) — tracked with the toggle-strip session's journal
work, not this effort.

## 10. BASELINE-INTEGRITY ROOT CAUSE + CONTRACTS (2026-07-12, closes the "pins baseline" reject class)

Live attribution (enriched reject messages carrying native's base truth) proved the
class was NOT one bug but a family of baseline lies, each now contracted:

1. **Patch-baseline proof (native):** deltas ship `baseSourceRevision`/`nextSourceRevision`;
   native tracks `appliedJsSourceRevisionBySourceId` and loudly rejects a patch whose
   base ≠ what it applied ("Patch baseline mismatch" — classified RECOVERABLE, rides the
   resync-replace path; it briefly escalated to a fatal render error until classified).
2. **Upsert-completeness proof (JS ship side):** a patch asserting non-upserted next ids
   are resident must prove them against the acked snapshot's membership — unprovable →
   replace + `map_patch_unprovable_assumed_resident` contract.
3. **Two-writer truth (native):** `applyMarkerRoleFamilyDelta` REBUILDS family membership
   outside the delta chain (the root two-writer violation) — membership writes now
   invalidate the applied revision so the next patch converges loudly in one resync.
   The IDEAL fix (role lane never writes membership) is the role-lane redesign, tracked
   with the toggle-strip journal work.
   RESULT: three consecutive submit→dismiss→resubmit cycles with ZERO rejections (was 1-2
   per cycle); residual loud classes = ack-race patches (claims vN, native vN+1) which
   converge by design in one replace. Silent membership corruption is dead.

## 11. FINAL RED TEAM (2026-07-12, whole-session diff) — 2 CONFIRMED fixed, watch-items logged

FIXED: (1) "Patch baseline mismatch" rejects didn't match the resync path's 'Source delta'
substring gates (render owner :3187/:3201) → would have stranded the map stale; both
sites now match it. (2) Fan-out synthesized deltas carried no revision proof → native's
appliedJsSourceRevisionBySourceId never advanced for derived families → every later
legacy derived patch would mismatch; the fan-out maps now carry per-family
baseSourceRevision/nextSourceRevision, attached natively in baseDelta. (3) Seam
world-commit-hold subscription had no teardown (the reconciler leak class) —
disposeWorldCommitHold added + wired into the driver effect cleanup.
WATCH-ITEMS (documented, not built): ungated collision membership adds obstacles in
BUFFERED tiles (not just off-screen) — measure placement cost at bigger worlds; verify
recordSharedSheetSnap fires only at settle (if it fires at snap start the commit-hold is
inert — perf-only risk); spec coverage for buildSourceDelta proofs / fan-out synthesis /
seam hold is a named gap. VERIFIED after fixes: 3 more submit→dismiss cycles, zero
rejections; repeat same-query submits replayed resident frames (only 2 structural
applies across 4 submits — the S-3 reuse working).

## 12. Multi-market coverage — VERIFIED THROUGH BACKEND LOGIC (2026-07-12)

Viewport resolves to EXACTLY ONE market (outermost polygon covering the viewport
CENTER, LIMIT 1 — market-resolver.service.ts:207; multi-market status still selects one).
Natural-search markers: scoped to that one market ∩ viewport, shipped ≤100/page (the
~650 figure is the COUNT, not shipped markers). shortcutCoverage dots: viewport-bounded,
scoped to the one market ONLY when the client sends marketKey — WITHOUT marketKey it
returns ALL restaurants in the polygon across every market, LIMIT 50000
(search-coverage.service.ts:181,310). So at multi-state zoom: one market's dots (center
market), never merged — and the 50k no-marketKey path is a payload footgun to cap/decide
before multi-market load.
