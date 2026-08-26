# v17 Coherence Red Team — attacking the plan before we build it (2026-08-25)

Read-only pass over the v17 change set against the actual code and staging data.
Every claim below is cited to `file:line` or to a SELECT I ran. Ranked by severity.

---

## Plain-language summary (owner)

The five v17 changes are individually reasonable. Put together, three of them
fight each other and one of them cannot do the job it was hired for.

1. **The "the name must appear in the text" check would not have caught the bug
   it was designed for**, and it would throw away good data. In the Luckys →
   Lefty's case the model *did* see "Lefty's" — it was in the same request, in
   another comment of the same thread. Any check that allows normal replies
   ("+1", "it's so good") to inherit a name from the parent also allows exactly
   the swap we're trying to stop. The fix that actually works is different:
   make the model quote the exact words it read and say which comment it read
   them in, and let our code build the tidy name from that quote. Then a name
   nobody wrote is not something the model can even say.
2. **The "+1" change and the name check pull in opposite directions.** Lowering
   the praise bar creates more mentions whose restaurant name is not in their
   own text — which is precisely what the name check refuses. Also worth
   knowing: "+1" is *already* in the v16 prompt (§A.1). This is the model not
   obeying, not a missing rule.
3. **Refusing a mention because praise sits on a dish row would delete real dish
   claims** — 8.1% of v16 mentions. Today that flag costs us almost nothing
   (the database already counts one endorsement per source, per restaurant).
   Refusing is a net loss.
4. **Cuisine: there is no "nightly cuisine drain" to retire.** What exists is a
   general safety mechanism that re-points events away from merged/archived
   entities — deleting it would strand evidence across the whole system, not
   just cuisine. And search's dish side is *already* empty of cuisine (verified:
   zero dish rows carry a cuisine tag), so nothing gets worse by stopping the
   prompt first. The real ordering risk is the opposite one: activating a new
   prompt while nothing converts dish cuisine re-pollutes the dish side.
5. **The "read cuisine on both sides" search change, done naively, returns
   FEWER results than today** — the current all-words gate ANDs the dish side
   and the restaurant side together. One concept in two places must be an OR.
6. **Refused rows are invisible to our review tooling.** The shadow diff reads
   saved events; a refused mention leaves no trace, so a too-strict check
   silently shrinks the corpus and the review closes green.

---

## F1 — CRITICAL. The name-in-text refusal cannot catch the swap class, and refuses legitimate inheritance

**Failure scenario.** v17 ships. A commenter writes "+1, the mushrooms are
unreal" under a parent praising Luckys, in a thread dominated by Lefty's. The
model again writes `lefty's pizza`. The ingest check looks for "lefty's" in the
text it is allowed to consult — and finds it, because Lefty's is in the same
request. The check passes; the wrong-restaurant credit lands exactly as in v16.
Meanwhile a *correct* "+1" whose restaurant name lives only in the parent gets
refused if the check is scoped to the source document.

**Code evidence.**
- The model's visible world is a CHUNK, not a document and not a post:
  `apps/api/src/modules/external-integrations/llm/llm-chunking.service.ts:255-300`
  packs *several* top-level threads together until the token budget is hit, and
  `:326-338` attaches the full post title+body to every chunk. So Luckys' comment
  and Lefty's comments were in one payload by construction.
- Legitimate name-outside-own-text emission is prompt law:
  `collection-prompt.candidate.md:186-190` (short agreement "+1"/"this"/"agreed"
  adopts the parent's referent), `:369-374` (pronouns/definites resolve to the
  nearest anchor), `:55-63` (depth-aware order reaching the post title/body),
  `:331-338` (a one-word list shorthand emits the fuller form observed
  *elsewhere in the input*).
- Measured blast radius of the doc-scoped signature is only
  163 pairs / 15,137 (`plans/v16-grounding-investigation-20260825.md`) — i.e. the
  strict check catches ~1% and the 203 similar-name swap pairs largely sit
  *outside* it.

**Ideal shape (removes the class rather than filtering it).** Stop letting the
model author a name at all:

- Emission carries, per mention: `place_observed` (the span **verbatim**, exactly
  as typed) and `place_source_id` (which SRC the span was read from). Drop
  `place` from the schema entirely.
- Ingest computes the canonical by applying B.3's *mechanical* rules in code
  (lowercase, whitespace collapse, possessive-clitic strip, location-suffix
  strip). A name that appears in no source is then **unrepresentable**: there is
  no field in which to write it.
