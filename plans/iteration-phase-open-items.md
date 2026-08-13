# Iteration-phase open items (2026-08-09) — everything the owner raised, nothing forgotten

Owner ruling in force: **ITERATION PHASE** — no prod deploys, no prod spend
(knowledge rail + collection disarmed on prod; verified quiet). Ideal shape
first, in local/staging; one clean pre-launch ship at the end. This file is
the ledger of every open item from the 2026-08-09 sessions. Strike items as
they land; nothing leaves this list without a commit hash or an owner "drop
it."

---

## A0. STANDING LAW for everything below (owner, 2026-08-09 evening)

Every piece of this — new and old — gets RED TEAMED before it counts as
done: best approaches, abstractions, primitives, patterns, models proven,
not assumed; nothing built on foundations that aren't ideal yet. The
from-scratch mentality applies at every layer. A section leaves this file
only after (a) implementation, (b) verification gates, AND (c) an
adversarial pass that tried to refute it.

## LOCKED DECISIONS (owner-ratified; implementation items reference these)

L1. **GROUNDING = COMPOUND ONLY (locked 2026-08-09 evening).** The longest
    grounded span is the ask; decomposed food-parts are NEVER emitted as
    asks (measured: siblings beat parts even on mexican breakfast, and the
    24-query battery showed 7 improvements / 0 regressions); attribute
    parts survive as CONSTRAINTS (vegan/spicy wire dietary+attribute
    machinery, never fill); parts become the PRIMARY reading only when no
    compound grounds at all. Thin compounds rescue through siblings/judged
    + on-demand learning, never through food-parts.
    IMPLEMENTATION: kill the food-part emission in maximal linking
    (search-query-interpretation), delete band-3 from the ladder design,
    re-run the 24-query battery + all gates as the proof, guard spec
    (a decomposed food part reaching the ask set = RED).

L2. **ENGLISH JOINS THE VOCABULARY SWEEP (locked 2026-08-09 night).** The
    sweep has only ever been asked about es/vi; English surfaces come solely
    from observation (Reddit text), which is why 'chicken over rice' was
    missing while 'cơm gà' existed. en becomes a first-class sweep locale —
    same v5 generator, judge, ledger. Runs as part of the language wave.

L3. **COVER-LINKER (locked 2026-08-10, owner delegated).** Whole-query span
    selection: maximize covered tokens; among max-coverage readings the
    tie-break IS today's greedy preference — byte-identical wherever greedy
    already achieves full coverage (identity property = the regression
    spec). Recovers vi strand cases (bánh mì burger thực vật 3/5→5/5) and
    is zh's structural prerequisite (川味牛肉面 class). IMPLEMENTING NOW
    (pre-wave, per owner go 2026-08-10) — agent in flight.

## SEQUENCE IN FORCE (owner-ratified 2026-08-10)

① 📌04 re-extraction: v7 SHADOW RAN CLEAN ($30.44 actual) but DOES NOT
   ACTIVATE — the owner's exhaustive audit (4 reviewers, all 442 mentions)
   overturned the 12-doc sample: 161/258 anchored losses are REAL, and
   full-corpus 1,627 entities would lose all evidence. THE MISSED CLASS:
   short recommendation testimony (bare name-drop answers, additive list
   answers, brief praise). v8 rederivation next (loss examples pinned as
   gold; gold-set composition bias — long-form-only — to be fixed);
   re-shadow ≈$30/run. Corpus stays v1-active, hands-off. The shadow
   choreography DID ITS JOB: systematic recall regression caught before
   activation, zero user impact. Evidence: logs/v7-lost-anchor-evidence
   .jsonl, plans/data-audit-2026-08.md (9648c86a7).
   META-LESSONS, both lanes: (a) SAMPLES LIE — a 12-doc sample said
   "mostly correct"; the exhaustive read said 62% real losses. Exhaustive
   audits before destructive verdicts. (b) A gold set biased toward one
   input mode (long-form) ships blind to the others — the same law as the
   gold-corpus input-mode coverage rule. (c) My own concurrence
   rubber-stamped the sample — independent takes must re-sample
   independently, not re-read the same 12 docs.
   Cover-linker landed here (7df2a1d2d). ∥
