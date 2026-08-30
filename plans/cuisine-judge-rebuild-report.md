# One cuisine judge, all signals — rebuild report (2026-08-30)

Owner ruling: the deterministic venue-name vote was unprincipled ("French
shouldn't lose because it's beaten — it should lose because it's not
correct"). The venue-facts cuisine judge (cuisine-prompt.md) now takes the
VENUE NAME as first-class evidence, rules on each cuisine-shaped word's
JOB in the name (kitchen claim vs product word / proper name / homograph),
and outputs the full multi-cuisine set. The name-vote lane and projection
vote clause are deleted. All code UNCOMMITTED; zero staging writes.

## 1. Prompt derivation (cuisine-prompt.md, full rederivation)

The prompt keeps the TRADITION TEST, FILTER TEST, hybrid-carries-parents
law, level-committed emission, and error economics unchanged, and gains:

- **Input widened**: `{"name", "summary", "types"}` (was summary-only).
  Types ride along as context so the judge can reconcile a name word with
  what the venue demonstrably is — the disambiguation the old projection
  vote did with SQL now happens where the reasoning lives.
- **THE KITCHEN-CLAIM TEST** — the owner's principle at the decision
  point: for each cuisine-shaped word in the name, does it name the
  KITCHEN'S TRADITION, or does it (a) modify a PRODUCT ("Texas French
  Bread", "Go Greek Yogurt" — cover the word + following noun: is what
  remains a product the venue sells?; extended to product STYLING:
  "MEXICAN DOGGIS" the hot-dog stand), (b) sit inside a PROPER
  NAME/title/pun ("French Quarter Grille", "Roman's", "Spaghetti
  Western"), or (c) be a HOMOGRAPH ("American Indian" → native american;
  "Western" as frontier or as a region of Yunnan)?
- **Foreign-language and concept names**: language, signature dishes, and
  culturally specific words all count ("Cơm Tấm …" → vietnamese;
  "Karahi …" → pakistani; "Taqueria …" → mexican) — what string-matching
  never could.
- **Name-only venues**: judged on the name alone when unambiguous
  ("Chaba Thai" → thai); ambiguous name + no other signal → `[]` (doubt
  costs nothing; other lanes fill later).
- **Reconciliation, not voting**: a different-tradition summary means the
  name's word was never a kitchen claim; a product-counter venue makes
  "… Bread/Yogurt/Ice" product words; a genuine tradition venue that
  happens to be a bakery still passes ("Poseidon Greek Bakery" — the
  class the old vote wrongly suppressed); non-food types (museum) → `[]`.
- **bbq technique clause** (re-certifying the 2026-08-26
  smoked-dish-infers-bbq pin, which was failing on the LIVE prompt too):
  smoked meats are the technique that defines the bbq repertoire.

## 2. Certification (gold harness, ×3 all-PASS)

Harness: `scripts/prompt-gold.ts --kind=cuisine` (payload widened to
`{name, summary, types}`; old summary-only cases unchanged). Case file
grew 15 → 41: all 13 measured traps + the 2 undeterminable-tail traps
(Spaghetti Western, Pardon My French) as must-NOT pins with their REAL
staging summaries/types; must-YES Chaba Thai / Aha Indian / Gyu-Kaku /
Poseidon; 3 foreign-language cases (Phở Phong Lưu, Saigon Le Vendeur,
Bawarchi Biryani) and 2 concept cases (Pho King, Taqueria Torres) — all
verified real staging places; hybrid (Taqueria Guadalajara tex-mex →
tex-mex AND mexican); museum non-food gate. **The Texas-French-Bread
protection now lives here as a cert case**, as ruled.

| run | live (predecessor, pinned `scripts/fixtures/cuisine-prompt.v2.md`) | candidate |
|---|---|---|
| 1 | 35 PASS / 6 FAIL | **41/41 PASS** |
| 2 | 35 PASS / 6 FAIL | **41/41 PASS** |
| 3 | 35 PASS / 6 FAIL | **41/41 PASS** |

Zero FLAKY, zero regressions; 6 fixes over live (Texas French Bread, the
smoked-bbq pin, and the 4 foreign/concept name cases live cannot see).
Results: `scripts/fixtures/cuisine-gold.name-judge.run{1,2,3}.result.json`.