- The only check that remains is a decode-level one, and it is of the same kind
  we already trust: `place_source_id` becomes an ENUM of the chunk's SRC refs,
  exactly like `source_id` is today
  (`llm-response-schemas.ts:336-360`), and `place_observed` must be a substring
  of that source's text — a *lookup*, not a judgment.
- The Luckys case then fails at the model's own hand: to say "lefty's" it must
  cite a source whose text contains it, and that source is not SRC048; the
  mention's own `source_id` (SRC048) plus a cited ancestor chain is checkable.

**Honest limit.** This does not make coreference correctness free — a model can
still cite a wrong-but-real ancestor. It makes *invention and blending*
impossible, which is the class that is structurally undetectable today.

**If we keep `place`** (weaker fallback): the check must not be "name in text"
but "canonical is a mechanical reduction of the cited span" — a deterministic
function comparison, which catches `franklin bbq` blends and `lefty's` swaps
where a substring search cannot.

---

## F2 — CRITICAL. "The field is the observed text" is false as long as B.3 keeps normalizing

`plans/name-rule-costbenefit-20260825.md` §4.4 says that once the prompt emits
observed text, the provenance fix "reduces to 'the field is the observed
text' — no dual-field contract needed." The prompt says otherwise:
`collection-prompt.candidate.md:441-462` still orders **lowercase**, **drop
trailing neighborhood/borough suffixes**, **strip the possessive clitic**,
**collapse whitespace**. Every one of those makes the emitted string differ from
the writer's span. So:

- v17 **must** add a second field. The enforced Gemini schema has none today —
  `llm-response-schemas.ts:250-321` has no `*_surface` property, and `required`
  is `['temp_id','place','general_praise','source_id']` (`:309`).
- The ingest plumbing for it already exists and is currently fed by a fallback:
  `extraction-pipeline.service.ts:1865-1900` (`ensureSurfaceDefaults`) copies
  `place` into `place_surface` when absent, and `:1943-1995`
  (`normalizePlaceNames`) tries to *recover* a surface with a `\b`-anchored regex
  over the source text. `unified-processing.service.ts:1106-1121` banks the
  surface as an alias only when it differs from `place`. With a real
  `place_observed`, the regex recovery becomes dead code and should be deleted in
  the same change (it is a guard against the missing field).

**Also load-bearing:** if code computes the canonical (F1), the location-suffix
lexicon ("les", "chelsea", "midtown", "queens") moves from prompt to code and
becomes city-specific data we must own per metro. That is a real cost of the
ideal shape and should be a conscious owner call, not a surprise.

---

## F3 — HIGH. There is no "nightly cuisine drain" to retire; retiring what exists strands evidence

**Failure scenario.** v17 "retires the nightly cuisine drain." The thing deleted
is the general tombstone machinery. A restaurant merge lands mid-batch; the
next writer's events go onto the archived loser and vanish from every projection
— across all vocabulary, not cuisine.

**Code evidence.** The three "drain" parts named in
`plans/cuisine-system-review-20260825.md` are:
1. a **one-time migration** (`20260801200000_cuisine_facet`) — already done,
   nothing to retire;
2. the **write-time re-point**, which is the general event-ledger front door:
   `extraction-scope.service.ts:364-433` (`writePlaceEvents` /
   `writePlaceEntityEvents` resolve every id through the active-winner redirect,
   `skipDuplicates`) plus the time-of-use revalidation in
   `unified-processing.service.ts:1655-1700`;
3. the **nightly sweep** `sweepTombstoneEvents()` in
   `projection-rebuild.service.ts:997`, run from the 3AM convergence cron.

None of these are cuisine-specific. The only cuisine-specific behavior is that
the archived `item_attribute` cuisine rows have redirects pointing at the
canonical `place_attribute` rows — verified on staging:

| name | type | status | facet |
|---|---|---|---|
| mexican | item_attribute | **archived** | — |
| mexican | place_attribute | active | cuisine |
| mexican | item | **active** | — |

(89 active `facet='cuisine'` rows; same shape for `italian`, `bbq`.)

**Resolution.** Delete nothing. If the prompt stops emitting dish cuisine, the
conversion simply stops firing for cuisine — the mechanism idles, which is what
"the guard becomes unnecessary" actually looks like here. Deleting the redirect
hop is a separate, much larger question about merge integrity.

