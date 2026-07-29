# Full Reload Charter (2026-07-27)

The decision: a **from-scratch reload of Austin** — wipe the derived layer,
re-extract from stored inputs under the settled prompt. Worth it regardless
of price at this stage. NEW YORK IS NOT REPROCESSED: its raw corpus stays,
its 1,000-post catch-up is already banked, and we spend nothing re-running
it — but we must not open a chronological GAP for it either (see §5).

BECAUSE the reload costs real money, the prompt must be right BEFORE we
spend, not discovered wrong afterward. Iterate in LARGE spans: one big
audit, all issues found, one reload — not a loop of small loads each
costing the same as the full one.

## 1. MEASURED COST (pilot, 539 Austin docs, 7 runs, 27 min)

All-in $0.00382/doc — 9x the extraction-only ledger figure ($0.00043),
because that figure counts ONLY content.extract.

| caller                               | USD  | share | note                                              |
| ------------------------------------ | ---- | ----- | ------------------------------------------------- |
| content.extract                      | 0.69 | 34%   | input 92% CACHED (1.74M of 1.89M) — caching works |
| entity-resolution.match_batch        | 1.32 | 64%   | 432,727 OUTPUT tokens / 76 calls (~5,700 each)    |
| attribute.place + match + embeddings | 0.05 | 2%    |                                                   |

Projections at this rate: **Austin (39,495 docs) ≈ $151**; both metros
(71,528) ≈ $273. A FRESH-START wipe likely costs MORE than $151: this pilot
still had exact/alias matches to lean on (37 exact + 9 alias of 47); with
an empty entity table every string resolves cold.

AUDIT IN FLIGHT: entity resolution costs 2x extraction. Whether ~5,700
output tokens/call is necessary is being audited BEFORE we spend. Any
saving here compounds over every future collection run, not just this
reload.

## 2. DECISIONS RATIFIED (implement these)

a. **Category items count toward the RESTAURANT score only when no dish
exists under that category** — granular per category, not per
restaurant. A place can have burgers-with-dishes (excluded; the dishes
already carry the claim) and tacos-without (included). One claim,
counted exactly once, always.
b. **No support-vs-direct weighting, no split display.** Every endorsement
counts as one. The CATEGORY CARD is the explanation: "Tacos · 8" next to
"birria taco · 11" tells the story visually (the dish is always >= the
category under equal boost). No badge, no qualifier word.
c. **Fresh start scope:** wipe DERIVED — entities, connections + mentions,
signals, category edges, attribute evidence, adjudication tombstones.
KEEP raw truth — collection*source_documents, collection_extraction*
inputs, sources/lanes, users/polls/lists. VERIFY FIRST: count
user-generated references to entity ids (poll votes/targets, list items,
favorites, photos) — they FK to entities and will break.
RATIONALE for wiping tombstones specifically: archived entities are
resolution SINKS, so every junk/merge judgment made under the OLD prompt
is frozen and never re-adjudicated. A reload that keeps them inherits
the old vocabulary's mistakes.
d. **Keep archived entities in NORMAL operation** (FK safety + sink
efficiency); readers filter to active. The wipe is a one-time
fresh-start event, not a new policy.
e. **Tags reader filters entity.status='active'** (4,769 signal rows point
at archived entities today).
f. **Collection scheduler is PAUSED** (COLLECTION_SCHEDULER_ENABLED=false
on worker, 2026-07-27) so no collection interleaves with the reload.
MUST be re-enabled after.
g. **Prod attribute-evidence backfill MUST run before any prod projection
rebuild** — otherwise the derived array drops the ~78% of attributes
that came from Google/cuisine sources. (Moot if the fresh start wipes
attributes anyway — sequence deliberately.)

## 3. CADENCE (investigated, no fix needed)

Derived cadence is correct: austinfood 0.79 posts/day -> clamp(0.5\*1000/
0.79, 2h, 14d) = 14 days; foodnyc 12.29/day -> also 14d. The 14-day cap IS
the max interval (ARRIVAL_LOOKBACK_DAYS) — we never let a source go 633
days; the measurement horizon bounds it. Lanes still read cadence_days=1
because that's the BOOTSTRAP value and advanceLane only writes the derived
interval into due_at ON DISPATCH — last dispatch (2026-07-24) predates the
derivation shipping. Next dispatch self-corrects.
COSMETIC DEFECT: advanceLane updates due_at but leaves the cadence_days
COLUMN stale, so the column misreports the lane's real cadence. Scheduling
reads due_at so behavior is right; fix the column write for honesty.

## 3b. NESTED CATEGORY DOUBLE-COUNT (found 2026-07-28; fix before reload)

§2a suppresses a category item when a DISH carries the claim. Owner asked
whether nested category claims (a place claimed for both "chicken" and
"kung pao chicken", no dishes) should each count. MEASURED: 871 same-
document parent+child category pairs, 723 mentions / 1,006 upvotes of 5,722
category upvotes (~18%) are ONE claim counted twice. So: not correct.

