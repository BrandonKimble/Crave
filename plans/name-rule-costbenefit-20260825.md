# The "ONE canonical name per establishment" rule — cost/benefit (2026-08-25)

## Plain-language summary (owner)

The rule tells the model: when a thread spells one restaurant several ways
("Torchy's", "torchys", "Torchys Tacos"), pick one spelling and use it for every
mention. It was supposed to keep one restaurant from splitting into duplicates.

Three findings:

1. **It never came from an incident.** It arrived in an October 2025 prompt
   restructure (commit message: "might revert") with no bug, plan, or measurement
   behind it. The August 2026 rewrite carried it forward and made it stronger.
2. **Our own resolver already does the job, better.** The code that turns names
   into restaurants (the fold + surface tables + the LLM matcher) unifies
   spelling variants deterministically. Measured on staging: the model left 832
   variant pairs UNcollapsed in v16 output anyway (the rule doesn't even work
   reliably), and the resolver unified essentially all of the real ones without
   help. The rule buys nothing the system doesn't already have.
3. **When it does fire, it can fire wrong** — the proven Luckys → Lefty's bug:
   a genuine one-off mention of a different restaurant gets absorbed into the
   thread's dominant name, and one commenter's praise is credited to the wrong
   business. That error is invisible downstream because the rule also erases the
   spelling the writer actually used.

**Recommendation: delete the unification half of the rule.** Keep the mechanical
normalization (lowercase, keep the writer's spelling). Emit what was written;
let the resolver — which is deterministic, auditable, and already trusted —
decide what is the same restaurant. Deleting it is free; keeping it costs
wrong-restaurant attributions we cannot detect.

---

## 1. Provenance — where the rule came from

Traced with `git log -S` / `--follow` across the prompt file's three homes
(`llm-content-processing.md` → `collection-prompt.md` →
`collection-prompt.candidate.md`):

| Date | Commit | What happened |
|---|---|---|
| 2025-07-21 | `638356e94` (initial commit) | Only mechanical normalization existed: "Convert to lowercase canonical forms … Store original mention text separately for alias creation." No unification rule. |
| **2025-10-06** | **`152388541` — message: "might revert"** | The full **"Step 2: Canonicalization & Alias Unification"** appears: "Choose a single canonical `restaurant_name` per establishment … assign a consistent `restaurant_temp_id` for reuse in this input", with the safe-unification clauses (equal-after-normalization, strict token-superset). |
| 2026-04-30 | `0f6b8e10b` | File moved to `apps/api/.../prompts/collection-prompt.md`; rule carried verbatim ("Maintain the chosen canonical `place` consistently across the input"). |
| 2026-08-05 | `9fa05b487` (candidate rewrite) | Rule restated as B.3: "Choose ONE canonical name per establishment … **Use the chosen canonical consistently for every mention of that place within the post object.**" Same commit **deleted all `*_surface` fields** from the output ("verified absent from the enforced Gemini schema"), removing the audit trail the 2025 version had at least gestured at. |

**Original motivation, quoted** (152388541, Step 2 Scope & Goal): "Normalize and
unify the restaurant names resolved in Step 1 for this input … Choose a single
canonical `restaurant_name` per establishment (from observed variants only) and
assign a consistent `restaurant_temp_id` for reuse in this input."

So: the rule exists to prevent within-input duplicate restaurant rows. There is
no commit message, plans/ doc, or measurement tying it to an observed defect —
it landed inside a wholesale restructure whose own message was "might revert".
**Was it an overreaction?** It wasn't a *reaction* at all: it was speculative
architecture. It also predates today's resolver — the fold-symmetric surface
tier (2026-08-09), the joined-identity tier, and the tier-3 LLM matcher were all
built later, which is why the prompt was asked to do a job the pipeline now owns.

## 2. Does the resolver make the rule redundant? — Yes.

Read end to end: `entity-resolution.service.ts` (2,866 lines) +
`entity-identity.ts` (the fold).

- **Tier 1 (exact):** matches on `canonicalFold` — lowercase, apostrophes
  stripped ("Phil's" == "Phils"), punctuation → space, accent policy, NFKD.
  Every same-spelling-variant pair ("Torchy's"/"torchys"/"TORCHYS") unifies
  here by construction, at confidence 1.0, deterministically.
- **Tier 2 (surface):** `entity_surface.form_folded = ANY(canonicalFold(...))` —
  any form any pass ever banked on the entity grounds the mention (0.95).
  Fold-symmetric since 2026-08-09.
- **Tier 2.5 (joined identity):** space/join twins ("home slice"/"homeslice").
- **Tier 3 (recall + LLM matcher):** the near-variant judge — explicitly built
  because "without the judge, near-variants accumulate as separate entities"
  (its own comment). Handles token-supersets and misspellings, and BANKS the
  winning surface so the next occurrence is deterministic.
- Plus the metro-adoption gate, identity-key locks, and the nightly domain
  merge for true branches.

The one thing the prompt's rule adds beyond all this is **within-thread
coreference by similarity** — "this oddly-spelled name is probably the same
place everyone else is discussing." That is exactly the inference that produced
Luckys → Lefty's: similarity across *different* real restaurants is precisely
what the resolver's guards (accent evidence, metro gate, single-owner fold
claims) exist to refuse, and the prompt bypasses them all before the code runs.

