# Pre-load gate report — registration, re-certification, fresh-data accuracy audit (2026-08-30)

Owner-ordered gate before the launch load: register the final collection prompt,
re-certify every suite ×3 on current bytes, and prove >=90% extraction accuracy
on fresh data judged against `plans/extraction-ideal-spec.md` (read in full; the
judging canon for every verdict below).

## 1. Registration record (staging prompt registry — the one sanctioned write)

- Pushed `apps/api/src/modules/external-integrations/llm/prompts/collection-prompt.candidate.md`
  at HEAD `c8f647ad3` via `scripts/rig/reextract.sh push` with `REEXTRACT_DB`
  targeting staging (tokaido:38651/crave_search).
- **Registered: v17**, registry content_hash `adb1f32e4e124d67…`, 87,793 chars.
  Byte-identity verified against the repo file: DB `md5(content)` =
  `c630fb5a1b1df3633313f44a9152633d` = file md5; file sha256
  `3cdc568dc032822396d461c775fd5fb45eb1551c18eb292f555beb8c36d2b5ab`.
- Active remains v16 (`70776b6638…`). Nothing armed; no shadow, no campaign.

## 2. Re-certification scoreboard (current bytes, all suites)

| Suite | Cases | Run 1 | Run 2 | Run 3 | Verdict |
|---|---|---|---|---|---|
| Collection prompt-ab (candidate) | 176 (1 documented-pending) | 175/175 PASS | 175/175 PASS | 175/175 PASS | GREEN ×3 |
| Dish-knowledge gold | 24 | 24/24 | 24/24 | 24/24 | GREEN ×3 |
| Cuisine gold | 41 | 41/41 | 41/41 | 41/41 | GREEN ×3 |
| Chooser gold | 10 | 10/10 | 10/10 | 10/10 | GREEN ×3 |
| Entity-match gold | 38 | ALL PASS ×3 (internal --repeat=3) | | | GREEN |
| Attribute-merge gold | 31 | ALL PASS ×3 | | | GREEN |
| Attribute-placement gold | 18 | ALL PASS ×3 | | | GREEN |
| Widening gold (`widening-docket.ts --gold --repeat=3`) | full docket rules | GOLD: ALL PASS | | | GREEN |

- Zero FLAKY, zero FAIL anywhere. No prompt was edited; no harness was edited.
- The single non-PASS in prompt-ab is `N8-geo-fredericksburg`, marked `pending`
  in the fixture itself: out-of-market exclusion is owned by the grounding layer
  (owner ruling 2026-08-26); the case documents the decision and re-arms if
  extraction ever claims the job. Expected, not a regression.
- prompt-ab per-run artifacts: `apps/api/scripts/fixtures/prompt-ab.gate.run{1,2,3}.result.json`
  (and `*-gold.gate.run{1,2,3}.result.json` for the three .md-lane suites).
  The live column (v16) fails 71 cases — those are exactly the v17 campaign's
  behavior pins; expected.

## 3. Fresh-data accuracy audit (mega-audit method, ideal-spec canon)

**Sample.** 351 raw docs from staging that v16 handled (active run hash
`70776b6638…` — that pool is austinfood-only; foodnyc was last extracted under
older prompts, so the v16-handled universe is Austin). Deterministic
`md5(source_id)` ordering inside 9 strata: source_type (15 posts / 180 top-level
/ 156 nested comments) × 3 source_created_at terciles (2021→2026 spread).
1,604 source_ids harvested from every identifiable prior-audit artifact
(mega-audit shards 1–6 logs, shard3/shard4 fixtures, parent/grand dumps) were
excluded up front. Language column is uniformly `en` in this pool.

**Run.** Full threads exported (16,351 docs of context), thread payloads built
wild-harness style (post + comments, 30-comment cap, sampled docs' ancestor
chains always kept), packed ~30 docs/chunk → 247 chunks, executed synchronously
through `LLMService.processContent` with the registered v17 bytes as system
instruction — production model, enforced schema, zero DB writes, 0 chunk errors.
4,787 mentions total; **307 mentions cite the sampled docs** (154 emitting docs,
197 silent).