The obvious fix is WRONG and was tested before proposing: suppressing any
category with a narrower category under it flips 244 items and drops 646
upvotes of genuinely DISTINCT claims. Why the asymmetry — banking. A
category claim's mentions REPLAY onto matching dishes, so excluding the
whole category item loses nothing (the dish already holds it). Category
items carry `categories: []`, so nothing replays onto a NARROWER CATEGORY
item — excluding the parent there destroys evidence.

IDEAL FIX (foundation, not a second SQL rule): make banking SYMMETRIC —
give category items their parent categories so a parent claim replays onto
the narrower category item exactly as it does onto a dish. Then ONE rule
covers every case: a claim counts once, credited to the most specific
carrier that actually holds it, and the rollup predicate widens from "a
dish carries it" to "any narrower item carries it". Requires reordering
projection-rebuild (category items are currently built AFTER support
attachment, deliberately, so they receive no banked support) — verify with
a full local rebuild before the reload.

## 3c. ASSERTED vs INFERRED CATEGORIES (designed, measured, DEFERRED)

Owner asked whether "Nixta has the best tacos - the duck carnitas taco is
unreal" should score +2 (the category claim respected in its own right)
rather than +1. Read the real text behind both shadow types:

- DISH shadows category (25 cases): 19 of 25 (76%) have the category word IN
  the document -- "Great coffee" + "their cold brew", "I ALSO recommend
  their cookies". These are genuine independent assertions. Owner is right.
- CATEGORY shadows category (731 cases): only 253 asserted. "I only buy
  Chilean Sea Bass" emits sea bass + seafood + fish -- ONE thing said, two
  ancestors INFERRED. Counting each would scale a comment by how deep a
  taxonomy the model happened to emit, and would systematically favor foods
  with deep category trees. That is noise, not signal.

So the distinction is ASSERTED vs INFERRED, not dish-vs-category. Ideal fix:
extraction MARKS the category the person actually named; inferred ancestors
never score alone.

DEFERRED, deliberately. Magnitude: 465 upvotes of 123,965 = 0.38% of score
mass, 152 restaurants, avg +3.1. And it is FULLY REVERSIBLE at zero cost --
shadowing is a QUERY-TIME rule, the category items and their mentions are
retained, and the raw documents survive the reload (§2c), so assertedness
can be computed later offline with no re-extraction and no reload. Against
that, building it now would add a NEW extraction obligation immediately
before we spend, and every prompt obligation examined this session has
leaked. Conservative under-count of 0.38% beats a new failure class at the
moment the audit is meant to be shrinking unknowns.

## 4. THE PRE-RELOAD AUDIT (the gate — do this BEFORE spending)

The prompt has NEVER been validated in full: the 13/13 replay predates the
two-axis parent rule AND the fusion rule. Required before the reload:

1. Re-run the 13-case regression under the CURRENT prompt (must still pass).
2. Large representative sample (>= 100 docs, random, all shapes) graded for
   EVERY failure class we know: menu-item labeling, fan-out, fusion
   compounds, two-axis parents, namespace leakage (dish nouns as
   attributes, meal-periods as categories), attribute emission, over-
   extraction/hallucinated dishes, wrong links, restaurant-name quality.
3. Hunt for classes we have NOT yet looked for — that is the point of "find
   ALL the issues now": sarcasm/negation, multi-restaurant comparisons,
   chains vs one-offs, non-English text, deleted/edited comments, bots,
   crossposts, very long threads, price/hours claims mistaken for dishes.
4. Only when the sample is clean do we wipe and reload.

## 5. NEW YORK — no reprocessing, no gaps

NY's raw corpus and its 1,000-post catch-up stay as they are. The risk is a
CHRONOLOGICAL GAP: with collection paused, new NY posts age out of the
1,000-post window (foodnyc runs ~12.3 posts/day, so the window covers ~81
days — ample, but not infinite). Before/after the reload, confirm foodnyc's
chronological lane resumes with a due date that does not skip arrivals. If
the pause runs long, run foodnyc's chronological lane ALONE (cheap, ~11
docs/run at Austin rates; NY is denser) to keep the window fresh without
touching the reload.

## 6. SEQUENCE

1. DONE 2026-07-27. Resolution-cost audit found thinking config lost at the
   callLLMApi seam (28af1b38) AND absent entirely in the relevance gate,
   whose ledger was also blind to thinking tokens (f12f4126). One shared
   resolver now owns thinking level for every assembler. All-in cost/doc
   $0.00382 -> $0.00045 (8.5x); Austin reload ~$151 -> ~$18; replay ~18x
   faster. Applies to every future collection run, not just the reload.
2. DONE 2026-07-27 (1b58d1d5): §2a per-category rollup admission (1,191 of
   1,706 category items are sole carriers and now count; 515 stay
   suppressed), §2e tags filtered to active (4,892 archived signal rows no
   longer surfaceable as tags), §3 cadence_days column now honest. §2b was
   already a no-op — no weighting exists to remove.
3. Run the §4 audit; iterate the prompt in LARGE spans until clean.
4. Verify user-reference counts (§2c), then wipe + reload Austin.
5. Re-enable collection; confirm NY continuity (§5).