② LANGUAGE WAVE on the clean corpus: en (L2), es tail, vi refresh, zh
   (needs cover-linker + Han edit-budget-0), ko — each vi-style: sweep →
   gold corpus (INTENT-ONLY assertions, never pin decomposed parts — L1
   lands later) → flow-gate block. Re-baseline all gates after.
③ Resume step-by-step flow locks at STEP 2 (admission ladder) with fully
   representative data; L1 implements with it.
④ The full cross-app multilingual synergy red team as capstone (C3).

## A. Awaiting an OWNER DECISION (blocked on a word from him)

1. **The admission ladder** (the al-pastor discovery, the big one).
   UPDATE post-eval: band 2 = DENSE ∪ JUDGED-COUSINS MINUS JUDGED REJECTS,
   decided by measurement (7fc655383: union 20/20 coverage vs 17-18 alone,
   precision ~0.99 everywhere; per-anchor artifact published). Band 3
   (parts) likely DELETED per the step-1 lock above. PROVEN LIVE BUG to
   fix with the ladder: judged rejects are NOT subtracted from today's
   ring — chicken's top similar result is judge-rejected 'poultry';
   318 rejected pairs survive the serving cut corpus-wide.
   Proposed and pending ratification: page fills down
   `exact + name-variants/satisfies → dense siblings (K25/R20/.75, the
   perfected cut) → decomposed-part categories → judged cousins`,
   band-by-band only as each runs dry; pure Crave-Score order within the
   admitted set; Include-similar chip unchanged. The one change from today:
   decomposed-part categories LEAVE tier 0 (they currently flood
   "tacos al pastor" with the whole taco category at exact). Thin queries
   (bún bò huế) naturally reproduce the July always-on sibling feel.
   Alternative on the table: July's always-interleaved siblings on every
   search. Recommendation: the ladder.
2. **Negation cue list: keep or delete.** Empirically proven real: unstripped
   'sin cerdo' dense-retrieves vegetarian/soy-free (inversion); stripped →
   pork. Options: (a) keep literal-ignore everywhere (4-word closed-class
   list per language, added per rollout — current state); (b) delete the
   list and let ONLY the dense leftover lane be semantic (softens the
   literal-ignore doctrine in one lane). Owner suspects (b); data supports
   either; doctrine call.
3. **chè → dessert-soup**: no dessert concept exists in the corpus to claim
   the word (tea holds it uncontested). Mint-by-hand violates no-fake-data;
   organic minting happens when collection processes a vi dessert shop.
   Owner may rule mint-now vs wait.
4. **Activate the measured-better extraction prompt**
   (`collection-prompt.candidate.md`: 17/17 vs live 11/17, defects −51/79/98%
   on a 150-post A/B — committed, unactivated). This IS the re-extraction
   the owner wants; run via /reextract (shadow replay → diff triage →
   activation). Iteration-phase compatible (local/staging corpus). Needs
   owner go because it's the corpus-wide prompt change + spend.
5. **On-demand cleanup cron pair merge** (9:15/9:30 same-domain jobs → one
   job, two steps). Trivial; owner said "go ahead" candidates welcome —
   do with next cron touch.

## B. IN FLIGHT (agent running or committed-but-unverified)

