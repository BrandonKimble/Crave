# Birth & linking red-team — adversarial from-scratch derivation (2026-08-30)

Owner order: "Try to come up with something BETTER. Don't trust the current
system because it's stable or complex." Read-only; all numbers measured on
staging (2026-08-30) or taken from the traced incident reports
(`plans/grounding-fix-report.md`, `plans/junk-mint-rootcause-20260827.md`,
`plans/poll-gazetteer-all-types-study.md`).

---

## The measured baseline (what the incumbent actually costs)

Staging census (places):

| Fact | Number |
|---|---|
| Active grounded / active ungrounded | 7,316 / 990 (12% ungrounded) |
| Time-to-ground (entity birth → first grounded location) | median **5h**, p90 **~9.7 days**, p99 **~20.5 days** (caveat: staging carries batch-backfill history; steady-state medians are likely lower, tails real) |
| Mentions accumulated BEFORE grounding | median **0**; 6,057/7,379 (82%) grounded with **≤1 mention** |
| Ungrounded actives' mention counts | median **10**, p90 84; only 173 have zero mentions |
| Ungrounded never-attempted (post strike-void) | 959/990 |
| Single-word names: ungrounded vs grounded | **36%** (353/990) vs **16%** (1,149/7,316) |
| Places cost per newly grounded location | ~$0.045 (BigQuery-verified, 2026-08-02) |
| Junk-mint blast radius (v17 shadow, all 72 walked) | 68 junk entities carry **71 events** — one-mention leaves; 2 junk VENUES (Caymus, Fairlife) |
| The 716 incident | one broken sweep (1-snippet context + rule-v1 geography veto) → 716 permanent strikes on real, famous, evidence-heavy places; zero alarm; fixed by chooser v2 (3 snippets + mention count), tripwire (halts at 19 strikes on the same shape), strike void (707 rows) |

Two claimed advantages of birth-before-grounding, checked against data:

- **"Evidence lands instantly"** — TRUE and load-bearing: the median
  ungrounded active carries 10 mentions; parking or hiding that evidence has
  a real user-facing cost (see Challenger A2).
- **"More mentions = better matching context"** — MOSTLY UNREALIZED at
  grounding time (82% ground at ≤1 mention; median pre-grounding mentions =
  0). The advantage is real only for the hard tail — which is exactly the
  cohort the 716 lived in (Rudys: 1,315 mentions, still declined under
  1-snippet context). So the honest restatement: deferral doesn't buy
  context for most entities, but the entities it buys context FOR are the
  ones where context decides. Chooser v2 (3 snippets + mention count) is
  what actually cashed that advantage; before v2 it was a claim, not a fact.

---

## THESIS A — birth-before-grounding

### Challenger A1 — ground synchronously at birth (mint only with a place id)

Steelman: no junk venue can ever exist; Caymus/Fairlife die at the door;
the janitor, the strike counter, the money guard, the ungroundable-survival
gate all become UNNECESSARY (the no-guards doctrine loves this); every
searchable place is real by construction.

Priced against the data, it loses three ways:

1. **Wrong-grounding at 1-snippet context is the proven disease, and birth
   is the moment of MINIMUM context by definition.** Every birth-time
   hearing is the impoverished hearing that produced the 716 — one snippet,
   often a stray trip anecdote ("Rudy's dive bar on 8th"). The incumbent can
   wait and re-hear on the next mention; sync-at-birth must decide NOW, and
   a wrong `google_place_id` is the most expensive wrong claim in the system
   (it poisons every future event routed to it, and place-grounded
   restaurants are never deleted). The 716 is direct evidence that the
   decision quality at forced-single-snippet time is not acceptable.
2. **Spend lands on junk.** 36% of ungrounded actives are single-word
   junk-suspects; birth-time grounding buys a full attempt (autocomplete +
   searchText + chooser LLM call) for every one of them, plus for every
   RC1-class retail-brand mint the collection prompt lets through that week.
   The incumbent's mention-driven ordering is a corpus-voted priority queue:
   junk is one-mention by nature (68 junk entities / 71 events), so it
   naturally never earns a second attempt; real places re-trigger
   themselves.