## 3. Validation sweep (dry-run, zero writes, staging read-only)

Rederived the measurement's flagged set live from staging (cuisine-vocab
word at a word boundary in an active place name): **623 places / 689
(place, word) pairs** (vs the measurement's 652/719 — dedupe-merge and
evidence-heal jobs were writing concurrently; counts approximate as
briefed). Plus a 100-place random control and 20 foreign/concept-name
places. ~1,730 judge calls total (incl. certs), ledger ≈ $0.40
(3.8M in / 21k out tokens on the Lite tier; ≈ $0.70 BigQuery-real at the
known ~1.7x under-metering) — far under the $3–5 budget.

### Trap scoreboard — 15/15 correct (old lane: 13/15 wrong pre-vote, 2/15 wrong post-vote)

| trap | judge output | verdict |
|---|---|---|
| Tocabe, An American Indian Eatery | native american | ✓ no `indian` |
| Texas French Bread | [] | ✓ no `french` |
| French Quarter Grille | cajun | ✓ |
| Roman's | new american, italian | ✓ no `roman` |
| Go Greek Yogurt | [] | ✓ |
| Great American Cookies | [] | ✓ |
| All American Bagel & Barista Co | [] | ✓ |
| Culture An American Yogurt Co | [] | ✓ |
| MEXICAN DOGGIS | [] | ✓ |
| Western Yunnan Crossing Bridge Noodle | yunnan | ✓ no `western` |
| Jägerhaus German Mediterranean | german | ✓ no `mediterranean` |
| Jeremiah's Italian Ice | [] | ✓ |
| The Great British Baking Company | [] | ✓ |
| Spaghetti Western | italian | ✓ no `western` (sweep) |
| Pardon My French | no `french` | ✓ (gold cert ×3; place absent from today's flagged set) |

Including the two residuals the OLD architecture could never fix
(Western Yunnan, Spaghetti Western).

### Flagged-set accuracy vs the 98% baseline

Of 689 pairs, the judge emitted the name's word verbatim in 528 (76.6%).
The 161 non-emissions, categorized:

| category | pairs | reading |
|---|---|---|
| trap correctly suppressed | 15 | the wins the old lane couldn't have |
| refined/equivalent tradition emitted instead | 67 | "DAM-A Korean BBQ" → korean; "Bep Saigon Asian" → vietnamese+chinese; the judge's answer is the FINER, correct signal (the measurement itself called these vocabulary gaps, not errors) |
| diet word → attribute, not cuisine | 50 | `halal` — principled per the TRADITION TEST; the old lane wrongly filed halal as a cuisine |
| format/posture word dropped | 3 | izakaya/fusion bare |
| residual disagreement | 26 | read by hand below |

The 26 residuals, hand-read: ~20 are CORRECT suppressions of the same
product/proper-name grammar the measurement identified but did not count
(Ralph's/Marino's/Gelatoro Italian Ices, Brooklyn French Bakers, French
Connection, American Flatbread/Cut brand words, the African-American
museum, Bad Roman → italian, Kaia → south african refinement). Genuine
losses ≈ 6 pairs: "Cousin Louie's Italian American" emitted the
hyphenate `italian-american` without its parents (hybrid-law slip on a
non-gold shape), `basque` dropped at Le Basque (Google agrees with the
judge), "Shanghai Chinese Restaurant" → cantonese (level swap),
Ululani's Hawaiian Shave Ice (product-word reading of an arguable
tradition claim), Mediterranean Foods / Borderless European Market
(groceries judged empty — defensible). **Net: ~683/689 ≈ 99.1% correct
vs the old lane's 98.2%-with-13-traps-wrong** — matches-or-beats, with
every trap right.

### Control (100 random places)

63/100 nonempty output; of the 46 with existing cuisine evidence, 40
overlap it and the 6 disagreements are refinements (southern vs
american, middle eastern vs the `halal` mis-filed as cuisine, new
american vs american). No hallucinated-tradition class observed.

### Foreign/concept names (20)

20/20 sensible; every pho/cơm/taquería/biryani name resolved to the
right tradition, including ungrounded name-only places ("Pho Binh" →
vietnamese, "Taqueria Gramercy" → mexican) that today carry NO cuisine
knowledge at all — the net-new win class.

