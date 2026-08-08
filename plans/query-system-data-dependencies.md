# Query System ← Data Audit: dependency handoff (2026-08-05)

**For the session executing `plans/data-audit-2026-08.md`.** Every item below
was measured on the local prod mirror today, from the query side. Each states
the SEARCH consequence, so the data work can be prioritized by what it unblocks.

The headline: the Spanish launch gate sits at 86.7% overall but **compound at
50%**, and the audit's existing P0/P1 items explain most of that. I am NOT
asking for new work — I am reporting which already-planned items are on the
query critical path, plus three defects I found that I don't see in the audit.

---

## Already in the audit — these directly gate search

### 1. Attribute tombstone leak (audit P0.1) — **highest search impact**

> ✅ CLOSED (data-audit-2026-08.md; annotated 2026-08-08): fixed in the
> class-②-⑤ cleanup — do not re-litigate from this section.

Measured in vocabulary terms:

| type | active entities | archived | active aliases | **aliases stranded on archived** |
|---|---|---|---|---|
| food_attribute | 171 | 535 (76%) | 292 | **549** |
| restaurant_attribute | 428 | 1,251 (75%) | 1,969 | **1,490** |

**1,188 distinct search words ground to NOTHING** — they exist only on archived
rows and appear on no active entity. Sampled: `authentic`, `high quality`,
`huge portions`, `con queso`, `well seasoned`, `american cuisine`,
`vietnamese food`, `weekend only`, `hokkaido`.

Search consequence: a user typing any of those gets zero grounding. This is
also why every cuisine compound fails — see below.

### 2. Cuisine four-way split (audit P2.1, "cuisine dissolves")

> ✅ CLOSED (data-audit-2026-08.md class ②: cuisine facet + redirect-on-
> archival + stranded-event drain; annotated 2026-08-08).

Every cuisine exists 3–4 times, with the row a compound query needs archived:

```
mexican  food                 ACTIVE   43 events   ← "cuisine minted as dish"
mexican  food_attribute       ARCHIVED             ← the compound path, DEAD
mexican  restaurant_attribute ACTIVE   2,448 events
mexican  restaurant_attribute ARCHIVED             ← duplicate row (audit P1)
```

Identical for `japanese`, `peruvian`, `pizza`, `italian`, `indian`, `thai`.
Note `indian` and `thai` also exist as **food** entities (16 and 4 events) —
the audit's "11 cuisines minted as dishes."

Search consequence: `desayuno mexicano`, `sushi japonés`, `mariscos peruanos`,
`comida india vegetariana` — 6 of 15 compound gold failures are this one defect.
**CORRECTED 2026-08-06: simulated in full on a corpus clone — these fixes moved the launch gate +0.0% (141/179 concepts identical). They matter for SCORING integrity, not search grounding; the grounding blocker was the query-side consume rule, fixed separately (e76ae45bc). Items below remain worth doing on their own merits.**

### 3. Alias/name collisions (audit P1 "aliases")

> ⛔ DECIDED AGAINST for testimony surfaces (later ruling; see
> entity-alias.service.ts:88-93 — 7.8% of aliases collide and "refusing
> those would be refusing reality"). The backfill this section asks for
> should NOT be built; annotated 2026-08-08.

**1,331 active entities whose name is another active entity's alias.** Bigger
than the audit's 29+37 figure, which appears to be scoped to same-type and
cross-type collisions separately.

```
soba [ingredient]  is an alias of  soba [food]
raw [food]         is an alias of  raw [food_attribute]
lunch [food]       is an alias of  lunch [restaurant_attribute]
slice [food]       is an alias of  Slice [restaurant]
```

Search consequence: ambiguous grounding. Under the ranking invariant (results
order by Crave Score, never by relevance) a wrong-but-high-scoring match ranks
**first**, so this is a correctness bug, not a quality one.

The audit's proposed rule — *"an alias may never equal another active entity's
name"* — is already implemented and shipped on the ingress side as P0-b in
`entity-alias.service.ts`. It blocks NEW violations only. The 1,331 existing
ones need the backfill. **Please keep the rule; it is load-bearing for search.**

### 4. Plural residue (audit P1 "4 plural residue pre-lemma-fix")

Confirmed live and worse than 4 in search terms:

```
taco   food  2,328 events
tacos  food    151 events   ← same concept, split
```

Search consequence: evidence mass is split, so an entity that should dominate
ranking is diluted across two rows.

---

## NOT in the audit (as far as I can see) — three additions

### 5. Zero-evidence compound dishes win the span competition

`mexican breakfast` exists as an active food entity with **0 events**. Because
grounding is longest-match-wins, `desayuno mexicano` grounds to it and returns
**nothing** — strictly worse than decomposing to `breakfast` + `mexican`.

Ask: when the rerun mints compound dishes, is there an evidence floor? An
entity with 0 events is a liability, not knowledge. (Distinct from restaurants,
which are never deleted — that law is about place-grounded restaurants.)

### 6. Attribute-word-in-food-name is pervasive (not a defect, a constraint)

**1,253 food entities contain an attribute word in their own name** —
`mango sticky rice`, `blue cheese stuffed olives`, `smoked bob armstrong`. And
`pizza` is both a food and an attribute.

Not asking for a fix. Flagging it because it **falsifies any "split the query at
attribute words" rule** — I tested and discarded exactly that. If the extraction
work is tempted by a similar rule, it will break these 1,253.

### 7. Dietary/constraint terms need a hard boundary flag

`vegan` vs `vegetarian`, `halal` vs `kosher`, `gluten free` vs `dairy free`.
The audit notes `dietary constraint_class` was re-flagged on prod (12 rows). I
found the LLM vocabulary pass generating `pizza vegetariana` as an alias for
`vegan pizza` — deleted, and the prompt now forbids it structurally.

Ask: keep `constraint_class='dietary'` populated and authoritative through the
rerun. It is the only deterministic lever search has for "never substitute these,"
and I need it to carve these terms out of any fuzzy matching.

---

## What I am NOT asking for

- No new entity type, no new facet (audit P2.1 already ruled cuisine dissolves).
- No Spanish-specific data work. The vocabulary/alias layer is mine and is built.
- No change to the ranking invariant.

---

## What I will do on my side, assuming the ideal shape

Assuming items 1–4 land, the residual query-side question is span choice:
should `tacos vegetarianos` ground to `vegetarian taco` (2 events) or decompose
to `taco` (2,328) + `vegetarian` (121)? The evidence separation is ~1000x and
clean, which suggests a deterministic evidence-gated rule rather than stemming
or a per-query LLM — both of which I tested and found to be treating symptoms of
the corpus defects above. That work continues in `plans/concept-graph.md`.
