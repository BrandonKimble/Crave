# Orthographic surfaces — placement red-team, derivation, cert, dry run (2026-08-30)

Closes the &↔"and" gap queued by plans/normalization-coherence-audit.md
(530 &-named actives, only 232 with any " and " surface; St.↔Saint 28 rows).
All edits uncommitted. No staging writes were made.

## 1. The placement red-team (owner-scoped amendment) — verdict: HYBRID

The owner's initial ruling put the whole fix in the per-locale
surface-enumeration LLM pass (the vocabulary sweep,
`vocabulary-generator.ts` + `label-sweep.service.ts`). Four candidate homes
were steelmanned against the real consumers — gazetteer exact recognition,
autocomplete/suggest, poll linking, all of which read **banked
`entity_surface` rows** — plus forward coverage for new mints, determinism,
cost, and the no-non-exhaustive-lists philosophy applied honestly.

| Home | Verdict | Why |
|---|---|---|
| (3) The fold itself | REJECTED — rejection re-verified | `&`→` and ` bakes English into the one locale-blind normalizer, moves 530 stored identity keys, and expansion is not a fold's job at all (see the census evidence below: the same token expands to different words). |
| (2) Search-time expansion | REJECTED | Fixes only the query→surface direction, per-query cost forever, and does nothing for the gazetteer's recognition of names inside longer text, autocomplete prefix arms, or poll linking — the consumers all read stored rows. |
| (1) Mechanical rule at the surface writer | WINS the closed class | `&`↔"and" has ONE answer — there is no judgment to buy, so paying an LLM per name (and per future mint, forever) to compute a deterministic mapping is fabricated work. The closed mapping is legitimate data, same species as TRAILING_LOCATION_TOKENS and the dietary vocabulary: finite, owner-reviewable, per-locale-extendable. One correction to the steelman: the hook cannot live INSIDE `addSurfaces` — the gap's main carrier is the entity NAME, written by `identityInsertData`, which never passes the surface door. So the mechanical rule is a **census** (watermark = the variant row itself), which covers past and future with one mechanism, exactly the label sweep's own law. |
| (LLM sweep) | WINS the semantic class | The staging corpus itself proves abbreviation expansion needs a reader: "St. Elmo Brewing" is **Saint** but "Clinton St. Baking Company" and "11th St. Bar" are **Street** — same token, opposite words, undecidable mechanically. That judgment is exactly what the vocabulary pass is paid for. |
| (4) Hybrid | **BUILT** | Mechanical census for the closed symbol class; the v8 vocabulary prompt for the semantic abbreviation class and the open locale tail. |

Owner-visible residual (unchanged from the audit): whether a locale's own
connector (`y`, `et`, `và`, `和`) earns banked variants is a per-locale data
decision — add it to `AMPERSAND_WORDS` when ruled and the census re-covers
the corpus on its next pass. Today it holds only `and`, because this
corpus's `&` names are read with "and" by locals of every language in the
launch metros; minting `salt y time` would violate
enumerate-what-they-really-type.

## 2. What was built

**Mechanical half**
- `apps/api/src/modules/content-processing/entity-resolver/orthographic-variants.ts`
  (+ spec, 8 tests): pure closed-class module, both directions
  (`Salt & Time`→`Salt and Time`, `Salt and Time`→`Salt & Time`, glued
  `Ham&Eggs` handled); never emits a variant whose fold equals the original.
