# `business/signal/` — the distilled advice corpus

Built 2026-07-12 from the 64 YouTube transcripts in `~/CraveApp/Distribution`
(superwall 47, thebrettway 9, arthurspalanzani 8; ~659k words). Purpose: turn a
year of consumed app-growth advice into ONE canonical, adversarially-tested
blueprint for Crave's business model + distribution — and kill the noise.

## Structure

| Path                  | What it is                                                                                                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `testimony/`          | One file per transcript: structured evidence extraction (speaker, apps, category, every concrete claim + number, deal structures, contrarian positions, Crave-transfer judgment). Machine-built, fanned out 2026-07-12. |
| `spine/`              | Claude's first-hand close-reading notes on the highest-leverage transcripts (paywall/pricing, UGC deals, Cal AI interviews, the big compilations).                                                                      |
| `crave-fact-sheet.md` | The Crave-side grounding: what the app is, onboarding/paywall machinery as built, per-city seeding economics. Every transfer judgment leans on this.                                                                    |
| `claims-ledger.md`    | Phase 2 (done): index over `ledger/` — 11 journey-ordered sections of cross-examined claims, conflicts explicit.                                                                                                        |
| `panels/`             | Phase 3 (done): five adversarial panels — opposing advocate briefs + a judge verdict per contested call (price/gate, city strategy, creator doctrine, share-link policy, sequencing/budget/metrics).                    |
| `blueprint.md`        | **Phase 4 (done): THE CANON.** The slim "do exactly this" doc; supersedes all prior business/ files where they conflict.                                                                                                |

## Epistemic rules (why this exists at all)

1. 47/64 transcripts are Superwall content: the host sells paywall tooling, the
   guests are survivors, the sample skews to AI-utility apps with single-session
   wow. Every claim carries incentive flags and a category-transfer judgment
   against Crave (local, data-density, repeat-use food discovery).
2. Numbers are never summarized away; claims cite their evidence type
   (first-party / claimed / secondhand / anecdote).
3. Agreement across independent speakers ≠ truth (they watch each other's
   videos); disagreement is the interesting signal.