6. **Collection-locale spine — CORRECTED, all 8 red-team findings fixed
   (2026-08-10/11; verified personally: 0 mis-tagged extraction rows,
   'bún đậu mắm tôm' detection clean, tsc clean, resolution 58/58).**
   Commits: 73a3b7228 (write-flip revert), 43ab586cf (10,670-row repair),
   d6c220b05 (oracle trust-provenance: junk one-row flips dead, weak-
   detector null), 05f117586 (feedback cut + sweep lock), 8a22f2f11
   (low_result + ledger locale lanes), 069ab02d3 (ledger fold: 469
   collision groups → 4, all genuine variants), 80ccab973 (--language
   required at onboarding), + my 58/58 fixture rulings (ex-02 canonical
   singular; loc-05 names are locale-unscoped). DOCTRINE STANDS: source
   language = reader context; word language = generator/judge provenance
   only. RESIDUALS ledgered: (a) tinyld has NO usable vi model — 6 vi
   gold sentences detect es@1.0; detector-model ticket, largest remaining
   wrong-verdict source; (b) camarones/shrimp DUPLICATE ENTITY minted by
   extraction 08-10 — flagged to convergence lane; (c) sweep run-tally
   under-reports banked surfaces ~1.6× (cosmetic, DB is truth). A0 RE-RUN (2026-08-11): core HELD (write revert
   total, read chain strict-superset, repair complete, oracle list sound,
   F1-F13 stay closed) but the correction's OWN machinery failed — R1
   BLOCKING: pooled advisory locks strand 25/25 under load, silently
   killing the demand lane (idiom copied from places-promotion = LAYER
   defect); R2 client-settable detectedLocale on /search/run; R3 ledger
   fold merges đầu/dầu (survivor list mis-described); R4 poll-seed tags
   all aliases with Places languageCode unnormalized; R5 --language
   unvalidated; R6 repair may have dropped judge stamps (unfalsifiable,
   honesty note owed); R7 fold admits control/PUA chars as exact. ALL SEVEN FIXED
   (639e8ad45 lock layer — dedicated-session helper, 25/25 clean under
   pool pressure, crash-path proven, new mutation-proven invariant;
   595b5f8ef locale sealed at API boundary; 4a49fbc9f fold ruling —
   letters vs decorations, đầu/dầu split; 7d3019436 poll-seed tags;
   861acc85f --language validated; 78abf709c judge-stamp preservation;
   32fa7da58 invisibles expelled). Re-run's probes re-executed green;
   resolution 62/62; verified personally (lock spec 4/4, helper adopted
   at both named sites). **A0 SATISFIED for the spine** — the final
   system-wide adversarial pass remains C3's job.

6b. **Conjunction "gap" RECLASSIFIED (2026-08-09 evening)**: retested with
   clean examples — 'tacos and pizza' / 'wings and beer' ground BOTH sides
   already; conjunctions are parallel asks today, no design needed (owner
   kept current behavior). The margaritas loss was the junk class: a
   fuzzy span glued 'and' onto the next word + a literal junk 'and'
   entity in the graph. Folds into corpus cleanup (C2/A4).

## C. READY TO BUILD (ratified or unambiguous, not started)

7. **Implement the admission ladder** the moment A1 is ratified (includes
   moving part-categories out of tier 0 + demo probe re-run on
   'tacos al pastor', gates, guard spec).
7b. **Listwise neighborhood curation bench** (owner-suggested upgrade
   path): same dense feeder, but ONE LLM call grades the whole ~20-candidate
   neighborhood 0-10 through the searcher lens (real model, not flash-lite
   pairwise binary). Bench on the same 20 anchors vs the union before any
   corpus-wide commitment. The judge looked weak in the eval because we
   asked a binary question pairwise on a cheap model — this is the fix
   candidate.
7c. **Cousin-verdict grading rederivation** (subsumed by 7b if it wins):
   binary cousin has no closeness grade, so judged-only output can't rank.
8. **Prompt rederivations, remaining ranked queue** (doctrine: mental-model
   first, ordered for the thought process, no non-exhaustive lists; judge v3
   + vocabulary v5 are the quality bar):
   cuisine-prompt (two example lists, zero principle) → query-prompt
   (20-item classifier list) → collection-prompt (superseded if A4
   activates the candidate) → attribute-placement reject-half →
   moderation (principle stated last) → entity-match (+ its un-synced
   inline match_batch twin — two-sources-of-truth defect) →
   relevance-gate patch scars → poll-subject example lists.
9. **Generator completeness follow-up**: v5 returns 'thịt bò' without bare
   'bò' — if bare head-nouns matter (they did for vi search), extend the
   completeness DEFINITION and re-measure; never a bolt-on bullet.
10. **zh rollout pack** (when owner schedules): vocabulary sweep + gold
    corpus + flow-gate block + Han edit-budget-0 in the typo lexicon +
    SUPPORTED_LOCALES entry. ko same minus segmentation (ready).
    Stored-side surfaces >4 tokens for CJK await surface_token store.
11. **vi gold notes**: hg-11 (nem) parked on generator head-noun gap (see
    9); un-park when banked.

