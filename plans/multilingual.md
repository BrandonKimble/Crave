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

## THE I18N BUILD PHASE (owner reframing 2026-08-03: the product goal

## is ALL major languages, like every peer app — so this is ONE

## scheduled build phase, not a per-market gate)

Nearly everything below is BUILD-ONCE regardless of language count
(labels relation, locale plumbing, dense admission tier, label-sweep
pipeline, mobile scaffolding, MT-on-read, gate harness). Each
additional language afterward is DATA, not code: a locale file, ~60
spine words, sweep-generated label rows — LLM-drafted, enabled in
batches. Genuinely per-language residue: launch-gate grading
(LLM-graded first pass, native spot-checks for major languages),
morphology packs only where the language demands one (Spanish
inflection; CJK segmentation; many languages need none), RTL for
ar/he. SEQUENCING: this phase runs AFTER the database/extraction-
prompt phase — the prompt rewrite (cross-language normalization,
spine/tail split, N-items) is upstream of everything here; building
i18n on vocabulary rules about to change would be building on sand.
The checklist:

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
- Building M-items before the scheduled i18n phase (N-items are all
  justified by today's corpus; the i18n phase follows the DB/prompt
  phase because the prompt rewrite is upstream of it).

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

---

## ROUND 4 — IMPLEMENTATION DRY-RUN + FROM-SCRATCH FOUNDATIONS (2026-08-03)

Two Opus agents: one mentally implemented every item against real code
and the mirror; one judged every foundation by "would a day-one-
multilingual team have built it this way?" Verdict: ARCHITECTURE
HOLDS (concept/label/surface, gateway rejection, M4b all survived);
IMPLEMENTABLE AS WRITTEN: NO — the items below amend the doc. Where
round 4 conflicts with earlier sections, ROUND 4 WINS.

### Code shipped from this round

- Restaurant rename now updates identity keys (same drift class as the
  ontology rename, live on ~7k rows); ontology rename uses the row's
  real type. Both committed.

### AMENDMENTS (resolved by synthesis — no owner input needed)