---

## F4 — HIGH. Cuisine sequencing: the hole is the opposite of the one feared, and the enumerator needs a projection change nobody listed

**Verified on staging (2026-08-25):**
- `SELECT count(*) FROM core_restaurant_items WHERE food_attributes && <active cuisine ids>` → **0**.
- 30% of v16 mentions (**8,906 / 29,563**) carry a cuisine in `item_attributes`;
  only **251** of those carry a dish cuisine with *no* matching place-side
  cuisine. So dropping dish-side emission costs the restaurant side ~251
  mentions of testimony — negligible.

So there is **no window in which search gets worse** by stopping emission first:
the column it reads is already empty. The real ordering risk is the one
`v16-trace-audit:89` named — activating a prompt that still emits dish cuisine
onto **fresh rehearsal-minted** entities (which have no redirects) re-pollutes.

**The missing piece nobody listed:** dish-side cuisine lives at the wrong grain.
`Connection.itemAttributes` (`schema.prisma:324`, `food_attributes`) is a
**(restaurant, dish)**-grain column rebuilt from events
(`projection-rebuild.service.ts:381-422, 519-530`). A knowledge stamp on the
**food entity** is entity-grain. Either the projection must union the entity's
knowledge attributes into every connection it builds, or search must join
`core_entities` on the dish axis. Neither is in the v17 list, and the enumerator
is worthless without one of them.

**Correct order of operations:**
1. Build the enumerator + its entity column, and decide the grain bridge
   (projection union is the cheaper of the two and keeps search unchanged in
   shape).
2. Backfill the enumerator over food entities; verify non-zero coverage.
3. Ship the search dual-projection (F5) — only after (2), else it changes query
   shape over empty data.
4. Activate the v17 prompt (stops dish-cuisine emission) as part of the normal
   re-extract choreography.
5. Retire nothing (F3). Cleanup of the cuisine-as-dish junk hubs (F8) rides with
   step 4's GC.

---

## F5 — HIGH. Naive "dual projection" makes the all-words gate stricter, not looser

**Failure scenario.** "mexican tacos". The cuisine id is added to both
`softItemAttributeIds` and `softPlaceAttributeIds`. Tier 0 now requires the dish
to carry the cuisine **AND** the restaurant to carry it. Every Mexican taco at a
Korean spot — the exact case this change exists for — drops out of the full tier.

**Code evidence.** `search-query.builder.ts:634-651`: tier-0 is
`c.food_attributes @> softItemAttributeIds` **AND**
`fr.restaurant_attributes @> softPlaceAttributeIds`; the restaurant-axis twin is
`:174-190`. Two further couplings:
- per-word starvation counts key by attribute id
  (`search-query.builder.ts:854-880`, `json_build_object(<id>::text, …)`) — the
  same uuid in both lists produces a duplicate JSON key, last write wins;
- placement: `CROSS_TYPE_PLACEMENT_ORDER` is
  `item_attribute > item > place_attribute > ingredient > place`
  (`search-query-interpretation.service.ts:1208-1214`). With `item_attribute
  'mexican'` archived and `item 'mexican'` **active**, a bare "mexican" today
  resolves to the junk *dish* hub, never to the cuisine at all.

**Ideal shape.** A `facet='cuisine'` word is ONE concept with two projections:
one soft entry, satisfied by `food_attributes @> [id] OR
restaurant_attributes @> [id]`, counted once. That requires the soft-id
structure to become `{id, columns[]}` rather than two parallel id lists — a
small type change that makes the wrong (AND) reading unrepresentable.

---

## F6 — HIGH. The general_praise refusal deletes good dish claims for a harm the database already neutralizes

**What actually happens today** with `general_praise: true` on a dish row:
`unified-processing.service.ts:2832-2844` writes a restaurant-level
`general_praise` event **in addition to** the food event at `:2848-2870`. The
harm is bounded twice over:
- the ledger's content key is `(run, doc, place, evidenceType)`
  (`schema.prisma:1029`), so N dish rows in one doc collapse to ONE praise event;
- `replacePlacePraise` dedupes again per `(place, sourceDocument)` before summing
  upvotes (`projection-rebuild.service.ts:622-650`).

So the residual harm is "a sentence praising a dish also counts once toward the
restaurant's praise total." Refusing the mention would delete **2,383 v16
mentions' dish claims** (8.1%) to fix that. Net negative.