3. **Latency in the extraction path.** A synchronous external Places call +
   LLM chooser inside document processing couples collection throughput to
   Google latency/quota and makes extraction non-replayable (shadow replays
   would either spend real money or need a whole mock layer).

**Verdict: loses.** Its one genuine win (no junk venues ever visible) is
worth 2 entities per shadow-run-sized batch, against structural wrong-
grounding risk on the entities that matter most.

### Challenger A2 — two-tier identity (provisional entities invisible to search/polls until grounded)

Steelman: this is the strongest challenger. It keeps async grounding and
mention-driven spend, changes only VISIBILITY: an ungrounded place can hold
evidence but cannot be searched, polled, or linked. No user ever sees
"Best" the ghost, H-E-B's cabernet aisle, or a misspelled shell. The owner
has already ruled half of it (SD-3: terminal-ungrounded must not be
searchable) — this just moves the curtain from "after 3 strikes + weekly
cron" to "from birth."

Priced:

- **What goes dark, and for how long.** Median dark window = 5h
  (fine). But p90 ≈ 10 days, and the standing population is the real cost:
  990 active ungrounded places would vanish from search/polls TODAY, and
  their median mention count is **10** — these are Rudys/Easy Tiger/La
  BBQ-class real places with real community evidence, not junk (only 173
  are zero-mention). A user searching "Easy Tiger" during its ungrounded
  window gets nothing while the corpus holds 84+ mentions. Wrong-claim
  asymmetry cuts the other way here: hiding a heavily-attested real place
  is itself a wrong claim ("we don't know it") — and it's the COMMON case
  (36% junk-suspect means 64% of hidden entities are presumptively real).
- **What it saves.** The pre-terminal junk-visibility window: today a junk
  mint is visible until 3 definitive strikes + a weekly janitor pass —
  weeks, in principle. But the measured harm of that window is small:
  one-mention leaves with no consensus weight, "clutter, not ranking
  damage" (junk-mint report), and the poll-side harms route through the
  gazetteer, which Thesis B's fixes address at the link, not the entity.
- **Self-healing regression.** Twin merging currently uses grounded-vs-
  ungrounded asymmetry (grounded side always canonical; ungrounded twins
  merge in). Two-tier doesn't break that — but it does mean a provisional
  entity's evidence is invisible right up until the moment it merges or
  grounds, so the "islands→Gracie's" style alias corrections lose their
  early exposure that surfaces defects.

**Verdict: loses on current numbers, and the margin is the 990-median-10
cohort.** If steady-state time-to-ground drops to hours (post chooser-v2 +
reload, with the never-attempted backlog drained), the standing ungrounded
population shrinks toward the junk residue and this challenger's cost goes
to ~zero while its benefit stays — RE-PRICE IT after the reload. Partial
adoption worth taking now: see Amendment A-1.

### Challenger A3 — deferred-evidence buffering (no entity until grounded; mentions parked by name-fold)

Steelman: no entity, no junk, no twins — the name-fold bucket IS the dedupe,
and grounding converts a bucket to an entity exactly once. The cleanest
possible ontology: entities are facts about the world, buckets are facts
about text.

Why it loses, structurally:

1. **The evidence graph is entity-shaped all the way down.** A dish event
   needs a restaurant FK at extraction time; parking place mentions parks
   every item/attribute hanging off them, so the buffer must hold entire
   sub-graphs in a shadow schema — a second, worse entity system with its
   own resolution, merging, and visibility rules. This is two-tier identity
   with more machinery and fewer capabilities (no user anchoring, no
   referenced-means-alive, no court standing for parked names).
2. **It doesn't improve grounding correctness at all.** The chooser still
   sees the same snippets over the same candidates; buffering changes WHERE
   unresolved evidence sits, not how the hard question gets answered.
   Everything A2 buys, A3 buys at ~5x the rebuild cost.
