# Scoring & Ranking

> **Rolling canonical reference — not a changelog.** This folder describes how the Crave Score *works
> and what it means*, and how to *assess and tune* it once we have enough real data. Keep it current;
> edit in place. Execution detail + migrations live in `plans/` (`crave-score-rising-heat-redesign.md`,
> `crave-score-v3-endorsement-redesign-plan.md`); free/paid gating lives in `business/`.

The Crave Score is the heart of the app — the objective ranking everything else hangs off. This folder
is where we keep the *model* (what the number means) and the *calibration playbook* (which dial to turn
when a ranking looks wrong). Don't tune blind: come back here when there's enough real data to compare
against your gut.

## What the score IS (the north star you're tuning toward)

- **Objective & global. Never personalized.** The same for every user; no taste-based re-ranking, ever.
  Taste enters Crave only via what a user *searches* and what they *save* — never the Score.
- **Atomic unit = one decayed person-endorsement.** A Reddit comment naming a place = `1 (author) +
  its upvotes`; a poll like = 1; a poll's distinct likers = that many. **Upvotes, mentions, and likes
  all count 1:1** — we trust Reddit (app-agnostic historical data, one-vote-per-user). The endorsement
  value is `log1p(mentions + upvotes)`; the log is kept because it's load-bearing for the restaurant
  composite (see [composite-tuning.md](composite-tuning.md)).
- **Two axes.** A **stable** score (365-day half-life → global percentile → `0–10` native scale via a rank-preserving
  display curve (a gentle bell — see `plans/crave-score-1to10-scale-migration.md`), stored at 2 decimals) and a **rising** surge (the same score
  recomputed at a ~21-day half-life, minus the stable score = a recent-vs-baseline rating-point
  delta). Rising powers the "↑X pts" arrow and the Rising sort. Display is 1 decimal on cards / 2 in
  the score-info sheet; only a literal `10.0` shows "10", everything else caps at `9.9`/`9.99`.
- **It leans volume / "most endorsed & beloved"** — by design, not exposure-normalized "quality." A
  famous place with 10,000 endorsements outranks a gem with 200; that's an accepted meaning for a
  discovery app. Exposure-normalization is a *future dial*, recorded but not pursued.
- **Sentiment is a binary net-positive gate** (in the LLM collection prompt). No 1–10 intensity
  weighting: self-selection already encodes sentiment, and intensity rewards expressiveness over genuine
  strength (a hype-bias) while adding model noise. If ever revisited, use 2–3 claim-based tiers, not a
  continuous score.

## Files

| File | What it holds |
|---|---|
| [composite-tuning.md](composite-tuning.md) | The restaurant composite's dials (ρ, dish-vs-praise, operand curve), the mental model, recommended defaults, a symptom→dial diagnostic table, and the calibration methodology to run once real data exists. |

## When to come back here

Tune **only** when you have enough real, dense data (a full city's worth of scored restaurants) to
eyeball top-N rankings against your own judgment. The dials are config constants — changing them is a
re-score, not a migration. The calibration harness (archetype fixtures + real top-N eyeball) is shared
with the reorder-regime fixtures the rising plan already needs.

Also parked there: the **evidence floor & rising-confidence thresholds** (how few opinions is "too few
to trust/show", and when a `rising` delta is real vs thin-data noise). The current take is calibrated
to thin seed data and **must be re-derived against the production opinion-count distribution** once the
archive collection lands real volume — see [composite-tuning.md](composite-tuning.md#evidence-floor--rising-confidence--️-revisit-with-production-data).
