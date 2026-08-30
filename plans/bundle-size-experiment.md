# Bundle-size experiment — design (2026-08-30, coordinator)

## Question
Docs-per-chunk is the measured dominant lever on extraction behavior —
bigger than any prompt-text delta (wild A/B: both prompts ~18/38 adoption
solo vs 12/2 at ~57 docs; the cap-30 change alone moved coverage +49%).
The final v17 prompt deserves a measured chunk-size choice before the
full Austin reload, not an inherited one.

## Design
- Arms: docs-per-chunk ∈ {10, 20, 30} (30 = current cap, the control).
  Solo (1) is already characterized by the wild A/B — not worth a full arm.
- Corpus: ONE fixed random sample of ~1,500 Austin docs (deterministic
  md5 order), the SAME docs replayed under every arm, final v17 prompt,
  batch rail (half price).
- Metrics, all computed by the existing shadow-diff + wild-A/B tooling:
  1. Adoption/short-verdict emission rate on the known-sensitive
     populations (the loop-3 fixed panels).
  2. Doc coverage (docs yielding ≥1 mention) and mention volume.
  3. Junk-shape rate (wild-A/B classifier) and contract-refusal rate.
  4. First-vs-last-quintile emission delta within chunks (the fatigue
     meter from the original finding).
  5. Cost per 1k docs per arm (ledger + token sums).
- Decision rule (owner can override): choose the largest chunk size whose
  adoption rate and fatigue delta are statistically indistinguishable
  from the best arm — quality first, cost breaks ties.

## Cost envelope (estimate basis, to be confirmed by the bench sheet)
Full 39k-doc replays have banked at ~$12–14 each on the batch rail.
1,500 docs × 3 arms ≈ 4,500 doc-extractions ≈ 12% of a full replay
≈ **$1.50–2.50 total**. Runs through the iteration bench (campaign
envelope, approve-by-hash) like every other spend.

## RESULTS (2026-08-30, executed — scripts/bundle-size-experiment.ts)

**Verdict: keep `LLM_CHUNK_MAX_DOCS=30`.** The decision rule picks the
largest arm statistically indistinguishable from the best on quality —
and 30 was not merely indistinguishable, it was the best or tied on every
quality metric while being the cheapest arm.

### Setup as run
- Runner: `apps/api/scripts/bundle-size-experiment.ts` (probe; real
  `LLMChunkingService` per arm + real `LLMService.processContent`, the
  committed candidate prompt `collection-prompt.candidate.md` — byte-equal
  to HEAD `9b326d5ed` — as `systemPromptOverride`; staging DB read-only,
  zero writes; interactive rail, not batch).
- Sample: **40 posts / 1,218 comments** (1,258 scored doc-slots incl.
  extractable post bodies), austinfood, posts taken in `md5(source_id)`
  order until the comment target — identical docs in every arm.
  Target trimmed 1,500 → 1,200 to respect the spend envelope on the
  interactive rail (2x batch price; actual cost then came in far under —
  Gemini's implicit prompt cache absorbed ~2/3 of input tokens).
- Loop-3 panel overlap with the sample: **0/39 adoption, 0/5 shared**
  (44 sids in a 38k-comment corpus — expected-thin). Per the design's
  fallback, adoption is measured as the whole-sample **short-reply
  emission rate** (replies-to-comments ≤120 chars, n=429 — the
  adoption shape).

### Per-arm table (same 1,258 slots each arm; 0 call errors anywhere)
| metric | arm 10 | arm 20 | arm 30 |
|---|---|---|---|
| chunks (avg slots) | 144 (8.7) | 87 (14.5) | 66 (19.1) |
| doc coverage | 33.3% (419) | 31.1% (391) | **33.3% (419)** |
| mention volume | 721 | 670 | 653 |
| junk-shape rate | 0.69% | 0.75% | **0.61%** |
| short-reply emission (adoption-shaped) | 21.9% | 20.3% | 21.4% |
| fatigue Δ (Q5−Q1 emission) | **−11.7pp (z=2.7)** | −5.6pp (z=1.3) | −2.1pp (z=0.5) |
| tokens in/out (cached) | 3.38M/68k (2.20M) | 2.08M/62k (1.35M) | 1.60M/57k (1.07M) |
| cost (interactive) | $0.91 | $0.62 | $0.49 |
| cost / 1k docs | $0.72 | $0.49 | **$0.39** |

Fatigue curves (per-quintile emission rate):
- arm 10: 39.4 → 30.7 → 32.5 → 34.4 → 27.7 %
- arm 20: 37.4 → 28.1 → 26.6 → 29.7 → 31.8 %
- arm 30: 34.6 → 32.1 → 30.9 → 36.2 → 32.5 %

### Reading, honestly
- No pairwise quality difference is significant: coverage 30 vs 20 is
  +2.2pp (z=1.19), 30 vs 10 exactly 0; short-reply deltas all |z|<0.6.
  At n≈1,258 slots the coverage MDE is roughly ±4pp — this experiment can
  rule out a LARGE quality cost of 30, which is what it was for; it cannot
  rank arms within ~2pp.
- The only significant effect is arm 10's within-chunk fatigue delta
  (−11.7pp, z=2.7) — the OPPOSITE direction from the original 57-doc
  finding. At 10-slot chunks the first quintile is dominated by post
  bodies/thread roots (high-signal slots), so positional composition
  confounds the fatigue meter at small chunk sizes; it does NOT show
  attention decay returning at 30 (−2.1pp, n.s.).
- Mention volume drifts up as chunks shrink (721 vs 653, +10%) with no
  coverage gain and no junk-rate gain — consistent with slightly chattier
  duplicate/low-value emission, not recovered docs.
- Cost is monotone in call count: 10-doc chunks cost ~1.86x the 30-doc
  arm per doc.

### Decision-rule application
Best arm on quality = 30 (tied-best coverage, lowest junk, smallest
fatigue delta; adoption-shaped emission within noise of both others).
Largest arm indistinguishable from it = 30 itself. Cost tiebreak also
favors 30. **Recommended `LLM_CHUNK_MAX_DOCS=30` — no change for the
Austin reload.**

Cost actuals: **$2.02** LLM spend across all arms (+$0.04 smoke) — under
the $2.50–4 envelope even on the interactive rail. Raw per-arm JSON:
`apps/api/scripts/fixtures/bundle-size-experiment.result.json`.

Caveats: single run per arm (no seed variance); sample is 3.2% of the
corpus; loop-3 panels unmeasured (zero overlap); interactive rail, so
batch-rail behavior (same model, same prompt) is assumed equivalent.

## Sequencing
After the category-move agent lands and the v17 prompt is final+committed
(the experiment must run the exact prompt the reload will use). Before
the full Austin reload (its output IS the reload's chunk-size setting,
via LLM_CHUNK_MAX_DOCS).
