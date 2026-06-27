# `business/` — Business Model & Monetization

Where we **iterate on the business model**: pricing, the free/paid split, the trial, onboarding,
Stripe/RevenueCat setup, growth, and restaurant B2B. This is the home for business decisions
the same way `plans/` is for engineering and `product/` is for feature ideas.

`BRD.md` (repo root) was the original Business Requirements Doc — it's **stale** now; its still-good
ideas have been mined into [`brd-extraction.md`](brd-extraction.md). Treat the files below as current.

## Files

| File | What it holds |
|---|---|
| [business-model.md](business-model.md) | The model decision: freemium + trial, pricing, sequencing, funding stance, the research verdict behind it |
| [monetization-and-gating.md](monetization-and-gating.md) | The free vs paid feature map, the gating principles (taste-vs-crutch, discovery-vs-decision), and the open A/B decisions |
| [brd-extraction.md](brd-extraction.md) | Raw business/growth/B2B/community ideas mined from the old BRD + PRD (seed material) |

## The one-paragraph version

Crave launches **freemium**: the objective restaurant ranking (better than Google) is free
forever and is the trust + word-of-mouth engine; **Crave+** gates the things Google/Yelp/Beli
can't do — the **dish** intelligence layer (the hero), trending/momentum, and power filters on
your own lists. **~$7.99/mo + $39.99/yr, push annual.** Start freemium and only *tighten* toward
a harder gate later if the data says so (you can always close a door; you can't reopen one).
Stay bootstrapped; B2B (restaurant analytics) is the bigger long-run pool, held for Phase 2 and
never injected into the ranking.

> A fuller decision log also lives in agent memory at
> `~/.claude/projects/-Users-brandonkimble-Crave/memory/crave-business-model.md`. When the two
> disagree, **this folder is canonical** — update the memory pointer to match.
