# Final prompt items — rederivation report (2026-08-30)

The campaign's three remaining prompt debts (N27 flaky pin, the menu
sanity check, the item-name span-check question), closed per the owner
order: no patches, full rereads and rederivations, tested. All edits
uncommitted. Territory touched: `collection-prompt.candidate.md` only —
no code changes shipped (item 3's verdict is a reasoned NO).

---

## 1. N27 flaky pin ("fermented crab paste" → `crab`) — FIXED, certified 3/3

### The reread (in the model's shoes)

Full walk of the dish/ingredient emission chain (C.1 Gate 1, C.2, C.5)
asking why removing `item_categories` from the decode schema made the
compound ingredient intermittently trim. What the reread found:

- **C.5's own language points at ONE word.** "Ingredient nouns inside
  the dish name", "the ingredient is the WORD THE SOURCE WROTE",
  "if the noun you are about to write does not appear in the source" —
  noun/word, singular, everywhere.
- **Every positive ingredient exemplar in C.5 was a single word**
  (burrata, chanterelle, pesto, gruyere). The ONLY multi-word
  ingredients the section showed were the FORBIDDEN outputs ("salted
  crab", "tea leaf") — the model's sole pattern evidence for a
  compound in this slot was negative.
- **The model's own compliance check passes the trim.** "crab" DOES
  appear in the source, so the as-written test as phrased ("does the
  noun appear?") licenses the truncation. Nothing in the section said a
  substance's name has a LENGTH.
- Why the schema-field removal surfaced it: `item_categories` sat
  between `ingredients` and the end of the dish shape; with it gone the
  slot's neighborhood changed and the latent one-word pull (always
  present in the text) started winning ~20–30% of calls. The prior
  agent's 8 wording variants nudged emphasis; none gave the model a
  rule that makes "crab" WRONG.

### The rederivation

Two changes to C.5, one principle:

1. A new law between the two-sources list and the knowledge ban:
   **"An ingredient is the NAME of a substance, and the name is as long
   as the source made it."** — compounds kept whole because shortened,
   each word names a DIFFERENT substance ("crab" is an animal; the
   writer wrote about a paste); only a fronting preparation participle
   may fall away ("fermented crab paste" → `crab paste`).
2. A positive multi-word exemplar in rule 1 (gold-case pinning per the
   prompt-philosophy canon): "banh mi **with fermented crab paste**" →
   `["crab paste"]`.

### The displacement fight (measured, same-minute controls)

The report's warning held exactly: the first combined text (this C.5
rederivation + item 2's C.2 rewrite, each individually clean at
repeat=8) fixed N27 8/8 but flipped **N54-deal-as-answer-affordable to
deterministic FAIL (0/16)** — while EACH edit alone passed the band 8/8.
A pure two-edit interaction. Two interaction-fixed combinations both
measured clean (repeat=8, N27+N54+N6): dropping the gold example
(varC) or tightening the C.2 step-4 wording (varE). **Shipped: varE**
— keeps the gold example, shortens step 4 (no "say the phrase to the
server" framing; see item 2).

Band probe of the shipped text, repeat=8, HEAD-candidate as temporal
control (N27, N6-closure, G2-la-nueva, C3-grocery-control, V14d, N54,
B5): candidate **7/7 PASS**; HEAD control showed **N27 FLAKY** in the
same minutes — the instability is real and the fix is the difference.

### Certification (the N27 stability proof)

Full collection suite (176 cases, `prompt-ab.ts --repeat=3`), three
independent runs at the shipped config — fixtures
`prompt-ab.d4b.cert.run{1,2,3}.result.json`:

- run1: candidate **175/175 PASS, 0 FLAKY**
- run2: candidate **175/175 PASS, 0 FLAKY**
- run3: candidate **175/175 PASS, 0 FLAKY**
- `N8-geo-fredericksburg` PENDING by design in all three (grounding
  layer owns it).
- **N27: PASS in all 3 runs (9/9 calls)** — plus 8/8 twice in band
  probes = 25/25 observed calls clean, against a HEAD control still
  flaking. The bar (3/3 across runs, no regressions) is met; nothing
  was displaced.

(The "live" arm in the cert fixtures is the registered v1
`collection-prompt.md`, which fails ~72 pins by design — the honest
HEAD-candidate control lives in the band probes above.)

## 2. The menu sanity check — rederived without menu memory

C.2 step 4 asked "Would this exact wording appear on a menu?" — a
composition question phrased as world knowledge, inviting the model to
consult its memory of menus (the exact resource B.3/C.2/D.4 spend
paragraphs banning). What the check actually tests: **is the composed
phrase the coherent NAME of one offering, with no leftover commentary?**

Shipped step 4: "Is the phrase you composed the NAME of one offering,
or is a word of commentary — the writer's verdict, a comparison,
narration — still stuck to it? Peel such words one at a time, keeping
the head noun; judge the WORDS as spoken, never menus you remember."
The sub-bullet's "Appearing on a menu is NOT sufficient" became "A
coherent name is NOT sufficient" (same Gate-1 re-run). The
lone-ingredient and no-broader-dish laws are unchanged. Quote-mirror
green (no schema description quoted the old sentence).

## 3. Item-name span check — NO, with evidence

Decision from scratch: should ITEM names get the ingredient-style
mechanical observed-span refusal (word-boundary + number/diacritic/
hyphen variances + "the"/menu-number stripping) in
`place-name-contract.ts`, wired to a banked refusal in the pipeline?

**Verdict: no. Two independent reasons, both measured.**

1. **The defect class it was proposed for is invisible to it, by
   construction.** The known victims are peels/truncations ("rice
   platter" for chicken rice platter, "tri-tip" for tri-tip sandwich).
   A peel is a CONTIGUOUS sub-span of the source text — a word-boundary
   occurrence lookup finds it and passes. A mechanical check can only
   refuse what the source never wrote; a peel is precisely something
   the source wrote. Catching a peel requires judging that a LONGER
   phrase surrounded the match — a judgment, which the contract's
   charter ("a lookup, not a judgment", v17-coherence F1) forbids.
2. **What it WOULD refuse is mostly lawful composition.** Measured
   counterfactually at the wire level: 400 stored extraction inputs
   (`collection_extraction_inputs.raw_output`, local corpus), 3,688
   dish emissions, prototype check = `ingredientSpanAppearsInSource` +
   "the"/menu-number stripping, scope = the ENTIRE input payload text
   (a superset of any licensed scope — generous to the check).
   **Refusal rate 5.6% (205/3688)**, and inspection shows the refusals
   dominated by composition C.2 ORDERS: coordination splits ("beef or
   cheese enchiladas" → `beef enchiladas`), cross-clause joins ("Try
   the Peach Habanero" at a wing place → `peach habanero wing`; "the
   drip" + coffee context → `drip coffee`; "a double cheese with
   everything" → `double cheese burger`), plus pure mechanical gaps
   (HTML entity "fish &amp; chips" → `fish and chips`; possessive
   drift "Arctic Bird's Nest" → `arctic birds nest` — the ingredient
   check licenses neither). A same-method probe over 3,000 canonical
   entity-level events read 14.2%, inflated further by downstream
   unification (Margs→margarita, larb→laap) — same conclusion.

The categorical difference from the two existing lanes: `ingredients`
is a TRANSCRIPT field (C.5: "you are quoting the writer") and
`place_observed` is an OBSERVED SPAN by definition — both are quotes,
so a quote-lookup is their exact contract. The item is a COMPOSED
order-name (C.2 exists to build it out of scattered words); a
quote-lookup is the wrong contract for a field whose lawful values are
routinely not quotes. Banking ~1 in 18 lawful dish claims to catch a
class that mostly isn't the peel class buys noise, not integrity.

Where item-name integrity actually lives: C.2's keep-whole/sameness
laws + the pinned suite (N27, N70 venue-name, V8n, the keep-whole
bullets) prompt-side, and the downstream dish-name judge
concept-side. If the peel class needs mechanical teeth later, the
honest shape is a judged lane (an LLM name-faithfulness court like the
restaurant-name judge), not a substring contract.

No code was changed for this item.

## 4. Certification ledger

- Full suite ×3: above (175/175, 175/175, 175/175; 0 flaky anywhere;
  N8 pending by design).
- `yarn ts-node -T scripts/schema-quote-mirror.ts`: green ("every
  schema obligation is mirrored verbatim").
- `yarn invariants`: **green — 43 invariants, 88 proofs** — with one
  caveat: an UNTRACKED foreign spec another agent left on the shared
  tree (`apps/api/src/modules/restaurant-enrichment/`
  `servable-place-visibility.integration.spec.ts`, writes
  `.placeEvent.create` directly) trips
  `ledger.the-evidence-ledger-has-one-write-door`. With that file
  parked aside the suite is fully green; restored, it fails — the
  failure belongs to that in-flight work, not this change. Surfaced,
  not fixed (not my territory; parallel-agent interference, same class
  as the report's §5 note).
- `yarn build`: exit 0; dist asset verified to contain the new C.5 law.
- Targeted tests: `place-name-contract` + `extraction-pipeline` — 6
  suites, 49 tests, all pass.
- Boot smoke: fresh `dist/main` booted on :3999, `/health` 200.

Fixtures written: `apps/api/scripts/fixtures/prompt-ab.d4b.cert.run{1,2,3}.result.json`.
