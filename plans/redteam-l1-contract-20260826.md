# Red team L1 — the v17 extraction data contract (2026-08-26)

Scope: the two-shape mention union, place-name-contract.ts, refusal banking,
the iteration-bench laws against the S2/S4 commits, and the certification
harness pair. Standard applied: 100%-hindsight rederivation, not patches.
Code read end to end (llm.types.ts, llm-response-schemas.ts,
extraction-pipeline.service.ts, place-name-contract.ts,
collection-evidence.service.ts, unified-processing.service.ts,
replay.service.ts, shadow-diff.sql, prompt-ab.ts, prompt-gold.ts, the four
commits 9ecc1c3e3..HEAD).

Ranked findings.

---

## F1 (HIGH) — the wire union is flattened one function after it is born

The wire contract is genuinely a discriminated union — schema `anyOf`
(llm-response-schemas.ts:303) and TS (`llm.types.ts:165`
`export type LLMMention = LLMPlaceMention | LLMDishMention;`) both make
praise-on-a-dish-row unrepresentable. But `admitWireMention`
(extraction-pipeline.service.ts:1263) immediately projects it into the old
everything-optional shape:

```ts
return {
  ...wireMention,
  place, place_surface: placeObserved, ...
  general_praise: isDishMention(wireMention) ? false : wireMention.general_praise === true,
```

into `LLMInternalMention` (llm.types.ts:179), where `item?: string | null`
and `general_praise: boolean` are independent fields again. Every consumer
after line 1263 — `ensureSurfaceDefaults`, `dropDuplicatePlaceMentions`,
all of unified-processing (e.g. unified-processing.service.ts:2821
`if (mention.general_praise)` and :2832 writing a `general_praise` place
event) — operates on a shape where the v16-forbidden combination is
representable. Nothing downstream can type-error if a future edit sets
`general_praise: true` on a dish row; the invariant survives only as a
runtime derivation at one line.

Failure scenario: a later feature (say, "praise-worthy dish" scoring) reads
or writes `general_praise` on a dish mention; the compiler is silent; the
corpus regrows exactly the 2,383-row class the split was built to kill.
This is the same class as the v16 leak: a hand projection at a seam that
quietly widens the type.

Ideal shape: the union travels whole. The internal carrier is
`Admitted<M extends LLMMention> = { wire: M; place: string;
place_observed: string; place_source_id: string; provenance: {...} }` —
derived fields are ADDED alongside the wire mention, never spread over it.
`general_praise` stops existing as stored state entirely: the one write
site that needs it (the place-event writer) derives it from
`wire` shape at the point of use (`!isDishMention(wire) &&
wire.general_praise`). `LLMInternalMention` and the `item?`-optional
enriched shape become `Admitted<LLMPlaceMention> | Admitted<LLMDishMention>`
and the discriminant survives to the DB write. The `place_observed?/
place_source_id?` optionality on the internal shape (llm.types.ts:186-189)
also disappears — provenance is non-optional once admitted.

## F2 (HIGH) — `observedSpanAppearsInSource` has no word boundaries: false admits

place-name-contract.ts:118: `text.includes(variant)` — a raw substring
check. A span that is a substring of a *different* word passes the refusal
check. Concrete: span `oro` verifies against a comment that only says
"Loro"; span `ho ho` against "Tho Ho House"; the possessive variant
machinery widens it further (`torchy's` → variant `torchy` → matches inside
"torchys" or "torchyland"). The contract's whole point is "a lookup, not a
judgment" that catches Luckys→Lefty's-class fabrication — but a fabricated
SHORT name that happens to be a substring of any word in the source sails
through, and short hallucinated names are the likeliest fabrication class.

Ideal: anchor the match at word boundaries after the shared normalization —
build the variant set, then test `\b`-delimited occurrence (or tokenize the
text once and match token subsequences). Pure, still mechanical, still a
lookup. The spec file (place-name-contract.spec.ts, 108 lines) currently
pins no boundary case — add both sides ("oro" refused against "Loro";
"lefty's" admitted against "Leftys").