12b. **LLM-spend taxonomy invariant** (from 📌04's batch audit): untagged
   call sites pollute every campaign estimate (~$13/30d of unattributed
   flash-lite with 16k-token inputs + 408 calls on an unprofiled model).
   My lane verified tagged (concepts.satisfies, labels.vocabulary,
   aliases.claim_judge). Fix structurally: an invariant — every LLM call
   carries usageCaller — as a mutation-provable guard, not a per-incident
   hunt. Find + tag the 16k flash-lite classifier and the gemini-3.5-flash
   caller while building it.
12c. **Batch-convert the resolution/judge loop** — measured prize ≈$6 per
   Austin-scale campaign; deferred until the resolution loop is reworked
   anyway (📌04's honest verdict: a two-phase restructure of an
   advisory-lock-holding loop is not worth $6). Supersedes the old
   'batch rail' trigger for THESE call sites; extraction + embeddings
   already batched.

12d. **Worker boot must not drain spend-bearing queues it didn't budget**
   (📌04 shakedown finding #4, 2026-08-10): first worker boot after the
   mirror restore drained a fossil Redis backlog (~1,100 grounding/cuisine
   jobs, ~880 Places calls ≈ $25 before killed; bounded, restart free via
   replay dedupe). DISABLE_RESTAURANT_ENRICHMENT gates new scheduling but
   NOT draining a foreign backlog. Ideal shape: boot inspects queues and
   refuses/pauses spend-bearing drains that no active budget owns.

13b. **DONE (13b31da2c)** — tier-2 accent veto: one shared
   accentEvidenceFor across both tiers; 52 claims changed, all 52
   hand-reviewed (đậu no longer claims oil, bò kho no longer claims
   beef jerky); gate 64/64. The accent chain is closed end to end.
13c. **Squeeze-claim judge question** (⭐04 handoff): accent-free 'bo ne'
   squeeze can claim a genuinely-English 'Bone' when sole owner — vi-lane
   judge-inheritance design question, take up with the ladder/step work.
13d. **CALIBRATION LAW for the C3 synergy audit** (owner directive via
   ⭐04): the two convergence foot-guns (ASCII-only regex deleting a
   language; accent-blind equality fusing tone-differing words) are the
   calibration examples — the audit reads EVERY normalization, name regex,
   folded-equality, LOWER()/ILIKE, and tokenizer assumption line by line,
   runs the actual fold on real vi/zh strings, and proves each verdict.
   Pattern-matching review is disqualified; both examples were invisible
   to it. Also: any fold-algorithm change requires
   refreshSortedIdentityKeys({full:true}) or stored keys drift (LAW).
13e. **Resolution-gate fixture refresh**: ⭐04's deterministic tiers moved
   12-13 fixtures from alias→exact attribution; current honest baseline
   45/58. Fixture expectation updates belong to the convergence lane;
   my agents told not to touch them.

13f. **DONE-PENDING-RUN (814257c9c)** — retraction machinery built and
   seeded-proven (retain hearings work single-claimant; circular-evidence
   bug found by execution and fixed — the claimant card listed the judged
   word as its own proof). feed-retraction-candidates.ts stays DRY-RUN
   until post-v8 dedupe per the joint sequencing. Original spec: surface retraction lane (my half of the 326-collision plan;
   cross-ruled with ⭐04 2026-08-12)**: mis-banked surfaces are wrong
   word→concept claims — retraction = the EXISTING claims machinery
   (judge + deprecate-with-memory), extended to hear SINGLE-CLAIMANT
   suspicious rows (the named hole: uncontested claims skip the judge
   forever — bánh cuộn sits wrongly on 'wrap' unstamped). Candidate feed
   = ⭐04's surface-vs-name collision probe, EXCLUDING judge-upheld rows
   (several 'collisions' are settled near-synonym law, e.g. bún→
   vermicelli is CORRECT). Provenance verified: the tap was the v4-era
   sweep, not extraction. SEQUENCE: v8 activation → ⭐04 dedupe + this
   retraction → language wave (so sweeps land on a deduped corpus).

13g. **Generator flip-rate re-baseline before the wave**: v5's banked ~0%
   word-set flip does NOT reproduce under the current model (v5 itself
   flips 22-26% on multi-word concepts; head nouns stable; measured twice
   during the v6 work, f412a92a6). Not a v6 regression — v6 sits inside
   v5's own noise. Before the wave's sweeps run: re-measure flip rate
   under the wave's actual model and decide whether temp-0 (proven 0%
   in the v5 rederivation) or consensus is warranted for multi-word
   concepts. The wave must not inherit a stale stability assumption.

## ARCH VERDICT (2026-08-12 red team; the owner's patches-vs-foundations question)

NOT a week of patching — commits deleted machinery and measured claims. But
the week's failure PATTERN is named: A CORRECT LAW, INSTANTIATED PER CALL
SITE INSTEAD OF ONCE IN THE DATA MODEL. Two foundations wrong:
- H5 THE HEARING (fix first): claim→guard→judge→versioned-verdict→memory
  exists 4 ways; dedupe-merge lane has NO verdict memory (irreversible
  merges nightly, rejects re-rolled forever — verified; flagged URGENT to
  convergence lane) and a version bump re-opens losses only (wrong YES is
  permanent). Unification = one Verdict table + one due-predicate;
  knowledge_pass_runs is 80% of it. Proposed to ⭐04, awaiting ack; my
  lanes adopt first as reference impl once shape agreed.
- H1 THE FOLD KEY: accents-are-evidence enforced at 6 sites, ALREADY
  DRIFTED ('phở bo' admits in search, refused at resolver — live recall
  loss; port in flight). Foundation fix = store diacritic key as COLUMN
  beside the fold (deletes all vetoes); not urgent (4 benign collisions
  today) but before vi/zh corpus doubles.
Sound: locale model (adoption residues in flight), admission ladder
(forced by the owner's own rulings; gate-predicate duplication noted),
guard taxonomy (3 kinds; 12 root scanners unregistered — adoption in
flight). Clusters: version-stamp-per-store (H5 root); fold-version stamp
incomplete + schema.prisma absence (flagged ⭐04); display path
un-rederived (in flight).

## C2. CORPUS CURATION GAP (discovered via the DB restore, 2026-08-09)

The wiped local corpus carried weeks of data curation the prod corpus
never received. Measured on the prod mirror: es gate 88.7 (was 98.7),
vi 90.2 (was 98.8), HARD homograph gate RED in both languages (chile→
pepper collapses the country ambiguity; giá/mì/bún collapse), resolution
48/49, flow 16/18. This gap is REAL LAUNCH WORK: the curation recipes
(merges, junk sweeps, homograph guards) must be re-derived as repeatable
passes and run against the launch corpus — hand-curation that lives only
in a dead local DB is not a mechanism. Ties into re-extraction (A4).

## C3. THE SYNERGY CAPSTONE (build after spine + extraction-prompt land)

One end-to-end proof: a Spanish post pushed through collect → extract →
resolve → bank → search finds it — as a GATE, so "multilingual synergy"
is a checked property, not a claim. Remaining seams it will catch:
extraction prompt language handling (A4/queue), judge cross-locale
evidence sampling (unruled), CJK stored-side surfaces (zh rollout).

## D. PRE-LAUNCH SHIP CHECKLIST (when owner declares ideal shape reached)

12. One clean staging→prod ship of everything, then on PROD in order:
    migrations self-apply → fork-repair script (dry-run, review, apply) →
    false-conflict clear script → ONE full vocabulary rebuild under final
    prompt versions (per-locale, watermark-driven; budget ~$10-30/language)
    → containment/sibling/lexicon/open-intervals rebuilds happen via boot
    self-heal → full gate suite against prod mirror → re-enable
    KNOWLEDGE_MAINTENANCE_ENABLED (nightly) + collection scheduler.
    Prod is FROZEN at d85def24b until then (rails disarmed 2026-08-09).

## E. WATCHING (no action, keep visible)

13. Poll weekly ritual erroring in prod (bind-variable overflow) — other
    session owns the fix (CRAVE-27), was staging-only when last checked.
    Iteration ruling means it ships with the pre-launch ship unless the
    other session ships it sooner.
14. tôm→prawns re-heard as bothUpheld under judge v3 (LOCAL). Prod still
    carries v2-era verdicts — healed by the pre-launch re-hear (§D).
15. `entity-surface.service.ts` + one sibling file read as binary by
    grep/file — any grep-based audit or scanner invariant is silently
    blind there; use grep -a. (Candidate: strip the \0, or add a lint
    that fails on \0 in source.)
16. Old-config sibling harness `sibling-mode-e2e.ts` is an orphan (drives a
    deleted mode flag) — delete or repoint when the ladder lands (F1207).