**Ideal shape.** Don't check — make it unrepresentable. Gemini's enforced schema
has no `oneOf`, but it does have multiple top-level arrays: split the response
into `mentions` (item required) and `place_endorsements` (no item field at all).
The boolean disappears; "praise on a dish row" cannot be written. Note the field
is not simply derivable from `item === null` — place-only mentions that carry
only attributes and no endorsement exist by design
(`collection-prompt.candidate.md:743-770`, the standalone test) — which is why
two arrays, not a derived flag, is the right shape.

---

## F7 — MEDIUM. "+1" is already the rule, and it is the change that most inflames F1

`collection-prompt.candidate.md:186-190` already says: *"A short agreement ADOPTS
the parent's testimony… '+1', 'this', 'agreed', 'seconded'… credit the same
restaurant (and dish, when unambiguous) from THIS source's id. An agreement with
an ambiguous referent credits nothing."* And `:191-193` extends it to bare
verdicts with unstated subjects. So v17 item (2) is **not a missing rule** — the
~7/160 drop in the trace audit is non-compliance, and the remedy is gold-case
pinning plus rule placement, not a new rule.

**Ideal attachment semantics** (they are also what the prompt already says, so
the job is to pin them):
- referent = the parent's mention, resolved by the depth-aware order
  (`:55-63`); restaurant always, dish only when the parent's clause names exactly
  one dish;
- the mention is emitted **from the agreeing comment's own source_id**, which is
  correct: the event key includes `source_document_id`, so the "+1" comment's own
  upvotes count once and independently (`schema.prisma:1029`);
- when the adopted dish fails Step C, it degrades to a restaurant-only carrier
  (already stated at `:193-198`).

**Junk risk of lowering the bar further:** "+1" under a parent whose clause
*failed* Step A (a plan, a closure, a hedge) would launder a non-claim into a
claim. The prompt's own wording ("under a parent that vouches") covers it; it
needs a **negative** gold case, since the harness currently has none pinning the
failure direction of adoption.

**And the collision:** every one of these mentions has a restaurant name that is
absent from its own source text. Items (2) and (5) as written are in direct
tension; F1's cited-span design is what reconciles them.

---

## F8 — MEDIUM. Refused rows are invisible to the review that gates activation

`scripts/rig/reextract.sh:85-99` runs `apps/api/scripts/reload/shadow-diff.sql`,
which reads **persisted events only** (`shadow-diff.sql:54-94`,
`core_restaurant_entity_events`). A contract-refused mention writes nothing, so
it shows up only if it happened to be an entity's *sole* support — otherwise the
review closes green over a silently smaller corpus. The reextract skill's own
law is "never activate without a closed diff review"
(`.claude/skills/reextract/SKILL.md:22`), and that law is only as good as what
the diff can see.

**Resolution.** Refusals are BANKED, never dropped: one row per refused mention
carrying `(extraction_run_id, input_id, source_document_id, reason, raw mention
JSON)`, and a new `--- CONTRACT REFUSALS ---` section in `shadow-diff.sql`
grouped by reason with per-run counts and examples. A refusal rate above a
declared threshold should be an OWNER-DECISION row, not a log line. (This is
audit surface, not a guard: it does not change behavior, it makes behavior
visible.)

---

## F9 — MEDIUM. Per-mention verbatim names are safe for counting, but cost real money at the edges

Traced end to end; **nothing double-counts**:
- temp ids derive from the emitted name (`unified-processing.service.ts:1345-1358`
  — `restaurant::<normalized place>`; item temp ids are namespaced by the place
  temp id at `:1353-1364`), so variant spellings *do* fragment temp ids;
- `dropDuplicatePlaceMentions` fingerprints the **raw** place string
  (`extraction-pipeline.service.ts:1988-2035`), so variants escape that dedupe;
- but the resolver collapses intra-batch by identity fold
  (`entity-resolution.service.ts:2100-2180`) and, for near-variants, by the
  strict `matchEntity` judge over a batch overlay (`:2200-2300`), and
- event writes are keyed by `(run, doc, place, [entity,] type)` with
  `skipDuplicates` (`extraction-scope.service.ts:388-433`), so two spellings that
  resolve to one entity produce one event, not two. Projections count events, not
  mentions.

