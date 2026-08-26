# v16 wrong-restaurant attribution — mechanism report (2026-08-25)

## Plain-language summary (owner)

The resolver is innocent. The new v16 prompt makes the model itself hand the
review to the wrong restaurant before our code ever sees it. In the proven
control case, the model read the comment praising Luckys and wrote
"lefty's pizza" as the restaurant name in its JSON output — our resolver then
correctly looked up "lefty's pizza" and credited Lefty's Pizza Kitchen. So a
user searching Lefty's would see praise ("best mushrooms in Austin") that was
actually written about Luckys. The fix is a prompt fix (through the certified
re-extract process), plus one structural change that makes this class of error
detectable forever: make the model cite the name AS WRITTEN in the source next
to its canonical choice, so a canonical name that appears nowhere in the cited
text can be refused mechanically.

The second suspected case (Cheko's → Tex Mex Joe's) is NOT this bug and NOT
v16: it is a pre-existing wrong entity MERGE from 2026-08-04 that both the
active corpus and v16 share.

## Proven mechanism (Luckys control case)

Document `e9598532-8f78-4706-a135-cfcff2d729fc` (r/austinfood comment):

> "OK so i went and tried Luckys. Former chicagoan here - its the real deal
> ... The mushrooms topping were the best ive had in austin - fresh portabello
> ... get the small thin crust and small pan deal to try both economically."

Both runs saw the SAME thread input (the comment is `SRC048` in both), same
model (`gemini-3-flash-preview`), identical generation_config (temp 0.1). The
only variable is the system prompt.

**Active run** `ad503762` (prompt hash `cf421fe7…`), input
`738de981-a80b-4566-a0fc-22ae07098f13`, raw_output for SRC048:

```json
{"food": "thin crust pizza", "source_id": "SRC048", "restaurant": "luckys pizza",
 "ingredients": ["mushroom", "portabello"], ...}
{"food": "pan pizza", "source_id": "SRC048", "restaurant": "luckys pizza", ...}
```

**v16 run** `a81677cc` (prompt hash `40d3fc1a…`, campaign `9fbecbf9`), input
`6e983951-db1f-46f7-bc84-7708c16eb065`, raw_output for SRC048:

```json
{"item": "thin crust pizza", "place": "lefty's pizza", "source_id": "SRC048",
 "ingredients": ["mushroom"], "temp_id": "m26", ...}
{"item": "pan pizza", "place": "lefty's pizza", "source_id": "SRC048", "temp_id": "m27", ...}
```

The v16 output contains NO "luckys" anywhere — the model relabeled the Luckys
comment's mentions (mushroom topping, thin-crust+pan deal — unmistakably
SRC048's content) with the thread's dominant anchor "lefty's pizza" (Lefty's is
genuinely discussed elsewhere in the thread: SRC021/031/036).

**The resolver behaved deterministically and correctly on both texts.**
Staging `entity_surface` (both surfaces active, unambiguous):

| form_folded | resolves to |
|---|---|
| `luckys pizza` | Luckys Pizza |
| `leftys pizza` | Lefty's Pizza Kitchen @ Pins Mechanical |

So the divergence is 100% at the LLM emission; there is no rehearsal-path,
memory-state, or candidate-set difference in play for this case.

### Why the prompt produces it

The v16 prompt (`llm_prompts` content_hash `40d3fc1a…`, kind
`collection_system` v11) section **B.3 "Canonicalize the name"** instructs:
"Choose ONE canonical name per establishment … **Use the chosen canonical
consistently for every mention of that place within the post object**", with
variant unification allowed when "identical after normalization, or one is a
strict token-superset". The model over-applied unification: in a thread
dominated by "lefty's pizza", the single-mention, similar-shaped name
"Luckys" (l···y's + pizza context) was absorbed as a "variant" of the dominant
anchor — violating the prompt's own safety rule, but nothing in the output
format lets any downstream system notice, because the observed surface form is
never emitted. The old prompt has an equivalent canonicalization step but its
phrasing/structure did not induce this collapse on the same input.

## Where in code

- Emitted `place` is consumed verbatim as the restaurant anchor:
  `apps/api/src/modules/content-processing/reddit-collector/extraction-pipeline.service.ts:1874,1957–1979`
  (`mention.place` → `mention.place_surface`).
- Resolver folded exact/trigram match tiers (deterministic on the given text):
  `apps/api/src/modules/content-processing/entity-resolver/entity-resolution.service.ts:1082,1194,1436`.
- Replay lever (prompt-version pinning; batch shadow):
  `extraction-pipeline.service.ts:133–143,204,226`.

## Cheko's → Tex Mex Joe's: different, pre-existing mechanism

All four Chekos docs are credited to Tex Mex Joe's in the ACTIVE corpus too
(e.g. doc `ab99a0f4…`, active run `d2ab3c48…`). Cause: entity
`e462461a-6189-4086-9fb0-2111ccb212f4` "Chekos Méxican Restaurant & Bar"
(1304 W Koenig Ln) was merged into `88b391bc-a62f-474e-bab5-d0db5f4a6428`
"Tex Mex Joe's" via `entity_redirects` at **2026-08-04 03:00:39Z** (17 days
before v16), and the surfaces `chekos` / `chekos mexican restaurant bar` now
point at Tex Mex Joe's. Every corpus resolves "chekos" to Tex Mex Joe's since
then. This is a dedupe-merge defect (entity-dedupe lane), not a v16 regression
— it should be un-merged and investigated separately.

## Blast radius (staging, v16 completed runs)

- v16 replayed 12,021 documents producing 15,137 distinct (doc, restaurant)
  pairs.
- **1,006 pairs across 812 docs (~6.8% of docs)** credit a restaurant the
  active corpus never credited on that doc (0 explained by redirects).
- Strict signature of the proven mechanism (credited restaurant's surface
  form absent from the doc text entirely): **163 pairs / 161 docs (~1.3%)** —
  a lower bound, since thread-context coreference legitimately inherits names
  from parent comments; 203 of the 1,006 are similar-name swaps
  (trigram similarity > 0.5 to an active-credited restaurant on the same doc),
  the Luckys→Lefty's shape. The sampled ~4% sits inside the 1.3%–6.8% band.

## Ideal-shape fix (no downstream guard)

1. **The cause is the prompt's emitted text** — the fix goes through the
   certified prompt-iteration process, with this exact input pinned as a gold
   case (thread `SRC001…SRC049`, expected: SRC048 → `luckys pizza`, never
   `lefty's pizza`). Not this investigation's change to make.
2. **Structural change that makes the error auditable/impossible:** the
   emission contract should carry provenance — for each mention, the observed
   surface form(s) as written in the cited source (`place_observed`,
   verbatim-span), alongside the canonical choice. Canonicalization then
   becomes a checkable claim: a canonical whose observed forms do not appear
   in the cited source_id's text (or its declared coreference ancestor) is a
   contract violation at ingest — refused and logged, not silently grounded.
   This removes the blind spot rather than filtering symptoms: the resolver
   grounds observed text, and the "ONE canonical per establishment" collapse
   can no longer silently reassign one commenter's testimony to a different
   real-world restaurant.

Evidence rows/paths referenced above are reproducible with SELECTs against
staging `crave_search` (runs `ad503762-f2fe-4903-aebf-eef9058efecb` active vs
`a81677cc-7500-4bd0-80b4-fe664a4123cf` v16; inputs `738de981…` / `6e983951…`).
