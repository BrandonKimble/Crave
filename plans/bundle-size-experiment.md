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

## Sequencing
After the category-move agent lands and the v17 prompt is final+committed
(the experiment must run the exact prompt the reload will use). Before
the full Austin reload (its output IS the reload's chunk-size setting,
via LLM_CHUNK_MAX_DOCS).