## 4. What was deleted / changed

- `venue-cuisine-evidence.service.ts`: the entire `venue_name` lane
  (matcher, museum gate, name-lane report fields). The **dish_set lane
  stays** — different, deterministic signal, nightly phase unchanged.
- `place-attribute-projection.ts`: the whole name-vote clause
  (corroborated-or-unopposed SQL) — plain union of active evidence
  again. The archived-neither-corroborates-nor-opposes law survives as
  the union's active-only join (pinned by a new integration test).
- `google-place-type-attributes.ts`: `PRODUCT_VENUE_KIND_ATTRIBUTE_NAMES`
  deleted (no remaining consumers; its spec blocks removed).
- `llm.service.ts`: `extractCuisineFromSummary(summary)` →
  `extractVenueCuisineFacts({name, summary, types})`.
- `restaurant-cuisine-extraction.service.ts`: the judge is asked whenever
  a name or summary exists (i.e. always, for real places); the
  no-evidence defer branch survives only for degenerate rows (F4948).
  **Input fingerprint now hashes (name, summary, types, prompt)** — a
  rename or this very change reruns the extraction.
- Specs updated: `venue-cuisine-evidence.spec.ts` (dish-set only),
  `venue-cuisine-lanes.integration.spec.ts` (dish-set + archived-id +
  dry-run), `restaurant-cuisine-extraction-no-evidence.spec.ts`
  (name-only place IS judged; degenerate row still defers). Backfill
  script `backfill-venue-cuisine-evidence.ts` reduced to dish-set.
  Texas French Bread moved from the projection spec to the gold pins.

## 5. Backfill / recompute plan (DESCRIBED, not run — iteration phase)

The fingerprint change is the whole trigger: no script needed beyond the
existing rails.

1. The cuisine-extraction reconciler re-enqueues every place; the
   fingerprint gate sees the new (name, …, prompt) shape and recomputes.
   Places WITH a prior extraction (~5,230 on staging) rerun; places with
   NO record (~3,100, incl. the name-only class the old flow skipped
   forever) are judged for the first time.
2. Each completed extraction replaces its own `cuisine_llm` /
   `editorial_llm` evidence rows and re-projects — corrections (Texas
   French Bread etc.) reach search immediately, and the ~109
   "unopposed-name" places the dead lane would have served now get their
   cuisine through the judge instead.
3. Cost estimate (measured, not guessed): sweep averaged ~2.2k input /
   ~12 output tokens per call on the Lite tier. ~8,340 staging places ≈
   18.5M input tokens ≈ **$1.9 ledger / ~$3 BigQuery-real** for a full
   staging recompute. No Places spend (no re-grounding).
4. The `dish_set` lane is untouched and still awaits the knowledge-v2
   backfill to populate.

## 6. Verification

- `yarn build` green; `yarn invariants` 43/43 green.
- Targeted tests: 38 suites / 252 tests green (restaurant-enrichment +
  reddit-collector); DB integration spec 3/3 green.
- Boot smoke on :3999: /health healthy (database+redis healthy).
  Pre-existing, unrelated: `SOURCE TABLE ROW COLLAPSE` alarm fires on
  boot against the local corpus (SourceTableCollapseAlarm; present
  before this change).

## 7. Open concerns

1. **Hybrid parents on hyphenates outside gold** ("Cousin Louie's
   Italian American" → `italian-american` without `italian`) — one
   sweep case; a gold pin + prompt nudge would close it next iteration.
2. **Honest umbrella words** (`asian`, `dim sum`) are replaced by finer
   traditions — usually better, but search parity for umbrella filters
   depends on the (separate) hierarchy question the lanes report already
   flagged.
3. `halal` moves from cuisine to attribute wherever the judge rules —
   consistent with the TRADITION TEST, but existing `halal`
   cuisine-facet evidence from other sources remains; a facet cleanup is
   an owner call.
4. The judge now runs on EVERY place (names always exist): steady-state
   per-place cost is unchanged, but the one-time recompute above should
   be scheduled deliberately (fingerprint gate makes it self-throttling
   per worker pass).
