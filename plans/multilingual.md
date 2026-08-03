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
4. A successful dense catch is BANKED AS A CANDIDATE pairing
   (query→concept); it becomes a real tagged alias only after
   recurrence or the LLM-judge gate (the dedupe judge) approves —
   trust through repetition or judgment, never one keystroke.
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