3. **Fold-bucket identity is weaker than entity identity.** The sameness
   courts, prefix/domain twin lanes, and diacritic law all operate on
   entities with surfaces; a raw fold key can't host a hearing. Rudys vs
   Rudy's Country Store (a PREFIX pair, not exact-fold) would sit in two
   buckets forever with no merge path.

**Verdict: loses clearly.** Dominated by A2 on every axis.

### Hybrid probed — speculative autocomplete-only probe at birth

A $0.003 autocomplete call per new place name at mint time, storing only
"plausibly groundable y/n" as a junk signal (not a grounding — no chooser,
no place id written). Whole-backlog cost: 990 × $0.003 ≈ **$3**. Rejected
anyway: it injects a sync external dependency into extraction for a signal
the system already gets free — the word-role courts + junk-name census
answer "is this a plausible place name" from banked verdicts at $0, and a
positive autocomplete on a junk name ("Best", "Library") is common (Google
matches generously), so the probe's discriminating power on exactly the
junk class is poor. The 716 report confirms retrieval was never the broken
part; candidate sets were healthy.

### THESIS A verdict

**The incumbent survives — but it survives BECAUSE of the 2026-08-30 fixes,
not on its original form.** Birth-before-grounding with 1-snippet context
and silent permanent strikes (the pre-fix incumbent) genuinely loses to A2.
With chooser v2, the tripwire, the strike void, and the SD-3 terminal gate,
the incumbent beats every challenger on the owner's values: spend follows
corpus votes, wrong-grounding risk is minimized by deciding at maximum
context, evidence is never dark, and junk dies by lifecycle. Amendments:

- **A-1 (recommended, S): gate NEW-entity search visibility on
  evidence-or-attempt, not just non-terminal.** The 173 zero-mention
  ungrounded actives, and any future one-mention mint, are visible today
  with nothing behind them. A cheap read-side rule — an ungrounded place
  surfaces in search/autocomplete only once it has ≥2 mentions OR a
  grounding attempt in flight — takes A2's benefit precisely where it's
  cheap (zero-evidence shells) without darkening the median-10 cohort.
  This is a policy line in the search read path, not a schema tier.
- **A-2 (recommended, already specified elsewhere): actually arm the
  lifecycle.** The janitor cron is OFF and the census feeder uncommitted
  (`plans/dormant-systems-audit.md` items 1+3). Thesis A's "failures
  retire via the janitor" is currently a claim about dormant code. The
  incumbent's victory is conditional on shipping this.
- **A-3 (re-price after reload): revisit A2 (two-tier) once the
  never-attempted backlog (959) is drained.** If steady-state ungrounded
  population ≈ junk residue only, flip the default to
  grounded-implies-visible and let A-1's rule be the only exception path.

---

## THESIS B — linking on stored name-surfaces, junk cured by hygiene

Judged on the 50-comment dry-run (172 hookups, hand-judged;
`plans/poll-gazetteer-all-types-study.md` §4). Incumbent-with-shipped-
hygiene scoreboard for `place`: 26 wrong raw → 18 after word-role frame
gate → **~10 after junk-name drain**, and all 10 residuals are LEGIT
single-word restaurant names colliding with prose ("The Door", "Wild",
"Due", "Heaven"), further mitigated in polls by territory scoping.

### Challenger B1 — matching-time confidence rules (multi-token minimums, distinctiveness, "very close to full name")

Steelman: deterministic, cheap, and it kills the entire residual-collision
class in one rule — no court backlog, no janitor dependency.

Priced on real names, the false-negative bill is decisive: **1,149 of 7,316
active grounded places (16%) have single-word names.** A multi-token
minimum forfeits every correct link to Suerte, Wild, Loro, Uchi, Este…
to prevent ~10 wrong highlights per 50 comments. The dry-run's single-word
links were MOSTLY right (the wrong set after hygiene is ~10; the right set
includes a large share of the 33 correct place links). "Very close to full
name" softens this but converges to the same trade: distinctive multi-word
names never collided in the first place, so the rule only bites where it
hurts. It is also a stop-list in a trench coat — the owner ruled 2026-08-02
that junk grounding is a DATA defect, no matching-time stop-lists, and the
campaign's whole architecture (courts, cleaner, reject-at-birth) is the
enforcement of that ruling. **Loses: pays a 16%-of-corpus FN tax for a
highlight-surface FP problem that hygiene already shrank 26→10.**

