# Poll/discussion gazetteer — all entity types: study (2026-08-30)

Owner question: does the campaign work (word-role facet / Word Hearings, junk-name
work, reject verdicts, the courts) mean the gazetteer can link ALL entity types in
poll threads and discussions? Read-only study; measured on staging.

## 1. Where the limitation actually lives (and what it actually is)

The memory "we limited it to dishes and restaurants" is **stale**. Today the poll
scan links **4 of the 5 types** — the only excluded type is `ingredient`.

- `apps/api/src/modules/polls/polls.service.ts` — `highlightCommentSpans()`
  (~line 1330): scans `[place, item, item_attribute, place_attribute]` via
  `entityTextSearch.scanForKnownEntities`, engine-territory-scoped to the poll's
  place. This one method feeds comment posting/editing AND the graduation
  backfill (`poll-graduation.service.ts` `finalizeGraduation` re-runs it).
- Same 4-type list appears three more times in `polls.service.ts` (~1337-1340,
  ~1892-1895 creator-description scan, ~1916 endorsement projection).
- Discussions surface (`restaurant-mentions.service.ts`) doesn't scan at all —
  it reads stored `entitySpans` + `core_restaurant_entity_signals`, so it
  inherits whatever the scan links.
- Search, by contrast, scans **all 5** (`GAZETTEER_UNDERSTAND_TYPES`,
  `search-query-interpretation.service.ts:171`).

## 2. The original decisions (git archaeology)

| When | Commit | Decision |
|---|---|---|
| 2026-06-18 | f1363e204 | Gazetteer born for polls: `[restaurant, food]` only ("dishes and restaurants" — the remembered fear-driven limit) |
| 2026-06-30 | 2dc8f6fa6 | Attributes added: `[restaurant, food, food_attribute, restaurant_attribute]` |
| 2026-07-07 | 4d8cd9dfa | `ingredient` type created **explicitly excluded** from "dish autocomplete/siblings/polls by construction" — never a dish surface |
| 2026-07-25 | schema comment | Owner ruling JOINED ingredient to autocomplete (discovery surface); polls stayed excluded |
| 2026-08-02 | R14 (7dc77f8d9) | Rename to place/item vocabulary; list unchanged in substance |

So the open question reduces to: **can `ingredient` join the poll scan, and is
the 4-type scan itself now safe enough** given the campaign?

## 3. Protections: what's in the shared scanner vs search-only

