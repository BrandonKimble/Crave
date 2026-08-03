# Multilingual — the from-scratch shape

Status: round-1 red team complete (2 Opus agents + self-audit); round-2
verdict pass: self-run with spot-check verification (both Opus agents
hit the session usage cap mid-verdict — re-run them after reset only if
the owner wants belt-and-braces; every load-bearing number below was
re-verified first-hand: 1,714 unreachable entities, both Places
language pins, denseMode:'none', stored English titles). Owner intent: the
system must look as if multilinguality was designed in from day one —
re-derived, never additive; no speculative abstraction (nothing built
before its first real consumer, but nothing built ON a foundation that
could not have been the day-one design).

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
— NEVER a relaxation of the extraction-time translation ban
(llm.service.ts:1660), which would write translations into the recall
bag and cement the fusion.

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
Fix: fold BOTH sides with canonicalFold (fold query candidates;
match against identity_key/pre-folded aliases); add curly
apostrophe to the tokenizer char class. One fold, both sides of
every comparison — the multilingual precondition that is also
today's recall bug.
N2. UN-PIN PLACES from language:'en' (two call sites): every day it
runs it bakes anglicized renderings into permanent, expensive,
never-deleted restaurant rows — corrupting the very proper nouns
the plan promises to preserve. Request the location's language.
N3. QUARANTINE the ~20 remaining `[a-z0-9]` normalizers (ontology,
resolution types, enrichment, slugs) → the \p{L}\p{N} shape; they
currently annihilate the 340 non-ASCII names already in the graph.
N4. P3 PROMPT RULE (corrected): CONCEPTS normalize cross-language
(picante→spicy) + surface banked as alias; DISHES stay source-
faithful. Verification fixture exercises BOTH forking doors
(extraction AND query/on-demand).
N5. RESIDUE-LANGUAGE GUARD: an unresolved query token resolves-or-
parks; on_demand may not mint twin concepts from raw foreign
strings. (Query-door half of N4's fixture.)
N6. DE-MATERIALIZE English sentences: curated_lists title/subtitle
(and poll_topics.title) store recipeKey+params, rendered at read
time — English stops being data.
N7. LANGUAGE PACK #1 (consolidation, not speculation): food-lemma +
the head-final rule's THREE duplicated encodings (identity,
sibling-expansion SQL, singularish()) move behind one LanguagePack
interface with exactly one implementation. English morphology
leaves the inside of identity and becomes the English pack.
N8. Ruling P2.3 formally splits the vocabulary: CLOSED SPINE (59
cuisines + curated dietary + occasions + price levels — the
filterable concepts) vs OPEN TAIL (everything else).
N9. ICU COLLATION on user-facing ORDER BY name surfaces (round-2
self-verdict promotion from MARKET: the C.UTF-8 byte sort
mis-orders the 355 non-ASCII names in TODAY'S corpus — Despaña
sorts after Zebra in Austin lists now, not in some future market).

## FIRST NON-ENGLISH MARKET — the market checklist (build then)

M1. Locale on the wire: client sends Accept-Language/profile locale;
API negotiates and threads it; caches carrying rendered text key
on it. (Today: locale is captured at device auth and read by
NOTHING.)
M2. entity_labels relation + per-locale label tables for the SPINE
(hand-curated, genuinely an afternoon per language) + mint-time
label generation for the TAIL (concept-creation drafts labels per
active locale; explicit unlabeled fallback = English slug;
market-bound terms like `under $100` localize currency, not
words).
M3. Language-tagged alias rows + locale filter on the gazetteer alias
arm (homograph guard) + per-locale surface seeding for the spine.
M4. LANGUAGE-GATED DENSE FALLBACK: gazetteer+sparse miss on non-
English text → enable dense retrieval (multilingual embeddings
carry pulpo→octopus nearly free; zero English hot-path cost).
PREREQUISITE EXPERIMENT (highest-value, run before any of M2-M4):
measure cross-lingual cosine (aguacate↔avocado, pulpo↔octopus)
against the live HNSW index — it sizes how much M2/M3 lexicon work
dense recall replaces.
M5. Dish display labels via the offline knowledge-synthesis pass.
M6. Segmenter capability per script (Intl.Segmenter for ja/zh/th);
fuzzy-tier floors re-derived for short CJK names.
M7. Mobile i18n retrofit (a scoped project: ~600+ multi-word strings
across 190 tsx files, ICU templates for concatenations, RTL
logical styles ~800 sites, locale-driven Intl formatting,
relative-time; zero scaffolding exists today).
M8. Locale-arg localeCompare + locale-aware formatting; MT-on-read
for quotes (original shown — the one vendor-MT surface); language
pack #2 (morphology+stopwords).

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