### Challenger B2 — per-surface link thresholds (poll highlight vs search grounding demanding different tiers)

Steelman: different surfaces have different wrong-claim costs, so evidence
bars should differ.

Finding: **the incumbent already IS this architecture** — one shared scan
core, per-surface policy = {types, role gate, winner order, placement}
(study §5). Search runs the frame gate, browse mode, and sync hearings;
polls run territory scoping and a narrower type list. The challenger's only
NEW content is inverted: it would demand MORE evidence on the poll
highlight — the lowest-stakes surface in the app (a tappable span, not a
filter, not a ranking input). The correct per-surface delta is the one the
study already found: polls currently have FEWER protections than search on
the same wrongs ("best"→Best ghost links in polls TODAY). **Loses as a
challenger; wins as an amendment** — port the frame gate to
`highlightCommentSpans` (study item 2, size S). That is a per-surface
threshold pointed the right way.

### Challenger B3 — embedding/contextual linking ("does the sentence around 'wild' look restaurant-shaped?")

Steelman: the only challenger that addresses the irreducible residual —
prose-word collisions on legitimate single-word names — with no FN tax on
distinctive names. Industry practice (entity linking with mention-context
scoring) does exactly this.

Priced: value = ~10 wrong highlights per 50 comments, on a surface where a
wrong highlight is a mis-colored span; territory scoping already suppresses
most of them in place-anchored poll threads (a "Wild" span only links if
Wild is in the poll's engine territory). Cost = per-comment inference or an
embedding index over surfaces + calibration + non-determinism in a scanner
whose auditability (exact, closed-set, replayable) is a load-bearing
property — every link today can be explained by pointing at a surface row.
A contextual model's wrong links can't be cured by data hygiene, which
breaks the thesis-B self-healing loop deliberately. **Loses for polls
now.** Honest carve-out: if an UN-anchored discussion surface ever links
places globally (no territory scope), the single-word collision rate rises
and a scoped contextual check — only for single-word spans, only on
unanchored surfaces — becomes the first amendment to reconsider.

### THESIS B verdict

**The incumbent survives on the merits, with one conditional.** Its
scoreboard (26→~10 wrong, zero FN cost, every fix an already-built
mechanism) beats all three challengers on the owner's values. But the
thesis as stated — "junk is cured by hygiene" — is only true when the
hygiene RUNS, and today the janitor cron is off, the 399-surface census
feeder is uncommitted, and the frame gate is search-only. Amendments (all
three are the study's own items, endorsed here after adversarial review):

- **B-1: port the word-role frame-span drop into the poll scan** (fixes
  the 'best'/'think' class polls have live today; banked verdicts, no new
  spend).
- **B-2: commit the census feeder + arm the janitor** (the hygiene half of
  the thesis is currently dormant code).
- **B-3: add `ingredient` to the poll type lists** — the measured cleanest
  type (1 effective wrong in the sample); its scary class (vi diacritic
  shadows) is already dead in the shared scanner.

---

## Bottom line

Both theses survive from-scratch rederivation — neither survives on
stability or complexity, and neither survives in its pre-campaign form.
Thesis A's incumbent is the right architecture ONLY as amended by the
grounding-fix wave (chooser v2 context, sweep tripwire, strike void,
terminal gate); Thesis B's incumbent is right ONLY once its hygiene
machinery is actually armed. The strongest challenger overall was A2
(two-tier identity): it embodies the owner's wrong-claim asymmetry and half
of it is already owner law (SD-3), but it loses today because the standing
ungrounded population is dominated by real, evidence-heavy places (median
10 mentions) that it would make invisible for a p90 of ~10 days. It is the
one challenger with a scheduled rematch: re-price after the reload drains
the 959 never-attempted backlog.