**The genuine costs**, both worth stating in the plan:
1. one extra `matchEntity` LLM call per variant that trips the nomination gate
   (containment / edit distance ≤3 / word-set coverage, `:2225-2245`), capped at
   8 candidates;
2. when the judge answers "new", a **twin place entity** is minted and later
   grounded — ~$0.045 per newly grounded location (CLAUDE.md, re-measured
   2026-08-02). Sizing anchor: 832 variant pairs already survive uncollapsed in
   1,578 v16 inputs *with* the rule active
   (`plans/name-rule-costbenefit-20260825.md` §3).

Also worth noting in support of deleting the rule: **within-post consistency was
never achievable anyway** — a post is split across chunks
(`llm-chunking.service.ts:255-300`), and the model sees one chunk per call.

---

## F10 — MEDIUM. The gold harness cannot grade the contract v17 is built around

`apps/api/scripts/prompt-ab.ts:94-104` normalizes away punctuation **and
diacritics** before comparing, and `has()` at `:118-128` is token-subset
tolerant by design. Consequences for v17:
- a de-diacritization violation (`café crème` → `cafe creme`), which B.3
  explicitly forbids (`collection-prompt.candidate.md:434-440`), grades **PASS**;
- a token-superset blend (`franklin bbq` where nobody wrote it) grades **PASS**
  against an expectation of `franklin`;
- **12 of the 105 existing cases** expect a place string that is not verbatim in
  their own text (`jds`, `huts`, `mothers`, `philomenas`, `vinnies`, `carmines`,
  `jacobs pickles`, `clarks`, `pterrys`, `asters`, `l'industrie`, `vinnie's`) —
  measured by script over `scripts/fixtures/prompt-ab-cases.json`. Those cases
  encode the *old* canonicalization and must be rewritten to the observed span,
  or they will "prove" the new prompt is broken.

**Resolution.** Add a verbatim mode to the harness: an expectation may assert
`observed` exactly (no fold, no subset tolerance) alongside the tolerant
`places` assertion. Without it, item (1)'s and item (4)'s gold pins are
unfalsifiable and the certification is theatre.

---

## F11 — LOW. Cuisine-in-`item_categories` is untouched by item (3), and it regenerates the junk hubs

v16 emits **337** cuisine tokens into `item_categories` vs 218 for the active
prompt (`plans/v16-defect-sizing-20260825.md` §6) — the one class where v16 is
worse. Item (3) stops cuisine in `item_attributes` only. Categories mint **item**
entities (`unified-processing.service.ts:1150-1195`), which is exactly how the
active junk hubs were born — verified on staging:
`bbq` 36 connections, `italian` 16, `mexican` 13, `japanese` 1, `thai` 1 as
**dishes**. Those hubs are also what `CROSS_TYPE_PLACEMENT_ORDER` hands a bare
cuisine search today (F5). Stopping cuisine in categories belongs in the same
prompt change, and the hubs belong on the activation GC list.

---

## Summary of recommended amendments to the v17 plan

| # | Plan item | Amendment |
|---|---|---|
| 1 | verbatim names + name-in-text refusal | Emit `place_observed` + `place_source_id`; **delete `place`** and compute the canonical in code. The refusal becomes a substring lookup against a decode-enumerated source, not a judgment (F1, F2). |
| 2 | short praise to "+1" | Already the rule — reframe as gold-case pinning, and add the negative case (adoption under a failed parent clause). Recognize it inflates the class item 5 refuses (F7). |
| 3 | cuisine | Keep the drain (nothing to retire, F3). Sequence: enumerator + grain bridge → backfill → search → prompt activation (F4). Add the `item_categories` ban and the junk-hub GC (F11). |
| 4 | strengthened rules + gold pins | Extend `prompt-ab.ts` with a verbatim assertion mode and rewrite the 12 non-verbatim cases (F10). |
| 5 | ingest contract checks | Drop the `general_praise` refusal; split the response schema into two arrays instead (F6). Bank every refusal and surface it in `shadow-diff.sql` (F8). |
| — | search dual projection | One soft concept, OR across two columns — not two soft ids ANDed (F5). |

*Data claims re-verified against staging `crave_search` on 2026-08-25 (SELECT
only): active cuisine rows = 89; connections carrying an active cuisine id = 0;
v16 mentions with dish-side cuisine = 8,906 / 29,563, of which 251 carry no
place-side cuisine; cuisine-as-dish connection counts as listed in F11.*