A1. N1+M3 UNIFY — `entity_alias` rows NOW, array becomes projection.
N1's folded-alias need has exactly one legal shape (app-written —
a SQL fold expression index is banned by our own law), and the
foundations audit's #1 cursed item is the untagged bag itself
(SEVEN writers — merge-fold ×2 verbatim copies, rename, extraction
banking + create, dish-knowledge LLM, Places enrichment, cuisine
extraction — zero provenance, feeding confidence-1.0 grounding AND
the embedding doc). Synthesis: create
entity*alias(entity_id, form, form_folded, lang, source,
confidence, created_at) NOW; all seven writers write rows;
`aliases text[]` becomes a DERIVED PROJECTION maintained by one
app writer (legal — rows are truth, array is a materialized index
input, the identity_key precedent). Read arms and all FOUR alias
indexes (GIN overlap, FTS expression, trgm haystack, per-alias
unnest) keep working untouched; provenance stops being destroyed
from day one; M3 later becomes "filter reads by lang", not a
migration.
A2. THE ANALYZER SEAM lands with N1/N7: normalize → segment → match →
fallback as ONE pipeline object with exactly one (English)
implementation, behavior unchanged — the gazetteer's 70 inlined
lines become the seam M6/M4b/M8 plug into as packs, not four
independent surgeries on one function.
A3. N10 REVISED: the SLUG is demoted to the i18n phase (entity_id is
already the immutable handle; the slug's only consumer is M2's
fallback). The lockdown's load-bearing half ships NOW: ONE display
function every read surface routes through (so M2 edits one
function, not archaeology) + the lockdown spec. Note explicitly:
identity_key is the DEDUPE PROBE KEY (must follow renames) and
must never be treated as the concept handle.
A4. N2 RESEQUENCED + RESIZED: FOUR language pins (google-places
service :548/:728 defaults — the dangerous kind — plus both
enrichment callers), not two. Must land AFTER the restaurant
rename-identity fix (shipped) and the localized displayName must
land as a tagged alias/label, NEVER overwrite `name`. Free gift:
Google already returns displayName.languageCode and we discard
it — the language tag costs nothing.
A5. ORDERING CORRECTIONS: N8 (spine/tail ratification) closes BEFORE
the P3 prompt text is written; N4/N5 are PROMPT-PHASE items
(listed NOW only as rot-stoppers riding that phase); M4b precedes
M4 (detection gates the tier); language detection runs ONCE PER
QUERY, never per residue probe (the probe loop budget is 24 —
per-probe would 24x the embedding cost the plan calls ~free).
A6. PROMPT REWRITE ADDITIONS (for the prompt phase): the extraction
prompt ALREADY emits (canonical, surface) pairs — the day-one
boundary, credit due. Add ONE schema field: `language` on
surfaces (makes the P3 dish-source-faithful rule mechanically
assertable in shadow replay instead of hoped-for). DELETE prompt
§2.2's natural-language fold rules (a FIFTH fold implementation —
lowercase/articles/apostrophes belong to canonicalFold, not the
LLM). Real morphology-encoding count is five, not three (add
singularish() and the hand-rolled levenshtein to N7's
consolidation list).
A7. N6 SPLIT: curated_lists half is CHEAPER than stated (recipe_key
100% populated, 7 families; render API-side in home-feed; the
favorites-name copy must SNAPSHOT the rendered string — user data
never becomes a recipe). poll_topics half needs an OWNER RULING:
titles mix templated and USER-AUTHORED free text with no marker —
recipes for templated, literal + source-language tag for
user-authored (user text is then a translate-on-read surface).
A8. NEW N-ITEM — ingredient unique index is on RAW name
(jalapeño ≠ jalapeno TODAY, in English): re-key to the folded
identity, same class as N1.
A9. SCORING GATE (replaces the 'verify during shadow run' punt, which
cannot catch it): per-source calibration is genuinely language-
free, but SOURCE-FAITHFUL TWINS SPLIT EVIDENCE MASS (pulpo +
octopus rows each rank below a monolingual competitor). New
launch-corpus metric: fraction of dish evidence mass on unmerged
cross-language twins, with a threshold — feeds the judge-merge
queue, not the calibrator.
A10. SIGNALS LEDGER (i18n phase, must be listed): Signal
subjectType='term' keys demand on RAW UNTAGGED text — "pulpo" and
"octopus" are two demand terms forever, on the surface that
DRIVES SPEND. Term subjects gain the same detected-lang tag the
banking loop already designs. Append-only ledgers are the hardest
keys to change later.
A11. STALE POINTERS CORRECTED: Places pins are google-places.service
:548/:728 + enrichment :3013/:3756; M4's insertion anchor is the
denseMode:'none' site (:473-475), NOT :253-260; the FTS index is
an EXPRESSION INDEX, not a generated column; derived_entity_word*
deletes HAS NO WRITER in the repo (the SymSpell fuzzy lane may be
dead — investigate before pricing M3 against it).

### OWNER DECISIONS — ALL FOUR RATIFIED 2026-08-03

D1-D4 below are RULED as recommended: D1 templated poll titles become
recipes, user-authored titles stay literal + source-language tag; D2
anglicized-name repair rides the pending Places backfill campaign as
one approved spend; D3 one shared gold-labeled query corpus
(~150/language, stratified) serves both M4 calibration and the launch
gate, LLM-graded with native spot-checks; D4 locale = Accept-Language
per request + optional user profile override, never the push-device
row. Original decision text kept below for the record.

D1. N6 poll_topics: ratify recipe-vs-literal split for titles
(user-authored stays literal + lang tag; templated becomes
recipes). Recommended: yes.
D2. N2 repair scope: are the already-anglicized restaurant names
re-enriched in native script, and at what Places cost? (Can ride
the already-pending Places backfill campaign approval.)
D3. M4 calibration + launch gate share ONE artifact: the gold-labeled
cross-lingual query corpus (~150/language, stratified). Ratify
building it once for both, and the grading model: LLM-graded
first pass + native spot-checks for major languages.
D4. M1 locale home: request header (Accept-Language) negotiated
per-request + a user PROFILE preference — never the push-device
row (a user who declines notifications has no locale today).
Recommended shape stated; ratify.

### Round-4 confidence

Architecture: unchanged, holds. Implementability after these
amendments: HIGH (the dry-run's eleven blocking decisions are
resolved above except D1-D4, which are product rulings, not design
gaps). Credit recorded: extraction's surface/canonical split, the
'simple' FTS config, the Unicode tokenizer, versioned prompts, and
recipe_key were ALREADY the day-one shape.

---

