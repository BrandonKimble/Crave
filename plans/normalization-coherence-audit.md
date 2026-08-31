# Normalization coherence audit — apostrophes, folds, and every seam (2026-08-30)

Owner question: is text normalization "an uncoordinated mess of previous
strategies"? **Verdict: no — since the 2026-08 fold consolidation there is ONE
canonical fold law with per-consumer documented variances. 13 seams audited:
11 COHERENT, 2 MISMATCH(accepted, deliberate + documented), 0 live
MISMATCH(fix).** The Rudys/Rudy's twin class was NOT a fold mismatch — it was
two *gates* that ignored the fold (root cause below), both already fixed.
No code edits were required by this audit.

## The one fold law

`canonicalFold` in
`apps/api/src/modules/content-processing/entity-resolver/entity-identity.ts`
is the single implementation: NFKD → delete invisibles (\p{Cf}, soft hyphen,
variation selectors) → strip combining-diacritic blocks (not CJK voicing) →
NFC → lower → closed non-decomposable table (ß→ss, ø→o, đ→d …) → strip
apostrophes (straight + curly, post-NFKD so fullwidth U+FF07 folds too) →
every other non-letter/digit run → one space → trim. Versioned
(`FOLD_ALGORITHM_VERSION`, `fold_version` column, drift check + invariant
hash pin). Siblings in the same file, same code path: `diacriticFold`
(accent-preserving twin; `diacriticFold(x) !== canonicalFold(x)` IS the
"carries accent evidence" predicate), `normalizeSurface` (display normal
form: NFC + Cf-strip + whitespace collapse, keeps case/accents),
`entityIdentityKey` (food/ingredient adds per-token lemma-min + sort).

## Mechanism table

| # | Mechanism | Normalizations | Consumers |
|---|---|---|---|
| 1 | `canonicalFold` | full fold above | `identity_key` (all entity creates via `identityInsertData`), `entity_surface.form_folded` (written ONLY in entity-surface.service), text-search exact/prefix/trgm arms, gazetteer scan, demand-vocabulary, teaser surface arm, dedupe grouping, name-containment edges, denied-name registry, business-identity-rules (`+ strip leading "the "`) |
| 2 | `diacriticFold` | fold minus accent strip | accent-evidence tiers (`admitsAtExactTier`, resolver tiers, mint veto, `accentsAgreeUnbanked`), keyword ledger (`keyword-term-normalization` — deliberate: đầu≠dầu) |
| 3 | `normalizeSurface` | NFC, Cf-strip, ws collapse | stored `form` of aliases/labels (display side of every surface row) |
| 4 | `normalizeSpanMechanically` (place-name-contract) | NFC, lower, curly→straight apostrophes/quotes, ws collapse — KEEPS apostrophes, hyphens, diacritics | v17 extraction refusal check (`observedSpanAppearsInSource`, both sides) + `canonicalizeObservedPlaceName` (adds trailing-location-token drop only) |
| 5 | ingredient contract folds (same file) | #4 + diacritic fold + hyphen fold + head-token number variants + bound-morpheme | `ingredientSpanAppearsInSource` only; place side untouched (deliberate, v17 loop3) |
| 6 | `entityIdentityKey` token sort/lemma | fold + per-token variant-closure min + sort | item/ingredient identity + locks; `food-lemma` variants also feed `identityProbeNames` |
| 7 | SQL `lower(name)` arms | case only | typed-exact rank bonuses in text-search suggest/resolve, teaser name arm, attr-name teaser arm — always PAIRED with (or beside) a fold arm for recall |
| 8 | `COLLATE "C"` pair keys (food-dedupe, attr merge) | none — collation pin on LEAST/GREATEST of ids | dedupe docket pair identity; not a text fold at all |
| 9 | Google Places fetch | raw `entity.name`, trimmed only | autocomplete + searchText fallback → chooser candidate set |

## Seam verdicts

1. **Extraction span ↔ cited source text** — COHERENT. One function
   (`normalizeSpanMechanically`) on both sides; possessive-clitic variance
   (`Rudy's`/`Rudys`/`Rudy'`) explicitly licensed (`possessiveVariants`),
   word-boundary anchored.
2. **Extraction canonical name → resolver adopt probe** — COHERENT NOW;
   historically the minting seam (see root cause). Probe ORs byte-name
   (case-insensitive) with `identityKey IN canonicalFold(probes)`
   (entity-resolution.service.ts:815-828), deterministic owner pick, accent
   evidence guard.
3. **identity_key ↔ form_folded** — COHERENT: both app-written by the same
   function; never compared against SQL `lower()` (demand-vocabulary comment
   states the law; N1 fold-symmetry comments in text-search).
