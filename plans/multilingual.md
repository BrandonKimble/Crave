# Multilingual — the from-scratch shape

Status: FINAL — three red-team rounds (round 3: 2 Opus agents, verdict
REVISE, all revisions integrated below 2026-08-03; adversarial 25-query
embedding re-run included). Owner intent: the system must look as if
multilinguality was designed in from day one — re-derived, never
additive; no speculative abstraction (nothing built before its first
real consumer, but nothing built ON a foundation that could not have
been the day-one design).

Two directions, ONE architecture: (A) collection over any-language
corpora writes into one canonical concept space; (B) a day-one
non-English user reads out of it (UI, queries, displayed data) against
today's English corpus. The pivot is the concept layer.

## THE CORE MODEL: concept ≠ label ≠ surface (three things, three stores)

- CONCEPT: the entity row — an opaque id + stable internal slug.
  Never rendered to users.
- LABEL: what a user SEES — per-locale, ranked, curated or generated:
  a real relation `entity_labels(entity_id, lang, form, is_default,
rank)`. Built when the first non-English market arrives; English
  labels are implicit (= name) until then.
- SURFACE/ALIAS: what users and corpora SAY — the existing
  `aliases text[]` recall bag. Feeds retrieval only, NEVER display.

RULING (round 1, the #1 rotten-foundation find): aliases and labels
must never fuse. The alias array is merge-polluted BY DESIGN (dedupe
folds losers' names in — three code sites) and untagged; it is the
right structure for recall and the wrong one for display. The original
plan's "language lives in aliases" was half right: SURFACE forms live
in aliases; DISPLAY forms live in labels. Corollary: the label
producer is a separate offline translation pass writing entity_labels
— NEVER a relaxation of the translation bans (the dish-knowledge
prompt's ban at llm.service.ts:~1649; the extraction prompt is a
versioned llm_prompts DB row — read the active row, no source line can
cite it), which would write translations into the recall bag and
cement the fusion.

RULING (homographs): when multilingual aliases arrive they carry a
language tag (alias rows or a tagged structure), and the gazetteer's
alias arm filters by request locale — Spanish "pan"(bread) vs English
"pan" at confidence-1.0 exact match is a silent mis-grounding
otherwise.

## VERDICTS on the originally recorded section (what round 1 broke)

1. "Gemini interpretation reads Spanish; aliases just help" — WRONG:
   the 08-02 cutover deleted the sync LLM from the query path; the
   gazetteer exact-lookup IS the Understand. "tacos vegetarianos"
   silently drops the dietary constraint (fails looking like success);
   "pulpo" can mint a twin concept via on_demand — concept forking
   through the QUERY door. Materializing multilinguality into ROWS is
   the actual engineering problem; "the prompt handles it" is not.
2. "Attributes are a closed set (~dozens)" — WRONG: 574 active
   attribute concepts (59 cuisines + 515 open tail), LLM-minted free
   text, 76% churn. And the real display surface is 8,272 concept
   nouns (5,610 foods + 2,088 ingredients + 574 attributes) — a
   PIPELINE, not an afternoon.
3. "Aliases support multilingual forms" — mechanism HOLDS (gazetteer
   reads aliases at query time; 0.95 resolution tier; autocomplete
   exact) but content is 100% English and NOTHING PRODUCES translated
   surfaces (extraction bans translation; no user write path) — the
   producer must be designed, not assumed.
4. "Dish names are proper nouns" — restaurant names yes; dish names
   are generated English noun phrases and the primary product surface.
5. Latent assets confirmed: gemini-embedding-001 is multilingual and
   already embeds aliases; FTS is to_tsvector('simple') — language-
   neutral already; the identity fold is language-agnostic (shipped).

## THE DISH RULING

Dishes and restaurants are SOURCE-FAITHFUL surface forms, never
translated at write time — food culture does not translate (birria,
banh mi, pho live untranslated in the English corpus). Cross-language
equivalence (pulpo/octopus when they genuinely denote one dish) is a
JUDGE-GATED MERGE aided by multilingual embeddings — the word-order-
twin machinery, never forced normalization. Dish DISPLAY labels for
other locales are per-locale entity_labels rows produced by the
existing offline knowledge-synthesis pass — banked, never
translate-on-read on the hottest surface.

## NOW — stop the rot (each justified by TODAY'S English corpus)

N1. FOLD SYMMETRY (a live bug, not i18n): the gazetteer matches
lowercased raw tokens while identity holds folded keys — 1,714
active entities (≈23% of restaurants: Despaña, Harry's-with-curly-
apostrophe, Phở Hoài) are unreachable by their obvious typed form.
Fix: fold BOTH sides with canonicalFold; add curly apostrophe to the
tokenizer char class. HONEST SIZE (round-3): names can match against
the existing identity_key column, but ALIASES HAVE NO FOLDED MIRROR —
a folded-alias column/index is part of this fix; a migration, not a
one-liner.
N2. UN-PIN PLACES from language:'en' (two call sites): every day it
runs it bakes anglicized renderings into permanent, expensive,
never-deleted restaurant rows — corrupting the very proper nouns
the plan promises to preserve. Request the location's language.
N3. QUARANTINE the remaining `[a-z0-9]` normalizers — real targets ~4
(entity-resolution.types slug, ontology grouping keys, one
unified-processing site, enrichment) → the \p{L}\p{N} shape; they
annihilate the 355 non-ASCII names already in the graph. Do NOT touch
the ASCII-correct SQL-identifier guards (signals act/subject identity,
ballot marker) — those are deliberately ASCII-only.
N4. P3 PROMPT RULE (corrected): CONCEPTS normalize cross-language
(picante→spicy) + surface banked as alias; DISHES stay source-
faithful. Verification fixture exercises BOTH forking doors
(extraction AND query/on-demand).
N5. RESIDUE-LANGUAGE GUARD: an unresolved query token resolves-or-
parks; on_demand may not mint twin concepts from raw foreign
strings. (Query-door half of N4's fixture.)
N6. DE-MATERIALIZE English sentences: curated_lists title/subtitle
(and poll_topics.title) render from recipeKey+params at read time.
PARTLY DONE (recipe_key already exists on curated_lists); full
completion blocked on entity_labels for the attribute display word —
do the render-from-recipe move now, accept English labels until M2.
N7. LANGUAGE PACK #1 (consolidation, not speculation): food-lemma +
the head-final rule's THREE duplicated encodings (identity,
sibling-expansion SQL, singularish()) move behind one LanguagePack
interface with exactly one implementation. English morphology
leaves the inside of identity and becomes the English pack.
N8. Ruling P2.3 formally splits the vocabulary: CLOSED SPINE (59
cuisines + curated dietary + occasions + price levels — the
filterable concepts) vs OPEN TAIL (everything else).
N9. ICU COLLATION on user-facing ORDER BY name surfaces — DEMOTED
back toward market by round-3: nearly every such ORDER BY is a
TIEBREAKER behind score/count; the only primary alphabetical sorts
are place/city names (ASCII today). Correct in principle, low
present-day harm; do it opportunistically or at M8.
N10. CONCEPT IDENTITY LOCKDOWN (round-3 promotion from M2 — the
foundation most likely to make future-us curse present-us): attribute
identity IS the English display string today, and the LLM ontology
worker RENAMES display strings. The rename-identity-drift bug is
FIXED in code (rename now updates identity_key/identity_key_sorted in
the same statement), but the LAW still has no enforcement: add a
stable slug written at mint and never rewritten, plus a
lockdown-shaped spec (the extraction-scope-lockdown pattern)
asserting no read surface renders a concept name outside an
allowlisted display layer. Cheap at 574 attributes; archaeology at
8,272 renamed nouns. ALSO: the ontology rename demotes the old
DISPLAY name into the alias bag — record provenance (or stop
demoting) so label history is not laundered through the untagged bag.

## FIRST NON-ENGLISH MARKET — the market checklist (build then)

M1. Locale on the wire: client sends Accept-Language/profile locale;
API negotiates and threads it; caches carrying rendered text key
on it. (Today: locale is captured at device auth and read by
NOTHING.)
M2. entity_labels relation + per-locale label tables for the SPINE
(hand-curated/LLM-drafted, genuinely an afternoon per language) + for
the TAIL a NIGHTLY UNLABELED-CONCEPT SWEEP (round-3 revision,
replacing mint-time drafting: a batch pass over concepts lacking
labels for active locales — judge-gated, retry-able, covers past AND
future with ONE mechanism, and never couples concept minting to the
active-locale set; the ontology adjudicator's PASS-3 naming call is
the fallback seam if sweep latency ever matters). Explicit unlabeled
fallback = English slug; market-bound terms like `under $100` localize
currency, not words.
M3. Language-tagged alias rows + locale filter on the gazetteer alias
arm (homograph guard) + per-locale surface seeding for the spine.
PRICED HONESTLY (round-3): the untagged array has THREE read arms
(gazetteer GIN overlap, the FTS generated tsv column, the nightly
SymSpell delete-dictionary) and FOUR writers (dedupe fold, ontology
merge/rename, extraction banking, dish-knowledge LLM) — tagging is a
migration touching all of them, and an untagged shadow array is on the
NEVER list. Existing rows back-tag wholesale as lang='und'.
LABELS DOUBLE AS MATCH SURFACES (owner question 2026-08-03: "does the
tail work for a day-one Spanish user?"): the nightly label sweep's
entity_labels rows are tagged and judged — the gazetteer's match arm
READS them as exact surfaces alongside aliases. One generated table
serves display AND matching for all 515 tail attributes ("acepta
mascotas" → pet friendly) with no per-entity alias explosion. Reading
a second tagged store is not the forbidden fusion — the ban is on
WRITING labels into the untagged bag. Query-coverage anatomy, for the
record: constraint words = the seeded spine (Zipf-heavy, tiny set);
dish words = source-faithful names + dense (both proven); tail
attributes = label rows via this arm; leftovers = dense + the
self-teaching loop, all gated at launch.
M4. DENSE ADMISSION TIER (round-3 correction: NOT a flag flip). The
lane exists but dense candidates are structurally unselectable — the
linker's decider reads only sparseSimilarity and LINK_ELIGIBLE_EVIDENCE
excludes 'embedding' (the ham/rum guard). M4 = a second admission path:
dense tier, its own swept cosine floor + margin, gated on
non-English/no-sparse-evidence queries; insertion point confirmed at
search-query-interpretation.service.ts:253-260. The embedding call is
~free; the CALIBRATION is the work — a wrong answer can outscore a
right one (тако→tako 0.821 vs taco 0.751).

EXPERIMENTS, both run against the live index:

- 2026-08-02 (n=15, single-word dishes, es/fr/ja/zh/ko): 15/15 top-5,
  10/15 rank-1. pulpo→octopus, 章魚→octopus, tacos de birria→birria
  tacos; pan dulce found its own source-faithful entity.
- 2026-08-03 ADVERSARIAL (n=25: compound, negation, homographs,
  code-switching, misspellings): 22/25 top-5, 15/25 rank-1. VERDICT:
  dense de-risks SINGLE-CONCEPT non-English search only. Named failure
  classes, now known-red seeds for the launch gate: Latin-script
  homograph (es "pan" → zero bread in top-5); cross-script homograph
  (ru тако → ja tako/octopus at the set's HIGHEST confidence); negation
  (ramen sin cerdo → vegan ramen — silently inverted); foreign-named
  restaurant capture (sin gluten → the restaurant "Senza Gluten");
  compound constraints blended away (tacos vegetarianos baratos cerca
  → vegetarian taco, baratos+cerca dropped — fails looking like
  success).

M4b. LANGUAGE-AWARE QUERY DECOMPOSITION (round-3 gap, new item): dense
returns ONE blended neighbour list; it cannot decompose multi-
constraint queries. English gets decomposition from the n-gram
gazetteer scan; a Spanish query matches no n-grams and falls whole
into one dense probe. The market build needs script/language detection

- per-language span decomposition IN FRONT of the dense arm (seeded
  spine aliases give the gazetteer its Spanish n-grams; dense handles
  the remaining spans — decomposition is mostly alias coverage plus
  detection, not new NLP machinery). M6's Intl.Segmenter (CJK word
  boundaries) is a different problem and does not cover this.

M4b THESIS TESTED 2026-08-03 (mirror, real scanForKnownEntityGroups,
seeded aliases in/out): BASELINE "tacos vegetarianos" grounds only
[tacos] — the constraint drops silently, as predicted. After seeding
TWO alias rows (vegetariano, vegetarianos) on the vegetarian concept:
"tacos vegetarianos" → [tacos→tacos][vegetarianos→vegetarian] — the
EXISTING chopper decomposed the Spanish query with ZERO code changes.
Instructive miss: "pizza vegetariana" stayed ungrounded because the
feminine form wasn't seeded — Spanish gender/number morphology IS the
alias-coverage problem (language pack #2's morphology or fuller alias
forms), exactly as the plan claims. Remaining non-alias slice:
directive words (baratos/cerca → price/proximity) need spine mappings
to the existing filter directives, not entity aliases. VERDICT: M4b =
alias coverage + language detection + directive vocabulary; no new
NLP machinery. Confirmed empirically.

MARKET-LAUNCH GATE (the checklist's former biggest omission): a
stratified ≥150-query native-graded set per launch language — 40
single-noun, 30 compound, 20 negation, 20 attribute-not-dish, 20
homograph, 20 code-switched. Thresholds: ≥95% top-1 overall; 100%
negation non-inversion (wrong worse than none); ≥90% constraint
preservation measured on the PARSE; zero homograph mis-groundings at
confidence ≥0.95 in the spine. Known-red seeds (pan, тако, ramen sin
cerdo) stay in the set until green.

M5. Dish display labels via a SIBLING pass of knowledge synthesis
(round-3: the existing pass WRITES INTO aliases and its prompt bans
translation — reusing its writer would be the exact label/alias fusion
the NEVER list bans). New prompt + writer targeting entity_labels,
sharing only the batching harness; the labels relation itself is the
watermark (NOT EXISTS per locale — never a second timestamp column).
M6. Segmenter capability per script (Intl.Segmenter for ja/zh/th);
fuzzy-tier floors re-derived for short CJK names.
M7. Mobile i18n retrofit (a scoped project: ~600+ multi-word strings
across 190 tsx files, ICU templates for concatenations, RTL
logical styles ~800 sites, locale-driven Intl formatting,
relative-time; zero scaffolding exists today).
M8. Locale-arg localeCompare + locale-aware formatting; MT-on-read
for quotes (original shown — the one vendor-MT surface); language
pack #2 (morphology+stopwords).

## SCOPE OF LABEL/ALIAS GENERATION (owner question, 2026-08-02: "will

## the LLM create per-language rows for EVERY entity?" — NO)

Per-language rows are generated for CONCEPTS, not for the entity graph:

- SPINE (~60 filterable concepts + 59 cuisines): seeded per language up
  front. LLM-drafted, human-skimmed — an afternoon per language.
- TAIL attributes: label drafted AT MINT TIME for active locales only —
  the same pipeline that mints "co-fermented" drafts its Spanish label
  in the same breath. Seeding covers the past, mint-time covers the
  future; no third bucket exists to fall behind.
- RESTAURANTS (~7k): NEVER. Proper nouns.
- DISHES (~5.6k): NEVER pre-generated. Dish names are source-faithful;
  cross-language MATCHING rides the multilingual embeddings + the
  judge-gated alias banking below; cross-language DISPLAY (if a market
  wants it) is lazy/on-demand via the knowledge-synthesis pass for the
  dishes that actually surface, never a bulk 5,610×N translation run.

THE SELF-TEACHING LOOP (query-side, replaces any per-query LLM):

1. Seeded/tagged alias rows answer common words instantly and free.
2. Mint-time generation keeps new concepts covered as they are born.
3. The language-gated dense (embedding) fallback catches whatever has
   no row yet — slang, regional words, one-offs.
4. A successful dense catch is BANKED AS A CANDIDATE pairing in ITS
   OWN relation keyed (normalized_term, lang, entity_id) with a
   confirmations counter — NOT on_demand_request (that is a collection
   queue: banking there would trigger unbudgeted crawling for terms we
   already answered, and its engine-scoped key would stop the loop
   compounding across cities). The lang tag comes from SCRIPT +
   LANGUAGE DETECTION OF THE QUERY STRING with device locale as a
   prior only, both recorded (a Spanish-locale phone types English
   constantly — a fabricated tag would poison both languages'
   retrieval with no rollback). Promotion to a real tagged alias
   requires recurrence AND the LLM-judge gate (round-3: OR let query
   spam and popularity drift — the quesabirria problem — write
   permanent aliases with no semantic check).
5. Understanding therefore COMPOUNDS: the vector net handles less over
   time, rows handle more, and no per-query LLM ever returns.

## CONSIDERED AND REJECTED: the translation gateway

## ("translate every query/request to English at the edge, keep the

## whole backend English-only")

A real industry pattern, considered explicitly. Rejected because:

1. It IS the per-query LLM/MT re-introduced — rent, latency, and a new
   failure point on every search, forever; nothing is ever learned.
2. MT is WORST exactly on our input shape: 1-3 word culture-bound food
   queries with no sentence context. "pan" (Spanish) has no tag inside
   a translator — the homograph problem moves somewhere we cannot fix
   it, instead of somewhere we can (tagged rows + known user locale).
3. Food terms often must NOT translate: MT that renders "birria" as
   "stew" destroys precision on precisely the queries that matter most.
   Our dense fallback "translates by MEANING" without forcing a literal
   English string — same capability, no destruction.
4. It only replaces the cheapest half. Display (labels, UI, quotes)
   still needs the label/locale machinery anyway, and collection over
   non-English corpora can't ride it at all (translating source docs
   before extraction destroys source-faithful dish names and quotes).
5. Strictly dominated: the chosen design already contains the
   gateway's one good idea (meaning-level bridging via embeddings) but
   as owned, compounding data instead of perpetual per-query rent.

ALSO REJECTED (round 3): per-market/per-language indexes — the
corpus is already bilingual where the food culture is (pan dulce,
camarones, birria live in the "English" index); splitting would sever
exactly those rows from the queries that want them and make cross-
language merges cross-index. Dense-only-no-aliases — 60% top-1 on the
adversarial set is not a product, and embeddings cannot express
"this exact string means this concept at confidence 1.0".

## NEVER

- Translating dish/restaurant names at write time.
- Per-language entity forks (one concept, many labels).
- A second fold implementation (SQL or otherwise).
- Labels written into the alias bag; untagged multilingual aliases.
- Per-request MT on hot surfaces.
- Building M-items before a market exists (N-items are all justified
  by today's corpus).

## Open questions for the owner

- Ingredient unique index is on raw name (uq_entities_ingredient_name)
  — fine while single-language; the M2 labels design must revisit.
- Scoring under mixed-language corpora: per-source calibration is
  per-community ≈ per-language, so language mix should be isolated for
  free — verify during the first market's shadow run.

---

## CORRECTION 2026-08-03 (truth audit F1234–F1236) — appended, nothing above altered

This is the most numerically honest of the 2026-08 plans — the corpus counts
reproduce EXACTLY on the mirror: 8,272 concept nouns (5,610 food + 2,088
ingredient + 574 attribute), 574 attributes splitting 59 cuisine / 515 open
tail, ~7k restaurants (6,848 active), 1,714 unreachable entities (1,715
measured), 355 non-ASCII names. N1 (gazetteer matches lowercased raw tokens
while identity holds folded keys) is CONFIRMED STILL BROKEN — `canonicalFold`
appears in the entity-resolver files and in **zero** files under
`modules/search/` or `modules/entity-text-search/`. N2's "two call sites"
pinning Places to `language:'en'` is exact (`google-places.service.ts:452`
and `:632`). Three corrections:

- **F1234 — the extraction-time translation ban citation is wrong.**
  "`llm.service.ts:1660`" does not hold that ban; the only `translate` string
  in that file is at **`:1649`**, inside the DISH KNOWLEDGE-SYNTHESIS prompt
  ("never invent, shorten, pluralize, or translate yourself"), not the
  extraction prompt. Extraction prompts are versioned DB rows in `llm_prompts`
  (migration `20260801130000`), so no source line can cite the extraction ban —
  read the active prompt row instead.
- **F1235 — "the ~20 remaining `[a-z0-9]` normalizers" is stale.** 8
  occurrences across 7 non-spec files today. The work is smaller than stated.
- **F1236 — internal inconsistency: N3 says "340 non-ASCII names", N9 says
  "355".** 355 is correct (measured on the mirror 2026-08-03).

One half-landed item the doc does not flag: N6 says `curated_lists`
title/subtitle store English sentences — true, but `recipe_key` ALREADY
exists on that model (`schema.prisma:2525`), so N6 is partly done.
M4's 15/15 cross-lingual result and the M7 string counts were not re-run
(they need live embedding calls); the index size is consistent with a
2026-08-02 measurement plus a day of growth.
