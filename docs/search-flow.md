# Search, end to end — the complete data flow (read 2026-08-30)

Every stage below was read line-by-line by the coordinator (interpretation
1467/1467, service 3617/3617, builder 2030/2030, sibling expansion 417/417,
concept compiler 150/150, expansion + text-search lanes; executor read at
the executeDual level — it is mechanical: build both SQL texts, run in
parallel, parse). File pointers inline.

## Stage 1 — UNDERSTAND (query text → grounded entity ids)

search-query-interpretation.service.ts. Zero per-search LLM (cutover
2026-08-02; the old sync-LLM ladder is deleted — it, not an embedding, is
the thing that was "replaced").

1. `analyzeQuery` runs ONCE: script, locale (surface-locale oracle),
   tokens.
2. GAZETTEER SCAN: exact/alias surface matches over all 5 entity types
   (restaurant arm territory-scoped to the viewport's engine).
3. WORD-ROLE facet: frame words (best/top/near me) never ground alone;
   all-frame queries = BROWSE MODE (unfiltered ranked serve). First-search
   sync hearing for unheard words (≤1.5s budget, once per word ever).
4. RESIDUE (uncovered token runs): probed through the UNIFIED LINKER —
   one retrieval over all types; exact anywhere beats non-exact
   everywhere; otherwise calibrated per-tier fuzzy floors
   (evidence-admission.ts); the DENSE EMBEDDING tier exists here but only
   for non-English/non-Latin queries (the "camarones"→shrimp lane) and it
   LINKS (query word → one concept), it never widens.
5. Unresolved residue: ≤2 tokens → on_demand_ask signal immediately; 3+
   tokens → staged for the async residue-splitter LLM cron. Frame words
   never seed demand.
6. Placement of a grounded span: facet rank first (dietary > cuisine),
   then type order. Compounds keep their decomposed parts as extra
   grounded readings (maximal linking; containment-guarded).

## Stage 2 — PLAN (ids → constraints), search.service.ts

For DISH subjects, widening ALWAYS runs at plan time (pre-probe seed,
sibling-expansion reader, one memoized resolution per request):

- category-edge members (derived_food_category_edges) — tier 0, "IS it";
- name-containment variants (head-final: carbonara udon IS carbonara);
- twin-ingredient union (burrata the dish ∪ dishes containing burrata);
- judged SATISFIES edges (tier 0) and cousins (ring) — entity_satisfies,
  ITEM-ONLY today, directed, one hop;
- dense siblings (precomputed embedding mutual-rank edges) — only with
  the Include-similar chip ON; otherwise they ride as the tier-2 ring,
  counted and auto-filled only when the page can't fill.

ATTRIBUTES AND INGREDIENTS now have their own satisfies widening (built
2026-08-30 per the owner's sameness-and-widening ruling; EDGES PENDING
OWNER REVIEW — the docket ran dry-run only, so until edges are applied
this machinery reads an empty set and every search behaves exactly as
before):

- At plan time (executePooledStage) every grounded plain attribute id is
  resolved through `getSatisfiesAttributeArms` (one hop over
  entity_satisfies, relation='satisfies' only, DIRECTED from the asked
  word, redirect-following, fail-open, H6-memoized). Each widened id
  becomes an EXTRA OR-ARM of the SAME concept ("bar" = bar-id OR pub-id
  — the judged direction; the judge REJECTED pub→bar,
  `widenConceptArms`): soft concepts keep AND-across-concepts and their
  starvation key (the anchor id); attribute-only HARD walls get the
  same-column widened ids appended into the overlap (`&&`) id lists
  (cross-column targets are soft-arms-only — appending across the AND'd
  column lists would get STRICTER, the F5 failure). Dietary walls are
  never widened; cuisine keeps its own dual-home law (out of scope v1).
- Grounded ingredient ids resolve through `getSatisfiesIngredientIds`
  (same laws, asked-side only) and OR into the ingredient clause's
  existing union (evidence ∪ canon ∪ named-dish) — "bacon" also admits
  the pancetta carbonara.
- Admission only, always: ordering stays pure Crave Score.
- Edges are minted by the WIDENING COURT (WideningSatisfiesService +
  widening-satisfies-rule.ts, rule versions 2/3 in the satisfies version
  space; concept_satisfies ledger lane): attribute doctrine = the
  searcher-tolerance test (moved out of the merge doctrine), ingredient
  doctrine = culinary substitutability from the asker's side; per-
  direction verdicts, D2 carrier context, schema-forced evidence
  reasons. Governed runner: scripts/widening-docket.ts — the dry-run
  judges and writes a verdict-table JSON for owner review; `--apply
<verdicts.json>` settles EXACTLY that reviewed table (no re-judging;
  the file's sha256 is stamped on every ledger row); --gold certifies
  the rules.

## Stage 3 — ONE POOLED EXECUTION per projection (builder + executor)

Membership (hard WHERE): servable-place floor, viewport polygon/bounds,
subject foods (anchors ∪ family ∪ similar), ingredient containment
(evidence ∪ synthesized canon ∪ named-dish arm), price, open-now (a
membership predicate over derived open intervals), dietary WALLS
(asymmetric per projection — owner semantics 2026-08-04), cuisine walls
only when cuisine IS the ask (dual-home OR — never a stricter AND).

SOFT CONCEPTS (the key attribute semantics): when the query has a real
subject, every non-dietary attribute word leaves the WHERE entirely and
becomes a per-row provenance concept (concept-membership.compiler.ts —
AND across concepts, OR within one concept's arms). Each row gets a tier:
0 = satisfies every soft concept, 1 = partial, 2 = similar ring. THE GATE:
tier-1 admitted only when tier-0 can't fill one page; tier-2 only when
0+1 can't. When the attribute IS the whole ask (no subject), it stays a
HARD wall (stripping it would return the whole viewport).

ORDER IS PURE CRAVE SCORE (percentile_rank; owner law 2026-08-08: tier
NEVER orders — admission only; id anchors for determinism). matched_tags
is display-only. Restaurant admission = matching dish EXISTS or
name-praise signal; claim-identity dedup for vote rollups.

## Stage 4 — AFTERMATH

- PER-WORD STARVATION: window count per soft concept; a word with zero
  in-pool coverage fires a precise demand signal (not "few results").
- THIN/UNRESOLVED TRIGGER (< 25 tier-0 or unresolved terms): additive
  LEXICAL expansion (search-entity-expansion → searchEntitiesForTerms:
  prefix/FTS/trigram/edit — LEXICAL ONLY; "pub"→"pubs", never →"bar";
  the embedding lane `searchByEmbedding` exists in entity-text-search but
  is NOT wired into this path), then ONE re-execution. Dishes also get
  attribute-text→dish ids and (chip on) more siblings here.
- On-demand recording (viewport-eligible), search signals, coverage
  honesty (partial/unresolved), out-of-viewport message.

## The decision-relevant consequences (why this reading was done)

1. Attribute words are SOFT with a subject, HARD alone. So keeping
   near-twin attributes separate hides results completely on
   attribute-only searches, and effectively hides them on modified
   searches in data-rich viewports (tier-0 fills the page).
2. A storage merge makes both words return the union, score-ordered,
   forever (intent is not recoverable by ranking — by owner design).
3. The dish axis has a rich graded widening stack; attributes and
   ingredients NOW HAVE THEIRS (built 2026-08-30, see Stage 2 — edges
   pending owner review of the docket dry-run verdicts in
   plans/widening-system-report.md).