- `apps/api/src/modules/entity-display/orthographic-variant-sweep.service.ts`:
  the census. Scans active entities whose name or active surface carries the
  class, mints the missing retypings via `addSurfaces` — role `recall`,
  source `orthographic` (new provenance; **the collision guard polices it**),
  surfaceOrigin `stripped-convenience` so it banks at `und` (reachable from
  every locale's lookup chain — right for a retyping of a proper name).
  Deprecated folds are never re-proposed. No run ledger: recomputation is
  free and the watermark IS the row.
- Wired as **step 0** of the knowledge-maintenance rail (free, no flag of
  its own, isolated failure) — a name minted yesterday is reachable tonight.
- Migration `20260830120000_entity_surface_orthographic_source` (CHECK swap
  only; applied locally with `migrate deploy`; shared API rebuilt+restarted).

**LLM half — vocabulary prompt v8** (`labels.vocabulary`, ledgered
fingerprint `e9590be8dfe6`, spec updated)
- "SPELLINGS COUNT AS WORDS" folded into the completeness definition (not
  appended): retypings through another orthography belong in the set, an
  abbreviation expands only to what it means IN THIS NAME, and an
  undecidable abbreviation stays unexpanded (a missing retyping is asked
  again; a wrong one is banked as truth).
- Proper nouns may now carry **retyping aliases only** (never translations,
  never the name repeated) — v5–v7 dropped a proper noun's aliases entirely,
  which was right for the translation-fabrication class and wrong for the
  orthographic one. `parseBatch` passes retypings through, minus the label
  itself.
- Places enter the sweep **only** through the orthographic arm: en-locale
  due-predicate gains `type='place' AND name ~* '(^|\s)(St|Ste|Mt|Ft|Dr)\.'`
  (English orthography, so the en sweep alone; a later locale's abbreviation
  class widens the predicate, not the mechanism). Ledger/watermark
  unchanged. The v8 bump re-opens the concept population — one re-pay per
  bump, the fleet's standard price.
- Predecessor v7 builder pinned byte-exact in
  `scripts/fixtures/vocabulary-v7-prompt.ts` (fingerprint verified
  `44c6dd662cfd`); `prompt-gold.ts` defaults live=v7 (`--vocab-pred=v4|v6`
  retained) and gains `notAliases` grading for the vocabulary lane.

## 3. Gold cases + certification (×3, dev key)

Five cases added (15 total), both sides of every new boundary:

| Case | Side | Pins |
|---|---|---|
| ortho-saint-expansion | keep | St. Elmo → "saint elmo brewing company" |
| ortho-street-not-saint | refuse | Clinton St. must NOT yield "clinton saint baking company" |
| ortho-proper-noun-never-translated | refuse | es sweep of Salt & Time must NOT mint "sal y tiempo" |
| ortho-concept-ampersand | keep | mac & cheese → "mac and cheese" (concept side) |
| ortho-ambiguous-abbrev-doctor | keep+refuse | Dr. Clark → "doctor clark", never "drive clark" |

Cert (prompt-gold, 15 cases × 3 runs × 2 variants per run, three full runs;
results in `scripts/fixtures/vocabulary-gold.v8.run{1,2,3}.result.json`):

| Run | live v7 | candidate v8 |
|---|---|---|
| 1 | 13 PASS / 2 FAIL | **15 PASS, 0 FLAKY, 0 FAIL** |
| 2 | 13 PASS / 2 FAIL | **15 PASS, 0 FLAKY, 0 FAIL** |
| 3 | 13 PASS / 2 FAIL | **15 PASS, 0 FLAKY, 0 FAIL** |

v7's two failures are exactly the gap (no saint/doctor retypings); all 10
legacy cases (THING-vs-MATERIAL, caldo boundary, vi short form) hold under
v8 in every run — zero regression, zero flake.

## 4. Staging dry run (read-only; $0 — the census is mechanical)

933 candidate entities scanned (name or active surface carries the class):

| | entities gaining | variant rows minted |
|---|---|---|
| place | 580 | 711 |
| item | 149 | 212 |
| place_attribute | 4 | 4 |
| ingredient | 2 | 4 |
| **total** | **735** | **931** |

- Of the 530 &-named actives: **401 gain their missing "and"-form** (129
  already covered by observed surfaces). Coverage of the audit's headline
  gap goes 232/530 → 530/530 on the first census pass.
- Reverse direction (word→`&`) and surface-derived variants account for the
  rest of the 931 (e.g. `S & S Cheesecake Inc.` → `S and S Cheesecake Inc.`;
  banked alias `Doms Sausage and Peppers Truck` → `Doms Sausage & Peppers
  Truck`).
- LLM place arm: **12 places** match the abbreviation trigger on staging
  (the audit's 28 counted all types under a looser regex) — 12 asks in one
  en-sweep batch, ≪ $1.
- Every minted row still faces the collision guard at write time; blocked
  variants route nowhere silently (census reports offered/banked/blocked).

## 5. Gates

- `yarn build` green; prettier + eslint green on every touched file.
- Targeted tests: orthographic-variants (8), vocabulary-rule-release,
  knowledge-maintenance-rail, and the three label-sweep integration suites —
  all green. (4 pre-existing integration failures — open-now-parity,
  iteration-bench, two dedupe-merge — reproduce on clean HEAD with the work
  stashed; not from this change.)
- `yarn invariants`: 43 invariants / 88 proofs, all rejected their defects.
- Boot smoke: migration applied via `migrate deploy`, client regenerated,
  shared :3000 API rebuilt + restarted (all LISTEN pids killed, new pid
  verified), `/health` healthy (db+redis).