Already active in polls (they live in `scanForKnownEntityGroups`, shared core,
`entity-text-search.service.ts`):
- **Territory scoping** for `place` (poll's covering engine; §13).
- **Fold symmetry + locale-blind exact grounding + diacritic admission**
  (2026-08-12/13 rulings): a plain typing cannot ground an accent-bearing
  foreign surface ("my" never grounds vi "Mỹ"→american; "can" never grounds
  "căn"→wheat gluten). This kills the entire Vietnamese-shadow class — the
  single largest wrong-class in the raw data below.
- **One claims registry** (label lane-4 removed 2026-08-07; junk-label class
  structurally gone), **longest-match spans**, **deterministic single winner**
  by caller type order.

Search-only, NOT in polls:
- **Word-role frame gate**: frame-only spans dropped ("best" can't ground the
  Best ghost restaurant), frame words never seed residue/demand; browse mode;
  first-search sync hearing. Polls' scan consults none of this — today a poll
  comment "best tacos" links "best"→the ghost place entity if it's active.
- Residue linker / dense lanes / facet-ranked placement (search planning
  concerns; polls don't need them — a poll span is display+aggregation, not a
  filter).

The word-role verdicts are **data, not search code**: staging `claim_verdicts`
lane `word-role` holds **64,868** verdicts (frame 4,580 / venue-category 1,706 /
particular 58,582), served by `lnService.roleOf` — reusable
from polls for a cheap in-memory read.

## 4. Measured dry-run (staging, read-only)

Staging has **0 poll comments** and only templated poll descriptions, so the
sample is 50 real Reddit comments from `collection_source_documents`
(60–350 chars — the same register as poll-thread prose). The scan's three
indexed arms were replicated in SQL (identity_key / lower(name) /
entity_surface.form_folded, active, role<>'display'), then longest-match dedup +
single-winner applied. Approximation caveats: no territory scoping, no diacritic
admission — so those two protections are credited explicitly below.

172 hookups, hand-judged:

| Type | Hookups | Right | Wrong | …diacritic-refused by real scan | …frame-word (word-role fixes) | …junk surface/ghost (cleaner fixes) | …residual collisions |
|---|---|---|---|---|---|---|---|
| place | 59 | 33 | 26 | 0 | 8 (best×4, think×4) | ~8 (Best ghost, islands→Gracie's, post→Vezzo, eat it, burger joint wrong-entity, halal, the view, love) | ~10 (Due, Wild, Heaven, York, The Door, masa, spumoni, tea, history, Lake) |
| item | 63 | ~44 | ~19 | 5 (cơm×3, đá, sắn) | 2 (food×2) | ~5 (austin, #2×2, la, pay→pie es-plain) | ~7 (classic, shot, sub, italian×2, duck, lunch) |
| ingredient | 18 | 6 | 12 | **11** (căn×6, mề×4, hẹ) | 0 | 0 | 1 (salt in "the Salt place") |
| item_attribute | 9 | 8 | 1 | 0 | 0 | 1 (sweet in "Sweet Leaf") | 0 |
| place_attribute | 23 | ~12 | ~11 | 7 (Mỹ→american) | ~2 (restaurant, music) | 0 | ~2 (familiar, pretty) |

Verified against staging surfaces: 'căn/hẹ/mề/Mỹ/cơm/đá/sắn/lòng' are all
accented vi rows the real scan's foreign-strict arm refuses for plain typings;
'best'→Best(place) and 'think'→Think Coffee are live und recall surfaces;
'islands'→Gracie's Diner is a junk alias.

**Effective wrong counts in the REAL scanner today** (subtract diacritic column):
place 26, item 14, ingredient **1**, item_attribute 1, place_attribute 4.
**After the word-role gate is ported**: place 18, item 12, ingredient 1.
**After junk-name cleanup** (399-surface census hearing + ghost janitor —
`plans/dormant-systems-audit.md` items 1+3: 'Best' is still active, janitor cron
off, census feeder never committed): place ~10, all of them legit single-word
restaurant names colliding with prose ("The Door", "Wild") — partially mitigated
in polls by territory scoping (a place-anchored thread only matches its engine's
places) and low-stakes by surface (a span is a tappable highlight, not a filter).

**The headline surprise: `ingredient` — the one excluded type — is the CLEANEST
type in the real scanner** (1 wrong of 7 effective hookups in the sample; its
raw wrongs are entirely the vi-shadow class the diacritic law already kills).
The over-linking fear attaches to `place`, which polls have linked since day one.

## 5. From-scratch rederivation of the ideal shape

One shared scan core (exists), per-surface policy = {types, role gate, winner
order, placement}. For polls/discussions ideal:

1. **All 5 types in the scan** — the type list is a policy input, and no honest
   derivation excludes ingredient: it's the highest-precision type, users
   discuss ingredients constantly ("the brie and green apples"), and signals/tags
   aggregation already handles arbitrary types (`PlaceMentionTagDto.type` is
   `EntityType`; nothing downstream is 4-type-shaped).
2. **The word-role frame gate belongs in the shared consumer path, not just
   search** — a frame verdict is a fact about a word, not about searching. Port
   the same rule search uses: drop grounded spans made entirely of frame-ruled
   units (`lnService.roleOf`; verdicts already banked; no
   sync hearing needed — comments can queue unheard words for the nightly
   hearing and simply not link them yet).
3. **Winner order** stays caller-declared: `[place, item, ingredient,
   item_attribute, place_attribute]` (place first — poll threads are
   place-anchored; ingredient after item so "carne guisada" stays a dish).
4. **No confidence thresholds** — the scanner is exact/closed-set; its
   correctness lever is data hygiene (owner ruling 2026-08-02: junk grounding is
   a DATA defect; no stop-lists), which is exactly what the courts + cleaner +
   reject-at-birth now enforce at the source.

## 6. Work items

| # | Item | Size |
|---|---|---|
| 1 | Add `EntityType.ingredient` to the 4 type lists in `polls.service.ts` (highlight, description scan, endorsement projection ×2) | XS |
| 2 | Port the frame-span drop into `highlightCommentSpans` (roleOf over span units; drop frame-only spans) — fixes 'best'/'think'/'my'-class wrongs polls have TODAY | S |
| 3 | Run the junk-place drain first: commit the 399-surface census feeder + arm the entity-lifecycle janitor so 'Best'-class ghosts die (dormant-systems-audit items 1+3, owner-gated) | S (mostly already built) |
| 4 | Decide the ingredient tap-target UX (spans deep-link — where does an ingredient go? autocomplete precedent says a discovery surface exists) | owner call |
| 5 | Re-run this dry-run as a certification once real poll comments exist | XS |

## 7. Recommendation

**Yes — the ideal state is reachable, and mostly already true.** Enable
`ingredient` in the poll scan now (it is measurably the safest type; its scary
class is already dead in the shared scanner). But the honest finding is
inverted from the fear: the over-linking that matters is in `place` and is
**already live** in polls — and its two fixes are exactly the campaign's own
machinery: (a) port the word-role frame gate to the poll scan (removes ~8/26
place wrongs incl. the Best ghost), (b) finish the junk-name drain (census
hearing over the 399 single-word ghost surfaces + turn on the janitor; removes
~8 more). Do items 2+3 with or before item 1; the residual (~10 legit
single-word restaurant names in a 50-comment sample, territory-scoped in
practice) is the irreducible cost of a closed-set scanner and is acceptable for
a highlight surface.