## 3. Measured on staging (v16 completed runs, prompt hash `40d3fc1a…`)

Corpus: 45 completed v16 runs, **1,578 inputs, 29,563 mentions, 15,700 distinct
(input, place) pairs**.

### Benefit side — what within-thread unification is actually worth

Even WITH the rule active, the model left variants uncollapsed constantly —
which lets us watch the resolver handle them:

| Measure | Count | What it means |
|---|---|---|
| Same-fold pairs left distinct within one input (e.g. `granny's` vs `granny’s tacos` apostrophe forms) | **302** | Rule failed to fire; tier 1 unifies 100% of these free. |
| Token-superset pairs left distinct within one input | **530** | Rule failed to fire again. |
| …of those 530, resolver already lands both on the SAME entity | **386 (73%)** | `perry's`/`perrys steakhouse`, `phil's`/`phil's icehouse`, `cuantos`/`cuantos tacos`, `bouldin creek`/`bouldin creek cafe` — unified with zero prompt help. |
| …resolve to different entities | 136 | Mixed bag: some are corpus dupes (`waterloo`/`waterloo icehouse`), some are genuinely different places the rule would have WRONGLY merged (`joe's` vs `tex-mex joe's`, `b cooper's` vs `coopers`). |
| Inputs carrying any residual variant pair | **339 / 1,578 (21%)** | Variants are common — and the system absorbs them downstream regardless. |

So the "benefit" case — threads with multiple spellings of one restaurant — is
real (~1 in 5 threads), but in every measurable instance the resolver delivers
the unification on its own. The rule's marginal benefit is **zero measured**:
when it fires, the resolver would have unified anyway; when it doesn't fire
(832 pairs), nothing breaks.

### Harm side

- From `plans/v16-grounding-investigation-20260825.md` (same v16 corpus,
  12,021 docs): **1,006 (doc, restaurant) pairs across 812 docs (~6.8%)**
  credit a restaurant the active corpus never credited; **203 pairs are
  similar-name swaps** (trigram > 0.5 — the Luckys→Lefty's shape); **163
  pairs / 161 docs** carry the strict signature (credited restaurant's name
  absent from the doc text entirely).
- Independently measured here: **220 of 29,563 v16 mentions (0.74%)** emit a
  canonical whose folded form appears **nowhere in the entire input text** —
  violating the rule's own "observed forms only" law. Example: a thread writing
  only "Franklin's BBQ" / "Franklins BBQ" / "Franklins" / "Franklin" emitted
  `franklin bbq`, a blend no writer typed (benign there; fatal in the Luckys
  case).
- The proven worked example (doc `e9598532…`): the comment — "OK so i went and
  tried Luckys. Former chicagoan here - its the real deal … The mushrooms
  topping were the best ive had in austin" — was emitted by v16 as
  `"place": "lefty's pizza"` (no "luckys" anywhere in the output), so a searcher
  of Lefty's Pizza Kitchen sees praise written about Luckys Pizza. The active
  prompt on the same input emitted `luckys pizza` correctly.

**Score: benefit ≈ 0 (fully covered by the resolver) vs harm = a proven
wrong-restaurant attribution class, ~203 candidate swap pairs in one replay,
structurally undetectable because the observed spelling is destroyed.**

## 4. Recommendation — the from-scratch shape

If we designed this today knowing the resolver exists, the prompt would never
be asked to decide identity. The ideal shape:

1. **Delete unification from the prompt.** Remove from B.3: "Choose ONE
   canonical name per establishment", the variant-unification clauses
   ("identical after normalization / strict token-superset"), the variant
   scoring (completeness/frequency tie-breakers), and "Use the chosen canonical
   consistently for every mention of that place within the post object."
2. **Keep the mechanical half of B.3** — lowercase, keep the writer's spelling
   and diacritics, no world-knowledge repair, strip location suffixes and
   possessive clitics, no placeholders. Each mention emits the name **as
   written in its own cited source** (post-title inheritance for pronouns stays
   in the coreference rules, which are about reference, not similarity).
3. **Identity is the resolver's verdict, exclusively.** Tier 1/2 folds unify
   spelling variants deterministically; tier 3's judge handles supersets and
   misspellings and banks the surface. This also un-splits the 136 ambiguous
   superset pairs from a silent model coin-flip into an auditable code path.
4. This composes with the grounding report's provenance fix (emit the
   verbatim-span `place_observed`): once the prompt emits observed text, that
   fix reduces to "the field is the observed text" — no dual-field contract
   needed.
5. Route through the certified re-extract process with the Luckys thread pinned
   as a gold case (SRC048 → `luckys pizza`, never `lefty's pizza`).

Cost of deleting: possibly a few more distinct-but-same-place strings per input
reaching the resolver — which tier 1/2 absorb for free (measured above), and
tier 3 absorbs at ~$0 marginal (it already runs for unmatched names). No
downstream guard needed; the failure class ceases to exist at the source.

---

*Queries reproducible against staging `crave_search` (v16 = completed runs with
`system_prompt_hash LIKE '40d3fc1a%'`; folds approximated in SQL as
lowercase + apostrophe-strip + punctuation→space). Provenance commits:
`638356e94`, `152388541`, `0f6b8e10b`, `9fa05b487`.*
