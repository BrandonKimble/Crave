# Restaurant Composite — Tuning Playbook

> **Rolling canonical reference — not a changelog.** How to think about and calibrate the restaurant
> score's dials. Read [README.md](README.md) first for what the score means. Live constants:
> `DEFAULT_CONFIG` in `apps/api/.../public-crave-score/public-crave-score.service.ts`.

## The formula

```
dish value   = log1p(endorsers)                          # one dish's intensity (endorsers = mentions + upvoteWeight·upvotes)
acclaim(r)   = best + ρ·2nd + ρ²·3rd + …                 # dishes sorted best-first, ρ = discountRho
praise(r)    = log1p(by-name endorsers)                  # "this place is great" mentions, no dish named
restaurant   = dishWeight·acclaim + praiseWeight·praise  # then → global percentile → 0–10 via the display curve (bell)
```

Dishes themselves rank on `log1p(endorsers)` alone (a single mass → percentile, so the log is
rank-irrelevant *for dishes*). Everything below is about how dishes **combine into a restaurant.**

## The mention:upvote premium — `upvoteWeight` (default 0.7)

`endorsers = mentions + upvoteWeight·upvotes`. A **written mention** (a Reddit comment or a poll
comment naming a place) counts as **1**; an **upvote / poll-like** counts as **0.7**. The reasoning:
a mention is a *costly, originating* signal — someone surfaced the place unprompted and typed it,
which filters for conviction and adds new information. An upvote is a *genuine, near-full endorsement*
(the person agrees just as much; they'd have written it themselves) but cheaper to give and easier to
farm. So 0.7 is a **gentle premium for the writers** that still treats agreement as a strong signal —
deliberately above the old v2 `0.7/0.3` split (which over-discounted upvotes) and below `1:1` (no
premium). Sanity feel at α=0.7: 5 mentions beat 5 upvotes by ~40%; 3 upvotes still beat 1 mention; a
mention is worth ~1.4 upvotes. ⚠️ Tunable like the dials below — **re-eyeball α against real rankings
once production volume lands** (see the evidence-floor note); config-only change + rescore, no
migration. Applies identically to Reddit and polls (comment = mention, like = upvote).

## The three dials — "what makes a restaurant great?"

### Dial A — ρ (`discountRho`): menu depth — *"how many dishes make a place great?"*
`acclaim = best + ρ·2nd + ρ²·3rd + …`
- **ρ → 0:** only the best dish matters — *famous for one thing* (Franklin = brisket).
- **ρ → 1:** flat sum — the *whole menu* must deliver, and big menus accumulate.
- **ρ = 0.5 (default):** the best dish is ~half the acclaim, with a fast-tapering bonus for the next
  ~2–4 dishes. "Lean peak, depth a bonus." Also a **gaming cap** — a 40-item menu can't farm score
  (dish #10 ≈ 0.2%).

### Dial B — `dishWeight` vs `praiseWeight`: food vs reputation — *"great for its food, or for being a great place?"*
- **acclaim** = specific standout dishes people name.
- **praise** = holistic by-name love ("this place is amazing / just go here") — vibe, service,
  consistency, or the small/ethnic spot people rave about without naming a dish.
- **1.0 / 2.0 (default):** praise×2 deliberately rescues the *beloved-but-dishless* place into the top
  quartile without letting it top the iconic dish-places. It's the holistic-reputation channel.

### Dial C — operand curve (log vs sqrt vs raw): *"how much does overwhelming popularity count?"*
- **log (default):** saturates — a dish loved by 1,000 vs 10,000 is similar *quality* evidence.
- **raw:** one viral item dominates everything (one-hit-wonder wins). **Wrong end — avoid.**
- **sqrt:** in between.
- Only affects how dishes *combine* (the composite), never dish rank itself.

## Why we keep the log (it's not just "safe")

`log1p` normalizes every dish and praise into a comparable ~0–10 **intensity**, which makes Dials A and
B *independent and interpretable*: the curve flattens raw counts into a clean band, then **ρ alone
controls breadth** and the **weights alone control food-vs-reputation**. Raw or sqrt would *re-couple*
them — a viral dish's raw count would swamp ρ, so "depth" would secretly also become a "popularity"
dial. **Corollary: if standout dishes feel under-rewarded, lower ρ — don't steepen the curve.**

## Recommended defaults & when to change them

| Dial | Default | Keep unless… |
|---|---|---|
| Operand curve | **log** | (don't change — it keeps the other two dials honest) |
| ρ `discountRho` | **0.5** | broad-excellent places (5+ loved dishes) feel underranked vs one-hit-wonders → nudge to ~0.6 |
| `dishWeight` / `praiseWeight` | **1.0 / 2.0** | vaguely-praised places outrank places with genuinely great *documented* dishes → ease praise toward ~1.5 (don't go below ~1.5 or you re-break dishless-but-beloved places) |
| `endorsementHalfLifeDays` (stable) | **365** | — |
| `risingHalfLifeDays` (rising) | **21** | rising feels stale → lower; too jittery → raise |

The most values-laden dial is **dish-vs-praise** — it decides whether Crave ranks *great-dish places*
or *well-regarded places*. Watch it first.

## Diagnose by symptom (failure mode → dial)

| What looks wrong in real top-N | Turn this |
|---|---|
| A one-hit-wonder (1 viral dish, nothing else) sits too high | **raise ρ** (reward breadth) |
| A place with a big mediocre menu sits too high | **lower ρ** (stop menu-size farming) |
| A vaguely-"great place" with no dish data beats a place with real standout dishes | **lower praiseWeight** |
| A genuinely-beloved hole-in-the-wall (no named dishes) sits near zero | **raise praiseWeight** |
| One wildly-popular dish makes its restaurant dominate everything | curve too steep → confirm it's **log**, then **lower ρ** |
| Rankings barely move when surfaces should feel fresh | **lower `risingHalfLifeDays`** |

## How to calibrate (run only with enough real data)

These are **empirical** dials — not derivable from first principles. The process:

1. **Pin archetypes** and assert the intended order: one-hit-wonder · broad-excellent · beloved-dishless
   · dish-rich-low-praise · mega-menu-mediocre. (Add to the scorer fixture harness.)
2. **Pull the real top ~50** restaurants in a dense city and ask: *does this match my gut for "best in
   [city]"?*
3. **Where it doesn't, the symptom names the dial** (table above).
4. **Sweep one dial at a time**, re-eyeball. Stop when the archetypes hold and the real top-N feels right.

Notes: changing a dial is a re-score (config only, no migration). Do this on a throwaway script over all
real subjects before committing. Reuse the same harness as the rising plan's reorder-regime fixtures.

## Evidence floor & rising confidence — ⚠️ REVISIT with production data

**The problem: thin-evidence volatility.** The score is a global percentile and the v3 redesign
deliberately **removed confidence shrinkage** (for interpretability), so there is nothing softening
places that have very few opinions. A place with a handful of opinions — where one new upvote is a
big *relative* jump in `log1p(mentions+upvotes)` — gets both a volatile score *and* a large `rising`
delta. That pollutes the **Rising / Trending** surface with anecdotal places ("a 3rd person noticed
it" reads as "skyrocketing").

**Snapshot from the THIN seed/test data** (2026-06-28, ~1.2k dishes — *not* production density;
every number here moves once real volume lands):

- Catalog is thin: **21%** of dishes have ≤2 opinions (mentions+upvotes), **54%** ≤5, **69%** ≤10.
- At the low end the score is essentially **ranking by opinion volume**: 1–2 ops → avg **2.0**,
  3–5 → **3.7**, 6–10 → **5.7**, 21–50 → **7.8**, 50+ → **9.1**. (A 7-opinion dish ≈ **5.7** — *mid*,
  because 7 is above-median evidence in thin data.)
- The **Rising sort is dominated by thin places**: every top-10 dish riser had only **2–5** total
  opinions (scores 1.6–4.5).
- Variance at the low end is huge (a 2-opinion dish ranged **0.0–9.9**), so a *score* threshold leaks
  — the worst case (a 2-opinion dish showing 9.9) slips through. The clean gate is an
  **evidence-count** threshold, not a score cutoff.

**The lever: a minimum opinion count** (mentions + upvotes + poll votes), with **two distinct
thresholds**:

1. **Rising-eligibility / Trending gate (high value).** Only compute/show `rising` and include a
   subject in the Rising sort when it has **≥ N opinions**. This is where the noise concentrates.
   *Tentative N ≈ 10.* Below it: keep the score, **suppress the delta**, exclude from Rising.
2. **Show-it-at-all floor (secondary).** Hide truly-anecdotal places. *Tentative ≥ 3 opinions* — but
   on the thin test data ≥5 would hide **54%** of the catalog, so keep it gentle or defer until real
   density exists.

**Alternative lever (rejected so far):** reintroduce confidence shrinkage (pull thin scores toward the
mean). v3 dropped it for legibility; a hard count threshold is simpler and more interpretable.
Reconsider if a threshold alone feels too binary.

**⚠️ Why this is parked:** the recommendation above is calibrated to *thin seed data*. Once the
archive collection lands real volume (likely **100k–millions** of opinions), the density flips — a far
larger share of places clears any meaningful evidence bar, so N for the rising gate can rise
(plausibly 25–50) and a real show-floor becomes affordable. **Re-derive both thresholds against the
actual production opinion-count distribution before committing; the conclusion here may change
materially.**