4. **Query tokenizer ↔ fold deleted-set** — COHERENT by construction:
   `FOLD_DELETED_*` regexes exported from entity-identity and consumed by
   query-analyzer (`foldDeletesEntirely`); each n-gram's folded text ==
   canonicalFold of its raw slice (pinned in gazetteer-spans specs). The
   F4/F5 harry's/ZWSP defect class is closed at the shared definition.
5. **Gazetteer exact tier ↔ surfaces (accents)** — COHERENT: one admission
   rule (`admitsAtExactTier`, per-token accent evidence + banked-plain-form
   arm) shared by search AND ingestion (2026-08-12 unification).
6. **Curly vs straight apostrophes end-to-end** — COHERENT: staging holds
   165 active place names with curly apostrophes; fold strips both; a
   straight-typed query reaches a curly-stored surface via form_folded.
   Verified no active fold twins survive beyond the 7 owner-held folds.
7. **Dedupe grouping ↔ fold** — COHERENT: exact-fold lanes group on
   identity_key and consult `accentsAgreeUnbanked` before treating a
   collision as identity (restaurant-entity-merge:653, food-dedupe:571-579).
8. **COLLATE "C" pair keys** — COHERENT: an ordering pin, not a fold; no
   text comparison rides on it.
9. **`lower(name)` SQL arms** — MISMATCH(accepted): they are typed-exact
   *rank bonuses* or legacy narrow arms sitting beside fold-armed recall
   (teaser resolveItemIds comment says exactly this). Worst case: a
   curly-apostrophe name misses a cosmetic exactHit bonus; recall unharmed.
10. **Keyword ledger on `diacriticFold`** — MISMATCH(accepted, documented):
    accent-preserving on purpose so đầu/dầu stay separate ledger rows while
    identity_key still folds them for locks.
11. **Ingredient contract folds diacritics/hyphens, place contract doesn't**
    — MISMATCH(accepted, deliberate): places keep diacritics because the
    span must literally appear in the source; possessive variance is the one
    licensed drift. Documented in place-name-contract.
12. **Google candidate fetch (raw name)** — COHERENT: Google's own matching
    is fold-tolerant; proven from the real 08-20 breadcrumb — query "Rudys"
    returned "Rudy's Country Store and BBQ" / "Rudy's \"Country Store\" and
    Bar-B-Q" branches (see grounding report addendum).
13. **Chooser name comparisons (LLM, raw both sides)** — COHERENT:
    apostrophe/possessive drift judged correctly, pinned by the
    `rudys-r1-market-anchor…` gold case (10/10 ×3 cert).

## Twin-class root cause (Rudys/Rudy's, Joes/Joe's, Vincents/Vincent's — the 32 merged)

**The fold was never wrong; two gates ignored it.**

- Staging evidence: every twin loser was minted 2026-08-10/12 beside a
  grounded winner that had held the identical `identity_key` for months
  (Joe's Bakery active since 06-01; "Joes Bakery" minted 08-12 05:41 UTC —
  149 place mints in one 05:41–06:40 batch). The identity-key adopt probe
  landed in commit f1e1770d4 at 08-12 02:33 UTC — *hours* before that batch,
  which ran a pre-probe binary. Before it, the adopt probe was
  case-insensitive BYTE equality: "Rudys" could never see "Rudy's" even
  though both rows already carried identity_key `rudys`.
- The twins then *survived* because the nightly dedupe's exact-fold lane
  gated membership on item-row support (`activeSupportExistsSql`) — twin
  members with only mentions/locations were dropped before grouping
  (grounding-fix-report R2), and staging's scheduler is off besides.
- Both gates are fixed: probe consults the fold (08-11), sweep admits every
  active fold twin with the D5 shell-hold law (08-30). 32 merged; the only
  surviving active exact-fold twins are the 7 owner-held folds.

## Fixes applied / queued

- **Applied: none needed** — no live fix-grade mismatch found; the cheap
  mismatches all turned out to be already-fixed or documented-accepted.
- **Queued (small):**
  - `lime butter` — one active *item* pair with byte-identical names and the
    same identity_key (staging census): a race twin that predates or slipped
    the coarse lock; food-dedupe exact-fold lane should eat it — verify next
    nightly, or fold-only sweep it with the reload.
  - The `lower(name)`-only rank arms (seam 9) could someday be moved to
    `identity_key = canonicalFold(term)` for exactHit symmetry — cosmetic,
    not urgent.
  - `TRAILING_LOCATION_TOKENS` lexicon growth remains an owner call per
    metro (v17 F2), flagged here per the fresh-eye rule.

## Full punctuation matrix (owner expansion, 2026-08-30)

Method per class: fold behavior probed on the built fold (`node` against
dist), then a staging census of active names/surfaces containing the class,
then a reachability judgment from plausible query forms.

