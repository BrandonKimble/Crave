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

## A. Awaiting an OWNER DECISION (blocked on a word from him)

0. **STEP-1 LOCK (grounding), proposed 2026-08-09 evening — awaiting yes**:
   compound-only grounding; food-PARTS DIE entirely (measured: siblings
   beat parts even on mexican breakfast — chilaquiles/huevos rancheros vs
   the breakfast×mexican flood); attribute parts survive as CONSTRAINTS
   (vegan/spicy wire dietary/attribute machinery, never fill); parts are
   PRIMARY only when no compound grounds at all. On lock: entry #1 of a
   new locked-decisions section here, then implementation.
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

6. **Collection-locale spine — COMPLETE 2026-08-09** (verified 57/58
   resolution gate personally): 81c0d2751, adf03754c, 4caa12375, 5c7ee2e72,
   4d839ef3c (locale-chain read+write, camarones-resolves-at-ingestion
   proven with controls), cdf4d6aae (per-term demand locale; --locale flag
   deleted; undecidable→und honest fallback confirmed). Fork repair
   cancelled on re-measurement (zero true duplicates). Awaits its A0
   red-team pass. NEW FINDINGS from the work, unfixed: (a) the addSurfaces
   collision-guard probe is locale-blind (an es claim refusable by an
   unrelated vi form — claim key arguably wants the locale chain); (b) no
   es/vi generic keyword vocabulary authored (a Spanish ask still ships
   'mejores' — conservative, but budget-wasting at scale).

6b. **Conjunction loss (grounding gap, found in the lock battery)**:
   'birria tacos and margaritas' loses the margaritas entirely — multi-item
   asks keep only the first item. Needs its own design: parallel asks per
   conjunct. Independent of the step-1 lock.

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
