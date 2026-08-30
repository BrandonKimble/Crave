# Wave red-team report — 2026-08-29/30 campaign (committed + working tree)

Read date: 2026-08-30. Scope covered: commits 4bdf568eb, 7a4ca0977, 337352b57,
9ffd79255, cb9f24000, 1caf6a486, plus the full uncommitted tree: the sameness
court (entity-resolution reject/tombstone, D2 context wire, entity-match +
attribute prompts and rule ledgers, embedding recall in food-dedupe,
attribute-dedupe-merge lane, survivor policy), the widening court
(widening-satisfies service/rule/docket, satisfies arms in search), the D4
category move (schema + migration + dish-knowledge + edge SQL + prompt-gold),
the unsegmented-residue group derivation, and the new spec/gold-harness files.
Everything below was read in the code, not taken from the reports.

## FOUNDATION

### F1 — HIGH — Tombstone pre-sink can silence a live entity; tombstone mint is not what its docstring claims
`apps/api/src/modules/content-processing/entity-resolver/entity-resolution.service.ts` (~1547–1610 pre-sink; `ensureRejectTombstone` ~1900s)

Two connected defects in the reject machinery:

1. **The pre-sink checks only for an archived redirect-free row matching the
   term's `identity_key` — it never checks whether an ACTIVE entity shares
   that key.** If both exist (a term rejected in one era, legitimately minted
   active in another — or defect 2 below creates the overlap), every future
   mention is absorbed by the tombstone BEFORE recall runs, so the active
   entity permanently stops accumulating mentions. This is the one failure
   mode the reject asymmetry ("a wrong reject silences a real dish
   permanently") was designed to prevent, reintroduced mechanically.
2. **`ensureRejectTombstone`'s docstring says "advisory-locked through the
   same identity namespace as creation" — no lock is taken.** It relies on a
   unique-collision catch, but the schema's identity-key uniqueness is
   `uq_attribute_identity_key`, an **attributes-only partial unique**
   (schema.prisma:38). For items/ingredients `entity.create` never collides:
   concurrent batches mint twin tombstones, and a tombstone can be minted
   while an active same-key entity exists — feeding defect 1.

From-scratch-correct fix: the pre-sink stands down (falls through to recall)
whenever any ACTIVE row shares the fold; `ensureRejectTombstone` refuses to
mint when an active same-key row exists and takes the same advisory lock the
creator takes (making the docstring true), catching only the real unique
violation (P2002) rather than bare `catch {}` (see G3).

### F2 — MEDIUM — The embedding recall lane's docket does not actually drain
`apps/api/src/modules/content-processing/entity-resolver/food-dedupe-merge.service.ts` (embedding lane, `LIMIT 200`)

The lane's stated law — "no similarity floor; the ledger's memory drains the
docket across runs, closest pairs first" — is aspirational. `LIMIT 200` is
applied **inside the SQL**, before ledger memory filters anything; the
already-decided filter runs later in `adjudicateDedupeCandidates`. So every
run recalls the SAME closest 200 pairs; once they are all judged (holds
persist at the current rule version), subsequent runs recall 200, skip 200,
hear 0 — pairs ranked 201+ are unreachable until entity churn happens to
shuffle distances. The attribute lane (`attribute-dedupe-merge.service.ts`)
does this correctly: candidates → ledger filter → THEN the hearing cap.
Fix: same order — filter decided claim keys before applying the per-run
bound (anti-join in SQL or recall wider and truncate after the `due` filter).
The food lane should mirror the attribute lane's shape, not invent a second.

## GUARD / FALLBACK / BACKCOMPAT

### G1 — MEDIUM — The single entity-match lane still launders the decision token as a reason
`apps/api/src/modules/external-integrations/llm/llm.service.ts` (~2155, `matchEntity` parse: `const reason = stated || decision;`)

The wave's own law ("a reason equal to the decision token is not evidence —
58% of audited rows") is enforced in the placement lane (`(unstated)`) and in
the batch lane (reason stays undefined), but the single transport still
fabricates `reason = 'match'`/`'new'` on silence. Any consumer that treats a
non-empty reason as a stated ground (the dedupe hearing ledger's
reasonless-verdict refusal) is defeated on this lane. Fix: the same refusal
as the other two lanes — never synthesize a reason from the decision word.

### G2 — RULED PRINCIPLED (no change) — D2 context fields optional on the wire
`entity-resolution.types.ts`, `llm.types.ts`, `entity-match-prompt.ts`

Verified this is a law, not backcompat cruft: the context is *evidence*, and
some callers legitimately have none (demand-vocabulary judges a query string
with no source document; sweep hearings have homes but no mention sentence).
Making `mention` mandatory would force those callers to invent provenance —
exactly what `mentionSentenceOf`'s never-invent rule forbids. The ablation
replay (37/41 correct bare) shows the doctrine does not silently depend on
the optional fields. `sameness-court-context.spec.ts` pins omission/caps.
The report's own docket already names the two bare callers to enrich next.

### G3 — LOW — `ensureRejectTombstone`'s bare `catch {}` treats every DB error as a collision
Any storage error (connection loss, constraint unrelated to identity) is
silently converted into "adopt or stand down," which quietly reroutes a
judged reject into quarantined creation. Discriminate P2002; rethrow the rest.
(Folded into the F1 rewrite.)

### G4 — ACCEPTED LAWS (verified stated-with-reason, no action)
- `carriersFor` fail-open in widening-satisfies.service.ts ("context
  enriches; its absence must never block a hearing") — consistent with D2's
  evidence-not-precondition stance.
- Satisfies readers fail open to unwidened search
  (search-sibling-expansion.service.ts) — the expansion fail-open policy.
- `judgeAttributeMergesBatch` fails closed to reasonless `keep`, which the
  ledger then refuses to record as a ruling — the correct pairing.
- `resumePendingEffects` catch-and-continue in `runSweep` — logged, and the
  sweep proceeding is the stated intent.
- `ItemMergePlan.entityType` optional with `?? EntityType.item` — a
  principled stored-plan migration (every pre-extension plan WAS an item
  plan; plans are durable ledger subjects, not live wire).

## LEFTOVER

### L1 — MEDIUM — The systems map asserts the deleted survivor dictionary
`docs/llm-systems-map.md:55`: "owner-ruled canonical spellings always survive
as winner." Falsified by the same wave (D3: `OWNER_CANONICAL_SPELLINGS`
deleted; survivor = evidence count, verified in
`attribute-dedupe-merge.service.ts#planMerge` and its spec). A future agent
citing the map re-learns the overruled doctrine. Fix the line.

### L2 — MEDIUM — search-flow.md already stale vs the tree
`docs/search-flow.md:95` ("The dish axis has a rich graded widening stack;
attributes have none") and :49 ("Their only widening is Stage-4 lexical
variants") are falsified by the uncommitted attribute/ingredient satisfies
arms (`search.service.ts` widening block, `widenConceptArms`). The doc was
written as a line-by-line-verified snapshot; update it in the same commit
that lands the widening work, or it ships false on day one.

### L3 — MEDIUM — Merge-court doctrine moved to v4 (SAME-CLAIM) after the certs and docs were written
`attribute-merge-rule.ts` v4 (`f9305ebbdc33`, same-claim test, widening owns
generosity) supersedes the v3 searcher-tolerance basis that
`plans/sameness-court-report.md` ("bumped to v3, fingerprint 3f350f3de7cc")
and `attribute-merge-gold-cases.json`'s description ("THE INTERCHANGEABILITY
TEST, searcher-tolerance basis") still state. The pinned verdicts themselves
survive either doctrine (the nine cross-word pairs are keep both ways), but:
(a) the fixture description and report section are stale doctrine text, and
(b) **I could not verify the 28-case merge gold was re-certified ×3 at v4**
(no LLM spend permitted in this review). Re-run `attribute-merge-gold.ts` at
v4 before relying on the cert claim; fix the two descriptions.

### L4 — RULED: delete `apps/api/scripts/rebuild-affected-projections.ts`
The dormant audit's condition is met: the alias bug it existed to repair is
fixed at the source — `extraction-scope.service.ts:117–121` selects
`restaurant_id AS place_id` in `affectedPlacesForDocuments`, and
`activate-shadow.ts` calls that method (lines 162, 310). The scoped
affected-set logic the audit suggested preserving already lives in the
service (`activePlacesForPromptHash`), so the script is a spent one-shot
wrapping durable service methods. Verdict: DELETE (a future scoped rebuild is
a 20-line runner over the service, not this v16-framed artifact).

### L5 — LOW — Study artifacts loose in the tree
`apps/api/scripts/fixtures/shard3*` (6 files), `wild-ab-loop4.ts`,
`wild-dish-knowledge-categories.ts`, `wild-ab-named-offering.ts`,
`prompt-ab.d4.run*.result.json`, `dish-knowledge-gold.d4.run*.result.json` —
one-off study inputs/outputs. Keep the gold fixtures that harnesses read;
the shard3 raw dumps and wild-* probes are spent studies — sweep or archive
before commit so the fixtures directory stays meaningful.

### L6 — CLEAN — Old-foundation grep results
No references to `OWNER_CANONICAL_SPELLINGS` remain in code (docs only, L1).
No code sends `restaurant_attribute`/`food_attribute` kind names (residual
strings are poll-display keys, a different vocabulary). The residue drain's
hand-copied group arms are replaced by `RESIDUE_GROUP_ENTITY_TYPE ... satisfies
Record<QueryEntityGroupKey, EntityType>` — the coverage-audit disease cured
with the pinned-exhaustive idiom, in exactly the right shape. The D4 move is
a true replacement, not a layer: the edge SQL header retires the
per-connection reconciliation and the schema comment, migration, prompt-gold
grader, and `LLMDishMention.item_categories` LEGACY note (kept only to decode
stored pre-v18 payloads — principled, replay-required) all agree.

## SYNERGY / SEAMS

### S1 — VERIFIED — Reject → tombstone → drop composes (modulo F1)
Reject honored only with a stated ground (both transports); tombstone minted
outside rehearsal only; mention resolves onto the tombstone; unified
processing's time-of-use revalidation drops redirect-free archived ids so no
mention rows/connections/surfaces are written; the pre-sink makes repeats
free. Rejects deliberately not written to the pair-keyed entity_match lane —
the tombstone IS the memory (coherent, since the pre-sink runs before the
ledger is consulted). One asymmetry worth knowing: rehearsal mentions DO sink
into pre-existing live tombstones (comment says so) while fresh rehearsal
rejects fall to quarantine — a shadow diff can therefore differ on a term's
first vs later rejection. Not a defect; note for the diff reviewer.

### S2 — VERIFIED REAL — Kept pairs → widening docket → search arms
The seam the mission doubted is closed end-to-end: merge-rule v4 names
widening as the handoff for every close keep; `widening-docket.ts` seeds the
docket with the owner's nine-plus pairs, merge-court holds over widening
kinds, and embedding nominations; `WideningSatisfiesService` settles
verdict-before-effect on the SAME `concept_satisfies` lane with a shared
version number space (item=1, attribute=2, ingredient=3 — the collision
reasoning is written down and correct); `entity_satisfies` is read by the H6
memoized readers; `widenConceptArms` ORs arms into the anchor's concept with
starvation keyed to the anchor, hard walls widen same-column only (the F5
stricter-not-wider trap explicitly handled), dietary never widens. This is
the strongest new code in the wave.

### S3 — CLEAN — No second survivor-name mechanism
`attribute-name-prompt.md` picks a display label among already-merged
synonyms; survivor-by-evidence picks which ID survives a merge. Different
acts, no overlap. Food and attribute merges share the tie-break (shorter
name) and now share `repointAttributeIdRefs`/`countReferences` over the same
registry, so the winner rule and the rewrite cannot disagree — the exact
consolidation the campaign demanded.

### S4 — NOTE — D2 birth-judge cost is reasoned, not measured
Per batch: one bulk source-document text read, one homes query, deterministic
sentence extraction. All batched, no per-mention round trips; this is a
collection-path (not user-facing) latency. Acceptable to ship on reasoning;
the first reload's timing logs will measure it for free.

### S5 — LOW — Certification harness count is drifting toward D6-reborn
Seven-plus mechanisms now: prompt-ab, prompt-gold, entity-match-gold,
attribute-placement-gold, attribute-merge-gold, widening-docket --gold,
judge-context-ablation (plus per-run result fixtures). Each rightly goes
through production transports, but each reimplements case-loading, repeat
loops, and grading. Not a blocker (they share no doctrine, only mechanics),
but the from-scratch shape is one gold-runner core with per-prompt
case-and-grader plugins — schedule with D6 post-reload rather than minting
harness #8.

### S6 — LOW/MEDIUM — Knowledge-tier category mint bypasses the identity court
`dish-knowledge-synthesis.service.ts#ensureCategoryEntity` self-provisions
ACTIVE item entities for category words with no judge and no reject path —
guarded only by the cuisine-vocabulary refusal, the self-parent filter, and
"the dedupe sweep owns twin healing" (its own comment). That is the same
posture the mention path just abandoned (junk MUST NOT mint entities without
a hearing). The input is a schema-forced, capped knowledge pass — far tamer
than testimony — so this is defensible, but it is a second birth door beside
the court. Owner docket: either route unmatched category words through the
match/reject judge (they already have candidates: the fold lookup) or bless
the bypass explicitly in the spec.

## TEST HONESTY (can each show RED?)

Spot-checked four of the strongest new claims by reasoning the mutation:

1. `sameness-court-context.spec.ts` "degrades a reasonless reject to new":
   delete `&& reason` in the batch degrade (`llm.service.ts` ~1795) → the
   spec's silent-reject case returns 'reject' → RED. Honest.
2. `widening-satisfies.service.spec.ts` "dry-run judges but writes NOTHING":
   call `settle` under dryRun → mocked ledger.record fires → RED. Honest.
3. `attribute-dedupe-merge.spec.ts` "NO canonical dictionary": reintroduce a
   pinned-spelling override in `planMerge` → the 999:1-reversed expectation
   fails → RED. Honest (and it pins the overruling, not just the behavior).
4. `widening-arm-compilation.spec.ts` "never fills an empty axis": drop the
   `dishArms.length ?` guard in `widenConceptArms` → RED. Honest.

Also structurally honest: both rule ledgers throw at import on an unversioned
prompt edit (proven-RED by construction), and the conformance spec's fixture
now exercises every wire field, closing its own documented blind spot.

## Verdict

**Fix-first, then ship.** The architecture is genuinely converged — one
sameness doctrine across three benches, one repoint implementation, one
satisfies lane, verdict-before-effect everywhere, pinned-exhaustive type maps
in the new code, and the merge/widening split composes end to end. But two
foundations need correcting before the reload leans on them:

1. **F1** — the tombstone pre-sink/mint must respect active twins and take
   the lock its docstring claims (this is the wrong-reject-silences-a-dish
   failure mode, mechanized).
2. **F2** — the embedding docket must filter decided pairs before the LIMIT
   or it stalls at 200 pairs forever.
3. **G1** — one lane still fabricates reasons the wave outlawed.
4. **L3** — re-certify attribute-merge gold ×3 at rule v4 before trusting
   the cert line; fix the stale doctrine text in the fixture, the two docs
   (L1, L2), and delete the spent one-off (L4).

## Fixes applied (foundation agent, 2026-08-30)

### F1 — FIXED (`entity-resolution.service.ts`)
- **Pre-sink active-twin standdown**: the tombstone probe now carries
  `AND NOT EXISTS (… live.status IN ('active','pending') …)` on the same
  type+identity_key (index-backed), so a fold shared by a tombstone AND a
  live entity is never absorbed — the mention falls through to recall and
  the judge (the "junk 'best' vs a real bar named Best" case: the judge
  separates the readings; the tombstone keeps serving the junk reading only
  when no live twin holds the fold). Rehearsal-status rows do not stand the
  sink down (shadow isolation).
- **`ensureRejectTombstone` rewritten to match its docstring**: it now takes
  the creator's own advisory xact lock (`identityMergeLockKey` over
  `entityLockKey` — the one 'entity:' namespace) inside a transaction; under
  the lock it (a) STANDS DOWN when an active/pending same-fold row exists
  (live entity wins; term falls to quarantined creation), (b) adopts an
  existing archived non-redirected twin, (c) otherwise mints. This closes
  the twin-mint race the attributes-only partial unique never covered.
- **G3 folded in**: only P2002 is absorbed (adopt-or-stand-down probe);
  every other storage error rethrows.
- **Spec** `reject-tombstone-presink.spec.ts` (9 cases): the silencing
  scenario is MUTATION-PROVEN — the double emulates the pre-sink SQL at
  text fidelity, and deleting the NOT EXISTS clause from the service was
  run live: 2 tests RED (silencing + pending-twin), junk-only sinking still
  green; fix restored, all green. Also pinned: lock taken on mint,
  standdown on live twin, adopt path, P2002 absorbed, non-P2002 rethrown.

### G1 — FIXED (`llm.service.ts` parseEntityMatchResponse)
`const reason = stated || decision` → `stated || undefined`. The single
transport now matches the batch lane (undefined) and placement lane
('(unstated)'): a reason is never synthesized from the decision token, so
reasonless-verdict consumers (hearing ledger) are no longer defeated.
Spec `entity-match-reason-honesty.spec.ts` (4 cases, drives the real
`matchEntity` with the transport stubbed at `callLLMApi`): silent match/new
keep reason absent, stated reason passes verbatim, reasonless reject still
degrades to 'new'. Mutation: restoring `|| decision` turns case 1 RED.

### L1 — FIXED
`docs/llm-systems-map.md` attribute dedupe-merge row: "owner-ruled
canonical spellings always survive as winner" → survivor = evidence count,
shorter-name tie-break, dictionary deleted (D3).

### L2 — ALREADY FIXED upstream
`docs/search-flow.md` no longer contains either stale line — the widening
agent's edit already states "satisfies widening built …; EDGES PENDING
OWNER REVIEW", consistent with the requested wording. No change needed.

### L4 — DELETED
`apps/api/scripts/rebuild-affected-projections.ts` removed. Verified per
the report: `extraction-scope.service.ts` `affectedPlacesForDocuments`
selects `restaurant_id AS place_id` and `activate-shadow.ts` calls it; the
scoped selection lives durably in the service. The
`plans/dormant-systems-audit.md` §5 recommendation is annotated RESOLVED.

### Remaining LEFTOVERs — not mine to touch
- **L3**: re-certifying attribute-merge gold ×3 at v4 needs LLM spend
  (forbidden this run) and the fixture/report doctrine text belongs to the
  attribute-doctrine agent's territory.
- **L5**: the shard3*/wild-* study artifacts are inputs to other agents'
  in-flight work (several are modified in the working tree); sweeping them
  mid-wave risks yanking files out from under a running study — left for
  the pre-commit sweep.
- **F2** (food-dedupe LIMIT-before-ledger) is the fix agent's file.