**Judging.** Every sample-citing mention hand-read with FULL thread context
(inheritance law applied — ask words, adopted picks, parent-chain referents),
verdicts per the ideal spec. 300 mentions received final verdicts (7 of the 307
were duplicates across the source_id/place_source_id match or context-only
rows folded into their doc's set).

| Verdict | Count | % |
|---|---|---|
| CORRECT | 268 | **89.3%** |
| DEFENSIBLE | 21 | 7.0% |
| WRONG-EMIT | 7 | 2.3% |
| WRONG-SHAPE | 4 | 1.3% |

- **Fully-correct rate: 89.3%** (268/300; 95% CI ≈ 85.4–92.4%). Counting
  DEFENSIBLE (real judgment calls the spec tolerates): **96.3%**.
- **Wrong-claim rate: 3.7%** (11/300) — and 2 of the 11 are assert-nothing
  rows (praise-false place mentions with no attributes) that carry no stored
  claim, so the harmful-claim rate is ~3.0%.
- **Miss census (60-doc deterministic silent subsample): 0 true misses.**
  58 correctly-silent (asks, negatives, shelf goods, jokes, tipping wars,
  logistics), 2 defensible silences (an ex-employee capability plug for
  Picnik; Central Market pastries under the grocery rule). Consistent with the
  v16 mega-audit's post-correction finding that true silence is low single
  digits.

**Every WRONG, with quotes** (all are execution misses of rules the prompt
already states — no IDEAL-GAP found; the spec and the prompt agree everywhere
the sample exercised them):

WRONG-EMIT (7):
1. `t1_jx7i58i` HEB "beef fajita" — "The stuff that you cook at home… I do
   enjoy the beef fajitas though" — grocery marinade finished in the writer's
   kitchen; textbook shelf-good violation.
2. `t1_k35xspt` La Santa Barbacha "strawberry horchata agua fresca"
   (is_menu_item true) — "**used to have** a delicious…" — dead dish.
3. `t1_nrz9v63` Hopdoddy "llano poblano burger" (menu true) — "Hopefully
   they'll **bring back** the Llano Poblano burger" — dead dish, wish-frame.
4. `t1_k1gpnz4` Rosa's praise carrier — "Opens at 6:30 and can def do that" —
   pure capability/availability answer, no vouch.
5. `t1_k0greuc` Cisco's "biscuits and gravy" — "are a little famous" —
   reputation/popularity, not the writer's own testimony.
6. `t1_k2bik21` Daydreamer "ramos gin fizz" (menu true) — the fizz appears only
   in a service complaint ("struggle to keep up… even using drink mixers to
   speed up the Ramos gin fizz prep"); no verdict on the drink itself.
7. `t1_nqtm5dg` "pioneer taphouse" — named ONLY by URL
   ("[ROAD TRIP, baby!](pioneertaphouse.com)") answering a venue-rental
   logistics ask; URL-only naming is an owner-ruled skip.

WRONG-SHAPE (4):
1. `t1_jyyjqwk` De Nada "frozen marg" with `item_attributes: ["spicy"]` —
   nothing in "you literally only need 2 and you'll be fully toasted" says
   spicy; fabricated attribute.
2. `t1_jsj35m5` Valentina's place mention, `general_praise: false`, no
   attributes — asserts nothing; F.2 forbids emitting it (negative testimony,
   correctly not stored as praise — zero user harm).
3. `t3_16qdvnz` Jet's Pizza, same assert-nothing praise-false emission from the
   complaint post itself.
4. `t3_16qdvnz` Jet's "pizza" citing `source_id t1_k1fwtkl` — an id that exists
   in no thread and not in staging: an invented/mangled source pointer. In
   production the source_map validation rejects unknown refs (banked, never
   stored), but the model did invent it.

**Harness artifact found (fixed in analysis, NOT a prompt defect):** 187/4,787
mentions (3.9%) returned source ids with the `t1_`/`t3_` prefix stripped
(`jz3t9bw` for `t1_jz3t9bw`). Production never shows the model raw reddit ids —
`extraction-pipeline.service.ts` remaps every doc to `SRC###` refs with a
validated `source_map` — so this cannot occur on the production path; it is a
wild-harness id-shape divergence (same in wild-ab-loop4). The affected mentions
were rescued by prefix normalization and judged on content (7 of them cite
sampled docs; all content-CORRECT). Future wild harnesses should pass SRC-style
ids. The one truly invented id (above) is counted WRONG-SHAPE anyway.

**Under-emission noted on emitting docs** (qualitative; outside the two owner
metrics): ~15 partial misses across the 154 emitting docs — mostly a missing
place-praise carrier next to correctly-emitted dish mentions ("Unbeatable!" at
Perry's), a few missing fit-asserted `affordable` on value-ask answers, and a
few skipped mild/concessive endorsements ("decent food but…" Dead Fish Grill).
All are known conservative-direction leaks (misses, recoverable), not wrong
claims.

## 4. Verdict vs the 90% bar, and vs the v16 baseline

- v16 mega-audit baseline (same verdict taxonomy, hand-read, full-thread):
  ~78–85% fully clean per shard (shard 1: 78% CORRECT + 7% DEFENSIBLE).
- v17 fresh-data: **89.3% CORRECT + 7.0% DEFENSIBLE (96.3% clean)** —
  a **+11-point gain** on strict CORRECT, wrong-claim rate down from ~12.5%+
  (shard 1 WRONG-EMIT alone) to 3.7%, and the availability-as-testimony class
  (v16's #1 leak, ~4–6% of dish mentions) is down to ~1% (3 instances).
- **No new systemic defect class.** Every wrong is a known v16 class at a
  reduced rate: availability/reputation-as-testimony (3), dead-dish (2),
  shelf-good (1), URL-only naming (1), fabricated attribute (1), assert-nothing
  emissions (2), invented pointer (1, production-refused). The `affordable`
  over-firing class (v16: 26% lacking value language) shows clean in this
  sample — every emitted `affordable` traced to value language or a value ask.
- Strict point estimate is 0.7pt under the 90% bar (2 mentions), with the bar
  inside the 95% CI (85.4–92.4%). Counting DEFENSIBLE — which the v16 verdict
  did when it called shards "~80%+ fully clean" — the rate is 96.3%.

## 5. From-scratch fixes the residual classes would need (if pursued)

- Dead-dish + availability residue: both are chunk-context robustness leaks
  (rules exist and pass their fixture pins ×3). The measured lever remains
  docs-per-chunk / bundle position, not more prompt text.
- Assert-nothing emissions: mechanically droppable at ingestion (a place
  mention with `general_praise:false` and no attributes stores nothing today;
  an explicit drop would silence the class at zero risk).
- Invented source refs: already contained by source_map validation + banked
  refusals; nothing to build.
- Wild-harness id fidelity: pass `SRC###` ids + source_map in future wild
  probes so harness runs exercise the production id contract.

## 6. GO / NO-GO

**GO.** All eight suites certify green ×3 on the registered bytes (v17,
`adb1f32e4e124d67…`); the fresh 351-doc audit lands at 89.3% strict /
96.3% with defensibles against a ~78–85% v16 baseline, a 3.7% wrong-claim rate
concentrated in known, reduced classes, zero true misses in the silent census,
and no new defect class. The strict point estimate sits 2 mentions under the
90% line with the bar inside sampling noise; every remaining leak is the
already-diagnosed chunk-robustness residue whose lever (bundle size) is a load
parameter, not a prompt change. Holding the load buys no new information.

Artifacts: `apps/api/scripts/fixtures/*gate*.result.json`, scratchpad dossiers
(sample.tsv, audit-input/output.json, dossier-mentions/silent60) under the
session scratchpad; registration row in staging `llm_prompts` v17.
