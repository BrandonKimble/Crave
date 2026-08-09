# Gold corpora — the market-launch gates

One file per language (`<lang>.json`), read by `../run-launch-gate.ts`. The
corpus IS the specification of what "search works in this language" means; the
runner is only the mechanism. Assertion semantics live in each corpus's own
`assertionSemantics` block, and the authoring law in its `authoringLaw`:
**corpus-grounded, not invented** — every expectation is read out of the
database before it is written down.

## INPUT-MODE COVERAGE (required of every language corpus)

A corpus must cover the **keyboard regimes real users type in**, not just the
clean ones. For any language written with accents or diacritics that is at
least three regimes:

1. **Fully accented** — the word spelled correctly (`phở`, `café`, `mañana`).
2. **Fully plain** — every accent dropped, the way most people type on a US
   keyboard (`pho`, `cafe`, `manana`).
3. **PARTIALLY accented** — some words accented and some not, within one query
   (`phở bo`, `cà phe sua da`, `bún bò hue`). Telex/VNI half-applied, an iOS
   autocorrect that fixed one word and not the next, a user who gave up
   halfway. **This is a normal input mode, not a typo.**

**Why this is a standing requirement and not a nice-to-have.** On 2026-08-09 a
vi gate scored 98.0 GREEN on all four clauses over a corpus written entirely in
regimes 1 and 2. A red team then took those same 150 queries and de-accented
exactly ONE word in each: **161 of 275 variants changed their grounding, 156
losing the right concept** — `phở bo` shredding into pho + avocado, `cà phe`
reaching a restaurant called Phê. The gate could not see any of it, because
the corpus contained no query in the regime where the defect lived. A green
gate over a blind spot is worse than a red one: it certifies the blind spot.

The vi corpus carries this as its `pa-*` stratum. Every language corpus owes
the same coverage, es included, and so does every language added later. Include
at least one **counterweight** entry as well — a partially-accented query that
must still be REFUSED (vi's `pa-13`, `cơm chay`) — so the rule that admits
regime 3 cannot quietly erode the evidence that regime 1 supplies.

## Run artifacts

`<lang>.result.json` next to each corpus is the last run's full per-query
detail, written by the runner. It is committed so a regression is a diff.
