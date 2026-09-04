# Two-pass extraction — pilot results (2026-09-03)

Owner-ordered A/B: can a decompose-first design remove the chunk-context
leak floor (~1 recurrence per ~500 docs per pinned shape) that single-pass
prompts hit at this thinking level? Harness: `scripts/two-pass-ab.ts` —
the REAL stored production chunks whose documents produced the audited
v22 leaks, replayed through variants with identical output schema.

## Variants

- **single** — production-faithful: candidate prompt over the stored
  30-doc input_payload.
- **two** — pass 1 `decompose-pass-prompt.md` (subjects / clauses / acts /
  landings / venue-relations as structured JSON), pass 2 = the SAME
  candidate prompt + the decomposition appended as a worksheet.
- **perPost** (added after round 1) — no decomposition; the same prompt,
  one call per post. Tests whether ISOLATION alone (the regime where pins
  certify 3/3) is the cure.

## Round-1 numbers (6 leak chunks × 2 reps)

| variant | leaks | mentions | cost vs single |
|---|---|---|---|
| single (v23 candidate) | 12 | 426 | 1.0x |
| two-pass worksheet | 9 | 404 | ~2.0x |

Per class: frog-leaps-at-HEB 4→1 (mostly fixed); castle-hill-ruin 6→6 and
nomad-rent-a-room 2→2 (unmoved). **Verdict: the worksheet variant buys a
~25% leak reduction at 2x cost — context gravity still wins when pass 2
re-reads the whole chunk.** Note castle-hill leaked in-chunk even though
the v23 closure edit passes 3/3 in isolation — the floor, demonstrated.

## The related cert finding

The host-venue-dish pin (`prompt-parked-cases.json`) is the floor made
visible in cert form: four wordings of the doctrine each fixed the pin
while breaking FA63 (shelf law) or FA47 (affirmation carrier) — a
measured seesaw. The pin is parked as THIS design's acceptance test.

## Round 2 (repeat=1, all three variants)

| variant | leaks | cost vs single |
|---|---|---|
| single | 4 | 1.0x |
| two-pass worksheet | 5 | ~2.0x |
| perPost isolation | 6 | ~1.0x |

**The decisive discovery: `perPost` == `single` by construction** — the
production chunks each hold ONE post; the "~30 documents" are that post's
comments. Post-level isolation is already what production does. So the
leak floor does not live between unrelated posts; it lives INSIDE one
thread's 30+ comments (castle-hill leaks 3-5 mentions per run from its
own thread even with the closure edit in force — the model fails to apply
the post-object-wide PLACE STATUS closure).

## The K-sweep (owner-ordered; leak chunks, pre-maker-test prompt)

| K (comments/window) | leaks (single → windowed) | raw cost | est. REAL cost* |
|---|---|---|---|
| 30 (today) | baseline | 1.0x | 1.0x |
| 20 | 10 → 4 | 2.65x | ~1.2x |
| 10 | 12 → 4 | 4.5x | ~1.4x |
| 5 | 6 → 0 | 8.0x | ~1.8x |

*with the production batch path's explicit prompt cache (~10x cheaper
prompt re-reads), which the raw probe didn't use.

Castle-hill — the thread-context killer, 8-10 leaks/run at K=30 — dies
at EVERY K <= 20. The residual leaks at K=10/20 (nomad rent-a-room,
mil-ask) were DOCTRINE gaps fixed separately in v23-final (the
capability-endorsement law; the mil marker was instrumentation noise).
So K=20 + v23-final plausibly reaches ~zero measured leaks at ~1.2x
real cost. Deployment is one env var: LLM_CHUNK_MAX_DOCS (the chunker
already packs whole subtrees). Before flipping production: a random-
sample precision check at K=20 (windowed mention counts ran HIGHER —
445 vs 373 at K=5 — which is either recall gain or noise, unmeasured),
ideally validated by running the v23 shadow replay itself at K=20.

## K=25 run (2026-09-03 late — CURRENT v23 text) — the picture inverts

single (K=30): **0 leaks**. windowed K=25: 2 (both the mil-ask marker,
previously determined to be instrumentation noise). Castle-hill — 8-10
leaks/run at K=30 under the OLD text — is gone AT K=30 under v23-final:
the four doctrine unifications (maker, status, capability,
label-vs-thing + plurality) consumed the attention signal this suite
could measure. Windowing may have nothing left to buy. Decision
consequence: run the v23 shadow at the DEFAULT K=30; the K knob stays
in the pocket for the corpus audit to justify.

## Verdict + the real next design question

The worksheet two-pass is dead (2x cost, noise-level gain). WINDOWING
is the winner: K<=20 kills the attention class outright, doctrine
unifications (maker test, status test, capability law) kill the stated-
rule classes, and per-comment isolation is unnecessary. Owner decision
pending: run the v23 shadow at LLM_CHUNK_MAX_DOCS=20 as the at-scale
validation.

## Position analysis (owner theory, tested 2026-09-03)

Leak sites do NOT cluster late in chunks: n=34 candidate positions, mean
normalized position 0.46, median 0.32; the FIRST third holds more leak
sites (17) than the last (12). The upvote-sort-parents experiment is
therefore skipped per the owner's own conditional.