| Class | Fold behavior | Staging rows (active names) | Verdict |
|---|---|---|---|
| ASCII hyphen `-` | → space ("Bar-B-Q" → `bar b q`) | 391 | COHERENT — query side folds identically; hyphen/space/nothing drift beyond that is trgm's job (ingredient contract additionally folds hyphens, deliberate) |
| Unicode dashes ‐‑–— | → space, all forms converge | 8 | COHERENT |
| Curly/straight quotes ‘’“” | apostrophes DELETED (both forms); double quotes → space; extraction contract normalizes curly→straight | 165 curly-apostrophe names | COHERENT (seam 6 above) |
| Angle/CJK quotes «»‹›「」『』【】 | → space | 0 | COHERENT (no exposure) |
| Ampersand `&` | → space (`Salt & Time` → `salt time`) | **530** | **MISMATCH(structural, queued)** — see below |
| "and"/y/et word forms | kept as tokens; no &↔and equivalence anywhere | — | part of the same queued item |
| Abbreviation periods (St., Dr., Mt., Ft. …) | period → space (`St. Philip` → `st philip`) | 28 | COHERENT mechanically; St.↔Saint EXPANSION is semantic, not a fold's job — queued with &/and as the equivalence-alias item |
| Slash `/` | → space (`half/half` → `half half`) | 22 | COHERENT |
| Accents/diacritics | canonicalFold strips; diacriticFold preserves; per-token evidence rule | large | COHERENT (verified again — seams 5–7 above; `phở đặc biệt` → `pho dac biet`) |
| Non-decomposable letters đ ł ø ß æ œ … | closed two-table split (letter vs spelling) | — | COHERENT (pinned in canonical-fold.spec) |
| CJK punctuation 、。・｜（） | → space; CJK voicing marks preserved (never \p{M}-stripped) | 0 CJK-punct, 2 fullwidth (`｜`, `（）`) — keys correct | COHERENT |
| Thai/Devanagari/Arabic marks | preserved (`ผัดไทย`, `مطعم الشام` fold intact, no shredding) | surfaces exist, keys correct | COHERENT |
| Numerals ① ⅷ № fullwidth | NFKD compat: ① → `1`, Ⅷ → `viii`, № → `no`, fullwidth digits → ASCII | 0 circled/roman | COHERENT (latent-correct) |
| Currency/degree $ € £ ¥ ° | → space (`85°C Bakery` → `85 c bakery cafe …`) | 4 | COHERENT with one noted edge: a user typing `85c` folds to one token vs stored `85 c` — exact tier misses, trgm rescues (similarity 0.78); 1 row, accepted |
| Trademark signs ™ ℠ | **WAS a latent defect**: NFKD decomposes to letters and GLUED them (`Wingstop™` → `wingstoptm`) | 0 rows with ™/℠ (4 with ®, which already folds clean) | **MISMATCH(fixed)** — fold v2 |
| ® © ℗ | → space (no compat decomposition) | 4 | COHERENT |
| Emoji + variation selectors | VS deleted; emoji → separator; emoji-only names → NULL identity | 2 emoji-suffixed names, keys clean (`Burger City🍔` → `burger city`) | COHERENT |
| Invisibles (ZWSP/ZWJ/BOM/soft hyphen) | deleted outright, shared with query tokenizer | — | COHERENT (seam 4) |

### Fix applied — fold v2 (™/℠ letter-glue)

`entity-identity.ts`: ™/℠ now become separators BEFORE NFKD (the only point
they are distinguishable from real letters), matching ®'s treatment.
`FOLD_ALGORITHM_VERSION` bumped 1→2 with the backfill decision recorded in
place: **reasoned deferral** — zero stored rows contain ™/℠ (staging census),
so no stored identity_key moves and check-fold-drift stays green without a
heal. `fold-version-pin.spec.ts` regenerated: all v1 vectors unchanged +
three new v2 vectors (Wingstop™, Brand℠ Café, Tiny Pies® pinning ®'s
unchanged behavior). Gates re-run green (build, 144 fold/tokenizer tests,
43 invariants/88 proofs).

### Queued (structural)

1. **&↔"and" equivalence — the largest real gap found by this audit.**
   530 active names contain `&`; only 232 have any surface containing
   " and ". A user typing "salt and time" misses `Salt & Time` at the EXACT
   tier and — more importantly — at the GAZETTEER scan (exact-fold based), so
   the restaurant goes unrecognized inside query text; trgm arms rescue plain
   search recall (similarity 0.71 ≥ threshold) but not the gazetteer.
   Fold-level `&`→` and ` is the wrong shape (English-biased — the same name
   class is y/et/und per locale; and it moves 530 stored keys). The house
   shape is SURFACE COVERAGE: mint the "and"-form alias (locale-appropriate)
   at surface-write/census time for `&` names, exactly how possessive and
   accent variants are already banked. Same mechanism then covers St.↔Saint
   (28 rows) and similar abbreviation expansions. Owner-visible decision:
   which equivalence families to bank, per locale.
2. `85c`-style digit-letter joins (1 known row) ride along with item 1 if
   ever needed; accepted for now.