## F3 (HIGH) — the hand-grown trailing-token lexicon is city data living in code

place-name-contract.ts:36-51: `les, chelsea, midtown, queens, soho,
brooklyn, manhattan, bronx, nyc, austin, atx` — a per-metro fact table,
hard-coded, grown by commit (the S3 commit added nyc/austin/atx). Two
failure modes:

1. **Collision with real names.** The loop (:78) strips trailing tokens
   while >1 token remains: a restaurant actually named "Little Queens"
   canonicalizes to `little`; "Taste of Austin" → `taste of`. The comment
   says a name that *is* one of these tokens is untouched — but a name that
   *ends* in one is not, and the lexicon has no way to know the difference.
2. **Coverage rot.** Every new community (Chicago: "wicker park", "logan
   square"; Houston: "htx", "montrose") silently gets zero suffix-dropping
   until someone remembers to edit a Set in reddit-collector — a fact and
   an obligation living in two places, the exact sentence the bench laws
   were written against.

Ideal: branch-tag dropping is derived from data the system already owns.
Two owned sources exist: (a) the community config/gazetteer (each community
already declares its metro; the search cutover built a gazetteer), and
(b) Google `addressComponents` on grounded locations — neighborhood/
sublocality/city names for *this* community's actual places. The
canonicalizer takes `(placeObserved, communityAreaLexicon)` as an argument;
the lexicon is computed per community and versioned like a prompt input.
Collisions self-resolve because the resolver ALSO sees the undropped
observed span (`place_surface` is banked): make the suffix-drop a
*candidate* alias handed to entity resolution rather than a destructive
rewrite — resolution already judges name matches; let the layer with
knowledge decide, and "Little Queens" survives because the grounded entity
match wins over the truncation.

## F4 (MEDIUM) — refusal banking is first-class on all paths but has no lifecycle owner

Verified good: sync, batch ingest, and replay all funnel through
`completeChunkPlan` → `admitWireMention` (replay.service.ts:143,207,349 call
`processStoredInputs`/`processPosts`), so refusals are banked identically
everywhere; prompt-ab is deliberately DB-free. The diff reads them
campaign-scoped (shadow-diff.sql:100-124). But:

- **No GC, no retention.** Nothing deletes `collection_extraction_contract_
  refusals` (only `onDelete: Cascade` from ExtractionRun, and no production
  code deletes extraction runs — the only `extractionRun.deleteMany` in the
  tree is a spec teardown). The table grows monotonically with every live
  collection tick forever.
- **No live-path reader.** Outside a shadow campaign, refusals surface only
  as a `logger.warn` (extraction-pipeline.service.ts:1047). A prompt/model
  drift that pushes live refusal rates from 0.5% to 10% — silently shrinking
  the corpus — reaches no meter, no alert, no census. That is the v16
  "coverage is derived, progress is owned" hole reopened one layer down:
  the refusal *rows* are owned, the refusal *rate* is nobody's.
- **Campaign close doesn't touch them.** The bench's closed phase reconciles
  spend but not refusals; rejected campaigns leave their refusal rows as
  unlabeled residue.

Ideal: the refusal table gets the same treatment as the coverage claims —
an owner. (1) A refusal-rate meter per pipeline with an alert threshold
(the ops-alert seam from bench S3 already exists); (2) retention = the run
lifecycle: when the bench closes/rejects a campaign, its refusal rows are
summarized into the run row's metadata and the raws GC'd after N days;
(3) live runs keep a rolling window only.

## F5 (MEDIUM) — the subreddit projection leak was patched, not rederived

The S3 commit's own message says "subreddit projection leak fixed": the
`LightweightPost` hand-projection in llm.service.ts dropped `subreddit`,
silently disabling the prompt's community-scope rule, and the fix ADDED the
field plus a shape sniff:

```ts
subreddit: 'subreddit' in post && typeof post.subreddit === 'string' ? post.subreddit : null,
```

That is bench law 1's named disease ("a nine-field projection dropped the
tenth") cured by making it a ten-field projection. The `'subreddit' in
post` sniff exists because the chunker's post type and `LLMPost` have
drifted apart — a second seam. Same class at
extraction-pipeline.service.ts:788-792 and :1111-1117: `rehearsal:
args.baseParams.rehearsal === true` is hand-projected into
`ExtractionTraceContext` at TWO sites; the next run-context field (campaign
id, prompt-contract version) must be remembered at both or v16 repeats.

Ideal: `LightweightPost` dies — the chunker consumes `LLMPost` (the sealed
input shape) directly, or derives its lightweight view with `Pick<LLMPost,
...>` so a dropped field is a compile error, and the model-facing
serializer is the ONE place that decides what the model sees.
`ExtractionTraceContext` is built by one constructor from `baseParams`,
called at both sites. (Laws 2 and 3 re-verified clean over this range: the
four commits add no new terminal transitions — market-membership writes are
idempotent reconciles, not run terminals — and no parallel tallies.)

## F6 (LOW-MEDIUM) — two graders: lane split justified, skeleton accreted

prompt-ab.ts (549 lines) and prompt-gold.ts (667 lines) each own a copy of:
the arg parser, prompt resolution, the unit fan-out, the CONCURRENCY=6
worker pool, outcome maps, PASS/FLAKY/FAIL verdicting, the regression
report, `--out` writing, and a private `norm()` (prompt-ab.ts:178,
prompt-gold.ts:237 — currently identical, by luck). The *graders* differ
for real reasons — mentions-list expectations vs boolean/enum lanes, and
prompt-ab's mechName exactness is load-bearing for the observed-span
contract — but the harness chassis is duplicated, and the copies have
already drifted once (only prompt-ab has the unknown-expect-key hard error
:139, the tool-absence-swallow fix; prompt-gold silently ignores an unknown
expect key TODAY — e.g. a typo'd `notCuisine` grades as vacuous PASS).
prompt-gold's JSON extraction (`text.indexOf('{')` :474) is also a
hand-rolled parse the other harness doesn't share.

Ideal: one harness primitive `runAB(cases, {render, call, grade})` owning
fan-out/verdicts/reporting/key-validation; prompt-ab and each gold kind
become ~50-line lane definitions (render payload, pick schema+caller,
grade). The unknown-key hard error becomes structural for every lane.

## F7 (LOW) — possessive variance: sound direction, one asymmetry worth pinning

`possessiveVariants` (place-name-contract.ts:88) handles names genuinely
ending in plural s correctly in the dangerous direction: span `leftys`
does NOT match text "Lefty's" (variants are `leftys's`/`leftys'`) — the
Luckys/Lefty's class stays refused. The permissive direction is real but
licensed: span `torchy's` matches a text that only wrote "torchy" — the
model may mint a possessive the source lacks. With F2's word boundaries in
place this is acceptable drift (the canonicalizer output is what the
resolver sees, and resolution judges aliases); without F2 it compounds.
Pin both directions as spec cases; no shape change needed beyond F2.

## Verdict summary

The v17 contract's *direction* is right everywhere it was checked: the
union exists at wire+schema, refusals are banked on every execution path,
canonicalization moved to code, the grader grades names mechanically. The
findings are all the same genus: the ideal shape stops one layer too early
— union flattened at ingest (F1), lookup missing its boundary (F2), city
data in a code Set (F3), banked rows with no lifecycle (F4), a projection
patched instead of deleted (F5), a harness duplicated instead of factored
(F6). None require re-certification of the prompt; F1/F5 are type-level
refactors, F2/F3 change admit/canonicalize behavior and need a shadow diff
before activation.
