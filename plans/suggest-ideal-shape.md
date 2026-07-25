# Suggest / Autocomplete — the from-scratch ideal shape (proposal, 2026-07-24)

Produced by the ultracode teardown study: 5 code-anatomy agents (full maps of
autocomplete.service.ts, the shared matcher, the demand substrate, the mobile
surface, and the decision history), 5 web-research agents (QAC frontier,
multi-entity blending practice at Spotify/LinkedIn/DoorDash/UberEats/
Instagram/Slack/Airbnb/Google Places/Yelp/Beli, rank-fusion methods, fuzzy-
matching practice, food/local suggest UX), and 2 retro-audit agents. Full
reports: workflow wf_00cddd89-505 journal.

## Verdict first: NOT a teardown — a two-layer refit

The owner authorized a complete teardown. The study's honest answer is that
the FOUNDATION is already frontier-shaped and must be kept:

- **The shared matcher is near-ideal.** Two-lane hybrid recall (lexical:
  exact/prefix/FTS/trigram/word-similarity/bounded-levenshtein with
  LENGTH-BANDED thresholds 0.7/0.55/0.45/0.35; dense: pgvector HNSW cosine)
  fused by **unweighted RRF (k=60)** — which is exactly what the rank-fusion
  research names as the from-scratch ideal for incomparable sources with
  zero training data. Its evidence-tier ladder (exact→prefix→contains→name→
  fuzzy→alias→edit→weak) is honest derivation throughout (coverage instead
  of fake 1.0s, tier-honest similarity). This was the Feb "ideal retrieval
  build" (P1.4 arc, commits 560917f1→78840307) — the owner's memory of a
  best-in-class revamp is real and it is THIS layer.
- **The lane architecture is the consensus pattern, not an accretion.**
  Every mature system (Spotify, LinkedIn, DoorDash, Instagram, Slack)
  converges on: per-type candidate GENERATORS ranked homogeneously with
  type-appropriate signals, and cross-type ordering solved as a separate
  blending/layout problem. Crave's six lanes + "floor, not mandate" merge
  is structurally that. Nobody unifies person-scores and dish-scores on one
  scale — and neither should we.

What is NOT ideal — the two layers to refit:

## Refit layer 1: the fusion (kill the cross-lane score bridge)

Today the lanes' outputs enter ONE global sort via hand-built score
bridges: attribute rankSupport = 0.6×typed + 0.3×selection + 0.1×corpus
(× a naked 1.35), query rows floored at 0.5, poll/user lanes riding
env-set lane weights and 0.4 whole-string similarity floors. This is the
cross-family-weights disease §11/§16 killed elsewhere.

The from-scratch fusion, from the research consensus + the no-fake-
estimates law:

1. **Within-lane: rank-only, type-appropriate.** Each lane orders its own
   candidates by its own signals (attribute lane: RRF-fuse its three
   sub-rankings — typed-demand rank, selection rank, corpus rank — no
   weights; entity lane: keep evidence-tier-first with demand re-ranking
   INSIDE tiers, which is already the structural-clamp design; user/poll
   lanes: rank by similarity/recency, NO similarity floor — see layer 1b).
2. **Across lanes: RRF over lane ranks + K1 slot sentences.** The final
   list fuses lane rank positions (1/(60+rank), the published constant),
   with owner SLOT sentences as the only cross-lane numbers: "the panel
   shows at most 8 rows; queries get up to 3; people/polls appear only
   with strong matches and never displace a same-rank entity" — sentences,
   not weights. Cross-lane tie-breaks use the only type-neutral signals
   the industry uses: text-match strength (evidence tier), the user's OWN
   prior engagement with that exact entity, then global popularity.
3. **Intent gating from the query string** (already half-present via
   min-length gates): short/1-2-char queries = navigational (entity prefix
   - zero fuzz); ≥3 chars opens fuzzy + dense; @-prefix or name-shaped
     queries open the user lane wider. This replaces threshold-flavored
     gating with the length-adaptive eligibility the fuzzy-practice research
     documents (Algolia's 4/8-char typo ladder; trigram is meaningless under
     3 chars).
4. **Similarity floors die; slot caps replace them (1b).** The 0.4
   whole-string floors on user/poll lanes are the weakest documented shape
   (length-asymmetric, silently drops good long-name matches). Replace
   with: prefix-tier first, word_similarity RANK-ONLY, capped at K1 slots
   (3 users / 3 polls) — a bad match can only appear when nothing better
   exists AND the panel has room, which is the honest meaning the floor
   was reaching for.
5. **Instrument now, learn later.** Log (query, row, lane, position,
   impression, tap) from the first user — autocomplete_selection already
   exists; add impression meta. Post-launch, calibrated tap-probability
   re-ranking (unbiased LTR) replaces slot heuristics AT THE FUSION LAYER
   ONLY. VALUES GUARD (sourceClassInfluence corollary, owner-ratified):
   the learned layer orders the panel; it never rewrites the underlying
   Reddit-evidence quality scores. Fusion is behavioral; measurement is
   evidence; they stay separate layers forever.

## Refit layer 2: presentation (the "feels smart" gap is mostly here)

From the Baymard/Algolia/Google-Places/Yelp research + the mobile map's
gap list — none of this needs the backend refit to start:

- **Highlight the match** (bold the predictive completion) — currently no
  highlighting at all.
- **Type-differentiate rows**: attributes currently render identically to
  dishes; every row should answer "why am I here" (icon + label +
  provenance: "12 Reddit mentions", "your favorite", distance/neighborhood
  on entity rows).
- **Zero-state**: recents + popular-near-viewport + placeholder text that
  names the accepted intents (dish, restaurant, vibe…) — currently blank.
- **Never-blank rules**: fix the unfiltered prefix-cache placeholder
  (stale rows flash), keep last results while loading, add an error state
  distinct from no-matches.
- **Viewport bias, not restriction** (Google Places' own guidance for
  map-first apps): entity lane biased to the visible map with famous
  out-of-view matches still allowed, labeled with where they are.
- **Latency budget stays**: zero-debounce per-keystroke is already the
  right instant-feel call pre-launch (p95 well under the ~100ms bar);
  revisit a ~50ms debounce only at scale.
- Small correctness items: recently-viewed FOOD tap should land on the
  dish (not the restaurant profile); matcher hygiene (drop the dead
  pre-rename trgm index; delete the stale 'phonetic' tier comment).

## What this dissolves from the §18 docket

The 0.6/0.3/0.1 weights and 0.4 floors stop existing rather than getting
ratified (they are replaced by rank-fusion + slot sentences). The K1
sentences that REPLACE them (panel size 8, query strip 3, user/poll slot
caps 3, the intent-gating lengths) go to the docket instead — sentences an
owner can actually mean.

## Execution shape (when ratified)

Phase A (fusion refit, api): attribute-lane RRF, kill floors/weights/1.35,
lane-rank fusion + slot sentences, impression logging. Phase B
(presentation, mobile): highlighting, row differentiation, zero-state,
never-blank, viewport bias labels. Phase C (post-launch): calibrated tap
re-ranking at the fusion layer. Phases A and B are independent;
both are pre-launch-sized (days, not weeks). The matcher itself: NO
CHANGES beyond the two hygiene deletions.