## ROUND 5 — MODERN-PRACTICE SWEEP (2026-08-03, web-researched, 2 Opus agents)

Question: "did a modern tool already solve any compromise we made?"
VERDICT: PLAN IS MODERN — independently rederived the shapes Wikidata,
Elastic, the entity-linking literature, and Uber Eats' 2026 multilingual
search paper converged on (opaque ids, label≠alias with per-alias
provenance, locale-as-prior-not-router, source-faithful documents,
dense-alongside-lexical hybrid, no pivot-language translation). Postgres
at 16k entities is 2-4 orders of magnitude below "leave Postgres"
territory; a dedicated engine would buy ONE tokenizer (Charabia for
th/km/lo — re-open M6 only if CJK/Thai becomes top-3) and cost a second
write path + sync pipeline. gemini-embedding-001 remains SOTA-tier;
CRITICALLY, no model swap fixes the five adversarial failure classes —
NevIR/ExcluIR prove NO bi-encoder handles negation, homographs are
information-theoretically absent from one-word inputs, and compound
blending is structural to single-vector retrieval. The 60% adversarial
top-1 is a correctly calibrated measurement of a task embeddings don't
perform, not a bad build.

### AMENDMENTS ADOPTED (round 5 wins over earlier sections)

R5-1. RRF FUSION for the M4 dense tier: merge dense+sparse by RANK
(reciprocal rank fusion — the 2025-26 default, parameter-free), not
by score — directly kills the тако 0.821-beats-taco-0.751 hazard of
comparing incomparable score spaces.
R5-2. M4b DETECTION SPECIFIED: script detection is a HARD gate (Unicode
ranges, ~100% reliable, zero ML — alone catches the тако cross-
script case); language detection (lingua or fastText-lid — NEVER
CLD3, the worst at 1-3 words) is a SOFT prior fused with request
locale. Latin-script one-word es/pt/it/fr is NEAR-UNDECIDABLE by
design — resolved only by locale prior + tagged rows; documented so
nobody files bugs against the detector.
R5-3. NEGATION GATE (closes the plan's one unreachable threshold —
100% non-inversion had NO mechanism): tier 1 is a RULE-BASED
negation-cue detector per language (sin/no/without/senza/ohne — a
closed ~10-word list) that FAILS CLOSED: on a cue, drop the dense
arm, return the un-negated head with the constraint surfaced in UI,
never silently inverted. Free, and sufficient for the non-inversion
clause. Tier 2 (recorded as the sanctioned upgrade path, built only
on measured need): Flash-Lite constraint extraction on the SUBMIT
path only (~$0.05/1k queries at 2026 pricing — the cost objection
behind the 08-02 cutover no longer holds at this price; the
latency + keystroke-path bans stand untouched). Constraint
extraction is NOT the rejected translation gateway: it emits
{dish:"birria", dietary:null}, never renders birria as stew.
R5-4. TYPE-AWARE ADMISSION in M4: constraint-shaped spans must not
ground to restaurant proper nouns (the "sin gluten"→"Senza Gluten"
capture was a type-confusion, not a negation failure).
R5-5. LOCALE KEYS ARE FULL BCP 47 (decide BEFORE the A1 entity_alias
migration — key changes in append-only stores are the A10 failure
mode): es-MX/es-AR/es-ES diverge on exactly food vocabulary
(torta, palta/aguacate); zh-Hans/zh-Hant is unrecoverable from bare
zh. RFC 4647 lookup fallback (es-MX → es-419 → es); the sweep fills
regional rows only where they differ; detected tag and request
locale stored separately (already designed).
R5-6. WIKIDATA-LEARNED FIELDS added to M2/M3 schemas BEFORE the sweep
runs over 8,272 concepts: (a) a per-locale short DESCRIPTION
(labels collide — pan needs a disambiguator; the sweep drafts it in
the same call; also sharpens the judge-merge gate); (b) alias
STATUS enum (candidate/active/deprecated) — the loop needs a
DEMOTION path so a judge-rejected pairing is remembered as wrong
instead of re-proposed by query spam forever.
R5-7. THREAD REQUEST LOCALE INTO THE DENSE QUERY INPUT (Uber Eats
2026: an explicit search-language field, citing "'pan' in Spanish
vs English" verbatim) — not just the alias-arm filter.
R5-8. M7 MODERNIZED: react-i18next + i18next-icu (ICU MessageFormat 1)
named explicitly; MessageFormat 2 recorded as a deliberate 2027+
deferral (TC39 Stage 2, ~zero adoption). String extraction and the
~800 RTL sites are MACHINE-DRIVEN + reviewed (i18next-cli localize
/ jscodeshift class tooling; NativeWind auto-flips its classes —
measure the Tailwind-vs-StyleSheet split before pricing): budget
review time, not typing time (~2-5x scope reduction).
R5-9. HERMES INTL GAPS: Intl.Segmenter and Intl.PluralRules do NOT
ship in Hermes — M6 segmentation is SERVER-SIDE by declaration;
client plural handling needs @formatjs/intl-pluralrules (+
unicode-segmenter if ever needed on-device).
R5-10. LABEL JUDGE UPGRADED: MQM-style score/error-span output (not
boolean) with an auto-approve threshold + review queue; MULTI-
SAMPLE CONSENSUS judging for the spine and single-word terms
(single-judgment noise is worst exactly on short context-free
strings). Matches 2026 TMS practice (Lokalise AIQE / GEMBA-MQM).
R5-11. M8 PINNED: MT cache key = (source_text_hash, target_locale);
Google NMT default ($20/1M chars, ~$0.004 per 1k snippets), LLM
mode by exception.

### Standing validations worth keeping

Uber Eats (six markets) ships source-faithful documents + multilingual
embeddings + hybrid retrieval + explicit search-language field — our
architecture, at the largest food-search scale there is. Wikidata's
label/alias/search split is our trichotomy. The one capability class
we deliberately lack (cross-encoder reranking) is the acknowledged
ceiling of retrieval-only stacks and is what R5-3 tier 2 exists for.

---

## BUILD LOG (i18n phase, started 2026-08-04 — as-built corrections)

WAVE 1 SHIPPED (foundation + mobile scaffolding):

- entity_alias/entity_labels landed per A1/R5-5/R5-6; EIGHT alias
  writers existed, not seven (poll-entity-seed creates restaurants via
  buildRestaurantCreateInput); all route through one projection writer;
  21,585 legacy rows backfilled; the invariant registry caught the new
  FK columns and its guard was classified — the meta-machinery works.
- A8 AS-BUILT CORRECTION: ingredient uniqueness keys on identity_key,
  NOT identity_key_sorted — the sorted key is deliberately coarse and
  collides on 60+ live NON-duplicate ingredient pairs (orange bitters /
  bitter orange). 4 genuine violator groups archived with redirects.
- Ontology rename demotion now writes the old display form as a
  'deprecated' alias row — R5-6b's demotion memory, landed a phase
  early because the writer conversion made it free.
- VIETNAMESE JOINED THE FOLD: 47 precomposed tone-marked chars added
  (WS1 caught that 'pho hoai' could never reach Phở Hoài); mirror
  healed (10 entities, 16 alias rows).
- Mobile scaffolding live: react-i18next + ICU MF1 + Hermes plural
  polyfills; Accept-Language on every request; RFC 4647 lookup;
  3 core screens fully keyed; es.json drafted native-register.
  R5-8 CORRECTION: NativeWind is UNUSED in the app (className ×0,
  StyleSheet ×83) — RTL is codemod+triage over ~149 unambiguous +
  ~566 triage sites, under the 800 estimate but with no auto-flip
  discount. Onboarding's constants file (~64 literals) + the shared
  option labels are the remaining string debt; option labels are M2
  concept-label territory, not M7.

### Wave 2/3 as-builts (2026-08-03/04)

- **WS5b red team — ten findings, every one EXECUTED before the verdict**
  (F1 lost-update in the alias projection → FOR UPDATE serialization;
  F2 seeded es aliases grounded for ENGLISH requests → locale filter on
  both alias arms, tagged rows excluded absent a request locale; F3 the
  Vary header CLOBBERED CORS's `Vary: Origin` → merge-never-set; F4 the
  detector overruled explicit request priors on 15% of an English probe
  set → DETECTOR_OVERRULE_PRIOR=0.5 placeholder; F5 excludedSpans +
  queryAnalysis now thread to response metadata — the gate grades them;
  F6 the share-link poll localizes via `getPoll(pollId, locale)`;
  F8 blank-label totality — trim floor in `displayLabel` + a DB
  `CHECK (btrim(form) <> '')`; F9 ruled moot — recents replay the
  user's own text; F7 DEFERRED with a recorded shape: the durable
  lockdown is a type-level `LocalizedName` brand, not a regex spec;
  F10 string-debt: display `t()` on data-bearing suggestion tokens).
- **Gate-driven fixes G1-G3**: weak fuzzy links no longer pre-empt the
  dense tier on non-English queries (dense arbitrates and REPLACES —
  this was the 19-red cause of run 1); sub-4-char spans refuse fuzzy
  evidence ("sal"→salsa class); entity_labels became a locale-filtered
  match arm of the gazetteer.
- **Launch-gate scoreboard** (150-query es gold corpus, run 3, real DB
  and real interpretation path): overall 78%; **negation non-inversion
  100% GREEN (the HARD clause)**; **homograph mis-groundings
  @conf≥0.95 = 0 GREEN**; code-switched 100%; single_noun 77.5%;
  compound 50%; attribute 70%. Two parent rulings shaped the gold:
  compositional source-faithful groundings (camarones → "camarones
  enchilados") are CORRECT single-noun outcomes (`allowCompositional`),
  and exact English NAME matches (tuna, pie) are correct for ANY
  request locale in an English-corpus market.
- **Why the remaining reds are data, not machinery** — proven by the
  floor sweep: rank∈{3,5,8} × cosine∈{0.68,0.70,0.72} moved single-noun
  accuracy NOT AT ALL (62.5-65% pre-ruling). The tail is (a) morphology
  — "vegetarianos"/"japonés" are unseeded inflections of seeded forms:
  language-pack territory, per-locale inflection expansion at seed time;
  (b) tail labels — the sweep's generator is still the Noop; the real
  generator run is a market-checklist item. The M4 floors REMAIN
  placeholders; the sweep-flatness finding says calibration needs a
  labeled set with dense-tier-reachable cases, which the judge-banking
  loop produces in operation.
- **Verification state**: full suite 1,489 pass / 1 fail — the failure
  is FOREIGN (another session's configuration-readers keys), named not
  touched. Commits: 7511f0479 (wave 2), 9053822c3 (spine aliases),
  8199074c7 (wave 3), 68d0fdc6d (F8 migration).

### Red-team round (2026-08-04) — 5 agents + self, all against the live DB

**The feature did not work in production.** The deepest finding: `interpret()`
passed only `analysis` to the gazetteer, but the SQL locale filter read the
SEPARATE `options.requestLocale` — so `requestBaseLang` was always `''`, the
tagged-alias and labels arms never fired, and `interpret('asiatica','es')`
grounded NOTHING. The launch gate DID pass `requestLocale`, so it had been
scoring a call path production never makes (the "77.5%" was measured on a path
prod's users don't hit, propped up by a fig-leaf gate branch). This is the
canonical "instrument the composite, and make sure it can show RED" lesson,
re-learned one level up: the gate's own call diverged from prod's.

**Fixes shipped (commit 88f04d3cf), each rederived to a primitive, not patched:**

1. **One locale authority.** `analysis.requestLocale` is now the single source
   both the gate and `interpret()` feed; the divergent `options.requestLocale`
   locale-carrier is gone.
2. **The fold is a Unicode primitive.** `canonicalFold` was a ~100-char
   hand-maintained accent map whose stated justification (a byte-mirror of a DB
   `crave_fold`) no longer existed — the SQL mirror was abandoned in the
   ideal-shape pass. It silently minted twins on DECOMPOSED (NFD) input
   (iOS/macOS deliver NFD), on every accent absent from the list (pinyin ǎ/ǐ,
   Czech ď, fullwidth), and on zero-width/format-control injection
   (`ta<ZWSP>co`). Replaced with `NFKD → strip the combining-diacritic BLOCKS
(not \p{M}, so CJK voicing パ≠ハ and Thai/Devanagari/Arabic vowel signs
survive) → NFC → closed non-decomposable table → delete format-controls`.
   **0 identity_key / 0 form_folded drift on the live corpus** — a pure
   improvement, no re-key. The attack battery is frozen as
   `canonical-fold.spec.ts`, a standing guard.
3. **One locale-match primitive.** The grounding SQL used
   `split_part(locale,'-',1)` (symmetric first-subtag equality) while display
   used RFC-4647 Lookup — they disagree the moment a region/script subtag means
   something (`pt-BR` grounds a `pt-PT` row but renders English; `zh-Hant`
   grounds `zh-Hans`). New `localeLookupChain()` emits the ordered Lookup set
   both paths share; SQL matches `LOWER(locale)=ANY(chain)`. Also DROPPED the
   legacy `aliases` GIN arm — the untyped, UNLOCALED shadow that re-grounded
   seeded es forms for English (F2 reopened one arm over); `entity_alias` is a
   proven complete superset (0 of ~19.3k array forms absent, local AND prod).
4. **The gate made honest.** `compositionalHit` accepted a restaurant-name
   substring ("Camarones El Güero" passed "camarones") and "repollo" (cabbage)
   for "pollo" (chicken), and read a `foldedName` field that was never
   populated. Now: food/ingredient type only + whole-token folded match +
   the fields are on the interfaces (tsc checks them). Empty strata print
   `N/A`, never a vacuous GREEN (`pct(n,0)` returned 100).
5. **Dense floors no longer read `process.env` per call in shipped code** — a
   stray `DENSE_SWEEP_*` Railway var silently moved prod admission. Resolved
   once at load, gated behind `!isDeployedEnv`, and it announces itself.

**Honest gate on the real prod path:** single_noun 75.0%, compound 50%,
attribute 70%, homograph 85%, negation + code_switched 100%; overall 77.3%;
negation non-inversion 100% GREEN (HARD), homograph@conf≥0.95=0 GREEN.

### PRINCIPLED BACKLOG (found-and-proven, not yet fixed — each with its primitive)

Ranked by leverage. These are real, executed findings from the round; recorded
so the class, not the instance, gets fixed.

- **Derived keys are unversioned/unreconciled (HIGH).** Changing the fold forks
  the corpus silently; a hostile/drifted `form_folded` is unowned (the DB can't
  check an app-side fold). PRIMITIVE: a reconciler script that recomputes
  `canonicalFold` over `core_entities` + `entity_alias`, rewrites drift, and
  reports mismatches (runnable in CI/cron; the mutation proof is a planted
  hostile row). A `fold_version` stamp makes a fold change a data migration.
  (Not urgent now: current drift is 0.)
- **Locale is unvalidated free text (HIGH).** `xx-KLINGON`, `ES`, `es_MX`, a
  100-char tag are all accepted and become permanently invisible to the filter
  (a write that costs money and returns nothing). PRIMITIVE: canonicalize +
  validate at the single write ingress (`Intl.Locale` / `canonicalizeLocaleTag`,
  reject-or-`und`) + a DB CHECK on tag shape.
- **`deprecateForms` matches JS `toLowerCase` vs SQL `lower()` (HIGH).** They
  disagree on Turkish İ, so demotion silently no-ops on such forms. PRIMITIVE:
  every predicate over a surface uses the stored `form_folded`; SQL never
  applies `lower()`/`btrim()` to identity-bearing text.
- **`entity_labels` non-blank CHECK is ASCII-only `btrim` (MED/HIGH).** NBSP /
  U+2007 / U+200B labels are admitted and render an invisible entity name.
  PRIMITIVE: one `isDisplayable` predicate over `\p{L}|\p{N}` at label WRITE +
  a DB CHECK using `regexp_like(form,'[\p{L}\p{N}]')`.
- **NFC/NFD duplicate alias rows (MED).** The unique index is over raw `form`;
  an NFD and NFC spelling of one surface both survive. PRIMITIVE: `normalizeForm`
  applies `.normalize('NFC')` at intake so byte-identity is enforceable.
- **Analyzer: two script tables + a duplicated detector allowlist (MED).**
  `SCRIPT_RANGES` (10) and `scriptPinned` (5) disagree, so Arabic/Cyrillic/
  Devanagari reach dense with NO locale prefix to the embedder; `DETECTOR_
CANDIDATES` is a second literal that can drift from `LANGUAGE_PACKS`.
  PRIMITIVE: one script table `{script, test, pinnedLang?}`; `DETECTOR_
CANDIDATES = [...LANGUAGE_PACKS.keys()]`; `baseLanguage` via `Intl.Locale`.
- **Dense floors are uncalibrated placeholders (MED).** The known-bad
  тако→tako scores 0.821 > the 0.72 floor and IS admitted at defaults. Cannot
  be honestly calibrated without a labeled dense corpus (needs the market).
  PRIMITIVE: a `dense-calibration.generated.ts` from a gold-corpus sweep with a
  provenance header, exactly as the linker already has — the socket
  (`DENSE_SWEEP_*`, now dev-gated) exists; the sweep does not.
- **Negation cues shred proper nouns / fail open on a typo / drop on truncation
  (MED).** "no name burgers" excludes "name burgers"; a misspelled "sin" grounds
  the negated term; the 48-token cap silently drops a trailing negation.
  PRIMITIVE: decide negation JOINTLY with the name arm (suppress a cue that
  participates in a grounded name span), edit-tolerant cue matching, and a
  `truncated:true` fact on the interpretation so a dropped constraint is never
  silent.
- **Coarse identity_key false merges (MED, by design, under-instrumented).**
  "soup dumplings"/"dumpling soup", "orange bitters"/"bitter orange" share a
  probe set; foods/restaurants have NO unique index on identity_key. PRIMITIVE:
  separate the serialization key from the adoption key (order-sensitive tiebreak
  before adopt) + a monitored count of coarse groups whose members differ under
  the strict key.

### Backlog burndown + list census (2026-08-04, second red-team pass)

Answering the owner's question "are we maintaining non-exhaustive lists?": a
whole-codebase census found the i18n text lists are almost all
CLOSED-and-defensible (each carries a defending comment — NON_DECOMPOSABLE is
finite, SCRIPT_RANGES uses `\p{Script}` escapes, negation cues fail-closed by
design, food-lemma/stopwords are DB-validated). The real open smells were
write-ingress ABSENT primitives and two Google-Places hand-lists.

**FIXED this pass (commits f22f47675, 3bc4fa6c1):**

- **One surface-write ingress primitive.** `normalizeSurface` (NFC + strip
  format-controls) + `isDisplayable` (\p{L}|\p{N}, app-side/platform-stable) +
  `normalizeLocaleTag` (Intl.Locale validate/canonicalize) now guard BOTH the
  alias and label writers. Kills: NFD/NFC duplicate rows, invisible
  (zero-width/NBSP) names that passed JS `.trim()` AND SQL `btrim()`, and
  free-text locale tags (`xx-KLINGON`, `es_MX`, 100-char) that landed as
  writes the match filter silently drops.
- **deprecateForms** now matches on the app-written `form_folded`, not
  `lower(form) = ANY(js-lowercased)` — the JS-vs-Postgres lowercase mismatch
  that silently no-op'd the ontology-rename demotion on Turkish-İ forms.
- **Places SKU billing drift** is now guarded: `takeout` (a live under-metered
  Atmosphere field) tiered, an explicit ESSENTIALS floor, a runtime
  `unclassifiedPlacesFields` warning, and a coverage spec that fails RED if a
  request mask gains an untiered field.
- **PREFERRED_PLACE_TYPES** (a 64-entry third hand-copy of the Google-type
  namespace) replaced with `Object.keys(map) ∪ {'restaurant'}` — proven equal,
  drift now impossible.
  > CORRECTION (coordinator plans-audit) 2026-08-08: outlived by three days.
  > Commit `990ab0306` ("the type set dies entirely — zero type judgments
  > remain") deleted the whole preferred/restaurantish type set from the
  > grounding lane; `PREFERRED_PLACE_TYPES` and `isRestaurantishPlaceTypes`
  > have zero hits in `apps/api/src` today. The judge reads raw Google types
  > as evidence instead. Nothing derives the set anymore — there is no set.

**Still open (recorded, each with its primitive):** fold-version reconciler
(derived-key ownership; drift currently 0 so not urgent); analyzer's two script
tables → one table with a `pinnedLang` column + `DETECTOR_CANDIDATES` derived
from `LANGUAGE_PACKS` + `baseLanguage` via `Intl.Locale`; dense-floor
calibration (needs a labeled corpus → needs the market); negation decided
JOINTLY with the name arm; coarse identity_key adopt-guard.

**Owner call (surfaced, not shipped):** `GOOGLE_PLACE_CUISINE_TYPE_MAP` is an
open list of world cuisines whose N+1 (ethiopian/peruvian/…) falls to the LLM
lane. Its values are mechanical (`x_restaurant → x`) but the cuisine-vs-format
classification is editorial — inverting the default (unknown `_restaurant` ⇒
cuisine) would change cuisine-extraction behavior, so it's your call.
