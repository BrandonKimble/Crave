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

## Next experiment (queued)

Run `perPost` on the same chunks: if isolation alone kills the leaks, the
design conversation becomes "how to buy isolation cheaply" (per-post
calls + prompt caching for the shared 27k-token system prompt), not "how
to teach a worksheet". Also queued: a large random sample (~500 docs) for
precision/recall beyond the leak set once a variant earns it.

## Position analysis (owner theory, tested 2026-09-03)

Leak sites do NOT cluster late in chunks: n=34 candidate positions, mean
normalized position 0.46, median 0.32; the FIRST third holds more leak
sites (17) than the last (12). The upvote-sort-parents experiment is
therefore skipped per the owner's own conditional.
